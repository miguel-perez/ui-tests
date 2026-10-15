import copy
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

from merge_gate import CONTEXT, GitHub, ci_status, confirm_merge_requested, enable_auto_merge, publish_status, reconcile, review_status


REPO = "owner/repo"
HEAD = "a" * 40
PR = {
    "number": 1, "state": "open", "draft": False,
    "base": {"ref": "main"},
    "head": {"sha": HEAD, "repo": {"full_name": REPO}},
}
APPROVAL = {
    "id": 5521179355,
    "user": {"login": "coderabbitai[bot]", "type": "Bot"},
    "state": "APPROVED", "commit_id": HEAD,
    "submitted_at": "2026-10-14T16:26:06Z", "body": "",
}
COMMENTS = [
    {**APPROVAL, "id": 5521193172, "state": "COMMENTED", "submitted_at": "2026-10-14T16:27:13Z"},
    {**APPROVAL, "id": 5521197696, "state": "COMMENTED", "submitted_at": "2026-10-14T16:27:37Z"},
]
CI = {
    "id": 1, "name": "Automation CI", "head_sha": HEAD,
    "app": {"id": 15368, "slug": "github-actions"},
    "status": "completed", "conclusion": "success",
}


class ReviewStatusTests(unittest.TestCase):
    def status(self, reviews, pr=PR):
        return review_status(pr, reviews, REPO, "main")[0]

    def test_requires_actual_current_bot_approval(self):
        self.assertEqual(self.status([APPROVAL]), "success")
        self.assertEqual(self.status([]), "pending")

    def test_stale_approval_cannot_approve_new_commit(self):
        old = {**APPROVAL, "commit_id": "b" * 40}
        self.assertEqual(self.status([old]), "pending")

    def test_other_reviewers_and_lookalike_users_cannot_approve(self):
        for user in [{"login": "author", "type": "User"},
                     {"login": "coderabbitai[bot]", "type": "User"},
                     {"login": "other[bot]", "type": "Bot"}]:
            with self.subTest(user=user):
                self.assertEqual(self.status([{**APPROVAL, "user": user}]), "pending")

    def test_latest_negative_decision_revokes_older_approval(self):
        for state in ["CHANGES_REQUESTED", "DISMISSED"]:
            with self.subTest(state=state):
                self.assertEqual(self.status([APPROVAL, {**APPROVAL, "state": state}]), "pending")

    def test_identical_chronological_evidence_agrees_with_observer(self):
        # REST chronological order is retained across pages. IDs order tied
        # timestamps; the observer also accepts unordered input (tested in JS).
        def row(index, state, **fields):
            return {**APPROVAL, "id": APPROVAL["id"] + index,
                    "submitted_at": f"2026-10-14T16:26:{6 + index:02d}Z",
                    "state": state, **fields}

        approval = row(0, "APPROVED")
        comment = row(2, "COMMENTED", body="Actionable feedback is still review evidence")
        cases = [
            ("incident empty comments", [APPROVAL, *COMMENTS], "success", "approved"),
            ("nonempty comments", [approval, comment], "success", "approved"),
            ("comments only", [comment], "pending", "pending"),
            ("no reviews", [], "pending", "pending"),
            ("stale approval current comment", [row(0, "APPROVED", commit_id="old"), comment], "pending", "pending"),
            ("current approval old comment", [approval, {**comment, "commit_id": "old"}], "success", "approved"),
        ]
        for state in ["CHANGES_REQUESTED", "DISMISSED", "UNKNOWN", None]:
            negative = row(1, state)
            cases.append((f"later {state}", [approval, negative, comment], "pending",
                          "fix" if state == "CHANGES_REQUESTED" else "pending"))
            cases.append((f"later stale {state}", [approval, {**negative, "commit_id": "old"}, comment], "pending", "pending"))
            cases.append((f"restored after {state}", [negative, row(2, "APPROVED"), row(3, "COMMENTED")], "success", "approved"))
        cases.append(("dismissed original approval row", [row(0, "DISMISSED"), comment], "pending", "pending"))
        for state in ["APPROVED", "PENDING"]:
            cases.append((f"unsubmitted {state}", [row(0, state, submitted_at=None), comment], "pending", "pending"))
        cases.append(("submitted pending only", [row(0, "PENDING")], "pending", "pending"))
        cases.append(("pending cannot supersede", [approval, row(1, "PENDING"), comment], "success", "approved"))
        for user in [{"login": "coderabbitai[bot]", "type": "User"},
                     {"login": "coderabbitai", "type": "Bot"},
                     {"login": "other[bot]", "type": "Bot"}]:
            cases.append((f"lookalike {user}", [row(0, "APPROVED", user=user), comment], "pending", "pending"))
        for state in ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]:
            tied = row(1, state, submitted_at=approval["submitted_at"])
            cases.append((f"tied {state}", [approval, tied, comment],
                          "success" if state == "APPROVED" else "pending",
                          "approved" if state == "APPROVED" else "fix" if state == "CHANGES_REQUESTED" else "pending"))

        script = """
          import { evaluate } from './review-state.mjs';
          let input = ''; for await (const chunk of process.stdin) input += chunk;
          const { pr, ci, cases } = JSON.parse(input);
          console.log(JSON.stringify(cases.map(item => evaluate(pr, item[1], [ci]).state)));
        """
        observer_pr = {**PR, "base": {**PR["base"], "repo": {"full_name": REPO}}}
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=Path(__file__).resolve().parent,
                                input=json.dumps({"pr": observer_pr, "ci": CI, "cases": cases}),
                                text=True, capture_output=True, check=True, timeout=30)
        for (name, reviews, expected_gate, expected_observer), observed in zip(cases, json.loads(result.stdout), strict=True):
            with self.subTest(case=name):
                self.assertEqual(self.status(reviews), expected_gate)
                self.assertEqual(observed, expected_observer)

    def test_other_reviewer_does_not_replace_coderabbit_verdict(self):
        human = {**APPROVAL, "user": {"login": "human", "type": "User"}, "state": "COMMENTED"}
        self.assertEqual(self.status([APPROVAL, human]), "success")

    def test_unsubmitted_review_is_not_approval(self):
        self.assertEqual(self.status([{**APPROVAL, "submitted_at": None}]), "pending")
        self.assertEqual(self.status([{**APPROVAL, "state": "PENDING"}]), "pending")

    def test_drafts_closed_forks_and_other_bases_are_ineligible(self):
        for field, value in [("draft", True), ("state", "closed"),
                             ("base", {"ref": "release"}),
                             ("head", {"sha": HEAD, "repo": {"full_name": "fork/repo"}})]:
            with self.subTest(field=field):
                self.assertEqual(self.status([APPROVAL], {**PR, field: value}), "pending")

    def test_deleted_head_repository_is_ineligible(self):
        self.assertEqual(self.status([APPROVAL], {**PR, "head": {"sha": HEAD, "repo": None}}), "pending")


class CiStatusTests(unittest.TestCase):
    def test_requires_explicit_success_on_current_head(self):
        self.assertEqual(ci_status(PR, [CI])[0], "success")
        self.assertEqual(ci_status(PR, [])[0], "pending")
        self.assertEqual(ci_status(PR, [{**CI, "head_sha": "b" * 40}])[0], "pending")

    def test_skipped_neutral_and_failed_ci_cannot_pass(self):
        for conclusion in ["skipped", "neutral", "failure", "cancelled", "timed_out", None]:
            with self.subTest(conclusion=conclusion):
                self.assertEqual(ci_status(PR, [{**CI, "conclusion": conclusion}])[0], "pending")

    def test_requires_real_github_actions_and_exact_check_name(self):
        for check in [{**CI, "name": "Other CI"},
                      {**CI, "app": {"id": 1, "slug": "github-actions"}},
                      {**CI, "app": {"id": 15368, "slug": "other-app"}}]:
            with self.subTest(check=check):
                self.assertEqual(ci_status(PR, [check])[0], "pending")

    def test_new_queued_run_supersedes_old_success_without_timestamps(self):
        old_success = {**CI, "started_at": "2026-10-13T20:00:00Z"}
        queued = {**CI, "id": 2, "status": "queued", "conclusion": None, "started_at": None}
        for checks in [[old_success, queued], [queued, old_success]]:
            self.assertEqual(ci_status(PR, checks)[0], "pending")


class ApiTests(unittest.TestCase):
    def test_reviews_beyond_first_page_are_examined(self):
        api = GitHub("unused")
        api.request = Mock(side_effect=[[{"state": "COMMENTED"}] * 100, [APPROVAL]])
        reviews = list(api.paginate("/reviews"))
        self.assertEqual(len(reviews), 101)
        self.assertEqual(reviews[-1], APPROVAL)
        self.assertIn("page=2", api.request.call_args.args[0])

    def test_comment_pages_do_not_hide_decisions(self):
        comment = COMMENTS[0]
        for pages, expected in [
            ([[comment] * 100, [APPROVAL, COMMENTS[1]]], "success"),
            ([[APPROVAL] + [comment] * 99, [COMMENTS[1]]], "success"),
            ([[APPROVAL] + [comment] * 99, [{**COMMENTS[1], "state": "DISMISSED"}, COMMENTS[1]]], "pending"),
        ]:
            with self.subTest(expected=expected, pages=pages):
                api = GitHub("unused")
                api.request = Mock(side_effect=pages)
                reviews = list(api.paginate("/reviews"))
                self.assertEqual(review_status(PR, reviews, REPO, "main")[0], expected)
                self.assertEqual(api.request.call_count, 2)

    def test_check_runs_response_is_paginated_by_result_key(self):
        api = GitHub("unused")
        api.request = Mock(side_effect=[{"check_runs": [CI] * 100}, {"check_runs": [{**CI, "id": 2}]}])
        checks = list(api.paginate("/checks", result_key="check_runs"))
        self.assertEqual(len(checks), 101)
        self.assertEqual(checks[-1]["id"], 2)

    def test_identical_status_is_not_written_repeatedly(self):
        api = Mock()
        api.paginate.return_value = iter([{
            "context": CONTEXT, "state": "success", "description": "approved",
            "creator": {"login": "github-actions[bot]"},
        }])
        publish_status(api, REPO, HEAD, "success", "approved", "https://example.test")
        api.request.assert_not_called()

    def test_status_from_other_identity_is_not_reused(self):
        api = Mock()
        api.paginate.return_value = iter([{
            "context": CONTEXT, "state": "success", "description": "approved",
            "creator": {"login": "author"},
        }])
        publish_status(api, REPO, HEAD, "success", "approved", "https://example.test")
        self.assertEqual(api.request.call_args.args[1]["state"], "success")


class MergeConfirmationTests(unittest.TestCase):
    def confirm(self, current):
        api = Mock()
        api.request.return_value = current
        return confirm_merge_requested(api, REPO, 1, HEAD)

    def test_same_head_already_merged_confirms_success(self):
        self.assertTrue(self.confirm({**PR, "state": "closed", "merged": True}))

    def test_same_head_squash_auto_merge_confirms_success(self):
        self.assertTrue(self.confirm({**PR, "auto_merge": {"merge_method": "squash"}}))
        self.assertFalse(self.confirm({**PR, "auto_merge": {"merge_method": "rebase"}}))

    def test_changed_head_never_confirms_an_old_merge_request(self):
        changed = {**PR, "head": {"sha": "b" * 40}}
        self.assertFalse(self.confirm({**changed, "merged": True}))
        self.assertFalse(self.confirm({**changed, "auto_merge": {"merge_method": "squash"}}))

    def test_changed_base_or_head_repository_is_not_confirmed(self):
        merged = {**PR, "state": "closed", "merged": True}
        api = Mock()
        api.request.return_value = {**merged, "base": {"ref": "release"}}
        self.assertFalse(confirm_merge_requested(api, REPO, 1, HEAD, "main"))
        forked = {**merged, "head": {"sha": HEAD, "repo": {"full_name": "fork/repo"}}}
        self.assertFalse(self.confirm(forked))

    def test_closed_unmerged_is_not_success(self):
        self.assertFalse(self.confirm({**PR, "state": "closed", "merged": False}))

    def test_draft_with_auto_merge_is_not_confirmed(self):
        self.assertFalse(self.confirm({**PR, "draft": True, "auto_merge": {"merge_method": "squash"}}))

    def test_api_error_is_not_assumed_to_be_success(self):
        api = Mock()
        api.request.side_effect = RuntimeError("API unavailable")
        with self.assertRaisesRegex(RuntimeError, "API unavailable"):
            confirm_merge_requested(api, REPO, 1, HEAD)

    @patch("merge_gate.time.sleep")
    @patch("merge_gate.time.monotonic", return_value=0)
    def test_in_progress_waits_for_confirmed_merged_state(self, monotonic, sleep):
        api = Mock()
        api.request.side_effect = [PR, {**PR, "state": "closed", "merged": True}]
        self.assertTrue(confirm_merge_requested(api, REPO, 1, HEAD))
        self.assertEqual(api.request.call_count, 2)
        sleep.assert_called_once_with(2)

    @patch("merge_gate.time.sleep")
    @patch("merge_gate.time.monotonic", side_effect=[0, 0, 10])
    def test_unconfirmed_merge_times_out_without_success(self, monotonic, sleep):
        api = Mock()
        api.request.return_value = PR
        self.assertFalse(confirm_merge_requested(api, REPO, 1, HEAD))
        api.request.assert_called_once_with(f"/repos/{REPO}/pulls/1", timeout=3)
        sleep.assert_not_called()

    @patch("merge_gate.time.sleep")
    @patch("merge_gate.time.monotonic", side_effect=[0, 9, 10])
    def test_api_timeout_is_bounded_by_remaining_poll_time(self, monotonic, sleep):
        api = Mock()
        api.request.return_value = PR
        self.assertFalse(confirm_merge_requested(api, REPO, 1, HEAD))
        api.request.assert_called_once_with(f"/repos/{REPO}/pulls/1", timeout=1)


class ReconcileTests(unittest.TestCase):
    def api(self, current=PR, reviews=None, checks=None):
        api = Mock()
        def paginate(path, **params):
            if path.endswith("/reviews"):
                return iter([APPROVAL, *COMMENTS] if reviews is None else reviews)
            if path.endswith("/check-runs"):
                return iter([CI] if checks is None else checks)
            raise AssertionError("Unexpected API endpoint")
        api.paginate.side_effect = paginate
        api.request.return_value = current
        return api

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_push_during_verification_cannot_receive_stale_success(self, publish, merge):
        current = copy.deepcopy(PR)
        current["head"]["sha"] = "c" * 40
        reconcile(self.api(current), REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[2:4], ("c" * 40, "pending"))
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_api_failure_revokes_success_and_never_merges(self, publish, merge):
        api = self.api()
        api.paginate.side_effect = RuntimeError("API unavailable")
        with self.assertRaises(RuntimeError):
            reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "error")
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_activation_flag_is_required_to_enable_auto_merge(self, publish, merge):
        reconcile(self.api(), REPO, "main", PR, "url", False)
        self.assertEqual(publish.call_args.args[3], "success")
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_missing_approval_never_enables_auto_merge(self, publish, merge):
        api = self.api(reviews=[])
        reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "pending")
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_approval_with_skipped_ci_never_enables_auto_merge(self, publish, merge):
        for check in [{**CI, "id": 2, "conclusion": conclusion} for conclusion in ["skipped", "neutral", "failure"]] + [
            {**CI, "id": 2, "status": "queued", "conclusion": None},
        ]:
            with self.subTest(check=check):
                reconcile(self.api(checks=[CI, check]), REPO, "main", PR, "url", True)
                self.assertEqual(publish.call_args.args[3], "pending")
                merge.assert_not_called()
        reconcile(self.api(checks=[{**CI, "app": {"id": 1, "slug": "github-actions"}}]),
                  REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "pending")
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_approval_plus_comments_preserves_pr_eligibility(self, publish, merge):
        for current in [{**PR, "draft": True}, {**PR, "base": {"ref": "release"}},
                        {**PR, "head": {"sha": HEAD, "repo": {"full_name": "fork/repo"}}}]:
            reconcile(self.api(current), REPO, "main", PR, "url", True)
            self.assertEqual(publish.call_args.args[3], "pending")
            merge.assert_not_called()

    @patch("merge_gate.subprocess.run")
    def test_protected_merge_command_matches_verified_head(self, run):
        enable_auto_merge(REPO, 1, HEAD)
        run.assert_called_once_with([
            "gh", "pr", "merge", "1", "--repo", REPO,
            "--auto", "--squash", "--match-head-commit", HEAD,
        ], check=True, timeout=60)

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_current_approval_enables_merge_for_exact_head(self, publish, merge):
        reconcile(self.api(), REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "success")
        merge.assert_called_once_with(REPO, 1, HEAD)

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_merge_is_not_reenabled_when_already_set(self, publish, merge):
        reconcile(self.api({**PR, "auto_merge": {"merge_method": "squash"}}),
                  REPO, "main", PR, "url", True)
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge", side_effect=subprocess.CalledProcessError(1, "gh"))
    @patch("merge_gate.publish_status")
    def test_concurrent_merge_keeps_verified_success_status(self, publish, merge):
        api = self.api()
        api.request.side_effect = [PR, {**PR, "state": "closed", "merged": True}]
        reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_count, 1)
        self.assertEqual(publish.call_args.args[3], "success")

    @patch("merge_gate.enable_auto_merge", side_effect=subprocess.CalledProcessError(1, "gh"))
    @patch("merge_gate.publish_status")
    def test_base_changed_before_confirmation_is_rejected(self, publish, merge):
        api = self.api()
        api.request.side_effect = [PR, {**PR, "base": {"ref": "release"}, "auto_merge": {"merge_method": "squash"}}]
        with self.assertRaises(subprocess.CalledProcessError):
            reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "error")

    @patch("merge_gate.enable_auto_merge", side_effect=subprocess.TimeoutExpired("gh", 60))
    @patch("merge_gate.publish_status")
    def test_timed_out_command_with_confirmed_auto_merge_keeps_success(self, publish, merge):
        api = self.api()
        api.request.side_effect = [PR, {**PR, "auto_merge": {"merge_method": "squash"}}]
        reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_count, 1)
        self.assertEqual(publish.call_args.args[3], "success")

    @patch("merge_gate.enable_auto_merge", side_effect=subprocess.CalledProcessError(1, "gh"))
    @patch("merge_gate.publish_status")
    def test_failed_merge_without_confirmation_still_fails_closed(self, publish, merge):
        api = self.api()
        api.request.side_effect = [PR, {**PR, "state": "closed", "merged": False}]
        with self.assertRaises(subprocess.CalledProcessError):
            reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "error")

    @patch("merge_gate.enable_auto_merge", side_effect=subprocess.CalledProcessError(1, "gh"))
    @patch("merge_gate.publish_status")
    def test_readback_api_failure_still_fails_closed(self, publish, merge):
        api = self.api()
        api.request.side_effect = [PR, RuntimeError("API unavailable")]
        with self.assertRaises(RuntimeError):
            reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "error")


if __name__ == "__main__":
    unittest.main()
