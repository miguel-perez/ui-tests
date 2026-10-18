import copy
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

from merge_gate import CONTEXT, GitHub, ci_status, confirm_merge_requested, enable_auto_merge, publish_status, reconcile, review_status, reviewer_logins


import os
os.environ["MODEL_REVIEWER_LOGINS"] = "owner"

REPO = "owner/repo"
HEAD = "a" * 40
PR = {
    "number": 1, "state": "open", "draft": False,
    "base": {"ref": "main"},
    "head": {"sha": HEAD, "repo": {"full_name": REPO}},
}
APPROVAL = {
    "id": 900,
    "context": "Model review", "state": "success",
    "creator": {"login": "owner", "type": "User"},
    "description": "No open finding", "created_at": "2026-10-14T16:26:06Z",
}
CI = {
    "id": 1, "name": "Automation CI", "head_sha": HEAD,
    "app": {"id": 15368, "slug": "github-actions"},
    "status": "completed", "conclusion": "success",
}


class ReviewStatusTests(unittest.TestCase):
    def status(self, statuses, pr=PR, reviews=()):
        return review_status(pr, statuses, REPO, "main", reviews)[0]

    def test_requires_actual_model_review_success_on_the_head(self):
        self.assertEqual(self.status([APPROVAL]), "success")
        self.assertEqual(self.status([]), "pending")

    def test_other_contexts_and_states_cannot_approve(self):
        self.assertEqual(self.status([{**APPROVAL, "context": "Other review"}]), "pending")
        self.assertEqual(self.status([{**APPROVAL, "context": "Review approval"}]), "pending")
        for state in ["failure", "pending", "error", None]:
            with self.subTest(state=state):
                self.assertEqual(self.status([{**APPROVAL, "state": state}]), "pending")

    def test_unset_or_empty_allowlist_fails_closed(self):
        for raw in ["", " , "]:
            with self.subTest(raw=raw):
                state, message = review_status(PR, [APPROVAL], REPO, "main", (), reviewer_logins(raw))
                self.assertEqual(state, "pending")
                self.assertIn("MODEL_REVIEWER_LOGINS", message)
        with patch.dict(os.environ, {"MODEL_REVIEWER_LOGINS": ""}):
            self.assertEqual(self.status([APPROVAL]), "pending")
        with patch.dict(os.environ):
            os.environ.pop("MODEL_REVIEWER_LOGINS")
            self.assertEqual(self.status([APPROVAL]), "pending")

    def test_only_listed_users_are_accepted(self):
        other = {**APPROVAL, "creator": {"login": "implementer", "type": "User"}}
        self.assertEqual(self.status([other]), "pending")
        with patch.dict(os.environ, {"MODEL_REVIEWER_LOGINS": "Reviewer, owner"}):
            self.assertEqual(self.status([other]), "pending")
            self.assertEqual(self.status([APPROVAL]), "success")
            self.assertEqual(self.status([{**APPROVAL, "creator": {"login": "REVIEWER", "type": "User"}}]), "success")
        # An unlisted newer failure cannot revoke, and an unlisted success cannot approve.
        self.assertEqual(self.status([APPROVAL, {**other, "id": 950, "state": "failure"}]), "success")

    def test_workflow_and_bot_created_statuses_cannot_approve(self):
        # A workflow in a PR branch holds a token that can write statuses.
        for creator in [{"login": "github-actions[bot]", "type": "Bot"},
                        {"login": "github-actions[bot]", "type": "User"},
                        {"login": "other[bot]", "type": "Bot"}, {}]:
            with self.subTest(creator=creator):
                self.assertEqual(self.status([{**APPROVAL, "creator": creator}]), "pending")

    def test_newest_verdict_wins_regardless_of_order(self):
        failure = {**APPROVAL, "id": 901, "state": "failure"}
        recovered = {**APPROVAL, "id": 902}
        for statuses in [[APPROVAL, failure], [failure, APPROVAL]]:
            self.assertEqual(self.status(statuses), "pending")
        for statuses in [[APPROVAL, failure, recovered], [recovered, failure, APPROVAL]]:
            self.assertEqual(self.status(statuses), "success")

    def test_requested_changes_block_even_with_a_success_verdict(self):
        def review(login, state, at):
            return {"user": {"login": login}, "state": state, "submitted_at": at}
        blocked = [review("human", "CHANGES_REQUESTED", "2026-10-14T16:00:00Z"),
                   review("human", "COMMENTED", "2026-10-14T16:01:00Z")]
        self.assertEqual(self.status([APPROVAL], reviews=blocked), "pending")
        resolved = [*blocked, review("human", "APPROVED", "2026-10-14T16:02:00Z")]
        self.assertEqual(self.status([APPROVAL], reviews=resolved), "success")
        pending = [review("human", "CHANGES_REQUESTED", None)]
        self.assertEqual(self.status([APPROVAL], reviews=pending), "success")

    def test_gate_and_observer_agree_on_the_same_evidence(self):
        failure = {**APPROVAL, "id": 901, "state": "failure"}
        forged = {**APPROVAL, "creator": {"login": "github-actions[bot]", "type": "Bot"}}
        cases = [
            ("no verdict", [], "pending", "review"),
            ("success", [APPROVAL], "success", "approved"),
            ("failure", [failure], "pending", "fix"),
            ("failure after success", [APPROVAL, failure], "pending", "fix"),
            ("success after failure", [failure, {**APPROVAL, "id": 902}], "success", "approved"),
            ("forged", [forged], "pending", "review"),
            ("forged beside failure", [forged, failure], "pending", "fix"),
            ("other context", [{**APPROVAL, "context": "x"}], "pending", "review"),
            ("unlisted user", [{**APPROVAL, "creator": {"login": "implementer", "type": "User"}}], "pending", "review"),
            ("unlisted failure ignored", [APPROVAL, {**failure, "creator": {"login": "implementer", "type": "User"}}], "success", "approved"),
        ]
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
        for (name, statuses, expected_gate, expected_observer), observed in zip(cases, json.loads(result.stdout), strict=True):
            with self.subTest(case=name):
                self.assertEqual(self.status(statuses), expected_gate)
                self.assertEqual(observed, expected_observer)

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
    def test_statuses_beyond_first_page_are_examined(self):
        api = GitHub("unused")
        api.request = Mock(side_effect=[[{"context": "other"}] * 100, [APPROVAL]])
        statuses = list(api.paginate("/statuses"))
        self.assertEqual(len(statuses), 101)
        self.assertEqual(statuses[-1], APPROVAL)
        self.assertIn("page=2", api.request.call_args.args[0])
        self.assertEqual(review_status(PR, statuses, REPO, "main")[0], "success")

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
    def api(self, current=PR, statuses=None, checks=None, reviews=None):
        api = Mock()
        def paginate(path, **params):
            if path.endswith("/statuses"):
                return iter([APPROVAL] if statuses is None else statuses)
            if path.endswith("/reviews"):
                return iter([] if reviews is None else reviews)
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
    def test_missing_verdict_never_enables_auto_merge(self, publish, merge):
        api = self.api(statuses=[])
        reconcile(api, REPO, "main", PR, "url", True)
        self.assertEqual(publish.call_args.args[3], "pending")
        merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_verdict_with_skipped_ci_never_enables_auto_merge(self, publish, merge):
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
    def test_success_verdict_preserves_pr_eligibility(self, publish, merge):
        for current in [{**PR, "draft": True}, {**PR, "base": {"ref": "release"}},
                        {**PR, "head": {"sha": HEAD, "repo": {"full_name": "fork/repo"}}}]:
            reconcile(self.api(current), REPO, "main", PR, "url", True)
            self.assertEqual(publish.call_args.args[3], "pending")
            merge.assert_not_called()

    @patch("merge_gate.enable_auto_merge")
    @patch("merge_gate.publish_status")
    def test_failure_verdict_and_requested_changes_never_enable_auto_merge(self, publish, merge):
        failed = [{**APPROVAL, "id": 901, "state": "failure"}]
        blocked = [{"user": {"login": "human"}, "state": "CHANGES_REQUESTED", "submitted_at": "2026-10-14T16:00:00Z"}]
        for api in [self.api(statuses=failed), self.api(reviews=blocked)]:
            reconcile(api, REPO, "main", PR, "url", True)
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
    def test_current_verdict_enables_merge_for_exact_head(self, publish, merge):
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
