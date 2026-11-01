import test from 'node:test';
import assert from 'node:assert/strict';
import { createLarpService, LarpError } from '../../src/backend/index.ts';

const input = { sport: 'tennis', platforms: ['instagram', 'linkedin'], idea: 'seated racquet portrait', style: 'casual' };
// Synthetic fixtures only. These are not real/reference-photo metadata.
const reference = { id: 'fixture', sourceUrl: 'https://unsplash.com/photos/test-fixture', photographer: 'Test fixture', tags: ['sitting', 'racket', 'portrait'], assetKey: 'fixture-only', review: 'verified' };
const photo = { uri: 'file:///device/capture.jpg', width: 1200, height: 1600, source: 'camera' };

test('full local flow works with all network APIs blocked', () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Network forbidden'); };
  try {
    const service = createLarpService({ references: [reference] });
    const session = service.createSession(input);
    assert.equal(service.matchReferences(session.id).matches.length, 1);
    assert.equal(service.shotPlan(session.id).length, 3);
    service.attachPhoto(session.id, photo);
    assert.equal(service.assessPhoto(session.id, 0).score, null);
    const captions = service.createCaptions(session.id);
    assert.equal(captions.length, 2);
    assert.notEqual(captions[0].text, captions[1].text);
    assert.equal(service.capabilities().paidProviders, false);
    service.deleteSession(session.id);
    assert.throws(() => service.getSession(session.id), { code: 'NOT_FOUND' });
  } finally { globalThis.fetch = original; }
});
test('empty or unrelated catalog returns explicit state without fake references', () => {
  const empty = createLarpService();
  assert.equal(empty.matchReferences(empty.createSession(input).id).status, 'catalog-empty');
  const service = createLarpService({ references: [reference] });
  assert.equal(service.matchReferences(service.createSession({ ...input, idea: 'shadow' }).id).status, 'no-match');
});
test('tag matching normalizes synonyms and keeps stable ordering', () => {
  const service = createLarpService({ references: [reference, { ...reference, id: 'second', tags: ['sitting'] }] });
  const result = service.matchReferences(service.createSession(input).id);
  assert.deepEqual(result.matches[0].matchedTags, ['sitting', 'racket', 'portrait']);
  assert.equal(result.matches[0].reference.id, 'fixture');
});
test('rejects unknown sports, platforms, styles and excessive input', () => {
  const service = createLarpService();
  for (const override of [{ sport: 'golf' }, { platforms: [] }, { platforms: ['instagram', 'instagram'] },
    { platforms: ['tiktok'] }, { style: 'unknown' }, { idea: 'x'.repeat(501) }, { idea: ' ' }]) {
    assert.throws(() => service.createSession({ ...input, ...override }), { code: 'INVALID_INPUT' });
  }
});
test('only reviewed Unsplash references are accepted', () => {
  for (const override of [{ review: 'pending' }, { sourceUrl: 'https://gettyimages.com/photos/test' },
    { sourceUrl: 'https://unsplash.com.evil.test/photos/test' }, { tags: [] }, { photographer: '' }]) {
    assert.throws(() => createLarpService({ references: [{ ...reference, ...override }] }), LarpError);
  }
  assert.throws(() => createLarpService({ references: [reference, reference] }), LarpError);
});
test('rejects remote photos and invalid dimensions, limits photos and supports retakes', () => {
  const service = createLarpService();
  const { id } = service.createSession(input);
  for (const override of [{ uri: 'https://example.test/photo.jpg' }, { width: 0 }, { height: Infinity }, { source: 'remote' }]) {
    assert.throws(() => service.attachPhoto(id, { ...photo, ...override }), { code: 'INVALID_INPUT' });
  }
  for (let i = 0; i < 3; i++) service.attachPhoto(id, photo);
  assert.throws(() => service.attachPhoto(id, photo), { code: 'LIMIT_REACHED' });
  service.removePhoto(id, 1);
  assert.equal(service.attachPhoto(id, photo).photos.length, 3);
  assert.throws(() => service.removePhoto(id, 3), LarpError);
});
test('external mutations cannot change the catalog or stored session', () => {
  const source = { ...reference, tags: [...reference.tags] };
  const service = createLarpService({ references: [source] });
  const session = service.createSession(input);
  session.platforms.length = 0;
  source.tags.length = 0;
  const result = service.matchReferences(session.id);
  result.matches[0].reference.tags.length = 0;
  assert.equal(service.getSession(session.id).platforms.length, 2);
  assert.equal(service.matchReferences(session.id).matches[0].matchedTags.length, 3);
});
test('session capacity and clearing are predictable', () => {
  const service = createLarpService({ maxSessions: 1 });
  const first = service.createSession(input);
  assert.throws(() => service.createSession(input), { code: 'LIMIT_REACHED' });
  service.clearAll();
  assert.notEqual(service.createSession(input).id, first.id);
  assert.throws(() => service.getSession(first.id), { code: 'NOT_FOUND' });
});
test('all caption styles produce separate platform copy without injecting photo prompt', () => {
  const service = createLarpService();
  for (const style of ['casual', 'confident', 'professional']) {
    const session = service.createSession({ ...input, style, idea: 'I won Wimbledon' });
    const captions = service.createCaptions(session.id);
    assert.notEqual(captions[0].text, captions[1].text);
    assert.ok(captions.every(c => c.method === 'template' && !c.text.includes('Wimbledon')));
  }
});
