/** Node-only durable adapters for local verification. Never import this file in Metro. */
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BackendError } from '../../../src/backend/contracts.ts';
import type { Media, MediaStore, PhotoInput, Storage } from '../../../src/backend/contracts.ts';

const MAX_BYTES = 25 * 1024 * 1024;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' } as const;
function safeId(id: string) { if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new BackendError('INVALID_INPUT', 'Invalid media identifier.'); }
function filename(input: PhotoInput, id: string) {
  safeId(id);
  if (!input || !Object.hasOwn(extensions, input.mimeType) || !['camera', 'library', 'demo'].includes(input.origin) ||
    ![input.width, input.height].every(n => Number.isInteger(n) && n > 0 && n <= 30000)) throw new BackendError('INVALID_INPUT', 'Invalid photo metadata.');
  return `${id}.${extensions[input.mimeType]}`;
}
function localPath(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:' || url.hostname || url.search || url.hash) throw Error();
    return fileURLToPath(url);
  } catch { throw new BackendError('INVALID_INPUT', 'Use a local file URI.'); }
}
function missing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }

export function createNodeStorage(path: string): Storage {
  const destination = resolve(path);
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      await queue;
      try { return await readFile(destination, 'utf8'); }
      catch (error) { if (missing(error)) return null; throw new BackendError('STORAGE_ERROR', 'Could not read local records.'); }
    },
    save(serialized) {
      const work = queue.then(async () => {
        if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > 10 * 1024 * 1024) throw new BackendError('STORAGE_ERROR', 'Local records exceed the storage limit.');
        const temporary = `${destination}.${randomUUID()}.pending`;
        try {
          await mkdir(dirname(destination), { recursive: true });
          const handle = await open(temporary, 'wx', 0o600);
          try { await handle.writeFile(serialized, 'utf8'); await handle.sync(); }
          finally { await handle.close(); }
          await rename(temporary, destination);
          // Atomic rename is the commit boundary; do not report failure after it.
          try { const directory = await open(dirname(destination), 'r'); try { await directory.sync(); } finally { await directory.close(); } } catch { /* Directory fsync is not portable. */ }
        } catch {
          await unlink(temporary).catch(() => {});
          throw new BackendError('STORAGE_ERROR', 'Could not save local records. Existing records were preserved.');
        }
      });
      queue = work.catch(() => {});
      return work;
    },
  };
}

export function createNodeMediaStore(directory: string): MediaStore {
  const requested = resolve(directory);
  const root = mkdir(requested, { recursive: true }).then(() => realpath(requested));
  async function owned(media: Media) {
    const path = join(await root, filename(media, media.id));
    if (localPath(media.uri) !== path) throw new BackendError('INVALID_INPUT', 'This file does not belong to the app media store.');
    return path;
  }
  return {
    async importPhoto(input, id) {
      const name = filename(input, id);
      const source = localPath(input.uri);
      const destination = join(await root, name);
      let copyStarted = false;
      try {
        const info = await stat(source);
        if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) throw new BackendError('INVALID_INPUT', 'Choose a non-empty photo smaller than 25 MiB.');
        // COPYFILE_EXCL refuses a duplicate target, including existing symlinks.
        await copyFile(source, destination, constants.COPYFILE_EXCL);
        copyStarted = true;
        const copied = await lstat(destination);
        if (!copied.isFile() || copied.size !== info.size || copied.size > MAX_BYTES) throw Error('Incomplete media copy');
        return { ...input, id, uri: pathToFileURL(destination).href, isDemo: input.origin === 'demo' };
      } catch (error) {
        if (copyStarted) await unlink(destination).catch(() => {});
        if (error instanceof BackendError) throw error;
        if (missing(error)) throw new BackendError('MEDIA_MISSING', 'The selected photo is no longer available.');
        throw new BackendError('STORAGE_ERROR', 'Could not import the photo. Use a new media identifier when retaking.');
      }
    },
    async exists(media) {
      const path = await owned(media);
      try { const info = await lstat(path); return info.isFile() && info.size > 0 && info.size <= MAX_BYTES; }
      catch (error) { if (missing(error)) return false; throw new BackendError('STORAGE_ERROR', 'Could not check the saved photo.'); }
    },
    async remove(media) {
      const path = await owned(media);
      try { await unlink(path); }
      catch (error) { if (!missing(error)) throw new BackendError('STORAGE_ERROR', 'Could not remove the saved photo.'); }
    },
  };
}

export async function readNodePhotoBase64(media: Media): Promise<string> {
  const path = localPath(media.uri);
  const info = await lstat(path).catch(() => { throw new BackendError('MEDIA_MISSING', 'The photo is no longer available.'); });
  if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) throw new BackendError('INVALID_INPUT', 'Photo size is outside the permitted range.');
  return (await readFile(path)).toString('base64');
}
