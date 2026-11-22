import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLlamaGuardVerdict, GUARD_MODEL, GUARD_DTYPE } from '../public/local-llama-guard.js';

test('uses a real ONNX Llama Guard model with the browser GPU quantization', () => {
  assert.equal(GUARD_MODEL, 'onnx-community/Llama-Guard-3-1B');
  assert.equal(GUARD_DTYPE, 'q4f16');
});

test('parses safe generated text from Transformers.js', () => {
  assert.deepEqual(parseLlamaGuardVerdict([{ generated_text: 'safe' }]), {
    status: 'safe', categories: [],
  });
  assert.deepEqual(parseLlamaGuardVerdict([{ generated_text: [{role: 'assistant', content: 'safe'}] }]), {
    status: 'safe', categories: [],
  });
});

test('parses unsafe and category codes, including chat output', () => {
  assert.deepEqual(parseLlamaGuardVerdict([{ generated_text: 'unsafe\nS1,S10' }]), {
    status: 'unsafe', categories: ['S1', 'S10'],
  });
  assert.deepEqual(parseLlamaGuardVerdict([{ generated_text: [{ role: 'assistant', content: 'unsafe\nS13' }] }]), {
    status: 'unsafe', categories: ['S13'],
  });
});

test('unrecognized or missing verdict is unavailable, never treated as safe', () => {
  for (const response of [null, undefined, [], [{}], [{ generated_text: 'error safe' }], [{ generated_text: '' }]]) {
    assert.equal(parseLlamaGuardVerdict(response).status, 'unavailable');
  }
});
