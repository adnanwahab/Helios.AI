# Private traffic-light security registry

This is a **local operator tool**, not an authentication system for the public Helios website. It is not deployed as a Netlify page or Fly route. Do not proxy it, bind it to a public interface, or run it on a shared/untrusted machine.

## Start

From the repository root, with Bun >= 1.3:

```sh
# Run once, only if .env.security does not already exist.
(umask 077; set -C; printf 'EMAIL_HASH_SECRET=%s\n' "$(openssl rand -base64 32)" > .env.security)
bun --env-file=.env.security run security:registry
```

Open http://127.0.0.1:8766 and enter the random local session token printed in your terminal. Keep the terminal private. The token changes on every start and stays in the browser tab's memory, not local storage. Stop the server with Ctrl+C. Locking the editor clears its view but does not revoke a copied token; restarting the script rotates it.

## Workflow

- Add a display name and email. A random UUID and green assignment are generated.
- Green: public; yellow: member; red: administrator. These are **assigned** permissions; they are not proof of identity or effective public application permissions.
- Edit names, assignments and account status in the sheet. Saving elevated access requires confirmation. Suspend a member by unchecking Active.
- Export a CSV with UUID, name, level, active status and revision. Edit in a spreadsheet and save as CSV. Import updates existing rows only, never enrolls accounts or accepts an email column. It applies atomically and rejects stale revisions and duplicate IDs. Keep the CSV private because names and UUIDs are personal data. CSV is supported; XLSX is intentionally not required.
- Email ownership verification, passkeys, sessions, public signup, role middleware and synchronization with Supabase are future integration work. The exported server-side helper expects a trusted, previously verified email from an identity provider; do not call it with an unverified request parameter. Never treat a UUID as a credential. Red access should additionally require strong authentication and a separate authorization policy.

## Privacy and storage

SQLite is the source of truth at `.data/security/registry.sqlite`, which is gitignored. The registry directory and database are restricted to the local OS user. The only stored email representation is a domain-separated HMAC-SHA256 with a stable 32-byte secret. Local-part case is preserved; domain case is normalized. Raw email is handled transiently in the input and HTTP request, and is not written to disk, exported, returned, or logged by the script. Browser extensions, OS input tools, devtools or password/autofill managers may independently retain inputs; use a trusted local browser. There is no email delivery or recovery function.

Keep the secret in the private gitignored `.env.security` file or a secret manager. Back up the database and key separately and securely. Do not replace the key to fix an error: the script detects a wrong key, and HMAC-only addresses cannot be rehashed without re-enrollment. Treat the registry, key and CSV as sensitive even though emails are not readable from the database. Never commit them.

Only loopback traffic is accepted; API calls require a random bearer token, and mutations require the exact same origin and JSON. The local OS user controls the tool. Audit records capture the target UUID, action, previous/new assignment and active status, and timestamp. They do not establish an individual operator identity or tamper-evident compliance history.

## Tests

```sh
bun run test:security
```

Tests use isolated in-memory databases, synthetic email addresses and handler requests. No live user data or production resources are used. Before integrating with real Helios authentication, review authorization at every protected route, verify identity and email normalization, require red-role MFA, and test revocation and deployment isolation.
