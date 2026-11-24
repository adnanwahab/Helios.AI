# Optional browser-local Llama Guard (HELIOS particle composer)

## User choice and download behavior

The particle composer (`heliosai-particle-interface.html`) displays a clearly
labeled **Use local AI safety screening (optional)** checkbox. It is **unchecked
by default on every new page load**, and the preference is not written to local
storage or cookies.

- **Unchecked:** the user can Send normally. Helios shows the existing explicit
  confirmation that the message will be published publicly to Civic Synthesis.
  If confirmed, the same `/api/publish_draft` call is used. This option skips
  *only* the browser-local model. It does not change any independent server rules.
- **Checked:** there is **no download just from checking the checkbox**, typing,
  or opening the page. When the user then presses **Send**, Helios dynamically
  imports `public/local-llama-guard.js`, checks for secure-context WebGPU support,
  and loads the Llama Guard model if needed.
- **Safe verdict:** the public-publication confirmation is still mandatory.
- **Unsafe verdict:** a modal explains that the message was not sent. The user can
  close it and edit the preserved draft.
- **Unavailable / inference failure / unrecognized output:** a distinct error
  modal appears, the draft stays intact, and nothing is published. The user may
  uncheck the optional local screening box before trying again.
- The checkbox is temporarily disabled during an active Send request so the
  displayed choice cannot change halfway through an in-progress check.

No model, tokenizer, or Transformers.js runtime is preloaded when the page is
opened or when the checkbox is merely selected. The browser may cache model
files after a consented download; this UI does not clear that browser cache.

## Refusal modal

For a model `unsafe` verdict the requested wording is:

> sorry, you can't send that.
>
> if you disagree pls email local city hall

The original unsent draft remains editable. Closing the modal returns keyboard
focus to the message. No email is sent to city hall; there is no inferred user
location. The wording is not a claim that city hall administers Helios appeals.

## Model and runtime

- Model: `onnx-community/Llama-Guard-3-1B`.
- Client runtime: `@huggingface/transformers@4.3.2` from jsDelivr, dynamically
  imported **only during an opted-in Send**.
- Inference: WebGPU, ONNX `q4f16`; the first opted-in run may download
  approximately **1.8 GB** of model files.
- User draft text is sent to in-browser inference, not a model API. Only after
  explicit publication confirmation does the existing Civic Synthesis
  submission endpoint receive the message.

## Safety and product limitations

Local screening is an optional client-side UX feature, **not an enforceable
security boundary**. Even a mandatory checkbox could be bypassed by a custom
client calling the public API directly. Civic Synthesis must independently
validate submissions as necessary. This PR does not add or verify server-side
moderation, a moderation appeals route, or any new backend enforcement.

Llama Guard can misclassify legitimate civic discussion (e.g. criticism of
public policy, elections or health systems). Test multilingual input, quoted
material, sensitive public-policy topics and false positives on supported
devices before promising production reliability. Since the opt-in model is
large and WebGPU-dependent, the unchecked experience must remain usable.

## Validation

Automated browser tests (`test/browser/local-guard-opt-in.e2e.js`) use a mock
publishing endpoint and a stub local guard module. They verify:

1. Default unchecked: no import/download request, including after Send.
2. Checking the box alone: still no module load; opting in and pressing Send
   runs the guard, and `unsafe` blocks publishing while retaining the draft.
3. `safe` still requires separate confirmation; cancel sends nothing.
4. Model unavailable: distinct modal, no POST, original draft retained.

Parser tests: `node --test test/local-llama-guard.test.js`.
Full browser suite: `bun run test:browser`.

A **real WebGPU inference smoke test** still requires a supported browser/GPU,
time and memory for the model download. CI stubs the model and does not claim
to verify real model weights or GPU inference.
