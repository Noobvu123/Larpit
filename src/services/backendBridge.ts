import type { Draft as BackendDraft, DraftPatch, Media, Method, Platform, Post } from "../backend/contracts.ts";
import type { Draft, PlatformName } from "../lib/flow.ts";
import type { CaptionMethods, Captions, Photo, SavedPost, Shot } from "./model.ts";

export const supportedPlatforms: PlatformName[] = ["Instagram", "LinkedIn"];
export const referenceKeys = ["portrait", "seated", "equipment"] as const;
export function backendPlatform(platform: PlatformName): Platform {
  if (platform === "Instagram") return "instagram";
  if (platform === "LinkedIn") return "linkedin";
  throw new Error("Choose Instagram or LinkedIn for this demo. Your earlier saved posts are still available.");
}
export function frontendPlatform(platform: Platform): PlatformName {
  return platform === "instagram" ? "Instagram" : "LinkedIn";
}
export function frontendShotId(draftId: string, shotId: string): string { return `${draftId}:${shotId}`; }
export function toBackendPatch(value: Partial<Draft>): DraftPatch {
  if (value.sport !== undefined && value.sport !== null && value.sport !== "Tennis") throw new Error("Tennis is the available sport for this demo.");
  return {
    ...(value.content !== undefined ? { content: value.content } : {}),
    ...(value.style !== undefined ? { toneBrief: value.style.slice(0, 500) } : {}),
    ...(value.pose !== undefined ? { poseBrief: value.pose.slice(0, 500) } : {}),
    ...(value.topic !== undefined ? { topic: value.topic.slice(0, 2000) } : {}),
    ...(value.shotCount !== undefined ? { photoCount: value.shotCount } : {}),
    ...(value.platforms !== undefined ? { platforms: value.platforms.map(backendPlatform) } : {}),
  };
}
export function frontendMethod(method: Method): "template" | "edited" | "local-model" {
  return method === "user" ? "edited" : method;
}
export function mapCaptions(captions: BackendDraft["captions"]): { captions: Captions; captionMethods: CaptionMethods; regenerationCount: number } {
  const result: Captions = {};
  const methods: CaptionMethods = {};
  let count = 0;
  for (const platform of ["instagram", "linkedin"] as const) {
    const caption = captions[platform];
    if (!caption) continue;
    const name = frontendPlatform(platform);
    result[name] = caption.text;
    methods[name] = frontendMethod(caption.method);
    count = Math.max(count, caption.regenerations);
  }
  return { captions: result, captionMethods: methods, regenerationCount: count };
}
export async function mapMedia(media: Media, resolveUri: (media: Media) => Promise<string>): Promise<Photo> {
  try {
    return { source: { uri: await resolveUri(media) }, isDemo: media.isDemo, origin: media.origin,
      width: media.width, height: media.height, mimeType: media.mimeType, unavailable: false };
  } catch {
    return { source: { uri: media.uri }, isDemo: media.isDemo, origin: media.origin,
      width: media.width, height: media.height, mimeType: media.mimeType, unavailable: true };
  }
}
export async function mapDraft(draft: BackendDraft, activeShot: number, checks: Record<string, boolean[]>, resolveUri: (media: Media) => Promise<string>) {
  const shots: Shot[] = await Promise.all(draft.shots.map(async (shot, index) => {
    const id = frontendShotId(draft.id, shot.id);
    return { id, referenceId: shot.referenceId ?? referenceKeys[index % referenceKeys.length],
      photo: shot.photo ? await mapMedia(shot.photo, resolveUri) : null,
      accepted: shot.accepted, checks: checks[id] ?? [false, false, false], assessment: shot.assessment };
  }));
  const selected = Math.max(0, Math.min(activeShot, shots.length - 1));
  const form: Draft = { sport: "Tennis", content: draft.content, style: draft.toneBrief, pose: draft.poseBrief,
    topic: draft.topic, title: draft.title, shotCount: draft.photoCount,
    platforms: draft.platforms.map(frontendPlatform),
    referenceIndex: Math.max(0, referenceKeys.findIndex(key => key === shots[selected]?.referenceId)) };
  return { draft: form, shots, activeShot: selected, ...mapCaptions(draft.captions),
    sessionId: draft.id, hasDraft: !draft.completedPostId, completedPostId: draft.completedPostId };
}
export async function mapPost(post: Post, resolveUri: (media: Media) => Promise<string>): Promise<SavedPost> {
  return { id: post.id, title: post.title, sport: "Tennis", createdAt: post.createdAt, content: post.content,
    photos: await Promise.all(post.photos.map(media => mapMedia(media, resolveUri))),
    ...mapCaptions(post.captions), platforms: post.platforms.map(frontendPlatform),
    style: "", topic: "", isDemo: post.isDemo };
}
export function combinePosts(current: SavedPost[], legacy: SavedPost[], hidden: string[]): SavedPost[] {
  const ids = new Set(current.map(post => post.id));
  return [...current, ...legacy.filter(post => !ids.has(post.id) && !hidden.includes(post.id))]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type IntegrationPreferences = {
  version: 1; dark: boolean; hasOnboarded: boolean; activeDraftId: string | null; activeShot: number;
  checks: Record<string, boolean[]>; hiddenLegacyPosts: string[];
  migratedLegacySession: string | null;
};
export function freshPreferences(): IntegrationPreferences {
  return { version: 1, dark: true, hasOnboarded: false, activeDraftId: null, activeShot: 0,
    checks: {}, hiddenLegacyPosts: [], migratedLegacySession: null };
}
export function parsePreferences(raw: string | null): IntegrationPreferences {
  if (!raw) return freshPreferences();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Your local settings could not be read. They have been kept for recovery.");
  const p = value as IntegrationPreferences;
  if (p.version !== 1 || typeof p.dark !== "boolean" || typeof p.hasOnboarded !== "boolean"
    || !(p.activeDraftId === null || typeof p.activeDraftId === "string")
    || !Number.isInteger(p.activeShot) || p.activeShot < 0 || p.activeShot > 2
    || !p.checks || typeof p.checks !== "object" || Array.isArray(p.checks)
    || !Object.values(p.checks).every(v => Array.isArray(v) && v.length === 3 && v.every(c => typeof c === "boolean"))
    || !Array.isArray(p.hiddenLegacyPosts) || !p.hiddenLegacyPosts.every(v => typeof v === "string")
    || !(p.migratedLegacySession === null || typeof p.migratedLegacySession === "string")) {
    throw new Error("Your local settings could not be read. They have been kept for recovery.");
  }
  return p;
}
