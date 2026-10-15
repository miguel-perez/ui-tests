---
description: Implement an authorized task, validate, and publish its pull request.
argument-hint: <task or GitHub issue>
---

Task: $ARGUMENTS

You own implementation through publication. The following workflow owns
CodeRabbit review, corrections, and merge. Work autonomously using the repository
instructions and the task's acceptance criteria.

1. Read repository instructions and the task context. If the task identifies a
   GitHub issue, read its current body and comments with `gh`. Record the concrete
   acceptance criteria and an implementation plan in
   `$ARTIFACTS_DIR/implementation.md` before editing.
2. Verify you are on the isolated branch provided by this run. Never implement
   directly on the default branch. Use the existing GitHub remote and explicit
   branch names for pushes.
3. Implement the entire scoped task. Add meaningful regression coverage when the
   behavior requires it. Run `npm run validate` and any additional checks needed
   to prove the acceptance criteria. Fix failures introduced by this change.
   Never remove or weaken review/CI controls to get a change merged.
4. Review your diff for unrelated changes and credentials. Commit only files
   belonging to this task, then push the current branch explicitly. Never
   force-push, commit credentials, or sweep another task's work into this commit.
5. Reuse an open PR for this exact branch when one exists; otherwise create a
   ready PR against the repository's default branch with `gh pr create`. The PR
   body must explain the final behavior and actual validation. Write multiline
   bodies to a file and use `--body-file`. Link the issue using `Closes #N` when
   the implementation meets its acceptance criteria. Mark your own draft PR
   ready with `gh pr ready` so CodeRabbit can review it.
6. Read the PR back with `gh pr view --json number,url,headRefName,state,isDraft`.
   Confirm it is ready (or already merged) and names this branch. Leave enabling
   auto-merge to the deterministic review tail. Update the implementation
   artifact with the PR URL, branch, commit, and validation results.

Return a concise implementation report with the PR URL and validation evidence.
The following deterministic node obtains the PR identity directly from GitHub.
Stop with a precise blocker if implementation or validation cannot finish;
never fabricate a PR identity or declare a failed check passed.
