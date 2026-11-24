# Email: signup, the day-3 email, and replies

1. Someone enters their email in the signup iframe (`/signup`, or `/signup?layout=inline` for one line).
2. Helios stores the address in Supabase Postgres and schedules one email for 72 hours later.
3. A Netlify scheduled function (`netlify/functions/email-tick.mjs`, hourly) sends due emails through Resend.
4. The email shows one shared goal (default `HGA-078`, *Government Responds and Explains*) with **Yes**, **No** and **Edit** links at the bottom. Each opens the goal's source bill on Civic Synthesis (`https://civic-synthesis.fly.dev/votes?bill=HFL-078&vote=yes|no|edit`), where the person confirms their answer. Clicking a link never records a vote by itself, because mail scanners open links too.
5. Replies to the email reach Resend's receiving address. Resend calls `/api/email/inbound`; Helios checks the signature, stores the reply and reads its first line as yes / no / edit / unsubscribe / reply.
6. Every inbound email (a reply, or a new message to an address such as hello@heliosai.lol) gets an **automatic reply within seconds**, sent from the same webhook request. A "yes", "no" or "edit" reply gets a one-click link to confirm that vote on Civic Synthesis, because email answers are not counted as votes. Anything else gets "your message arrived; a person reads every email".

### Auto-reply rules

- Threaded as `Re: <subject>` with `In-Reply-To`, and marked `Auto-Submitted: auto-replied` so other auto-responders don't answer it.
- Never sent to robots or lists: `Auto-Submitted` other than `no`, `Precedence: bulk/junk/list`, `List-Id`, `List-Unsubscribe`, `X-Autoreply`, `Feedback-ID`, noreply / mailer-daemon / postmaster senders, or our own addresses.
- Not sent for STOP / unsubscribe replies.
- At most `EMAIL_AUTO_REPLY_PER_DAY` (default 3) per sender per day, which also stops mail loops.
- If Resend can't send the reply (outage or rate limit), the webhook answers 502 so Resend redelivers it. The redelivery tries again, and the idempotency key `helios-autoreply-<email_id>` stops a double send.
- The result is stored on each message in `email_inbound.auto_reply_status`: `sent`, `failed`, `disabled`, `not_configured` or `skipped_*`.
- `EMAIL_AUTO_REPLY=0` turns it off. It also needs `RESEND_API_KEY` and `EMAIL_FROM`, the same as other sending.

| Path | What it does |
|---|---|
| `GET /signup` | The embeddable signup page (card, or one line with `?layout=inline`), served from the CDN |
| `POST /api/email/subscribe` | JSON `{email}` from the page; plain form posts work without JavaScript |
| `GET/POST /email/unsubscribe?id=…&token=…` | Confirmation page, and RFC 8058 one-click unsubscribe from mail apps |
| `POST /api/email/inbound` | Resend `email.received` webhook (Svix signature required) |

## Maintainer mailbox frame

The merged homepage now includes a **Mail · Resend** tab, embedding `/embed/mail` (source: `helios_mail.html`). It lists up to 30 recent received emails from `email_inbound` and allows a maintainer to send plain-text messages through Resend.

- `GET /api/email/mailbox` returns received messages and configuration status.
- `POST /api/email/mailbox` sends a message using `{to, subject, text}` with Resend.
- Both endpoints require `Authorization: Bearer <HELIOS_ADMIN_TOKEN>`. Sending also checks the request origin and is limited to 30 requests per hour.
- The token is manually entered in the frame and held in memory only; it is never committed to source or browser storage.
- `HELIOS_ADMIN_TOKEN` must be configured in Netlify as a server-side secret. The GitHub Pages mirror displays the frame, but sending and receiving require the live backend.
- This is an operator mailbox, **not a public email composer**. Received email content is private; do not publish or expose the maintainer token. Emails display as plain text, never injected HTML.

The inbound webhook still requires `RESEND_WEBHOOK_SECRET`, a configured receiving address, and a Resend `email.received` webhook. Receiving is not activated just by adding the frame.

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
| `EMAIL_AUTO_REPLY` | on | Set to `0` to stop automatic replies to inbound mail |
| `EMAIL_AUTO_REPLY_PER_DAY` | `3` | Most automatic replies one sender gets per day |

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
