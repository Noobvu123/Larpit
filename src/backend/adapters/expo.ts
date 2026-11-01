/** Native adapter for Expo SDK 58. Requires expo-sqlite and expo-file-system. */
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync } from 'expo-sqlite';
import { BackendError } from '../contracts.ts';
import type { Media, MediaStore, Storage } from '../contracts.ts';

import { mediaFilename as filename, MAX_PHOTO_BYTES as MAX_BYTES, resolveOwnedMediaUri } from './media-path.ts';

function root() {
  const directory = new Directory(Paths.document, 'larpit-media');
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}
function owned(media: Media) {
  return new File(resolveOwnedMediaUri(media, root().uri));
}
function checkPhoto(file: File) {
  if (!file.exists) throw new BackendError('MEDIA_MISSING', 'The selected photo is no longer available.');
  if (file.size <= 0 || file.size > MAX_BYTES) throw new BackendError('INVALID_INPUT', 'Choose a non-empty photo smaller than 25 MiB.');
}

export async function openExpoStorage(): Promise<Storage> {
  try {
    const db = await openDatabaseAsync('larpit-backend.db');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS larpit_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);');
    return {
      async load() {
        try { return (await db.getFirstAsync<{ payload: string }>('SELECT payload FROM larpit_snapshot WHERE id = 1'))?.payload ?? null; }
        catch { throw new BackendError('STORAGE_ERROR', 'Could not load your saved posts.'); }
      },
      async save(serialized) {
        if (typeof serialized !== 'string' || serialized.length > 10 * 1024 * 1024) throw new BackendError('STORAGE_ERROR', 'Local records exceed the storage limit.');
        try {
          // One bound SQLite statement is atomic. No interpolated record contents.
          await db.runAsync('INSERT INTO larpit_snapshot (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', serialized);
        } catch { throw new BackendError('STORAGE_ERROR', 'Could not save your post. Please try again.'); }
      },
    };
  } catch { throw new BackendError('STORAGE_ERROR', 'Could not open local storage.'); }
}

export function createExpoMediaStore(): MediaStore {
  // One instance is required per app process. Reserve IDs across async copies.
  const importing = new Set<string>();
  return {
    async importPhoto(input, id) {
      const name = filename(input, id);
      if (typeof input.uri !== 'string' || !/^(file|content):\/\//.test(input.uri)) throw new BackendError('INVALID_INPUT', 'The photo picker must supply a local file.');
      const destination = new File(root(), name);
      if (destination.exists || importing.has(id)) throw new BackendError('STORAGE_ERROR', 'This media identifier already exists. Use a new ID for a retake.');
      importing.add(id);
      let committed = false;
      try {
        const source = new File(input.uri);
        checkPhoto(source);
        const size = source.size;
        await source.copy(destination, { overwrite: false });
        checkPhoto(destination);
        if (destination.size !== size) throw new BackendError('STORAGE_ERROR', 'The photo could not be copied completely.');
        committed = true;
        return { ...input, id, uri: destination.uri, isDemo: input.origin === 'demo' };
      } catch (error) {
        if (!committed && destination.exists) { try { destination.delete(); } catch { /* A later cleanup can remove an unreferenced partial copy. */ } }
        if (error instanceof BackendError) throw error;
        throw new BackendError('STORAGE_ERROR', 'Could not store the photo. The original photo was preserved.');
      } finally { importing.delete(id); }
    },
    async exists(media) {
      const file = owned(media);
      return file.exists && file.size > 0 && file.size <= MAX_BYTES;
    },
    async remove(media) {
      const file = owned(media);
      if (file.exists) {
        try { file.delete(); }
        catch { throw new BackendError('STORAGE_ERROR', 'Could not remove the app-owned photo.'); }
      }
    },
  };
}

/** Only reads a photo already copied into the app's own media directory. */
export async function readExpoPhotoBase64(media: Media): Promise<string> {
  const file = owned(media);
  checkPhoto(file);
  return file.base64();
}

/** Current display URI; this also verifies the owned file still exists. */
export async function resolveExpoMediaUri(media: Media): Promise<string> {
  const file = owned(media);
  checkPhoto(file);
  return file.uri;
}
