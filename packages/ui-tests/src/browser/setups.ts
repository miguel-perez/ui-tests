/**
 * Where the tag goes in each common setup, and how it reads the server's address from that setup's environment: the address differs
 * between rehearsal, previews and production, so it is never written into the page by hand. `init` prints these, the getting-started
 * page shows them.
 */
export const TAG_SETUPS: { name: 'Vite' | 'Astro' | 'Next.js' | 'Rails' | 'Plain HTML'; line: string }[] = [
  { name: 'Vite', line: 'index.html: <script data-ui-tests="%VITE_UI_TESTS_URL%">…</script>, with VITE_UI_TESTS_URL in .env' },
  { name: 'Astro', line: '<script is:inline data-ui-tests={import.meta.env.PUBLIC_UI_TESTS_URL}>…</script> in your layout' },
  { name: 'Next.js', line: "<script data-ui-tests={process.env.NEXT_PUBLIC_UI_TESTS_URL} dangerouslySetInnerHTML={{ __html: TAG_SCRIPT }} /> in app/layout.tsx, with TAG_SCRIPT from 'ui-tests/tag'" },
  { name: 'Rails', line: '<script data-ui-tests="<%= ENV["UI_TESTS_URL"] %>">…</script> in app/views/layouts/application.html.erb' },
  { name: 'Plain HTML', line: 'the tag as printed, with the address of your ui-tests server' },
]
