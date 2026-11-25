# Constitution safety moderation

The existing maintainer queue is unchanged. New public clauses and comments can optionally opt into automatic safety screening. Private journals, practice comments, session IDs and full conversation history must never be sent to the model.

## Model and activation

The server uses OpenAI's free Moderations endpoint with the pinned `omni-moderation-2024-09-26` snapshot by default. It only approves an explicit unflagged result. Flags, malformed responses, possible contact details, timeouts, rate limits and disabled configuration leave the original text pending for human review. This is a safety check, not proof of accuracy, agreement, legality, or relevance. The optional local contact-pattern check is not a comprehensive personal-information detector.

Set the following **server-side only** on Fly (never in HTML or committed source):

```sh
fly secrets set HELIOS_AUTO_MODERATION=1 -a helios-ai-laws
# Configure OPENAI_API_KEY securely through your existing secret workflow if it is absent.
# Optional: HELIOS_MODERATION_MODEL=omni-moderation-2024-09-26
```

Deploy the reviewed code before enabling the feature. To disable automatic approval, set HELIOS_AUTO_MODERATION=0. Existing manual approval remains available. Deploy-preview constitution boards remain in practice mode; the moderation service also disables itself in Netlify deploy-preview contexts.

## Previously submitted text

Older submissions lack the new opt-in. Do not bulk-send them to OpenAI. A maintainer may explicitly identify their own previously submitted text (or text for which the appropriate consent has been obtained). With a local, securely configured OPENAI_API_KEY and HELIOS_ADMIN_TOKEN, run:

```sh
node scripts/moderate-constitution.mjs --exact 'cool beanscool beanscool beanscool beans'
```

This reads the authorized pending queue, matches exactly one record, screens only its text, and reports the decision without modifying the board. Rerun with `--apply` to approve the exact record only if the safety result is unflagged. The script uses the existing administrator route, session, CSRF protection and idempotency key. For a comment, add `--kind comment`. If the text is not in the current pending queue or matches multiple entries, nothing is changed.

## Validation

Run `bun test test/content-moderation.test.js test/constitution.test.js`. Tests mock the external API; they do not need credentials or incur requests. Automatic attempts are recorded in constitution_auto_moderation by kind and record ID, with verdict, reason and provider identifiers when available, not the submitted text. Manual decisions are not overwritten. Held submissions remain eligible for manual review.
