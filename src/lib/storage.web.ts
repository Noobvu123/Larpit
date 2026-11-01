import type { Photo } from "../services/model";

const DATA_KEY = "larpit.local.v1";
const BACKUP_KEY = "larpit.local.v1.backup";
const RECOVERY_KEY = "larpit.local.v1.recovery";
function browserStore(): Storage {
  if (typeof window === "undefined") throw new Error("Storage is not available until the app opens in a browser.");
  return window.localStorage;
}
export async function readStoredData(): Promise<{ raw: string | null; backup: string | null }> {
  const storage = browserStore();
  return { raw: storage.getItem(DATA_KEY), backup: storage.getItem(BACKUP_KEY) };
}
export async function writeStoredData(raw: string): Promise<void> {
  const storage = browserStore();
  storage.setItem(DATA_KEY, raw);
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* The main record is saved even if backup quota is full. */ }
}
export async function preserveCorruptData(raw: string): Promise<void> { browserStore().setItem(RECOVERY_KEY, raw); }
function photoUri(photo: Photo): string | null {
  return typeof photo.source === "object" && "uri" in photo.source ? photo.source.uri ?? null : null;
}
export function restorePhotoLocation(photo: Photo): Photo { return photo; }
const durableImages = new Map<string, string>();
/** Image bytes stay in this browser. Blob URLs are read locally, never sent to a server. */
export async function persistPhoto(photo: Photo, _postId: string, _index: number): Promise<Photo> {
  if (photo.isDemo && photo.assetKey) return photo;
  const uri = photoUri(photo);
  if (!uri || (!uri.startsWith("blob:") && !uri.startsWith("data:image/"))) throw new Error("Choose a local photo before saving.");
  if (uri.startsWith("data:image/jpeg;") && uri.length < 1_200_000) return photo;
  const cached = durableImages.get(uri);
  if (cached) return { ...photo, source: { uri: cached }, unavailable: false };
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This photo is unavailable. Please choose it again."));
    image.src = uri;
  });
  // Store a display-sized copy so one large camera image cannot exhaust browser storage.
  const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not save the selected photo.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const durable = canvas.toDataURL("image/jpeg", 0.78);
  durableImages.set(uri, durable);
  return { ...photo, source: { uri: durable }, width: canvas.width, height: canvas.height, unavailable: false };
}
export async function photoExists(photo: Photo): Promise<boolean> {
  if (photo.assetKey) return true;
  const uri = photoUri(photo);
  if (!uri) return false;
  if (uri.startsWith("data:image/")) return true;
  if (!uri.startsWith("blob:")) return false;
  return new Promise(resolve => {
    const image = new window.Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = uri;
  });
}
export async function deleteOwnedPhoto(_photo: Photo): Promise<void> {
  // Saved web photos are inline in the record. Removing the post removes its bytes.
}
