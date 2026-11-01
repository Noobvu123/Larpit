import { BackendError } from '../contracts.ts';
import type { Media, PhotoInput } from '../contracts.ts';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const imageExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' } as const;
export function mediaFilename(input: PhotoInput, id: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !input ||
    !Object.hasOwn(imageExtensions, input.mimeType) || !['camera', 'library', 'demo'].includes(input.origin) ||
    ![input.width, input.height].every(n => Number.isInteger(n) && n > 0 && n <= 30000)) {
    throw new BackendError('INVALID_INPUT', 'Invalid photo metadata.');
  }
  return `${id}.${imageExtensions[input.mimeType]}`;
}
/** Rebase only a known app-owned basename. Never follow a persisted path to an original. */
export function resolveOwnedMediaUri(media: Media, rootUri: string): string {
  const name = mediaFilename(media, media.id);
  const current = `${rootUri.replace(/\/$/, '')}/${name}`;
  if (media.uri === current) return current;
  if (!media.uri.startsWith('file:///') || media.uri.includes('\0') || /(?:^|\/)\.\.(?:\/|$)/.test(media.uri) ||
    !media.uri.endsWith(`/Documents/larpit-media/${name}`)) {
    throw new BackendError('INVALID_INPUT', 'This photo does not belong to the app media store.');
  }
  // iOS may move the application's container while retaining its Documents directory.
  return current;
}
