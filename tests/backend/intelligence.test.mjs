import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplateIntelligence, createOllamaIntelligence } from '../../src/backend/intelligence.ts';

const captionInput = { topic: 'Returning to tennis after a two-year break.', toneBrief: 'casual and fun', platforms: ['instagram', 'linkedin'], variant: 0 };
const photo = { id: 'media-1', uri: 'file:///photo.jpg', width: 800, height: 1000, origin: 'camera', isDemo: false, mimeType: 'image/jpeg' };
const reference = { id: 'ref-1', title: 'Courtside', assetKey: 'portrait', sourceUrl: 'https://unsplash.com/photos/test', photographer: 'Fixture', tags: ['portrait'], instructions: ['Stand.'] };
const reviewInput = { photo, reference, poseBrief: 'standing with racket' };
const jpeg = '/9j/AAAAAAAAAAAA';
const png = 'iVBORw0KGgoAAAAA';
function mock(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const data = url.endsWith('/tags') ? { models: options.models ?? [{ name: 'test:latest', size: 5000, digest: 'abc123' }] }
      : url.endsWith('/show') ? { details: { format: 'gguf' }, model_info: { 'general.architecture': 'test' }, capabilities: ['completion', 'vision'], ...options.show }
      : { done: true, response: JSON.stringify(options.output ?? { title: 'Back on court', captions: { instagram: 'Back on court 🎾', linkedin: 'Returning to tennis.' } }), ...options.response };
    return new Response(JSON.stringify(data), { status: options.status ?? 200 });
  };
  return { calls, fetchImpl };
}
function ai(overrides = {}, transport = mock()) {
  return { ...transport, provider: createOllamaIntelligence({ enabled: true, model: 'test', fetchImpl: transport.fetchImpl, ...overrides }) };
}

test('offline templates use topic and preserve platform/variant provenance without network', async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Network forbidden'); };
  try {
    const provider = createTemplateIntelligence();
    const variants = [];
    for (let variant = 0; variant < 3; variant++) {
      const result = await provider.captions({ ...captionInput, variant });
      assert.equal(result.method, 'template');
      assert.ok(result.captions.instagram.includes(captionInput.topic));
      assert.ok(result.captions.linkedin.includes(captionInput.topic));
      assert.notEqual(result.captions.instagram, result.captions.linkedin);
      variants.push(result.captions.instagram);
    }
    assert.equal(new Set(variants).size, 3);
    assert.equal((await provider.review(reviewInput)).score, null);
    const formal = await provider.captions({ ...captionInput, toneBrief: 'professional' });
    assert.ok(!formal.captions.instagram.includes('🎾'));
  } finally { globalThis.fetch = prior; }
});
test('invalid briefs, platforms and fourth variants are rejected', async () => {
  for (const patch of [{ topic: '' }, { platforms: ['tiktok'] }, { platforms: ['instagram', 'instagram'] }, { variant: 3 }, { toneBrief: 'x'.repeat(2001) }]) {
    await assert.rejects(createTemplateIntelligence().captions({ ...captionInput, ...patch }), { code: 'INVALID_INPUT' });
  }
});
test('maximum-length accepted briefs keep templates within platform limits', async () => {
  const provider = createTemplateIntelligence();
  for (let variant = 0; variant < 3; variant++) {
    const result = await provider.captions({ ...captionInput, variant, topic: 'x'.repeat(2000), toneBrief: 't'.repeat(2000) });
    assert.ok(result.captions.instagram.length <= 2200);
    assert.ok(result.captions.linkedin.length <= 3000);
  }
});
test('explicit opt-in, fixed loopback endpoint and local model names are enforced', () => {
  for (const options of [{ enabled: false, model: 'test' }, { enabled: true, model: 'test-cloud' }, { enabled: true, model: 'https://example.com' }, { enabled: true, model: 'test', baseUrl: 'http://192.168.1.1:11434' }]) {
    assert.throws(() => createOllamaIntelligence(options), { code: 'INVALID_INPUT' });
  }
});
test('installed local model preflight precedes bounded structured generation', async () => {
  const { provider, calls } = ai();
  const result = await provider.captions(captionInput);
  assert.equal(result.method, 'local-model');
  assert.equal(result.model, 'test:latest');
  assert.deepEqual(calls.map(c => c.url.split('/').pop()), ['tags', 'show', 'generate']);
  assert.ok(calls.every(c => c.url.startsWith('http://127.0.0.1:11434/api/')));
  assert.ok(calls.every(c => c.redirect === 'error' && c.credentials === 'omit' && !c.headers.Authorization));
  assert.equal(calls[2].body.stream, false);
  assert.equal(calls[2].body.format, 'json');
  assert.equal(calls[2].body.model, 'test:latest');
});
test('missing, cloud-backed and unverifiable models fail before generation', async () => {
  for (const settings of [{ models: [] }, { models: [{ name: 'test:latest', remote_host: 'https://ollama.com', size: 5000, digest: 'abc' }] },
    { show: { remote_model: 'remote' } }, { show: { remote_host: 'https://ollama.com' } }, { show: { model_info: {} } }, { show: { capabilities: [] } }]) {
    const { provider, calls } = ai({}, mock(settings));
    await assert.rejects(provider.captions(captionInput), { code: 'PROVIDER_UNAVAILABLE' });
    assert.ok(!calls.some(c => c.url.endsWith('/generate')));
  }
});
test('malformed, excessive, wrong-platform and duplicate model output is rejected', async () => {
  for (const settings of [{ response: { response: 'bad json' } }, { response: { done: false } }, { response: { remote_host: 'https://ollama.com' } },
    { output: { title: 'ok', captions: { instagram: '', linkedin: 'a' } } }, { output: { title: 'ok', captions: { instagram: 'x'.repeat(2001), linkedin: 'a' } } },
    { output: { title: 'ok', captions: { instagram: 'a', linkedin: 'b', tiktok: 'c' } } }, { output: { title: 'ok', captions: { instagram: 'same', linkedin: 'same' } } }]) {
    await assert.rejects(ai({}, mock(settings)).provider.captions(captionInput), { code: 'PROVIDER_UNAVAILABLE' });
  }
});
test('photo comparison sends both image bytes in reference/capture order', async () => {
  const { provider, calls } = ai({ readPhotoBase64: async () => jpeg, readReferenceBase64: async () => png }, mock({ output: { comparable: true, score: 78, feedback: ['Move the racket into frame.'] } }));
  const result = await provider.review(reviewInput);
  assert.equal(result.status, 'assessed');
  assert.equal(result.score, 78);
  assert.equal(result.method, 'local-model');
  assert.deepEqual(calls[2].body.images, [png, jpeg]);
  assert.ok(result.feedback.some(s => s.includes('not an approval')));
});
test('demo images, HEIC and absent readers never trigger model requests', async () => {
  const { provider, calls } = ai();
  assert.equal((await provider.review(reviewInput)).status, 'unavailable');
  assert.equal((await provider.review({ ...reviewInput, photo: { ...photo, isDemo: true } })).score, null);
  assert.equal((await provider.review({ ...reviewInput, photo: { ...photo, mimeType: 'image/heic' } })).score, null);
  assert.equal(calls.length, 0);
});
test('vision capability, image format and comparison results are validated', async () => {
  const readers = { readPhotoBase64: async () => jpeg, readReferenceBase64: async () => png };
  await assert.rejects(ai(readers, mock({ show: { capabilities: ['completion'] } })).provider.review(reviewInput), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(ai({ ...readers, readPhotoBase64: async () => 'bad' }).provider.review(reviewInput), { code: 'INVALID_INPUT' });
  for (const output of [{ comparable: true, score: 101, feedback: ['x'] }, { comparable: true, score: 50, feedback: [] }, { comparable: false, score: 20, feedback: ['x'] }]) {
    await assert.rejects(ai(readers, mock({ output })).provider.review(reviewInput), { code: 'PROVIDER_UNAVAILABLE' });
  }
  const result = await ai(readers, mock({ output: { comparable: false, score: null, feedback: ['Image is too dark.'] } })).provider.review(reviewInput);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.score, null);
});
test('already-cancelled and mid-flight cancellation is propagated without fallback', async () => {
  const controller = new AbortController();
  controller.abort();
  const transport = mock();
  await assert.rejects(ai({}, transport).provider.captions({ ...captionInput, signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(transport.calls.length, 0);
  const mid = new AbortController();
  const pending = ai({ fetchImpl: async () => new Promise(() => {}) }).provider.captions({ ...captionInput, signal: mid.signal });
  mid.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
});
test('unresponsive fetch is bounded by operation timeout', async () => {
  const { provider } = ai({ timeoutMs: 100, fetchImpl: async () => new Promise(() => {}) });
  await assert.rejects(provider.captions(captionInput), { code: 'PROVIDER_UNAVAILABLE' });
});
