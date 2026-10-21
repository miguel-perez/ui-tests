# Tunnel: serving a local build to participants

`ui-tests recruit --tunnel` exposes the build on this machine, and a ui-tests server for it, at one public URL for one run, and prints the invite links under it. The code path is tested with a local reverse proxy (`UI_TESTS_TUNNEL=fake`); installing `cloudflared` and a named tunnel are documented, not executed.

## The front door

Participants need both the app and the ui-tests server: the player, the collector and `ui-tests.js`, which the app's tag loads. So `recruit --tunnel` starts a front door on this machine, one origin that sends the server's paths (`/ui-tests.js`, `/ui-tests/`, `/api/ui-tests/`, `/r/`, `/rv/`) to a ui-tests server of the command's own, on a free loopback port, and everything else to the app at `target.url`. In the app's HTML answers it rewrites the address in the tag's `data-ui-tests` to its own origin, so the tag works through the tunnel as written, with no rebuild or restart of the app. The tunnel opens to the front door.

## Quick tunnel (the default)

1. Install `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Start the build the study targets (`target.url` in `ui-tests.config.ts`, `http://localhost:3000` by default), with the tag in its layout.
3. Run `ui-tests recruit --tunnel`. It starts the front door, runs `cloudflared tunnel --url <front door>`, waits for the `https://*.trycloudflare.com` address and prints the links.

The command stays running while the tunnel is open; the front door and its ui-tests server run as long as the command. The tunnel closes at the run's deadline, on Ctrl-C, or when the process ends, whichever is first. Close the laptop and the tunnel goes with it; run the same command again (same key) to reopen it: it reissues the links nobody has opened yet under the new address, prints them, and records the new address.

Every address is appended to the run as `tunnels: [{ url, openedAt, closedAt }]` and listed in the trace.

## What the tunnel exposes

The whole build and the ui-tests server, not only the player. Participants still need their token: the collector (`/api/ui-tests/`) answers 401 without one or an attempt key, and `/ui-tests/<run>/` shows no study without it. The public landing is reachable by anyone with the address, as it is on your own machine.

## Named tunnel (your own hostname)

Not run from here. Create it with `cloudflared tunnel create`, route one hostname to the app and one to a ui-tests server you run with `npx ui-tests serve` (`cloudflared tunnel route dns`, and an ingress rule for each), and run it with `cloudflared tunnel run`. Set `target.url` to the app's hostname, `server.url` and the server's `UI_TESTS_PUBLIC_URL` to the server's, and point the app's tag at the server's hostname. Then use `recruit` without `--tunnel`.
