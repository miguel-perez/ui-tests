# The no-repo path is a one-command deploy, not a hosted service

17 October 2026. Decision taken on the landing's "No repo to put it in? Paste one line." section, after asking what the snippet needs behind it.

## The question

A script tag only records. Something has to serve the script, collect the recordings, store them, host the player the participant sees, and talk to the panel. PRD 05 called that "our collector, our store, our wallet": a hosted service operated by ui-tests.com. The alternative on the runner track, `ui-tests run --tunnel`, keeps all of that on the author's machine, which must stay up for the run, so it fits a run watched for a few hours and not a 48-hour deadline or the visitors source, which listens all the time.

## The decision

There is no hosted service. The no-repo path is **a one-command deploy that the author owns**: `npx ui-tests host` pushes the collector, the player and the store to a free tier on the author's own account, prints the one line to paste, and the snippet points at that deploy. Recordings sit in the author's storage; panel accounts are the author's own token or key, as PRD 03 already has them; the visitors source (intercept) runs on that deploy, since it is always up. "Everyone is using agents": the one command is as easy to run as the paste was, and nothing of other people's sites lands on ui-tests.com.

## What changes

- **PRD 05, "Where things run".** The hosted column stops saying "our": collector, store and hooks run on the author's deploy; payment is the author's panel wallet in both tracks; the intercept cap per day stays, on the deploy. The reachability table gains a row, "The author's deploy": participants reach the live site; the collector and store live on the deploy; the limit is the provider's free tier.
- **PRD 03.** The `intercept` source's "hosted" becomes "the author's deploy"; the panel rows already say "the author's token / key".
- **The landing's hosted section.** Heading "No repo to put it in? One command." The lead names the deploy and that it is the author's. Two pieces, unnumbered: the command and what it deploys, and the line it prints. The dashboard the deploy serves is not on the landing (dropped in review to keep the section small; the deploy still serves it). Closing: "Same test, same report, on a box you own."
- **The sources table.** The visitors row's "On the hosted version" becomes "On your deploy".
- **Words to keep.** "Hosted" no longer describes ui-tests.com; the only hosted thing is the author's deploy. Nothing on the page says "our servers" or "we store".

## Open

Which provider the first `host` targets. The command should be provider-agnostic in its contract (a container plus a bucket) with one provider shipped first.
