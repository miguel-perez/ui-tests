# D2 implementation captures

Captured with worktree-local Playwright Chromium, at 1440 × 1000 (and 375 × 1000
for the full routes), reduced motion enabled. Full-page captures are JPEG;
individual surfaces are PNG. Regenerate with:

```sh
PLAYWRIGHT_BROWSERS_PATH=0 CAPTURE_SITE=1 npm run test:e2e
```

The approved references remain in `../screens-d2/`; the source markup remains in
`../artefacts/`. The issue's palette and readable contrast override the older
reference colours. Real recordings replace the empty video placeholders. Every
terminal here is captured from the generated Ink fragment.

| Surface | Approved capture | Implementation at 1440 |
| --- | --- | --- |
| Quiet terminal | [Approved](../screens-d2/artefact-terminal.png) | [Port](d2-terminal-quiet-window-1440.png) |
| Report rows | [Approved](../screens-d2/artefact-report.png) | [Port](d2-report-rows-1440.png) |
| Trace viewer | [Approved](../screens-d2/artefact-trace.png) | [Port](d2-trace-viewer-1440.png) |
| Code window | [Approved](../screens-d2/artefact-code.png) | [Port](d2-code-window-1440.png) |
| Pull request check | [Approved](../screens-d2/artefact-check.png) | [Port](d2-pull-request-check-1440.png) |
| Scenario card | [Approved](../screens-d2/mini-scenario-card.png) | [Port](d2-scenario-card-1440.png) |
| Taskbar | [Approved](../screens-d2/mini-taskbar.png) | [Port](d2-taskbar-1440.png) |
| Ease question | [Approved](../screens-d2/mini-ease-question.png) | [Port](d2-ease-question-1440.png) |
| Invite link | [Approved](../screens-d2/mini-invite-link.png) | [Port](d2-invite-link-1440.png) |
| Cap control | [Approved](../screens-d2/mini-cap-control.png) | [Port](d2-cap-control-1440.png) |
| Visitor invitation | [Approved](../screens-d2/mini-visitor-invitation.png) | [Port](d2-visitor-invitation-1440.png) |

Full routes: [landing desktop](landing-1440.jpg), [landing mobile](landing-375.jpg),
[guide desktop](guide-1440.jpg), [guide mobile](guide-375.jpg).
