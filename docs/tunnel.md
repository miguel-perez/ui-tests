# Tunnel: serving a local build to participants

`ui-tests recruit --tunnel` exposes the build on this machine at a public URL for one run, and prints the invite links under it. The code path is tested with a local reverse proxy (`UI_TESTS_TUNNEL=fake`); installing `cloudflared` and a named tunnel are documented, not executed.

## Quick tunnel (the default)

1. Install `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Start the build the study targets (`target.url` in `ui-tests.config.ts`, `http://localhost:3000` by default).
3. Run `ui-tests recruit --tunnel`. It starts `cloudflared tunnel --url <target>`, waits for the `https://*.trycloudflare.com` address and prints the links.

The command stays running while the tunnel is open. The tunnel closes at the run's deadline, on Ctrl-C, or when the process ends, whichever is first. Close the laptop and the tunnel goes with it; run the same command again (same key) to reopen it: it prints new links for the slots nobody has opened yet and records the new address.

Every address is appended to the run as `tunnels: [{ url, openedAt, closedAt }]` and listed in the trace.

## What the tunnel exposes

The whole build, not only the player. Participants still need their token: the collector (`/api/ui-tests/`) answers 401 without one, and `/ui-tests/<run>/` shows no study without it. The public landing is reachable by anyone with the address, as it is on your own machine.

## Named tunnel (your own hostname)

Not run from here. Create it with `cloudflared tunnel create`, route a hostname to it with `cloudflared tunnel route dns`, run it with `cloudflared tunnel run`, and set `target.url` to that hostname. Then use `recruit` without `--tunnel`.
