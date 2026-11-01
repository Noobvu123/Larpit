import { Asset } from 'expo-asset';
import { BackendError } from '../backend/contracts';
import type { Media, PhotoInput } from '../backend/contracts';
import { openBackend } from '../backend/service';
import type { Backend } from '../backend/service';
import { TENNIS_REFERENCES } from '../backend/references';
import { createBrowserMediaStore, openBrowserStorage, resolveBrowserMediaUri, stageBrowserPhoto } from '../backend/adapters/browser';
import { MAX_PHOTO_BYTES } from '../backend/adapters/media-path';
import { references } from '../lib/references';
import type { Photo } from './model';

let pending: Promise<Backend> | undefined;
export function getBackend(): Promise<Backend> {
  if (!pending) pending = (async () => {
    const backend = await openBackend({ storage: await openBrowserStorage(), media: createBrowserMediaStore(), references: TENNIS_REFERENCES });
    await backend.collectGarbage().catch(() => undefined);
    return backend;
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
export const resolveMediaUri = (media: Media): Promise<string> => resolveBrowserMediaUri(media);

function allowLocalUrl(uri: string): string {
  const url = new URL(uri, window.location.href);
  if (url.protocol === 'blob:' && url.origin === window.location.origin) return url.href;
  if (url.protocol === 'data:' && /^data:image\/(jpeg|jpg|png|webp|heic);/i.test(uri)) return uri;
  if (['http:', 'https:'].includes(url.protocol) && url.origin === window.location.origin) return url.href;
  throw new BackendError('INVALID_INPUT', 'Choose a local photo or one of the bundled references.');
}
async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const uri = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
        : reject(new BackendError('INVALID_INPUT', 'The photo has no readable dimensions.'));
      image.onerror = () => reject(new BackendError('INVALID_INPUT', 'Your browser could not read this image. Try a JPEG or PNG.'));
      image.src = uri;
    });
  } finally { URL.revokeObjectURL(uri); }
}

export async function prepareBackendPhoto(photo: Photo): Promise<PhotoInput> {
  if (typeof window === 'undefined') throw new BackendError('NOT_READY', 'Open the app in a browser first.');
  if (photo.isDemo !== (photo.origin === 'demo')) throw new BackendError('INVALID_INPUT', 'Photo provenance does not match.');
  const source = photo.assetKey ? references.find(ref => ref.id === photo.assetKey)?.image ?? photo.source : photo.source;
  let uri: string | undefined;
  if (typeof source === 'number') uri = Asset.fromModule(source).uri;
  else if (source && typeof source === 'object' && 'uri' in source) uri = source.uri;
  else if (typeof source === 'string') uri = source;
  if (!uri) throw new BackendError('INVALID_INPUT', 'Choose a local photo first.');
  const response = await fetch(allowLocalUrl(uri), { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new BackendError('MEDIA_MISSING', 'This photo could not be opened. Choose it again.');
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_PHOTO_BYTES) throw new BackendError('INVALID_INPUT', 'Choose a photo smaller than 25 MiB.');
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) throw new BackendError('INVALID_INPUT', 'Choose a non-empty photo smaller than 25 MiB.');
  // Read the actual decoded pixels instead of trusting optional picker metadata.
  const size = await dimensions(blob);
  const rawMime = blob.type.toLowerCase().split(';')[0];
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(mimeType)) throw new BackendError('INVALID_INPUT', 'Choose a JPEG, PNG, WebP or HEIC photo.');
  return stageBrowserPhoto(blob, { ...size, origin: photo.origin, mimeType: mimeType as PhotoInput['mimeType'] });
}
