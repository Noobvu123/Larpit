import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
import { openBackend } from '../../src/backend/service.ts';
import { TENNIS_REFERENCES } from '../../src/backend/references.ts';

let sequence = 0;
const metadata = { width: 800, height: 1200, origin: 'camera', mimeType: 'image/jpeg' };
const bytes = Uint8Array.from([255, 216, 255, 217]);
async function fixture() {
  globalThis.indexedDB = new IDBFactory();
  const adapter = await import(`../../src/backend/adapters/browser.ts?fixture=${sequence++}`);
  const storage = await adapter.openBrowserStorage();
  const media = adapter.createBrowserMediaStore();
  const app = await openBackend({ storage, media, references: TENNIS_REFERENCES });
  const input = () => adapter.stageBrowserPhoto(new Blob([bytes], { type: metadata.mimeType }), metadata);
  return { adapter, storage, media, app, input };
}

test('browser database and photo bytes survive service and adapter recreation', async () => {
  const { adapter, app, input } = await fixture();
  let d = await app.createDraft({ content: 'both', photoCount: 1, platforms: ['instagram', 'linkedin'], topic: 'Back on the court' });
  d = await app.setReference(d.id, 'shot-1', 'portrait');
  d = await app.attachPhoto(d.id, 'shot-1', input());
  d = await app.reviewPhoto(d.id, 'shot-1');
  d = await app.acceptPhoto(d.id, 'shot-1');
  d = await app.generateCaptions(d.id);
  for (const platform of ['instagram', 'linkedin']) {
    const preview = await app.getPreview(d.id, platform);
    await app.confirmPreview(d.id, platform, preview.revision);
  }
  const saved = await app.completeDraft(d.id);
  const reopened = await openBackend({ storage: await adapter.openBrowserStorage(), media: adapter.createBrowserMediaStore(), references: TENNIS_REFERENCES });
  const post = (await reopened.listPosts())[0];
  assert.equal(post.id, saved.id);
  assert.equal(post.isDemo, false);
  assert.equal((await reopened.inspectPostMedia(post.id))[0].available, true);
  const uri = await adapter.resolveBrowserMediaUri(post.photos[0]);
  assert.match(uri, /^blob:/);
  assert.deepEqual(new Uint8Array(await (await fetch(uri)).arrayBuffer()), bytes);
  await reopened.deletePost(post.id);
  assert.deepEqual(await reopened.collectGarbage(), { removed: 1, pending: 0 });
  assert.deepEqual(await reopened.listPosts(), []);
  assert.equal(await adapter.createBrowserMediaStore().exists(post.photos[0]), false);
});

test('competing browser tabs cannot silently overwrite a newer snapshot', async () => {
  const { adapter, app } = await fixture();
  const second = await openBackend({ storage: await adapter.openBrowserStorage(), media: adapter.createBrowserMediaStore(), references: TENNIS_REFERENCES });
  await app.createDraft({ content: 'written', topic: 'first tab', platforms: ['instagram'] });
  await assert.rejects(second.createDraft({ content: 'written', topic: 'stale tab', platforms: ['linkedin'] }), { code: 'STORAGE_ERROR' });
  const reopened = await openBackend({ storage: await adapter.openBrowserStorage(), media: adapter.createBrowserMediaStore(), references: TENNIS_REFERENCES });
  assert.equal((await reopened.listDrafts()).length, 1);
  assert.equal((await reopened.listDrafts())[0].topic, 'first tab');
});

test('aborted browser transactions preserve prior records and allow retry', async () => {
  const { storage } = await fixture();
  await storage.save('previous complete snapshot');
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = original.apply(this, args);
    if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
    return tx;
  };
  try { await assert.rejects(storage.save('incomplete write'), { code: 'STORAGE_ERROR' }); }
  finally { IDBDatabase.prototype.transaction = original; }
  assert.equal(await storage.load(), 'previous complete snapshot');
  await storage.save('retry committed');
  assert.equal(await storage.load(), 'retry committed');
});

test('failed snapshot commit rolls back new browser media while keeping previous shot', async () => {
  const { adapter, app, media, input } = await fixture();
  let d = await app.createDraft({ content: 'photos', photoCount: 1, platforms: ['instagram'] });
  d = await app.attachPhoto(d.id, 'shot-1', input());
  const previous = d.shots[0].photo;
  const spyMedia = { ...media, imported: null, async importPhoto(value, id) { this.imported = await media.importPhoto(value, id); return this.imported; } };
  const realStorage = await adapter.openBrowserStorage();
  const failedStorage = { load: () => realStorage.load(), async save() { throw new Error('simulated quota failure'); } };
  const retry = await openBackend({ storage: failedStorage, media: spyMedia, references: TENNIS_REFERENCES });
  await assert.rejects(retry.attachPhoto(d.id, 'shot-1', input()), { code: 'STORAGE_ERROR' });
  assert.equal((await retry.getDraft(d.id)).shots[0].photo.id, previous.id);
  assert.equal(await media.exists(previous), true);
  assert.ok(spyMedia.imported);
  assert.equal(await media.exists(spyMedia.imported), false);
});

test('missing browser photo blocks completion without discarding text or draft', async () => {
  const { app, media, input } = await fixture();
  let d = await app.createDraft({ content: 'both', photoCount: 1, platforms: ['instagram'], topic: 'My first practice' });
  d = await app.attachPhoto(d.id, 'shot-1', input());
  d = await app.acceptPhoto(d.id, 'shot-1');
  d = await app.generateCaptions(d.id);
  const preview = await app.getPreview(d.id, 'instagram');
  await app.confirmPreview(d.id, 'instagram', preview.revision);
  await media.remove(d.shots[0].photo);
  await assert.rejects(app.completeDraft(d.id), { code: 'MEDIA_MISSING' });
  assert.equal((await app.getDraft(d.id)).captions.instagram.text, d.captions.instagram.text);
  assert.equal((await app.listDrafts()).length, 1);
});

test('browser photo identifiers reject duplicates and outside deletion', async () => {
  const { media, input } = await fixture();
  const stored = await media.importPhoto(input(), 'media-1-abc-def');
  await assert.rejects(media.importPhoto(input(), 'media-1-abc-def'), { code: 'STORAGE_ERROR' });
  assert.equal(await media.exists(stored), true);
  await assert.rejects(media.remove({ ...stored, uri: 'file:///camera/original.jpg' }), { code: 'INVALID_INPUT' });
  assert.equal(await media.exists(stored), true);
  await assert.rejects(media.importPhoto({ ...input(), uri: 'https://example.com/photo.jpg' }, 'media-2-abc-def'), { code: 'MEDIA_MISSING' });
});

test('unexpected browser snapshot types are preserved and rejected instead of reset', async () => {
  const { adapter } = await fixture();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('larpit-integrated-v1', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put({ unexpected: 'legacy data' }, 'snapshot');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  const storage = await adapter.openBrowserStorage();
  await assert.rejects(storage.load(), { code: 'CORRUPT_STORAGE' });
  const original = await new Promise((resolve, reject) => {
    const request = db.transaction('records', 'readonly').objectStore('records').get('snapshot');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(original, { unexpected: 'legacy data' });
  db.close();
});
