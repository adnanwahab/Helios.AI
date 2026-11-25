# Optional accounts and open_login

Helios remains open without an account. The homepage, law atlas, research inputs,
future keyframes, local simulations, browser drafts, and JSON export do not
require sign-in. Shared services keep their existing availability and consent
rules. Opening the login dialog does not connect a civic board or upload a
private journal.

## Open the dialog

Use the **Sign in** button, call `window.open_login()`, dispatch an `open_login`
custom event, or add `?open_login=1` to the current page. Room and keyframe query
parameters and the fragment are preserved. **Continue as guest**, Close, and
Escape dismiss the dialog and return focus to the invoking control.

The account controls appear on the homepage, `/law-atlas.html`, and `/research`.
Signing out returns to guest mode and preserves local drafts. Static GitHub Pages
builds disable account connections and do not send credentials to the original
project.

## What signing in saves

The client uses the pinned Supabase Auth SDK. A connected, account-aware backend
validates the access token with the fixed project's Auth service before using the
verified user ID. Future connected votes, contributions, and research ownership
are attributed to that stable account actor. Signing in on another device can
therefore retrieve the same account votes and supervise rooms the account
created. An account is not proof of a unique human or a verified civic identity.

Existing guest votes and room ownership remain attached to their browser session.
They are not silently transferred, duplicated as account votes, or merged on
sign-in. Sign out in the original browser to access guest-owned supervision
controls. Practice votes and unsent drafts are not automatically uploaded.

Authentication availability and storage availability are reported separately.
Signing in alone does not make a disconnected research draft collaborative or
enable account saving on the legacy Fly gateway. The UI must show that condition
instead of reporting a save that did not happen.

## Server contract

| Endpoint | Result |
| --- | --- |
| `GET /api/account/config` | Optional-login configuration and actual civic account persistence capability. |
| `GET /api/account/me` | Verified minimal account information, or signed-out state, with current persistence capability. |
| `GET /api/research/account/config` | Configuration for the research runtime's separate storage. |
| `GET /api/research/account/me` | Verified account information and research capability. |

The browser sends its SDK access token in `X-Helios-Access-Token` only to
same-origin account and supported application endpoints. This header is separate
from maintainer and worker `Authorization` credentials. The server verifies tokens
through the fixed project's `/auth/v1/user`; it does not trust an unverified JWT
payload, email, browser-supplied actor ID, or user-editable metadata. Invalid or
expired proof fails explicitly; it is never downgraded into a guest write.

Existing browser cookies, same-origin checks, CSRF protection, request bounds,
rate limits, and idempotency requirements still apply. The authenticated actor
does not replace the browser session used for CSRF. The legacy Fly gateway
rejects account-token requests before forwarding, so unsupported account writes
cannot accidentally become anonymous votes.

## Deployment readiness

The configuration in `public/account-config.js` contains only the Supabase project
URL and a publishable key. It contains no service-role key, database connection,
or SMTP credential. The SDK is bundled into both static builds; the browser does
not load an executable script from a third-party CDN.

At implementation time, the project enabled email/password authentication and
email confirmation, but used the default email sender, had no OAuth provider,
and had no deployed redirect URLs. Therefore:

- Existing accounts may sign in with a password. No email is sent by that action.
- Public signup and magic-link sending remain disabled in the UI. Set up a custom
  SMTP sender and exact deployed return URLs, then enable `emailSignInEnabled`.
- This PR does not alter provider settings or transfer new credentials.
- The deploy preview requires an account-aware civic database for account votes
  and the separately configured research database for shared research. Login
  does not remove those existing configuration requirements.

After configuring email, test a user-initiated magic-link round trip on each
allowed deployment origin, including safe return to the selected room/keyframe.
Before claiming cross-device saving, verify a vote and an account-owned research
room from a second signed-in browser against the intended durable database.
