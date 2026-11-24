/**
 * Browser-only Llama Guard 3-1B preflight for the HELIOS particle composer.
 *
 * This is UX moderation, not an authoritative security boundary. Callers must
 * still apply server moderation on the endpoint accepting a public submission.
 * No draft text is sent to a model API; model weights are fetched by the browser.
 */
export const GUARD_MODEL = 'onnx-community/Llama-Guard-3-1B';
export const GUARD_RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
export const GUARD_DTYPE = 'q4f16'; // ~1.82 GB initial model download; WebGPU only.

let pipelinePromise;

/** Strictly interpret the model verdict; an unknown output is never "safe". */
export function parseLlamaGuardVerdict(output) {
  const first = Array.isArray(output) ? output[0] : output;
  let generated = first?.generated_text ?? first;
  if (Array.isArray(generated)) generated = generated[generated.length - 1]?.content;
  const verdict = typeof generated === 'string' ? generated.trim() : '';
  const match = /^(safe|unsafe)(?=\s|$)/i.exec(verdict);
  if (!match) return { status: 'unavailable', reason: 'unrecognized_verdict' };
  if (match[1].toLowerCase() === 'safe') return { status: 'safe', categories: [] };
  const categories = [...new Set(verdict.slice(match[0].length).match(/\bS(?:[1-9]|1[0-3])\b/gi) ?? [])];
  return { status: 'unsafe', categories };
}

async function getPipeline(onProgress) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import(GUARD_RUNTIME);
      return pipeline('text-generation', GUARD_MODEL, {
        device: 'webgpu',
        dtype: GUARD_DTYPE,
        progress_callback: info => {
          if (typeof info?.progress === 'number') {
            onProgress?.(`Loading local safety model: ${Math.round(info.progress)}%`);
          }
        },
      });
    })().catch(error => {
      pipelinePromise = undefined; // Allow a later user-initiated retry.
      throw error;
    });
  }
  return pipelinePromise;
}

/**
 * The message is evaluated locally, only after a person presses Send.
 * Returns safe/unsafe/unavailable; failures and malformed outputs fail closed.
 */
export async function checkLocalMessage(text, { onProgress } = {}) {
  if (typeof text !== 'string' || !text.trim()) return { status: 'unavailable', reason: 'empty' };
  if (typeof navigator === 'undefined' || !navigator.gpu || !globalThis.isSecureContext) {
    return { status: 'unavailable', reason: 'webgpu_unavailable' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { status: 'unavailable', reason: 'webgpu_unavailable' };
    onProgress?.('Checking this message locally. First use downloads a large model (about 1.8 GB).');
    const guard = await getPipeline(onProgress);
    // The model's tokenizer supplies its official Llama Guard safety taxonomy.
    const output = await guard([{ role: 'user', content: text.trim() }], {
      max_new_tokens: 32,
      do_sample: false,
      return_full_text: false,
    });
    return parseLlamaGuardVerdict(output);
  } catch {
    // Do not log or transmit draft text. A failed check never authorizes sending.
    return { status: 'unavailable', reason: 'model_error' };
  }
}
