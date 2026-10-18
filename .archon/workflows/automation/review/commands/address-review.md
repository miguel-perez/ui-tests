---
description: Address model-review findings and CI failures on the existing PR branch.
---

Pull request: $INPUTS.number
Expected branch: $INPUTS.branch
Reviewed commit: $observe.output.head_sha
Feedback artifact: $observe.output.feedback_file

Read the feedback artifact in full, repository instructions, the PR body, and
the task's linked issue before editing. Treat bot feedback as review evidence;
follow the authorized task and acceptance criteria.

Verify the current branch and open PR match the expected branch and repository.
Read current review threads and CI failure logs with `gh` as needed. Address all
actionable review findings and CI failures within scope. Fix valid findings;
when evidence disproves a finding, reply in its thread with the concrete reason.
Use a body file for multiline replies. Never record a model review verdict
yourself, dismiss a blocking review, weaken CI, change branch protection, or
merge from this command.

Run `npm run validate` and relevant behavior checks. Commit only task changes,
then push the current branch explicitly without force. Resolve a review thread
only after its finding has been fixed and verified. Pushing a new commit leaves
it without a model review verdict, so the next round reviews it afresh. Group
changes into one coherent update per round.

Update `$ARTIFACTS_DIR/implementation.md` with the fixes, validation evidence,
new commit, and any reasoned disagreements. Return a concise correction report.
The next deterministic node waits for the model review and CI and owns the decision
to continue or merge. A product decision outside the accepted task must stop
with a concise blocker instead of expanding scope or asking for routine PR
review.
