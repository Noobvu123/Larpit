import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Image } from 'react-native';
import { BackendError } from '../backend/contracts';
import type { Media, PhotoInput } from '../backend/contracts';
import { resolveExpoMediaUri } from '../backend/adapters/expo';
import { references } from '../lib/references';
import type { Photo } from './model';

export { getBackend } from '../backend/native';
export const resolveMediaUri = (media: Media): Promise<string> => resolveExpoMediaUri(media);
const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
function mime(value: unknown): PhotoInput['mimeType'] | undefined {
  return allowedMime.includes(value as PhotoInput['mimeType']) ? value as PhotoInput['mimeType'] : undefined;
}
/** Resolve bundled samples, legacy photos and picker photos to real local metadata. */
export async function prepareBackendPhoto(photo: Photo): Promise<PhotoInput> {
  if (photo.isDemo !== (photo.origin === 'demo')) throw new BackendError('INVALID_INPUT', 'Photo provenance does not match.');
  const source = photo.assetKey ? references.find(ref => ref.id === photo.assetKey)?.image ?? photo.source : photo.source;
  let uri: string | undefined;
  let contentType = mime(photo.mimeType);
  let width = photo.width;
  let height = photo.height;
  if (typeof source === 'number') {
    const asset = await Asset.fromModule(source).downloadAsync();
    uri = asset.localUri ?? undefined;
    // These bundled tennis assets are unscaled files. Their actual pixel dimensions are read below.
    contentType = mime({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' }[asset.type]);
    width = undefined; height = undefined;
  } else if (source && typeof source === 'object' && 'uri' in source) {
    uri = source.uri;
  }
  if (!uri || !uri.startsWith('file:///')) throw new BackendError('INVALID_INPUT', 'Select a photo stored on this device.');
  const file = new File(uri);
  if (!file.exists) throw new BackendError('MEDIA_MISSING', 'This photo is no longer available. Select it again.');
  contentType = contentType ?? mime(file.type);
  if (!contentType) throw new BackendError('INVALID_INPUT', 'Choose a JPEG, PNG, WebP or HEIC photo.');
  if (![width, height].every(n => Number.isInteger(n) && Number(n) > 0)) {
    const size = await Image.getSize(uri);
    width = size.width; height = size.height;
  }
  return { uri, width: width!, height: height!, mimeType: contentType, origin: photo.origin };
}
