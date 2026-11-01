import { Asset } from "expo-asset";
import type { Photo } from "./state";

/** Browsers download the chosen image. Native iOS uses the system share sheet. */
export async function sharePhoto(photo: Photo): Promise<string> {
  if (photo.unavailable) throw new Error("This photo is unavailable on this device.");
  const uri = typeof photo.source === "number" ? Asset.fromModule(photo.source).uri : photo.source && "uri" in photo.source ? photo.source.uri : undefined;
  if (!uri) throw new Error("This photo is not available to download.");
  const imageUrl = new URL(uri, window.location.href);
  if (!["blob:", "data:"].includes(imageUrl.protocol) && imageUrl.origin !== window.location.origin) throw new Error("Only your local or bundled photos can be downloaded.");
  const response = await fetch(imageUrl.href);
  if (!response.ok) throw new Error("The photo could not be prepared. Please try again.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif", "image/bmp": "bmp" };
  anchor.download = `larpit-photo.${extensions[blob.type] ?? "jpg"}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "Photo download started. Open your chosen platform to share it.";
}
