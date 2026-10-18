---
description: Deliver a task through implementation, model review, fixes, CI, and automatic merge.
argument-hint: <task or GitHub issue>
---

Start the `autonomous-delivery` workflow for this request using Archon's workflow
execution tool. Preserve the full task text and current GitHub issue context.
Use isolated worktree execution. The workflow owns implementation, model review
corrections, validation, and automatic merge. Do not substitute a bundled
workflow that stops at a human PR review gate.

Request: $ARGUMENTS
