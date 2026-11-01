/** Test-only adapters. Neither records nor media survive process restart. */
import { BackendError } from '../contracts.ts';
import type { Media, MediaStore, Storage } from '../contracts.ts';

export function createMemoryStorage(initial: string | null = null): Storage {
  let value = initial;
  return { async load() { return value; }, async save(next) { value = next; } };
}
export function createMemoryMediaStore(): MediaStore {
  const values = new Map<string, Media>();
  return {
    async importPhoto(input, id) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new BackendError('INVALID_INPUT', 'Invalid media identifier.');
      if (values.has(id)) throw new BackendError('STORAGE_ERROR', 'Duplicate media identifier.');
      const media = { ...input, id, uri: `file:///memory/larpit-media/${id}`, isDemo: input.origin === 'demo' };
      values.set(id, { ...media });
      return { ...media };
    },
    async exists(media) { return values.get(media.id)?.uri === media.uri; },
    async remove(media) {
      const found = values.get(media.id);
      if (found && found.uri !== media.uri) throw new BackendError('INVALID_INPUT', 'Photo does not belong to this test store.');
      values.delete(media.id);
    },
  };
}
