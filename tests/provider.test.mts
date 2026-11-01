import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import React from 'react';
import { openBackend } from '../src/backend/service.ts';
import { TENNIS_REFERENCES } from '../src/backend/references.ts';
import * as flow from '../src/lib/flow.ts';
import * as model from '../src/services/model.ts';
import * as bridge from '../src/services/backendBridge.ts';
import { createMemoryMediaStore } from './backend/helpers/memory.ts';

// These integration tests render the actual provider and execute its asynchronous
// operations against the actual backend. They do not exercise native modules,
// screen layout, real camera files, SQLite or an iOS simulator.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { create, act } = require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const providerPath = new URL('../src/lib/state.tsx', import.meta.url);
const compiled = ts.transpileModule(readFileSync(providerPath, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const sample = { source: { uri: 'file:///fixtures/tennis.jpg' }, width: 900, height: 1200, mimeType: 'image/jpeg', origin: 'demo', isDemo: true };

async function harness() {
  const settings = new Map<string, string>();
  let serialized: string | null = null;
  let failWrites = false;
  let failOpen = false;
  const storage = { async load() { return serialized; }, async save(value: string) { if (failWrites) throw new Error('test storage full'); serialized = value; } };
  const media = createMemoryMediaStore();
  let backend = await openBackend({ storage, media, references: TENNIS_REFERENCES });
  let state: any;
  let tree: any;
  const nativePorts = {
    getBackend: async () => { if (failOpen) throw new Error('Local database unavailable'); return backend; },
    prepareBackendPhoto: async (photo: any) => ({ uri: photo.source.uri, width: photo.width, height: photo.height, mimeType: photo.mimeType, origin: photo.origin }),
    resolveMediaUri: async (item: any) => { if (!(await media.exists(item))) throw new Error('Missing test photo'); return item.uri; },
  };
  const module: { exports: any } = { exports: {} };
  const imports: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@react-native-async-storage/async-storage': { getItem: async (key: string) => settings.get(key) ?? null, setItem: async (key: string, value: string) => { settings.set(key, value); } },
    './flow': flow,
    './references': { references: TENNIS_REFERENCES.map((reference, index) => ({ ...reference, image: index + 1 })) },
    '../services/model': model,
    '../services/backend': nativePorts,
    '../services/backendBridge': bridge,
    './storage': { readStoredData: async () => ({ raw: null, backup: null }), photoExists: async () => true, restorePhotoLocation: (photo: any) => photo },
  };
  const run = new Script(`(function(require,module,exports){${compiled}\n})`, { filename: providerPath.pathname }).runInThisContext();
  run((specifier: string) => { if (!(specifier in imports)) throw new Error(`Unstubbed native import ${specifier}`); return imports[specifier]; }, module, module.exports);
  function Probe() { state = module.exports.useApp(); return null; }
  async function mount() {
    await act(async () => { tree = create(React.createElement(module.exports.AppProvider, null, React.createElement(Probe))); });
    for (let attempt = 0; attempt < 10 && !state?.hydrated; attempt++) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    assert.equal(state.hydrated, true, 'provider hydration finished');
  }
  async function action<T>(work: (value: any) => T | Promise<T>): Promise<T> {
    let result!: T;
    await act(async () => { result = await work(state); });
    return result;
  }
  async function unmount() { if (tree) { await act(async () => { tree.unmount(); }); tree = undefined; } }
  async function reopen() {
    await unmount();
    backend = await openBackend({ storage, media, references: TENNIS_REFERENCES });
    await mount();
  }
  return { get state() { return state; }, get backend() { return backend; }, media, settings,
    setWriteFailure(value: boolean) { failWrites = value; }, setOpenFailure(value: boolean) { failOpen = value; },
    mount, action, unmount, reopen };
}

async function acceptSample(h: Awaited<ReturnType<typeof harness>>) {
  const id = h.state.shots[h.state.activeShot].id;
  assert.equal(await h.action(s => s.setPhoto(sample, id)), true);
  await h.action(s => s.reviewShot());
  assert.equal(h.state.shots[h.state.activeShot].assessment.method, 'manual');
  assert.equal(h.state.shots[h.state.activeShot].assessment.score, null);
  await h.action(s => s.setShotChecks([true, true, true]));
  await h.action(s => s.acceptShot());
}
async function confirmAll(h: Awaited<ReturnType<typeof harness>>) {
  for (const platform of h.state.draft.platforms) {
    const preview: any = await h.action(s => s.getPreview(platform));
    await h.action(s => s.confirmPreview(platform, preview.revision));
  }
}

test('provider executes full photo and caption flow, rejects stale preview and saves once across reopen', async t => {
  const h = await harness(); t.after(h.unmount); await h.mount();
  assert.equal(h.state.posts.length, 0);
  assert.equal(h.state.hasDraft, false);
  await h.action(s => s.update({ sport: 'Tennis' }));
  await h.action(s => s.finishOnboarding());
  assert.equal((await h.backend.listDrafts()).length, 0, 'welcome selection is not an unfinished post');
  await h.action(s => s.newDraft());
  await h.action(s => s.update({ content: 'both', shotCount: 1, style: 'Casual', pose: 'equipment racket' }));
  await acceptSample(h);
  await h.action(s => s.update({ topic: 'Back on the court after a long break', platforms: ['Instagram', 'LinkedIn'] }));
  await h.action(s => s.generateCaptions());
  assert.notEqual(h.state.captions.Instagram, h.state.captions.LinkedIn);
  assert.equal(h.state.captionMethods.Instagram, 'template');
  const stale: any = await h.action(s => s.getPreview('Instagram'));
  await h.action(s => s.setCaption('LinkedIn', 'Returning to tennis, one practice at a time.'));
  await h.action(async s => { await assert.rejects(s.confirmPreview('Instagram', stale.revision), /preview changed/i); });
  await confirmAll(h);
  const ids: any = await h.action(s => Promise.all([s.savePost(), s.savePost()]));
  assert.equal(ids[0], ids[1]);
  assert.equal(h.state.posts.length, 1);
  assert.equal(h.state.posts[0].captions.LinkedIn, 'Returning to tennis, one practice at a time.');
  assert.equal(h.state.posts[0].photos.length, 1);
  assert.equal(h.state.posts[0].isDemo, true);
  assert.equal(h.state.hasDraft, false);
  await h.reopen();
  assert.equal(h.state.posts.length, 1);
  assert.equal(h.state.posts[0].captions.LinkedIn, 'Returning to tennis, one practice at a time.');
  assert.equal(h.state.hasOnboarded, true);
  assert.equal(h.state.hasDraft, false);
});

test('provider written-only and photos-only paths keep their distinct requirements', async t => {
  const h = await harness(); t.after(h.unmount); await h.mount();
  await h.action(s => s.newDraft());
  await h.action(s => s.update({ content: 'written', style: 'Professional', topic: 'Returning to tennis', platforms: ['LinkedIn'] }));
  assert.equal(h.state.shots.length, 0);
  await h.action(s => s.generateCaptions());
  await confirmAll(h); await h.action(s => s.savePost());
  assert.equal(h.state.posts[0].photos.length, 0);
  await h.action(s => s.newDraft());
  await h.action(s => s.update({ content: 'photos', shotCount: 2, platforms: ['Instagram'] }));
  await acceptSample(h);
  await h.action(s => s.setActiveShot(1));
  await acceptSample(h);
  assert.deepEqual(h.state.captions, {});
  await confirmAll(h); await h.action(s => s.savePost());
  assert.equal(h.state.posts.length, 2);
  const photosPost = h.state.posts.find((p: any) => p.content === 'photos');
  assert.equal(photosPost.photos.length, 2);
  assert.deepEqual(photosPost.captions, {});
});

test('provider rejects a late photo for a previous shot and retains an unfinished draft after reopen', async t => {
  const h = await harness(); t.after(h.unmount); await h.mount();
  await h.action(s => s.newDraft());
  await h.action(s => s.update({ shotCount: 2, style: 'Casual' }));
  const firstId = h.state.shots[0].id;
  await h.action(s => s.setActiveShot(1));
  assert.equal(await h.action(s => s.setPhoto(sample, firstId)), false);
  assert.equal(h.state.shots[0].photo, null);
  assert.equal(h.state.shots[1].photo, null);
  await acceptSample(h);
  await h.reopen();
  assert.equal(h.state.hasDraft, true);
  assert.equal(h.state.activeShot, 0, 'resumes earliest unfinished photo');
  assert.equal(h.state.shots[1].accepted, true);
});

test('provider shows failed storage operation without losing earlier draft and permits retry', async t => {
  const h = await harness(); t.after(h.unmount); await h.mount();
  await h.action(s => s.newDraft());
  await h.action(s => s.update({ content: 'written', topic: 'Original topic', platforms: ['Instagram'] }));
  h.setWriteFailure(true);
  await h.action(async s => { await assert.rejects(s.update({ topic: 'Uncommitted topic' }), /could not save/i); });
  assert.equal(h.state.draft.topic, 'Original topic');
  assert.match(h.state.storageError, /could not save/i);
  h.setWriteFailure(false);
  await h.action(s => s.retryStorage());
  assert.equal(h.state.draft.topic, 'Original topic');
  assert.equal(h.state.storageError, null);
  await h.action(s => s.update({ topic: 'Retry succeeded' }));
  assert.equal(h.state.draft.topic, 'Retry succeeded');
});

test('provider reports unavailable storage on hydration and reloads saved data on retry', async t => {
  const h = await harness(); t.after(h.unmount);
  h.setOpenFailure(true); await h.mount();
  assert.match(h.state.storageError, /database unavailable/i);
  await h.action(async s => { await assert.rejects(s.newDraft(), /database unavailable/i); });
  h.setOpenFailure(false);
  await h.action(s => s.retryStorage());
  assert.equal(h.state.storageError, null);
  await h.action(s => s.newDraft());
  assert.equal(h.state.hasDraft, true);
});
