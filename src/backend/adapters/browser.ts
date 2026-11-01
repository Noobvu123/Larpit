/** Durable browser adapter. Native bundles never import this module. */
import { BackendError } from '../contracts.ts';
import type { Media, MediaStore, PhotoInput, Storage } from '../contracts.ts';
import { MAX_PHOTO_BYTES, mediaFilename } from './media-path.ts';

const INPUT_ROOT = 'file:///larpit-browser-input/';
const MEDIA_ROOT = 'file:///larpit-browser-media/';
type StoredPhoto = { blob: Blob; mimeType: PhotoInput['mimeType']; width: number; height: number; origin: PhotoInput['origin'] };
const staged = new Map<string, StoredPhoto>();
const displayUrls = new Map<string, string>();
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new BackendError('STORAGE_ERROR', 'Browser storage is unavailable. Open the app in a normal browser window.'));
        return;
      }
      const request = indexedDB.open('larpit-integrated-v1', 1);
      let rejected = false;
      request.onupgradeneeded = () => {
        for (const name of ['records', 'photos']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onblocked = () => { rejected = true; reject(new BackendError('STORAGE_ERROR', 'Close other Larp It tabs and reload to update local storage.')); };
      request.onerror = () => reject(new BackendError('STORAGE_ERROR', 'Could not open browser storage. Your existing data was kept.'));
      request.onsuccess = () => {
        if (rejected) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

function transaction<T>(db: IDBDatabase, name: string, mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolveResult: (value: T) => void, abort: (error: Error) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let result: T;
    let failure: Error | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? new BackendError('STORAGE_ERROR', 'Browser storage could not save this change. Free some space and try again.'));
    tx.onerror = () => { /* onabort reports the final transaction result. */ };
    const abort = (error: Error) => { failure = error; tx.abort(); };
    try { action(tx.objectStore(name), value => { result = value; }, abort); }
    catch (error) { abort(error instanceof Error ? error : new Error('Browser storage failed.')); }
  });
}

export async function openBrowserStorage(): Promise<Storage> {
  const db = await openDatabase();
  let lastSnapshot: string | null = null;
  let loaded = false;
  return {
    async load() {
      lastSnapshot = await transaction<string | null>(db, 'records', 'readonly', (store, done, abort) => {
        const request = store.get('snapshot');
        request.onsuccess = () => {
          if (request.result !== undefined && typeof request.result !== 'string') {
            abort(new BackendError('CORRUPT_STORAGE', 'Saved browser data could not be read. It has not been overwritten.'));
            return;
          }
          done(request.result ?? null);
        };
      });
      loaded = true;
      return lastSnapshot;
    },
    async save(serialized) {
      if (!loaded || typeof serialized !== 'string' || serialized.length > 8_000_000) throw new BackendError('STORAGE_ERROR', 'Invalid local snapshot.');
      await transaction<void>(db, 'records', 'readwrite', (store, done, abort) => {
        const read = store.get('snapshot');
        read.onsuccess = () => {
          if (read.result !== undefined && typeof read.result !== 'string') {
            abort(new BackendError('CORRUPT_STORAGE', 'Saved browser data changed unexpectedly. Reload before continuing.'));
            return;
          }
          const current = read.result ?? null;
          if (current !== lastSnapshot) {
            abort(new BackendError('STORAGE_ERROR', 'Another Larp It tab changed your posts. Reload this tab before continuing.'));
            return;
          }
          const write = store.put(serialized, 'snapshot');
          write.onsuccess = () => done(undefined);
        };
      });
      lastSnapshot = serialized;
    },
  };
}

/** Only prepareBackendPhoto may stage selected local bytes for the service's file-only contract. */
export function stageBrowserPhoto(blob: Blob, input: Omit<PhotoInput, 'uri'>): PhotoInput {
  const id = `input-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  mediaFilename({ ...input, uri: INPUT_ROOT + id }, id);
  if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) throw new BackendError('INVALID_INPUT', 'Choose a non-empty photo smaller than 25 MiB.');
  staged.set(id, { blob, mimeType: input.mimeType, width: input.width, height: input.height, origin: input.origin });
  return { ...input, uri: INPUT_ROOT + id };
}

function assertOwned(media: Media): void {
  mediaFilename(media, media.id);
  if (media.uri !== MEDIA_ROOT + media.id) throw new BackendError('INVALID_INPUT', 'This photo does not belong to the browser media store.');
}
async function readPhoto(id: string): Promise<StoredPhoto | undefined> {
  const db = await openDatabase();
  return transaction<StoredPhoto | undefined>(db, 'photos', 'readonly', (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result as StoredPhoto | undefined);
  });
}

export function createBrowserMediaStore(): MediaStore {
  return {
    async importPhoto(input, id) {
      mediaFilename(input, id);
      const stagedId = input.uri.startsWith(INPUT_ROOT) ? input.uri.slice(INPUT_ROOT.length) : '';
      const selected = staged.get(stagedId);
      if (!selected || selected.origin !== input.origin || selected.mimeType !== input.mimeType || selected.width !== input.width || selected.height !== input.height) {
        throw new BackendError('MEDIA_MISSING', 'Choose the photo again before saving it.');
      }
      const db = await openDatabase();
      await transaction<void>(db, 'photos', 'readwrite', (store, done) => {
        // add() rejects an existing ID without overwriting its bytes.
        const request = store.add(selected, id);
        request.onsuccess = () => done(undefined);
      });
      staged.delete(stagedId);
      return { ...input, id, uri: MEDIA_ROOT + id, isDemo: input.origin === 'demo' };
    },
    async exists(media) {
      assertOwned(media);
      const found = await readPhoto(media.id);
      return !!found && found.blob.size > 0 && found.blob.size <= MAX_PHOTO_BYTES && found.mimeType === media.mimeType && found.width === media.width && found.height === media.height && found.origin === media.origin;
    },
    async remove(media) {
      assertOwned(media);
      const db = await openDatabase();
      await transaction<void>(db, 'photos', 'readwrite', (store, done) => {
        const request = store.delete(media.id);
        request.onsuccess = () => done(undefined);
      });
      const cached = displayUrls.get(media.id);
      if (cached) { URL.revokeObjectURL(cached); displayUrls.delete(media.id); }
    },
  };
}

export async function resolveBrowserMediaUri(media: Media): Promise<string> {
  assertOwned(media);
  const cached = displayUrls.get(media.id);
  if (cached) return cached;
  const found = await readPhoto(media.id);
  if (!found || found.blob.size <= 0) throw new BackendError('MEDIA_MISSING', 'This saved photo is missing. Choose it again.');
  const uri = URL.createObjectURL(found.blob);
  displayUrls.set(media.id, uri);
  return uri;
}
