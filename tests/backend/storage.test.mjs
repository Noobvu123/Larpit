import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, truncate, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createNodeStorage, createNodeMediaStore, readNodePhotoBase64 } from './helpers/node.ts';
import { createMemoryStorage, createMemoryMediaStore } from './helpers/memory.ts';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'larpit-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'camera.jpg');
  await writeFile(source, Buffer.from([255, 216, 255, 217]));
  return { dir, source, input: { uri: pathToFileURL(source).href, width: 800, height: 1000, origin: 'camera', mimeType: 'image/jpeg' } };
}
test('records survive adapter recreation and ignore incomplete temporary writes', async t => {
  const { dir } = await fixture(t);
  const path = join(dir, 'state.json');
  const first = createNodeStorage(path);
  assert.equal(await first.load(), null);
  await first.save('{"schemaVersion":1,"posts":[]}');
  await writeFile(path + '.interrupted.pending', '{broken');
  assert.equal(await createNodeStorage(path).load(), '{"schemaVersion":1,"posts":[]}');
  await first.save('{"schemaVersion":1,"posts":[1]}');
  assert.equal(await createNodeStorage(path).load(), '{"schemaVersion":1,"posts":[1]}');
});
test('invalid save preserves existing bytes and subsequent saves still work', async t => {
  const { dir } = await fixture(t);
  const store = createNodeStorage(join(dir, 'state.json'));
  await store.save('existing');
  await assert.rejects(store.save('x'.repeat(10 * 1024 * 1024 + 1)), { code: 'STORAGE_ERROR' });
  assert.equal(await store.load(), 'existing');
  await store.save('next');
  assert.equal(await store.load(), 'next');
});
test('queued atomic writes leave a complete snapshot and no temporary copies', async t => {
  const { dir } = await fixture(t);
  const store = createNodeStorage(join(dir, 'state.json'));
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(JSON.stringify({ i, content: 'x'.repeat(1024) }))));
  assert.equal(JSON.parse(await store.load()).i, 11);
  assert.deepEqual((await readdir(dir)).filter(n => n.endsWith('.pending')), []);
});
test('photo import copies and persists bytes, and remove never deletes original', async t => {
  const { dir, source, input } = await fixture(t);
  const store = createNodeMediaStore(join(dir, 'media'));
  const media = await store.importPhoto(input, 'photo-1');
  assert.notEqual(media.uri, input.uri);
  assert.equal(media.isDemo, false);
  assert.equal(await createNodeMediaStore(join(dir, 'media')).exists(media), true);
  assert.equal(await readNodePhotoBase64(media), (await readFile(source)).toString('base64'));
  await store.remove(media);
  assert.equal(await store.exists(media), false);
  assert.equal((await stat(source)).size, 4);
});
test('duplicate imports fail without overwriting or removing the first copy', async t => {
  const { dir, input } = await fixture(t);
  const store = createNodeMediaStore(join(dir, 'media'));
  const media = await store.importPhoto(input, 'photo-1');
  await assert.rejects(store.importPhoto(input, 'photo-1'), { code: 'STORAGE_ERROR' });
  assert.equal(await store.exists(media), true);
  assert.equal((await readFile(fileURLToPath(media.uri))).length, 4);
});
test('invalid paths, identifiers and outside deletion are rejected', async t => {
  const { dir, input } = await fixture(t);
  const store = createNodeMediaStore(join(dir, 'media'));
  for (const id of ['../outside', 'one/two', '', 'x'.repeat(101)]) await assert.rejects(store.importPhoto(input, id), { code: 'INVALID_INPUT' });
  await assert.rejects(store.importPhoto({ ...input, uri: 'https://example.com/photo.jpg' }, 'remote'), { code: 'INVALID_INPUT' });
  const media = await store.importPhoto(input, 'photo-1');
  await assert.rejects(store.remove({ ...media, uri: input.uri }), { code: 'INVALID_INPUT' });
  assert.equal((await readFile(fileURLToPath(input.uri))).length, 4);
});
test('missing, oversized and empty sources do not create stored media', async t => {
  const { dir, source, input } = await fixture(t);
  const store = createNodeMediaStore(join(dir, 'media'));
  await truncate(source, 25 * 1024 * 1024 + 1);
  await assert.rejects(store.importPhoto(input, 'large'), { code: 'INVALID_INPUT' });
  await truncate(source, 0);
  await assert.rejects(store.importPhoto(input, 'empty'), { code: 'INVALID_INPUT' });
  await unlink(source);
  await assert.rejects(store.importPhoto(input, 'missing'), { code: 'MEDIA_MISSING' });
  assert.deepEqual(await readdir(join(dir, 'media')), []);
});
test('existing symlink cannot redirect media overwrite or be treated as stored photo', async t => {
  const { dir, source, input } = await fixture(t);
  await mkdir(join(dir, 'media'));
  await symlink(source, join(dir, 'media', 'photo-1.jpg'));
  const store = createNodeMediaStore(join(dir, 'media'));
  await assert.rejects(store.importPhoto(input, 'photo-1'), { code: 'STORAGE_ERROR' });
  assert.equal(await store.exists({ ...input, id: 'photo-1', uri: pathToFileURL(join(dir, 'media', 'photo-1.jpg')).href, isDemo: false }), false);
  assert.equal((await stat(source)).size, 4);
});
test('demo marker is derived from origin and memory stores are explicitly ephemeral', async () => {
  const records = createMemoryStorage();
  await records.save('example');
  assert.equal(await records.load(), 'example');
  assert.equal(await createMemoryStorage().load(), null);
  const mediaStore = createMemoryMediaStore();
  const media = await mediaStore.importPhoto({ uri: 'file:///fixture.jpg', width: 100, height: 100, origin: 'demo', mimeType: 'image/jpeg' }, 'demo-1');
  assert.equal(media.isDemo, true);
  assert.equal(await mediaStore.exists(media), true);
  assert.equal(await createMemoryMediaStore().exists(media), false);
});
