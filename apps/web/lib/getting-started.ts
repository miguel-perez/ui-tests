import { compilation, example } from './copy'

const [install, init, rehearse] = compilation.commands

/**
 * The getting-started page: from an empty app to a first result, each command as the landing's compile
 * section names it, in the landing's words. The mount lines are the three `npx ui-tests init` prints; the study is the one this
 * site runs on itself (`apps/web/ui-tests/landing.ui.test.ts`).
 */
export const gettingStarted = {
  title: 'Get started',
  lead: 'From your app to a first result in six steps. Each command copies as it is; the last one runs the whole study on you, recruits nobody and costs nothing.',
  clone: {
    heading: 'The package is not on npm yet',
    text: 'Until it is published, `npm install -D ui-tests` finds nothing. Run it from a clone of the repository instead: this site is the app, and its study is `apps/web/ui-tests/landing.ui.test.ts`.',
    commands: ['git clone https://github.com/miguel-perez/ui-tests', 'cd ui-tests', 'npm ci && npm run dev'],
    then: 'Leave that running, and in a second terminal run `npx ui-tests` in `apps/web`.',
  },
  ci: {
    heading: 'Running from CI',
    text: 'Runs and results live in a database, so a record outlives any one preview. Locally that is a file; for CI and previews use Postgres on Neon. These steps need your own accounts, so nothing here is done for you.',
    steps: [
      'Create a Neon project and a database, and copy its pooled connection string.',
      'In Vercel, add `UI_TESTS_DATABASE_URL` with that string, and `UI_TESTS_SERVER=1`, to the Preview environment.',
      'In GitHub, add the same string as the repository secret `UI_TESTS_DATABASE_URL`, and pass it to the workflow that runs your studies.',
    ],
    then: 'For a local try-out without Neon, `UI_TESTS_DATABASE_URL=pglite:memory` runs the same store in memory. The tables are created on first use.',
  },
  sharing: {
    heading: 'Sharing a report',
    text: 'Set `UI_TESTS_SHARE_SECRET` on the server, then `npx ui-tests report <run> --share` prints a link to the report. Anyone with the link sees the report and its recordings; without the secret there are no share links. A link has no expiry. To revoke every link you have made, change `UI_TESTS_SHARE_SECRET`: the old links stop opening.',
  },
  accessibility: {
    heading: 'Accessibility',
    text: 'Everything a participant meets works with the keyboard alone: Tab and Shift+Tab to move between questions and buttons, the arrow keys to choose within a set of choices, Space to tick a box, Enter to press a button. Every screen has one heading, one question and labelled controls; the bar announces the question it asks and any offer of more time. The checks run in a real browser with axe on every screen. What they cannot do is listen, so before you publish a study, check it by ear.',
    manual: [
      'On a Mac, open Safari and turn VoiceOver on with Command+F5.',
      'Open a participant link and go from the first screen to the thanks with the keyboard only.',
      'On each screen, listen for the heading, then the question, then each choice with its place in the group (for example "3 of 5").',
      'On the task page, press Tab until the bar is read: the task, Done, and I couldn\'t do this. Press Done and listen for "Finished this task?".',
      'When the bar offers more time, listen for the offer, then press the button once with the keyboard.',
    ],
    then: 'Do this by hand. It is not part of the automated checks. Each person also says which browser, device and assistive technology they use, and that is kept with their attempt. Spoken answers are kept as audio; set `UI_TESTS_TRANSCRIBER` to a module whose default export turns audio into text to keep the words too.',
  },
  steps: [
    { id: 'install', heading: 'Install', text: install.does, command: install.command },
    { id: 'init', heading: 'Write the config and a study', text: init.does, command: init.command },
    {
      id: 'mount',
      heading: 'Mount it in your app',
      text: 'Three lines in a Next.js app: the bar in your root layout, the collector, and the page each person starts on. Without a run on, the bar renders nothing and loads nothing.',
      lines: [
        "import { UiTests } from 'ui-tests/next'   and   <UiTests />   in your root layout",
        "app/api/ui-tests/[[...path]]/route.ts:   export { GET, POST } from 'ui-tests/server'",
        "app/ui-tests/[run]/page.tsx:   export { PlayerPage as default } from 'ui-tests/server'",
      ],
    },
    {
      id: 'study',
      heading: 'Write the study',
      text: 'Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. This is the study this site runs on itself, in `ui-tests/landing.ui.test.ts`:',
      file: 'ui-tests/landing.ui.test.ts',
      code: example,
    },
    { id: 'run', heading: 'Run it on yourself', text: rehearse.does, command: rehearse.command },
    {
      id: 'read',
      heading: 'Read the result',
      text: 'When you press Done and answer the questions, the terminal says whether your check passed, lists the moments that got in the way, and opens your trace on this machine. A run on yourself is a rehearsal: it never counts toward the five people a study plans for, so the sentence reads',
      result: 'Rehearsal: 0 of 5 planned attempts recorded.',
    },
  ],
} as const
