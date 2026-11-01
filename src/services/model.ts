import type { ImageSourcePropType } from "react-native";
import type { ContentKind, Draft, PlatformName } from "../lib/flow";
import type { Assessment } from "../backend/contracts";

export type Photo = {
  source: ImageSourcePropType;
  isDemo: boolean;
  origin: "camera" | "library" | "demo";
  width?: number;
  height?: number;
  mimeType?: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  /** Stable bundled reference key. Native asset numbers are never authoritative on restore. */
  assetKey?: string;
  unavailable?: boolean;
};
export type Shot = {
  id: string;
  referenceId: string;
  photo: Photo | null;
  accepted: boolean;
  checks: boolean[];
  assessment?: Assessment | null;
};
export type Captions = Partial<Record<PlatformName, string>>;
export type CaptionMethods = Partial<Record<PlatformName, "template" | "edited" | "local-model">>;
export type SavedPost = {
  id: string;
  title: string;
  sport: "Tennis";
  createdAt: string;
  content: ContentKind;
  photos: Photo[];
  captions: Captions;
  captionMethods: CaptionMethods;
  platforms: PlatformName[];
  style: string;
  topic: string;
  isDemo: boolean;
};
export type StoredModel = {
  version: 1;
  dark: boolean;
  hasOnboarded: boolean;
  sessionId: string;
  hasDraft: boolean;
  draft: Draft;
  shots: Shot[];
  activeShot: number;
  captions: Captions;
  captionMethods: CaptionMethods;
  regenerationCount: number;
  completedPostId: string | null;
  posts: SavedPost[];
};
export const platformOrder: PlatformName[] = ["Instagram", "LinkedIn", "Snapchat", "TikTok"];
export const referenceIds = ["portrait", "seated", "equipment"] as const;
export function makeShots(count: number, sessionId: string): Shot[] {
  return Array.from({ length: Math.max(1, Math.min(3, Math.trunc(count))) }, (_, index) => ({
    id: `${sessionId}-shot-${index + 1}`,
    referenceId: referenceIds[index % referenceIds.length],
    photo: null,
    accepted: false,
    checks: [false, false, false],
  }));
}
export function resizeShots(shots: Shot[], count: number, sessionId: string): Shot[] {
  return makeShots(count, sessionId).map((shot, index) => shots[index] ?? shot);
}
export function replaceShotPhoto(shot: Shot, photo: Photo | null): Shot {
  return { ...shot, photo, accepted: false, assessment: null, checks: [false, false, false] };
}
export function replaceShotReference(shot: Shot, referenceId: string): Shot {
  return shot.referenceId === referenceId ? shot : { ...shot, referenceId, accepted: false, assessment: null, checks: [false, false, false] };
}
export function canAttachPhoto(shot: Shot | undefined, expectedShotId?: string): boolean {
  return !!shot && (expectedShotId === undefined || expectedShotId === shot.id);
}
export function validateCompletion(model: Pick<StoredModel, "draft" | "shots" | "captions">): void {
  const { draft, shots, captions } = model;
  if (draft.sport !== "Tennis") throw new Error("Choose Tennis before saving your post.");
  if (!draft.platforms.length) throw new Error("Choose at least one platform.");
  if (draft.content !== "written") {
    if (shots.length !== draft.shotCount || shots.some(s => !s.photo || !s.accepted || s.photo.unavailable)) {
      throw new Error("Review and accept every requested photo before saving.");
    }
  }
  if (draft.content !== "photos") {
    if (!draft.topic.trim()) throw new Error("Add what your post will be about.");
    if (draft.platforms.some(p => !captions[p]?.trim())) throw new Error("Add a caption for every selected platform.");
  }
}
export function addCompletedPost(posts: SavedPost[], post: SavedPost): SavedPost[] {
  return posts.some(p => p.id === post.id) ? posts : [post, ...posts];
}
/** Resume the earliest unfinished slot, even if a later shot was active before interruption. */
export function resumeActiveShot(model: Pick<StoredModel, "draft" | "shots" | "activeShot">): number {
  if (model.draft.content !== "written") {
    const missing = model.shots.findIndex(shot => !shot.photo || !shot.accepted || shot.photo.unavailable);
    if (missing >= 0) return missing;
  }
  return Math.max(0, Math.min(model.activeShot, model.shots.length - 1));
}
export function resumePath(model: Pick<StoredModel, "draft" | "shots" | "captions" | "hasDraft">): "/content" | "/style" | "/references" | "/topic" | "/platforms" | "/captions" | "/preview" {
  if (!model.hasDraft) return "/content";
  if (model.draft.content !== "photos" && !model.draft.style.trim()) return "/style";
  if (model.draft.content !== "written" && model.shots.some(s => !s.photo || !s.accepted || s.photo.unavailable)) return "/references";
  if (model.draft.content !== "photos" && !model.draft.topic.trim()) return "/topic";
  if (!model.draft.platforms.length) return "/platforms";
  if (model.draft.content !== "photos" && model.draft.platforms.some(p => !model.captions[p]?.trim())) return "/captions";
  return "/preview";
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}
function platforms(value: unknown): value is PlatformName[] {
  return Array.isArray(value) && value.length <= 4 && value.every(p => platformOrder.includes(p)) && new Set(value).size === value.length;
}
function captions(value: unknown): value is Captions {
  return record(value) && Object.entries(value).every(([key, text]) => platformOrder.includes(key as PlatformName) && string(text, 5000));
}
function methods(value: unknown): value is CaptionMethods {
  return record(value) && Object.entries(value).every(([key, method]) => platformOrder.includes(key as PlatformName) && (method === "template" || method === "edited" || method === "local-model"));
}
function content(value: unknown): value is ContentKind { return value === "photos" || value === "written" || value === "both"; }
function photo(value: unknown): value is Photo {
  if (!record(value) || typeof value.isDemo !== "boolean" || !["camera", "library", "demo"].includes(value.origin as string)) return false;
  if (value.assetKey !== undefined && !referenceIds.includes(value.assetKey as typeof referenceIds[number])) return false;
  if (value.isDemo && value.origin !== "demo") return false;
  if (!value.isDemo && value.origin === "demo") return false;
  if (value.assetKey) return value.isDemo;
  if (!record(value.source) || !string(value.source.uri, 20_000_000)) return false;
  return /^(file:\/\/|content:\/\/|ph:\/\/|blob:|data:image\/(jpeg|jpg|png|webp|heic);)/.test(value.source.uri);
}
function draft(value: unknown): value is Draft {
  return record(value) && (value.sport === null || value.sport === "Tennis") && platforms(value.platforms) && content(value.content)
    && string(value.style, 500) && string(value.pose, 500) && string(value.topic, 2000) && string(value.title, 160)
    && Number.isInteger(value.shotCount) && Number(value.shotCount) >= 1 && Number(value.shotCount) <= 3
    && Number.isInteger(value.referenceIndex) && Number(value.referenceIndex) >= 0 && Number(value.referenceIndex) < 3;
}
function shot(value: unknown): value is Shot {
  return record(value) && string(value.id, 120) && referenceIds.includes(value.referenceId as typeof referenceIds[number])
    && typeof value.accepted === "boolean" && (value.photo === null ? !value.accepted : photo(value.photo))
    && Array.isArray(value.checks) && value.checks.length === 3 && value.checks.every(v => typeof v === "boolean");
}
function post(value: unknown): value is SavedPost {
  return record(value) && string(value.id, 120) && /^[a-zA-Z0-9_-]+$/.test(value.id) && string(value.title, 160)
    && value.sport === "Tennis" && string(value.createdAt, 60) && Number.isFinite(Date.parse(value.createdAt))
    && content(value.content) && Array.isArray(value.photos) && value.photos.length <= 3 && value.photos.every(photo)
    && captions(value.captions) && methods(value.captionMethods) && platforms(value.platforms) && value.platforms.length > 0
    && string(value.style, 500) && string(value.topic, 2000) && typeof value.isDemo === "boolean";
}
/** Fail closed on unrecognized versions/corrupt records; the caller preserves the original bytes. */
export function parseStoredModel(raw: string): StoredModel {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || typeof value.dark !== "boolean" || typeof value.hasOnboarded !== "boolean"
    || !string(value.sessionId, 100) || !/^[a-zA-Z0-9_-]+$/.test(value.sessionId) || typeof value.hasDraft !== "boolean"
    || !draft(value.draft) || !Array.isArray(value.shots) || value.shots.length !== value.draft.shotCount || !value.shots.every(shot)
    || !Number.isInteger(value.activeShot) || Number(value.activeShot) < 0 || Number(value.activeShot) >= value.shots.length
    || !captions(value.captions) || !methods(value.captionMethods) || !Number.isInteger(value.regenerationCount)
    || Number(value.regenerationCount) < 0 || Number(value.regenerationCount) > 2
    || !(value.completedPostId === null || string(value.completedPostId, 120))
    || !Array.isArray(value.posts) || value.posts.length > 500 || !value.posts.every(post)
    || new Set(value.posts.map(p => p.id)).size !== value.posts.length) {
    throw new Error("Saved data could not be read. Your original data has been kept.");
  }
  return value as unknown as StoredModel;
}
