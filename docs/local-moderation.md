# Local Llama Guard refusal modal (HELIOS particle composer)

## What this PR adds

The `heliosai-particle-interface.html` Send action now runs a **browser-local
Llama Guard 3-1B safety preflight** before the existing explicit confirmation
to publish publicly to Civic Synthesis. When the model returns `unsafe`, the
HTML `<dialog>` presents the requested text exactly:

> sorry, you can't send that.
>
> if you disagree pls email local city hall

The original unsent draft remains editable. Closing the modal restores
keyboard focus. Escape closes the dialog. No address or message is sent to
any city hall. There is no inferred user location.

If WebGPU, memory, network, model download or inference is unavailable, the
submission is **not sent** and a different diagnostic modal is shown. Unknown
model outputs are never interpreted as `safe`. No automatic retries of the
public POST are added.

## Inference and deployment

- Model: `onnx-community/Llama-Guard-3-1B`, Llama Guard 3-1B
  ONNX weights (subject to the Llama 3.2 license).
- Runtime: `@huggingface/transformers@4.3.2`, dynamically imported from
  jsDelivr *only when a user attempts to send*.
- Inference: `device: 'webgpu'`, `dtype: 'q4f16'`; first download is
  about **1.8 GB** and requires sufficient GPU memory, an HTTPS page or
  localhost and a supported browser. This combination is based on published
  model files/API documentation, not yet verified by an end-to-end GPU run.
- Browser downloads model assets and runtime from the configured public
  CDNs; the draft text is passed only into browser inference.
- No new Netlify function, secret or third-party moderation API is added.
  The existing Netlify and GitHub Pages builders already copy the `public/`
  directory, so the module remains available as a same-origin import.

## Important limitations

**This is a client-side UX gate, not trustworthy enforcement.** A custom
client can bypass it and POST directly to
`https://civic-synthesis.fly.dev/api/publish_draft`. Server-controlled
moderation and a human review/appeal route must be implemented on the Civic
Synthesis backend before any promise of comprehensive enforcement.

Llama Guard's broad taxonomy includes legitimate civic speech (e.g., topics
about medicine, sex, political systems or elections) and its output can be
wrong. This initial UI blocks the model's literal `unsafe` verdict; do not
interpret that as a reliable conclusion about legality or civic legitimacy.
Before rollout, test political disagreement, quotation, self-reports,
multilingual input, privacy and vulnerable-group discussions for disparate
false positives. Maintain a real appeal channel rather than implying that
an unspecified city hall is responsible for Helios moderation.

## Validation

Run `node --test test/local-llama-guard.test.js` for deterministic verdict
parsing. A real WebGPU smoke test must be performed on a supported device
with time and memory for the model download. Verify blocked, unavailable,
allowed + publication-confirmation, Escape/focus, and server error paths.
