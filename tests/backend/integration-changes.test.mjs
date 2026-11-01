import test from 'node:test';
import assert from 'node:assert/strict';
import { openBackend } from '../../src/backend/service.ts';
import { createMemoryStorage, createMemoryMediaStore } from './helpers/memory.ts';
import { TENNIS_REFERENCES } from '../../src/backend/references.ts';
import { resolveOwnedMediaUri } from '../../src/backend/adapters/media-path.ts';
import { stageBrowserPhoto } from '../../src/backend/adapters/browser.ts';

const photo = { uri: 'file:///camera/capture.jpg', width: 800, height: 1200, origin: 'camera', mimeType: 'image/jpeg' };
async function fixture() {
  return openBackend({ storage: createMemoryStorage(), media: createMemoryMediaStore(), references: TENNIS_REFERENCES });
}
test('topic and tone updates retain user text and title while removing obsolete templates', async () => {
  const app = await fixture();
  const d = await app.createDraft({ content: 'written', platforms: ['instagram', 'linkedin'], topic: 'Back on court', toneBrief: 'casual' });
  await app.generateCaptions(d.id);
  await app.editCaption(d.id, 'instagram', 'My own words');
  await app.setTitle(d.id, 'My own title');
  const next = await app.updateDraft(d.id, { topic: 'First practice this week', toneBrief: 'formal' });
  assert.equal(next.captions.instagram.text, 'My own words');
  assert.equal(next.captions.instagram.method, 'user');
  assert.equal(next.captions.linkedin, undefined);
  assert.equal(next.title, 'My own title');
  assert.equal(next.titleMethod, 'user');
  await app.generateCaptions(d.id, { platform: 'linkedin' });
  assert.equal((await app.getDraft(d.id)).captions.instagram.text, 'My own words');
});
test('selecting the same reference preserves accepted shot and review revision', async () => {
  const app = await fixture();
  let d = await app.createDraft({ content: 'photos', photoCount: 1, platforms: ['instagram'] });
  d = await app.setReference(d.id, 'shot-1', 'portrait');
  d = await app.attachPhoto(d.id, 'shot-1', photo);
  d = await app.reviewPhoto(d.id, 'shot-1');
  d = await app.acceptPhoto(d.id, 'shot-1');
  const same = await app.setReference(d.id, 'shot-1', 'portrait');
  assert.equal(same.revision, d.revision);
  assert.equal(same.shots[0].accepted, true);
  assert.deepEqual(same.shots[0].assessment, d.shots[0].assessment);
  const changed = await app.setReference(d.id, 'shot-1', 'equipment');
  assert.equal(changed.shots[0].accepted, false);
  assert.equal(changed.shots[0].assessment, null);
});
test('native saved photo paths rebase across iOS container changes without following originals', () => {
  const media = { ...photo, id: 'media-1-abc-def', isDemo: false, uri: 'file:///old/container/Documents/larpit-media/media-1-abc-def.jpg' };
  const root = 'file:///new/container/Documents/larpit-media/';
  assert.equal(resolveOwnedMediaUri(media, root), root + 'media-1-abc-def.jpg');
  for (const uri of ['file:///camera/media-1-abc-def.jpg', 'https://example.com/Documents/larpit-media/media-1-abc-def.jpg', 'file:///old/../Documents/larpit-media/media-1-abc-def.jpg', 'file:///old/Documents/larpit-media/other.jpg']) {
    assert.throws(() => resolveOwnedMediaUri({ ...media, uri }, root), { code: 'INVALID_INPUT' });
  }
});
test('browser staging requires actual nonempty bytes and preserves metadata/provenance', () => {
  const blob = new Blob([Uint8Array.from([255, 216, 255, 217])], { type: 'image/jpeg' });
  const metadata = { width: 800, height: 1200, origin: 'demo', mimeType: 'image/jpeg' };
  const staged = stageBrowserPhoto(blob, metadata);
  assert.match(staged.uri, /^file:\/\/\/larpit-browser-input\/input-/);
  assert.equal(staged.origin, 'demo');
  assert.equal(staged.width, 800);
  assert.throws(() => stageBrowserPhoto(new Blob([]), metadata), { code: 'INVALID_INPUT' });
  assert.throws(() => stageBrowserPhoto(blob, { ...metadata, width: 0 }), { code: 'INVALID_INPUT' });
});
