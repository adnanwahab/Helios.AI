# Email: signup, the day-3 email, and replies

1. Someone enters their email in the signup iframe (`/signup`, or `/signup?layout=inline` for one line).
2. Helios stores the address in Supabase Postgres and schedules one email for 72 hours later.
3. A Netlify scheduled function (`netlify/functions/email-tick.mjs`, hourly) sends due emails through Resend.
4. The email shows one shared goal (default `HGA-078`, *Government Responds and Explains*) with **Yes**, **No** and **Edit** links at the bottom. Each opens the goal's source bill on Civic Synthesis (`https://civic-synthesis.fly.dev/votes?bill=HFL-078&vote=yes|no|edit`), where the person confirms their answer. Clicking a link never records a vote by itself, because mail scanners open links too.
5. Replies to the email reach Resend's receiving address. Resend calls `/api/email/inbound`; Helios checks the signature, stores the reply and reads its first line as yes / no / edit / unsubscribe / reply.

| Path | What it does |
|---|---|
| `GET /signup` | The embeddable signup page (card, or one line with `?layout=inline`), served from the CDN |
| `POST /api/email/subscribe` | JSON `{email}` from the page; plain form posts work without JavaScript |
| `GET/POST /email/unsubscribe?id=…&token=…` | Confirmation page, and RFC 8058 one-click unsubscribe from mail apps |
| `POST /api/email/inbound` | Resend `email.received` webhook (Svix signature required) |

## Setup

1. **Sending domain.** In Resend, add and verify a domain you own (for example `helioshtml.com`) by adding the DNS records it shows.
2. **Receiving address.** In Resend, open Emails → Receiving. Use the generated `anything@<id>.resend.app` address, or point the MX record of a *subdomain* such as `reply.helioshtml.com` at Resend. Don't put the root domain's MX on Resend, or all of that domain's mail goes there.
3. **Webhook.** In Resend → Webhooks → Add webhook: URL `https://helioshtml.com/api/email/inbound`, event `email.received`. Copy its signing secret (`whsec_…`).
4. **Secrets.** In the Netlify UI (Site configuration → Environment variables), set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` (`Helios <hello@helioshtml.com>`), `EMAIL_REPLY_TO` (`reply@<your receiving address>`) and `SUPABASE_DB_URL`. Mark the keys as secret.
5. **Check it.** `node scripts/email-status.js` shows signup counts, the next send and recent replies (with `SUPABASE_DB_URL` set).

Until `RESEND_API_KEY` and `EMAIL_FROM` are set, signups are stored and the scheduled run logs a warning; the emails go out once both are configured. Without `RESEND_WEBHOOK_SECRET`, the inbound webhook answers 503.

**Try it end to end:** sign up with your own address, then run `node scripts/email-status.js send-now you@example.com`. The next scheduled run sends it (up to an hour, because the schedule is hourly).

## Optional settings

| Variable | Default | Purpose |
|---|---|---|
| `EMAIL_GOAL_ID` | `HGA-078` | Which shared goal the email features; its `sourceProposalId` picks the Civic Synthesis bill |
| `EMAIL_DELAY_HOURS` | `72` | Time from signup to the email |
| `PUBLIC_BASE_URL` | `https://helioshtml.com` | Used in unsubscribe links |
| `CIVIC_SYNTHESIS_URL` | `https://civic-synthesis.fly.dev` | Where Yes / No / Edit lead |

## Throughput

The scheduled run sends at most 50 emails and stops starting new sends after 7 seconds, so it fits Netlify's function timeout. Anything left waits for the next hour. If signups outpace that, change the schedule in `netlify/functions/email-tick.mjs` to run more often, after checking your Netlify plan's scheduled-function limits.

## Embedding the form elsewhere

```html
<iframe src="https://helioshtml.com/signup" title="Get one email from Helios" style="width:100%;max-width:420px;height:280px;border:0"></iframe>
<iframe src="https://helioshtml.com/signup?layout=inline" title="Get one email from Helios" style="width:340px;height:44px;border:0"></iframe>
```

After a signup the page sends `{type: "helios:email-signup", status: "subscribed"}` to the parent window with `postMessage`.

## Safety and privacy

- Only the address and the embedding site's origin are stored. Unsubscribing deletes the address and keeps a hash so the address is not emailed again, even if someone signs it up again.
- There is no confirmation email, so anyone can type any address. To limit misuse, an address gets at most one email per 30 days, signups are rate limited per visitor (20 an hour, using Netlify's `x-nf-client-connection-ip`), a hidden field catches simple bots, and the email says "Didn't sign up? You can ignore it."
- Sends use a Resend idempotency key per signup, so a retry after a crash or timeout can't send twice. Resend outages, rate limits and key problems are retried with backoff; addresses Resend rejects are marked failed.
- Replies (text, sender and Resend's SPF/DKIM/DMARC results) are stored in Supabase and are included in its backups. A "STOP" or "unsubscribe" reply unsubscribes the sender only when their domain authenticated (DKIM or DMARC pass).
