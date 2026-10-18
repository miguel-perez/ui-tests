"""Publish a required review status, then let GitHub enforce merge requirements.

Run only from trusted default-branch code. No PR contents or review text are
executed. Only the model reviewer's recorded verdict on this exact head counts.
"""

import json
import os
import re
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CONTEXT = "Review approval"
MODEL_REVIEW = "Model review"
CI_CHECK = "Automation CI"
GITHUB_ACTIONS_APP_ID = 15368


def changes_requested(reviews):
    """True when any reviewer's latest submitted decision asks for changes."""
    latest = {}
    for review in reviews:
        if review.get("submitted_at") and review.get("state") not in ("PENDING", "COMMENTED"):
            latest[review.get("user", {}).get("login")] = review.get("state")
    return "CHANGES_REQUESTED" in latest.values()


def review_status(pr, statuses, repository, default_branch, reviews=()):
    """Require the model reviewer's success verdict, recorded on this exact head."""
    if pr.get("state") != "open" or pr.get("draft"):
        return "pending", "Waiting for a ready, open pull request"
    if pr.get("base", {}).get("ref") != default_branch:
        return "pending", "Only the default branch is eligible for automatic merging"
    if (pr.get("head", {}).get("repo") or {}).get("full_name") != repository:
        return "pending", "Automatic merging is limited to branches in this repository"
    # REST lists reviews chronologically; paginate preserves that order.
    if changes_requested(reviews):
        return "pending", "A reviewer has requested changes"

    # The model reviewer records its verdict as a commit status on the head it
    # reviewed, so a push leaves the new head without one. Statuses created by
    # github-actions[bot] (this gate, or a workflow a PR could edit) never count.
    # The newest verdict wins, so a later failure revokes an earlier success.
    verdicts = [
        status for status in statuses
        if status.get("context") == MODEL_REVIEW
        and status.get("creator", {}).get("type") == "User"
        and status.get("creator", {}).get("login") != "github-actions[bot]"
    ]
    if not verdicts:
        return "pending", "Waiting for the model reviewer's report on this commit"
    latest = max(verdicts, key=lambda status: status.get("id", 0))
    if latest.get("state") != "success":
        return "pending", "The model reviewer's report has open findings on this commit"
    return "success", "The model reviewer reported no open finding on the latest commit"


def ci_status(pr, checks):
    """Require actual successful CI; GitHub also accepts skipped/neutral checks."""
    candidates = [
        check for check in checks
        if check.get("name") == CI_CHECK
        and check.get("head_sha") == pr["head"]["sha"]
        and check.get("app", {}).get("id") == GITHUB_ACTIONS_APP_ID
        and check.get("app", {}).get("slug") == "github-actions"
    ]
    # A queued run can have no timestamps yet. IDs still identify the latest
    # created check so an older successful run cannot hide a pending rerun.
    latest = max(candidates, key=lambda check: check["id"], default=None)
    if not latest or latest.get("status") != "completed":
        return "pending", "Waiting for Automation CI on the latest commit"
    if latest.get("conclusion") != "success":
        return "pending", "Automation CI must succeed; skipped and neutral results do not pass"
    return "success", "The model reviewer reported no open finding and Automation CI passed"


class GitHub:
    def __init__(self, token, api_url="https://api.github.com"):
        self.token = token
        self.api_url = api_url.rstrip("/")

    def request(self, path, payload=None, timeout=30):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            self.api_url + path,
            data=body,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except HTTPError as exc:
            # Do not log request headers or response bodies that might contain
            # private repository data or authentication diagnostics.
            raise RuntimeError(f"GitHub API returned HTTP {exc.code}") from None

    def paginate(self, path, result_key=None, **params):
        page = 1
        while True:
            response = self.request(path + "?" + urlencode({**params, "per_page": 100, "page": page}))
            entries = response.get(result_key) if result_key else response
            if not isinstance(entries, list):
                raise RuntimeError("GitHub returned an unexpected list response")
            yield from entries
            if len(entries) < 100:
                break
            page += 1


def publish_status(api, repository, sha, state, description, target_url):
    """Avoid identical status writes and GitHub's per-commit status limit."""
    previous = next(
        (item for item in api.paginate(f"/repos/{repository}/commits/{sha}/statuses")
         if item.get("context") == CONTEXT),
        None,
    )
    if (previous and previous.get("state") == state
            and previous.get("description") == description
            and previous.get("creator", {}).get("login") == "github-actions[bot]"):
        return
    api.request(f"/repos/{repository}/statuses/{sha}", {
        "context": CONTEXT,
        "state": state,
        "description": description,
        "target_url": target_url,
    })


def enable_auto_merge(repository, number, sha):
    # GitHub still enforces required CI, review status, conversation resolution,
    # and branch protections. Never use --admin or bypass merge requirements.
    subprocess.run([
        "gh", "pr", "merge", str(number), "--repo", repository,
        "--auto", "--squash", "--match-head-commit", sha,
    ], check=True, timeout=60)


def confirm_merge_requested(api, repository, number, sha, base_ref=None, timeout_seconds=10):
    """Confirm a concurrent merge through live state, never CLI error text.

    The readback must still describe the verified PR: same head repository and,
    when supplied, the same base branch.
    """
    deadline = time.monotonic() + timeout_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        current = api.request(f"/repos/{repository}/pulls/{number}", timeout=min(3, remaining))
        if current.get("head", {}).get("sha") != sha:
            return False
        if (current.get("head", {}).get("repo") or {}).get("full_name") != repository:
            return False
        if base_ref is not None and current.get("base", {}).get("ref") != base_ref:
            return False
        if current.get("merged") is True:
            return True
        if current.get("state") != "open" or current.get("draft"):
            return False
        if current.get("auto_merge"):
            return current["auto_merge"].get("merge_method") == "squash"
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(2, remaining))


def reconcile(api, repository, default_branch, pr, target_url, auto_merge_enabled):
    number = pr["number"]
    sha = pr["head"]["sha"]
    try:
        reviews = list(api.paginate(f"/repos/{repository}/pulls/{number}/reviews"))
        statuses = list(api.paginate(f"/repos/{repository}/commits/{sha}/statuses"))
        checks = list(api.paginate(f"/repos/{repository}/commits/{sha}/check-runs", result_key="check_runs"))
        # Discard work if a push or draft/base change happened while fetching
        # reviews. A stale workflow may never grant success to a newer head.
        current = api.request(f"/repos/{repository}/pulls/{number}")
        if current.get("state") != "open":
            return
        if current["head"]["sha"] != sha:
            publish_status(api, repository, current["head"]["sha"], "pending",
                           "Commit changed during review verification; waiting for the next check",
                           target_url)
            return
        state, description = review_status(current, statuses, repository, default_branch, reviews)
        if state == "success":
            state, description = ci_status(current, checks)
        publish_status(api, repository, sha, state, description, target_url)
        print(f"PR #{number}: {state} — {description}")
        if state == "success" and auto_merge_enabled and not current.get("auto_merge"):
            try:
                enable_auto_merge(repository, number, sha)
            except subprocess.SubprocessError:
                # Archon or another gate run may have requested the same merge.
                # Preserve verified approval only after GitHub confirms that
                # exact head merged or has squash auto-merge enabled.
                if not confirm_merge_requested(api, repository, number, sha, current["base"]["ref"]):
                    raise
    except Exception:
        # Revoke a previous successful custom status if verification fails.
        # API outages cannot be treated as an approval.
        publish_status(api, repository, sha, "error", "Could not verify the model review and CI", target_url)
        raise


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise RuntimeError("Invalid GitHub repository name")
    api = GitHub(os.environ["GH_TOKEN"], os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    metadata = api.request(f"/repos/{repository}")
    default_branch = metadata["default_branch"]
    target_url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    auto_merge_enabled = os.environ.get("AUTOMERGE_ENABLED", "").lower() == "true"
    failed = False
    for pr in api.paginate(f"/repos/{repository}/pulls", state="open", base=default_branch):
        try:
            reconcile(api, repository, default_branch, pr, target_url, auto_merge_enabled)
        except Exception as exc:
            failed = True
            print(f"PR #{pr['number']}: review verification failed ({type(exc).__name__})", file=sys.stderr)
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
