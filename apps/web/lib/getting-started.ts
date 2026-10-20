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
