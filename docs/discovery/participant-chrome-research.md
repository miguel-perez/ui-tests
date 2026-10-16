# Participant chrome: research and spec

16 October 2026. Builds on [`participant-overlay-research.md`](participant-overlay-research.md), which settled the card contents, the bar controls, the confirmation on Done, give-up, the SEQ wording and consent; none of that is reopened. The brief: the chrome must be modern, effective and white-labelled, and must not share the host page's panel colour.

## Problems in the current artefacts

- **Taskbar:** buttons about 32px tall, under the 44px floor on a phone. Labels "I'm done" / "I can't do this" differ from the settled "Done" / "I couldn't do this". No way to reopen the task text.
- **Ease question:** says "How easy was that?" and "1 very hard". The settled stem is "Overall, how difficult or easy did you find this task?" with "Very difficult" at 1.
- **All three:** hard-code Fira and the amber accent, which reads as our brand.

**A PRD conflict to fix.** PRD 06 says the taskbar is "styled as part of the site rather than a third-party overlay". The author has since decided the bar must not share the host's panel colour. The recommendation follows that decision; the PRD sentence should be amended.

## 1. What the field does

| Tool | Where the chrome sits, can it move | Done and give-up; recording; progress | Branding and theming | Injection |
|---|---|---|---|---|
| Maze, website test | Instructions modal bottom-left; moves with a "Drag" icon ([help](https://help.maze.co/hc/en-us/articles/46070670578067-Interacting-with-a-Website-Test-revised)) | "End task"; recording indicator not found; progress not found | Logo on welcome and thank-you; brand colour on the prompt button only. "Custom colors, typefaces/fonts, dark mode… are not yet available"; watermark removal Enterprise only ([branding](https://help.maze.co/articles/8046794486-branding-options-for-your-unmoderated-studies)) | Separate window held to 1180–1380px; optional snippet for heatmaps |
| UserTesting, Chrome | "Task widget… in the top right corner", draggable to another corner ([help](https://help.usertesting.com/hc/articles/11880311619101-How-Does-UserTesting-Capture-a-Contributor-s-Activity)); other browsers use two tabs | "Next", then "Done"; only an audio-level indicator | Theming not found | Browser extension |
| Userlytics | "Floating tasks window", movable, minimisable, one task at a time ([help](https://www.userlytics.com/helpcenter/clients/how-and-when-to-use-our-overlay-web-recorder/)) | Not found | Custom landing pages; recorder theming not found | Extension |
| Lyssna | Floating picture-in-picture window, minimisable | "I'm done" | Logo 25×150px and a button colour; full removal on Enterprise (sources conflict); only for self-recruited participants ([help](https://help.lyssna.com/en/articles/4952936-test-branding)) | New tab plus the window |
| Loop11 | Fixed full-width strip at the top | "Task Complete" / "Abandon Task" | Themes with a logo and six colours ([announcement](https://www.loop11.com/?p=7466)) | Extension |
| Trymata | Narrow column on the right; newer mode uses two tabs ([blog](https://trymata.com/blog/trymata-new-download-free-recorder/)) | Tasks one at a time | Not found | No download |
| Userbrain | Extension popup only, no overlay | Elapsed timer on the extension icon | Not found | Extension |
| PlaybookUX | Not found | Not found | Not found | Extension or app |
| Sprig | Bottom-right by default; corners or centred modal; "always appear at the bottom" on a phone ([docs](https://docs.sprig.com/docs/microsurvey-look-and-feel)) | n/a | One brand colour drives "border, button background, and radio fills"; separate dark-mode colour; the rest by CSS; signature off on Enterprise only | SDK |
| Hotjar surveys | Position setting | n/a | Background, button and font colour; "Hide Hotjar Branding" plan-gated ([help](https://help.hotjar.com/hc/en-us/articles/36819973617681)) | Script tag |

Across the field: the idiom is a small floating surface in a corner that can be moved and minimised; only Loop11 uses a full-width strip and only Trymata a side panel. Theming is thin everywhere, usually one accent and a logo, and removing the vendor brand is an upsell. No vendor documents a theme inherited from the host page.

## 2. Overlays on someone else's page

| Concern | What the sources say | What to do |
|---|---|---|
| **Isolation** | Shadow DOM does not block inheritance: color, font-family, line-height "arrive from the host's ancestors"; `all: initial` resets them but not custom properties; a host ancestor with `transform` or `filter` re-parents `position: fixed` ([open-wc](https://www.open-wc.org/guides/knowledge/styling/styles-piercing-shadow-dom/), [dev.to](https://dev.to/michael-yousrie/things-shadow-dom-does-not-isolate-3jj3)) | Closed shadow root with `:host { all: initial }`; px not rem; mount on `document.documentElement` |
| **Stacking** | A popover "is put into the top layer so it will sit on top of all other page content"; `manual` popovers are not light-dismissed ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using)); Sentry resorts to `--z-index: 100000` ([Sentry](https://docs.sentry.io/platforms/javascript/user-feedback/configuration/)) | `popover="manual"` for the bar; `<dialog>.showModal()` for the card and questions; no z-index race |
| **Focus obscured** | SC 2.4.11: a focused component must not be "entirely hidden due to author-created content"; sticky bars are a named cause; for movable content only the initial position is tested ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)) | `scroll-padding-bottom` equal to the bar's height on the host's `<html>` while shown |
| **Phone keyboard** | Chrome defaults to `resizes-visual`, so fixed bars can sit under the keyboard; Safari lacks `interactive-widget` ([Chrome](https://developer.chrome.com/blog/viewport-resize-behavior), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=230225)) | Hide the bar while a host input has focus on touch; position from `visualViewport`; pad with `env(safe-area-inset-bottom)` |
| **ARIA** | `role="toolbar"` only for "3 or more controls" ([APG](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)) | The bar is `role="region"` with the study name as its label; normal tab stops |
| **Theming tokens** | Stripe Appearance API: `colorPrimary`, `colorBackground`, `colorText`, `colorDanger`, `fontFamily`, `fontSizeBase`, `borderRadius`, `spacingUnit`, `focusOutline`, `disableAnimations`; inputs at least 16px on mobile ([Stripe](https://docs.stripe.com/elements/appearance-api)). Sentry: `--foreground`, `--background`, `--accent-background`, `--font-family`, `colorScheme: system`, `showBranding` default true | Copy the five-token vocabulary |
| **"Powered by"** | Default on, removable by plan (Maze, Sprig, Lyssna, Hotjar, Sentry) | Default it off, as PRD 06 requires |
| **Targets** | SC 2.5.8: at least 24×24 CSS px, aim for 2.5.5 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)); Apple 44pt, Material 48dp | 44px on touch, 36px minimum with a pointer |
| **"Modern"** | Vercel Toolbar shrinks to a few icons, expands on hover, drags to an edge and remembers the spot ([changelog](https://vercel.com/changelog/improvements-to-vercel-toolbar), [reposition](https://vercel.com/changelog/reposition-the-vercel-toolbar)); Liquid Glass translucency drew legibility complaints and Apple added a "Tinted" option ([pxlnv](https://pxlnv.com/blog/on-liquid-glass/)) | Compact pill, hairline border, soft shadow, one accent; **opaque**, because blur over an unknown page cannot guarantee contrast |

## 3. What the corpus says

- **Cooper, About Face** (`_sources/P2_24_Cooper_About_Face.txt`): a transient product "appears, performs its job, and then quickly leaves" (ch. 9, ~line 10515); "Transient applications must be simple, clear, and to the point", with "big buttons with precise legends", "nothing should be abbreviated" (~10530); because it "may obscure the very information that it is chartered to work on… [it] must be movable" (~10601); "limited to a single window and view" (~10577), which argues for confirming Done inside the pill rather than in a dialog. The recording indicator is daemonic: quiet and visible. Ch. 8: considerate software remembers "placement of palettes" (~9365), gives "rich modeless feedback… in plain view" (9333) and does not ask "Are you sure?" (~9364), so the Done confirmation is an inline morph, not a modal.
- **Tidwell, Designing Interfaces** (`P3_Tidwell_Designing_Interfaces.txt`): Modal Panel, "Show only one page, with no other navigation options, until the user solves the immediate problem", ways out "one, two, or maybe three… short, verbish labels" (6772ff), fits the card and the questions. Escape Hatch lets the user "say 'I'm done with this; forget I ever started it'" and "helps people feel like they can safely explore" (7483, 7527): the job of "I couldn't do this". Progress Indicator shows "What's currently going on… How to stop it" (11945). Good Defaults are "not always wise when answers might be sensitive" (18200): never preselect a scale value. Input Prompt "sits right where the user will type" (17361): use it for the open box.
- **Norman** (`P4_Norman_Design_of_Everyday_Things.txt`, 4507): "Visibility. Make relevant parts visible. Feedback. Give each action an immediate and obvious effect." (8108): "When an action has an undesirable result, it must be readily reversible."
- **Krug** (`P4_Krug_Dont_Make_Me_Think.txt`): "self-evident. Obvious. Self-explanatory." (776); "each click is a mindless, unambiguous choice" (1877); "Omit needless words" (1976); never "devote a millisecond of thought to whether things are clickable" (905).
- **ISO 9241-210** (`ISO_9241-210/atoms/`): self-descriptiveness, "it is obvious to the users which dialogue they are in, where they are within the dialogue, which actions can be taken" (p. 15), which argues for a visible "Task n of N" and chrome distinct from the page; user involvement "should be active… reflect the range of users" (p. 6), so keyboard, screen reader and reduced-motion parity keep the sample unfiltered.

## 4. Recommendation

Token key. Themeable: A accent, S surface, T text, R radius, F font. Fixed: focus ring 2px solid with 2px offset, two-tone; contrast floor 4.5:1 text, 3:1 non-text.

### Scenario card

| Element | Behaviour | Desktop / phone | Tokens | Accessibility | Source |
|---|---|---|---|---|---|
| Container | Modal `<dialog>`; page dimmed 40% | Centred, max 520px / bottom sheet, full width, 16px gutter, safe-area padding | S, R | Focus to the heading; Esc does nothing before the task starts | Tidwell Modal Panel |
| "Task 2 of 5" | Static | 13px | T at 70% | Part of the heading | ISO self-descriptiveness |
| Scenario | 2–4 sentences plus the line saying how the task ends | 17px, line-height 1.5 | T, F | Never truncates | NN/g via overlay research |
| "Start task" | One primary button | 44px / full width, 48px | A, R | Contrast floor | Cooper "precise legends"; Krug |

### Bar

| Element | Behaviour | Desktop / phone | Tokens | Accessibility | Source |
|---|---|---|---|---|---|
| Pill | `popover="manual"`; draggable to bottom or top, centre or corner; position remembered | Bottom-centre, 16px inset, 52px tall / docked to the bottom, full width, 56px plus safe area, hidden while a host input has focus | S inverse, R pill capped, shadow | `role="region"` with `aria-label`; scroll-padding on the host | Cooper movable; Vercel; WCAG 2.4.11 |
| Task summary | One line, ellipsis; click expands the full card in place | Up to 280px / an icon button labelled "Task" | T, F | `aria-expanded`; full text when expanded | NN/g; UXtweak |
| Done | Primary; morphs the pill to "Finished this task? Yes / Not yet" in place, no dialog | 44px / 48px | A | Focus to "Yes"; result in `aria-live` | UXtweak; Cooper single view |
| I couldn't do this | Secondary, ghost; same inline confirmation before the first interaction | Same | T, hairline | Text label, never icon only | Tidwell Escape Hatch |
| Drag handle | Grip | 24×44 / none | T at 50% | Keyboard alternative: "Move to top" | Cooper |

### Recording indicator

| Element | Behaviour | Desktop / phone | Tokens | Accessibility | Source |
|---|---|---|---|---|---|
| Chip | Separate small pill attached to the bar's left end, 6px gap: dot, "Rec 03:12", mute, pause | 32px / leading slot of the docked bar | S; the dot a fixed semantic red, not A | "Rec" plus the time so colour is never the only signal (SC 1.4.1); time not announced, state changes announced | Cooper modeless feedback; Norman |
| Pulse | 2 s opacity pulse | Same | Fixed | Static under reduced motion | MDN |
| Paused | Hollow dot, label "Paused" | Same | Fixed | Announced | Tidwell Progress Indicator |

### Question screens

| Element | Behaviour | Desktop / phone | Tokens | Accessibility | Source |
|---|---|---|---|---|---|
| Sheet | The card's dialog, one question per screen | Centred 520px / bottom sheet | S, R | Focus to the question | Tidwell; overlay research |
| SEQ 1–7 | Settled stem and anchors; nothing preselected | Seven 44px squares / seven 40px visual squares inside 44px touch targets, 4px gap, reflowing to two rows if the width needs it | Selected is A; others hairline | `radiogroup`, arrow keys | MeasuringU; Tidwell Good Defaults |
| Confidence | Same control, only when completion cannot be verified | Same | Same | Same | Overlay research |
| Open box | Prompt inside the box | 3 rows / 16px font (no iOS zoom) | T, F | Visible label | Tidwell Input Prompt; Stripe |
| "Talk instead" | Swaps the box for a mic control with level meter, timer and "Stop" | 44px | A | Mic permission asked only on this tap; transcript shown after | Norman feedback |
| Next / Finish | Primary; "Finish" on the last screen | 44px / full width | A | Contrast floor | UserTesting via overlay research |

### White-labelling rules

1. **What the author sets**, under `chrome:` in the config: `name` (card and consent), `accent`, `surface` (`"inverse"` default, `"light"`, `"dark"` or a colour), `text`, `radius` (0–16px), `font` (`"inherit"` default or a stack), `scheme` (`"auto"` default), `position` (`"bottom"` default or `"top"`), `poweredBy` (default `false`).
2. **Inherit only what is safe.** `font-family` from the host body's computed style; `scheme` from `prefers-color-scheme` and the host body's background luminance. Never sample the accent from the host: a sampled accent can match the site's own buttons and make Done look like part of the site under test. The default accent is the inverse surface's text colour. Radius ships neutral at 10px.
3. **Distinct without our brand: the inverse surface.** The default surface is the host's text colour and the chrome text is the host's background colour, so a dark pill sits on a light site and a light pill on a dark site, opaque, with a 1px hairline at 12% and a soft shadow. The bar never matches the host's panels and needs no logo; distinctness comes from form and tone, not identity.
4. **Floors the author cannot override.** Focus ring, 44px touch targets, reduced motion, 16px inputs and the recording red. `npm run validate` checks every rendered pair the config produces: text on surface, dim text on surface, button text on accent, accent and hairline on surface, at 4.5:1 for text and 3:1 for non-text, and warns with the failing pair. At runtime the text on the accent flips between black and white, and a `text` or `surface` value that cannot reach the floor falls back to the inverse default.
5. **Where "ui-tests" appears.** One "Powered by ui-tests" line in the consent screen's footer, only when `poweredBy: true`. Never in the bar, card, questions or recording chip.

### Revision after the author's review

The first build of this spec read as two heavy boxes, and a separate recording chip wrapped and looked bolted on. Amended: the bar is **one** pill, 40px tall and fully rounded, opaque on the inverse surface, bottom **right** by default (the corner least likely to cover primary content), draggable and remembered, hidden while a host input has focus. The recording state is the pill's leading segment behind a hairline: red dot, elapsed time, a pause control, and **no microphone control**, because voice is only captured when the person chooses "Talk instead" on the questions after the task. Then the task summary (one line, truncated, press to reread the card), Done as a small filled pill in the accent, and "I couldn't do this" as plain text. Cooper's "single window and view" and the Vercel idiom both argue for the one surface; the separate chip in the table above is withdrawn.

### Idiom: a compact floating pill, docked as a bottom bar on phones

It beats the full-width strip (Loop11), which collides with the host's sticky headers and footers, reads as a browser infobar and costs a row on every page; and the side panel (Trymata), which narrows the host's layout and can push the site across a breakpoint, so the participant tests a different layout from the one visitors see. The pill is the corner idiom Maze, Userlytics and UserTesting converged on, compacted in the Vercel manner, and what Cooper prescribes for a transient surface: small, movable, bold labels, a single view. It stays opaque rather than glass.
