export type Platform = 'instagram' | 'linkedin';
export type ContentKind = 'photos' | 'written' | 'both';
export type Origin = 'camera' | 'library' | 'demo';
export type Method = 'template' | 'local-model' | 'user';
export type PhotoInput = { uri: string; width: number; height: number; origin: Origin; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' };
export type Media = PhotoInput & { id: string; isDemo: boolean };
export type Reference = { id: string; title: string; assetKey: string; sourceUrl: string; photographer: string; tags: string[]; instructions: string[] };
export type Assessment = { status: 'assessed' | 'unavailable'; method: 'local-model' | 'manual'; score: number | null; feedback: string[]; model?: string };
export type Shot = { id: string; referenceId: string | null; photo: Media | null; assessment: Assessment | null; accepted: boolean };
export type Caption = { platform: Platform; text: string; method: Method; model?: string; regenerations: number };
export type Draft = {
  id: string; revision: number; createdAt: string; updatedAt: string;
  sport: 'tennis'; content: ContentKind; toneBrief: string; poseBrief: string; topic: string;
  photoCount: number; platforms: Platform[]; shots: Shot[];
  captions: Partial<Record<Platform, Caption>>; previewRevisions: Partial<Record<Platform, number>>;
  title: string; titleMethod: Method; completedPostId: string | null;
};
export type DraftPatch = Partial<Pick<Draft, 'content' | 'toneBrief' | 'poseBrief' | 'topic' | 'photoCount' | 'platforms'>>;
export type Post = { id: string; draftId: string; createdAt: string; title: string; titleMethod: Method; sport: 'tennis'; content: ContentKind; platforms: Platform[]; photos: Media[]; captions: Partial<Record<Platform, Caption>>; isDemo: boolean };
export type Database = { schemaVersion: 1; nextId: number; drafts: Draft[]; posts: Post[]; garbage: Media[] };
/** Save must atomically replace the entire value or reject without changing it. One service instance per store. */
export interface Storage { load(): Promise<string | null>; save(serialized: string): Promise<void>; }
/** Store must own imported copies, never modify/delete picker or camera originals. */
export interface MediaStore {
  importPhoto(input: PhotoInput, id: string): Promise<Media>;
  exists(media: Media): Promise<boolean>;
  remove(media: Media): Promise<void>;
}
export type CaptionRequest = { topic: string; toneBrief: string; platforms: Platform[]; variant: number; signal?: AbortSignal };
export type CaptionResult = { title: string; method: 'template' | 'local-model'; model?: string; captions: Partial<Record<Platform, string>> };
export type ReviewRequest = { photo: Media; reference: Reference; poseBrief: string; signal?: AbortSignal };
export interface Intelligence {
  readonly kind: 'template' | 'local-model';
  captions(request: CaptionRequest): Promise<CaptionResult>;
  review(request: ReviewRequest): Promise<Assessment>;
}
export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'LIMIT_REACHED' | 'NOT_READY' | 'STORAGE_ERROR' | 'CORRUPT_STORAGE' | 'UNSUPPORTED_VERSION' | 'MEDIA_MISSING' | 'PROVIDER_UNAVAILABLE' | 'CANCELLED' | 'STALE_RESULT' | 'BUSY';
export class BackendError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.name = 'BackendError'; this.code = code; }
}
