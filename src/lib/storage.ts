import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { Photo } from "../services/model";

const DATA_KEY = "larpit.local.v1";
const BACKUP_KEY = "larpit.local.v1.backup";
const RECOVERY_KEY = "larpit.local.v1.recovery";
export async function readStoredData(): Promise<{ raw: string | null; backup: string | null }> {
  const [raw, backup] = await Promise.all([AsyncStorage.getItem(DATA_KEY), AsyncStorage.getItem(BACKUP_KEY)]);
  return { raw, backup };
}
/** Main-key write is the durable commit. A best-effort backup never converts success into failure. */
export async function writeStoredData(raw: string): Promise<void> {
  await AsyncStorage.setItem(DATA_KEY, raw);
  try { await AsyncStorage.setItem(BACKUP_KEY, raw); } catch { /* Main record remains authoritative. */ }
}
export async function preserveCorruptData(raw: string): Promise<void> {
  await AsyncStorage.setItem(RECOVERY_KEY, raw);
}
function photoUri(photo: Photo): string | null {
  return typeof photo.source === "object" && "uri" in photo.source ? photo.source.uri ?? null : null;
}
function hash(text: string): string {
  let result = 2166136261;
  for (const c of text) result = Math.imul(result ^ c.charCodeAt(0), 16777619);
  return (result >>> 0).toString(16);
}
const mediaDirectory = () => new Directory(Paths.document, "larpit-media");
export function restorePhotoLocation(photo: Photo): Photo {
  const uri = photoUri(photo);
  const relative = uri?.split("/Documents/larpit-media/")[1];
  if (relative && !relative.includes("..")) return { ...photo, source: { uri: `${mediaDirectory().uri.replace(/\/$/, "")}/${relative}` } };
  return photo;
}
export async function persistPhoto(photo: Photo, postId: string, index: number): Promise<Photo> {
  if (photo.isDemo && photo.assetKey) return photo;
  const uri = photoUri(photo);
  if (!uri || !/^(file:\/\/|content:\/\/|ph:\/\/)/.test(uri)) throw new Error("This photo is unavailable. Choose it again before saving.");
  const media = mediaDirectory();
  media.create({ intermediates: true, idempotent: true });
  const post = new Directory(media, postId.replace(/[^a-zA-Z0-9_-]/g, ""));
  post.create({ intermediates: true, idempotent: true });
  if (uri.startsWith(post.uri.replace(/\/$/, "") + "/") && new File(uri).exists) return photo;
  const extension = uri.split(/[?#]/)[0].match(/\.(jpg|jpeg|png|webp|heic)$/i)?.[1]?.toLowerCase() ?? "jpg";
  const destination = new File(post, `${index}-${hash(uri)}.${extension}`);
  if (uri !== destination.uri && !destination.exists) await new File(uri).copy(destination);
  if (!destination.exists) throw new Error("The photo could not be saved on this device. Please try again.");
  return { ...photo, source: { uri: destination.uri }, unavailable: false };
}
export async function photoExists(photo: Photo): Promise<boolean> {
  if (photo.assetKey) return true;
  const uri = photoUri(restorePhotoLocation(photo));
  if (!uri) return false;
  try { return new File(uri).exists; } catch { return false; }
}
export async function deleteOwnedPhoto(photo: Photo): Promise<void> {
  const uri = photoUri(photo);
  const root = mediaDirectory().uri.replace(/\/$/, "") + "/";
  if (!uri || !uri.startsWith(root) || uri.includes("..")) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
