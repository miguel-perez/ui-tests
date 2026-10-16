# In the pull request: what GitHub lets a tool show, and how the best tools use it

16 October 2026. Desk research for the landing section "In the pull request" and for the integration itself. The belief that a PR integration is "limited to markdown with links" is mostly wrong, with one real limit: video cannot be hosted externally, and every image must be publicly reachable through GitHub's image proxy (Camo). `GITHUB_TOKEN` is itself a GitHub App installation token and can be granted `checks: write`, so the self-hosted track can create check runs; it loses the callback buttons, its own app identity, and images when the report host is private.

## 1. GitHub's surfaces

| Surface | Carries, limits | Where it shows | Who can create it |
|---|---|---|---|
| Commit status | `state` (error, failure, pending, success), `description`, `target_url`, `context`; at most 1000 per SHA and context ([statuses](https://docs.github.com/en/rest/commits/statuses)) | The checks list in the merge box with a Details link; statuses alone do not fill the Checks tab ([about status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)) | Push access; OAuth `repo:status` or a PAT |
| Check run | `name`, `status`, `conclusion` (action_required, cancelled, failure, neutral, success, skipped, timed_out; `stale` set by GitHub); `output.title` required; `output.summary` and `output.text` markdown, 65,535 characters each; `details_url` to "the integrator's site with the full details" ([check runs](https://docs.github.com/en/rest/checks/runs)) | The checks list, the Checks tab, the check page | "To create a check run, you must use a GitHub App"; `GITHUB_TOKEN` in Actions qualifies with `checks: write` ([token](https://docs.github.com/en/actions/concepts/security/github_token), [permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)) |
| Annotations | `path`, `start_line`, `end_line`, `annotation_level` (notice, warning, failure), `message` up to 64 KB, `title` up to 255; 50 per request, further updates append; Actions: 10 warnings and 10 errors per step | "Visible in the Checks and Files changed tab". Codecov is deprecating its annotations because "GitHub's API can't clear old annotations" ([Codecov](https://docs.codecov.com/docs/github-checks)) | App, or Actions |
| `output.images` | `alt` (required), `image_url` (required, full URL), `caption`; it exists and "adds images to the output displayed in the GitHub pull request UI" ([check runs](https://docs.github.com/en/rest/checks/runs)); layout and thumbnail size not found | The check page | App |
| `actions` (buttons) | At most 3; `label` 20 characters, `description` 40, `identifier` 20; a click sends `check_run.requested_action` ([guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)) | The Checks tab after completion | An App with a webhook |
| Job summary | GitHub Flavored Markdown, 1 MiB per step, at most 20 per job ([commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands), [blog](https://github.blog/news-insights/product-news/supercharging-github-actions-with-job-summaries/)) | The Actions run page, not the PR | Actions |
| Workflow annotation commands | `::error|warning|notice file=,line=,title=::msg`; 10 warnings and 10 errors per step | Files changed and the run page | Actions |
| PR comment | Markdown; mermaid renders ([diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)); uploads: images and GIFs up to 10 MB, video (.mp4, .mov, .webm) 10 MB free and 100 MB paid, public in public repos ([attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)); external images proxied by Camo and must be publicly reachable; "GitHub doesn't support externally hosted videos" ([anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)); body limit 65,536 characters (secondary sources); a sticky comment is one comment updated in place with a hidden marker ([sticky action](https://github.com/marocchino/sticky-pull-request-comment)) | The Conversation tab; each new comment notifies | App, PAT or `GITHUB_TOKEN` with `pull-requests: write` |
| Deployment status | States error, failure, inactive, in_progress, queued, pending, success; `environment_url`, `log_url`, `description` up to 140 ([statuses](https://docs.github.com/en/rest/deployments/statuses)) | The Conversation timeline | Push access |
| Merge box | Required checks must be "successful, skipped, or neutral"; anything else blocks, including for admins; a required check can be pinned to one app ([protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)) | | |

Video uploads became available in 2021 ([blog](https://github.blog/2021-05-13-video-uploads-available-github/)) and the CLI gained `--attach` in 2026 ([changelog](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments)); an app cannot rely on this, since it would have to upload as a user and external video is unsupported. Not confirmed: whether fork PRs get a read-only token, and whether Actions-created check runs keep a custom `details_url`.

## 2. How the best tools use these surfaces

| Tool | Surfaces | Line | Comment | Images | Detail link |
|---|---|---|---|---|---|
| Vercel ([docs](https://vercel.com/docs/git/vercel-for-github)) | Commit status, deployments, check runs, one bot comment | Per-project status; monorepos combine with "soft failures" | One comment with a table: Project, Status, Preview, Comments, Updated; silenceable per project | Not found | Preview and Inspect links |
| Codecov ([comments](https://docs.codecov.com/docs/pull-request-comments)) | Statuses `codecov/patch` and `codecov/project`, annotations, sticky comment | "92.00% of diff hit (target 91.49%)" | Updated in place by default; `require_changes` posts only when coverage changes | An "impacted file tree" SVG from codecov.io | Footer and graph link |
| Chromatic ([docs](https://www.chromatic.com/docs/in-pull-request)) | Checks "UI Tests" and "UI Review"; pending means "a human needs to review" | Not found | Not found | Not found | `buildUrl` |
| Percy ([docs](https://www.browserstack.com/docs/percy/source-code-integrations/overview)) | Status check; passes only when approved | Not found | Not found | Not found | Details opens the review |
| Playwright ([reporters](https://playwright.dev/docs/test-reporters)) | `github` reporter annotations; the HTML report as the detail page | | none | Report attachments | The report developers already know |
| Lighthouse CI ([docs](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/getting-started.md)) | Status checks through its App or a PAT | Not found | Not found | No | Links to uploaded reports |
| size-limit-action ([repo](https://github.com/andresz1/size-limit-action)) | Comment; can reject | | A comparison table | No | |
| Argos ([docs](https://argos-ci.com/docs/github)) | Statuses `argos`, `argos/<build>`, `argos/summary`; a comment | Not found | Yes | Not found | Links to Argos |
| Happo ([docs](https://docs.happo.io/docs/continuous-integration)) | Status: failure on diffs; a comment only without its App | | Fallback only | | Details opens the comparison |

Pattern: a one-line state on a check or status; a Details link to the vendor's own review page where the real work happens; at most one sticky, low-noise comment updated in place; the visual review tools put no images in GitHub.

## 3. Recommendation for ui-tests

**Name and conclusions.** Check name `ui-tests`. Conclusion `neutral` by default for all three outcomes: `success` draws a green tick that reads as "passed", which the PRD rules out; `neutral` still counts as passing for required checks, so it never blocks a merge even when a team marks the check required; `action_required` blocks and reads as "someone must review". An opt-in `block_on: problems` sends `failure` when problems are found.

| Outcome | `output.title` | Conclusion |
|---|---|---|
| Problems found | `4 problems found · 2 of 5 people reached the goal` | neutral (failure only with `block_on`) |
| None found | `No problems found with 5 people · 5 of 5 reached the goal` | neutral |
| Inconclusive | `Inconclusive · only 3 of 5 attempts completed` | neutral |

**Summary** (`output.summary`, about one screen): the sentence ("5 people tried *invite a colleague* on this preview. 2 of 5 reached the goal."); a table of the worst three problems: problem, page and element, people, impact; "Moment to watch" as a linked still (`[![Still, 0:58](https://ui-tests.com/r/k2m9/m1.png)](https://ui-tests.com/r/k2m9#problem-1&t=58)`), also sent in `output.images` with the timestamp as caption; links to the full report and to each person's attempt; a footer with n, the preview URL and the commit. The remaining problems go in `output.text` inside `<details>`.

**Annotations.** None by default: problems are on pages, not lines, and GitHub cannot clear old annotations. Only when the page's route file is in the diff, one `notice` per problem on its first line.

**Primary surface: the check page.** Tied to the commit, notifies nobody, supports images and the Details link, updates in place. **Secondary: one sticky comment**, three to five lines with the title, the worst problem and "Open report", updated in place and posted only when the outcome changes; can be turned off.

**Images.** A PNG or WebP still of the moment with a play glyph and the timestamp baked in, hosted on the report domain at an unguessable but public URL (Camo caches it, so no secrets or personal data in the still), well under 10 MB. No video in GitHub.

**Links.** Details to the report page; each problem to the report anchored at the moment; each person to their attempt.

**Self-hosted track** (`GITHUB_TOKEN` with `checks: write`, `pull-requests: write`): can create the check run with title, summary, text, images and annotations, post the sticky comment, write the job summary. Cannot: requested-action buttons, its own app identity (the check appears under GitHub Actions), being the expected source for a required check, images when the report host is private. Degraded path: the summary without images, plus a job summary and a sticky comment linking to the uploaded report.
