import { BackendError } from './contracts.ts';
import type { Database, Draft, DraftPatch, Media, PhotoInput, Platform, Post, Reference, Caption, Assessment } from './contracts.ts';

export function fail(message: string): never { throw new BackendError('INVALID_INPUT', message); }
export function text(value: unknown, name: string, limit = 2000, required = false): string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail(`${name} is missing or too long.`);
  return value.trim();
}
export function platforms(value: unknown): Platform[] {
  if (!Array.isArray(value) || value.length > 2 || value.some(p => !['instagram', 'linkedin'].includes(p)) || new Set(value).size !== value.length) fail('Choose Instagram, LinkedIn, or both.');
  return [...value] as Platform[];
}
export function patch(value: DraftPatch): DraftPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid draft update.');
  const out: DraftPatch = {};
  for (const key of Object.keys(value)) {
    if (!['content', 'toneBrief', 'poseBrief', 'topic', 'photoCount', 'platforms'].includes(key)) fail(`Unknown draft field: ${key}`);
  }
  if ('content' in value) {
    if (!['photos', 'written', 'both'].includes(value.content!)) fail('Choose photos, written, or both.');
    out.content = value.content;
  }
  for (const k of ['toneBrief', 'poseBrief', 'topic'] as const) if (k in value) out[k] = text(value[k], k);
  if ('photoCount' in value) {
    if (!Number.isInteger(value.photoCount) || value.photoCount! < 1 || value.photoCount! > 3) fail('Choose one to three photos.');
    out.photoCount = value.photoCount;
  }
  if ('platforms' in value) out.platforms = platforms(value.platforms);
  return out;
}
export function photo(value: PhotoInput): PhotoInput {
  if (!value || typeof value !== 'object') fail('Choose a photo first.');
  const uri = text(value.uri, 'Local photo URI', 4096, true);
  if (!/^file:\/\/\//.test(uri) || uri.includes('\0')) fail('Resolve the selected asset to a local file URI first.');
  if (![value.width, value.height].every(n => Number.isInteger(n) && n > 0 && n <= 30000)) fail('Invalid photo dimensions.');
  if (!['camera', 'library', 'demo'].includes(value.origin)) fail('Invalid photo origin.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(value.mimeType)) fail('Unsupported image format.');
  return { uri, width: value.width, height: value.height, origin: value.origin, mimeType: value.mimeType };
}
export function reference(value: Reference): Reference {
  if (!value || typeof value !== 'object') fail('Invalid reference.');
  const result = {
    id: text(value.id, 'Reference ID', 100, true), title: text(value.title, 'Reference title', 200, true),
    assetKey: text(value.assetKey, 'Reference asset key', 100, true), sourceUrl: text(value.sourceUrl, 'Unsplash URL', 1000, true),
    photographer: text(value.photographer, 'Photographer', 200, true), tags: value.tags, instructions: value.instructions,
  };
  if (!/^https:\/\/unsplash\.com\/photos\/[\w-]+$/.test(result.sourceUrl)) fail('Use the original Unsplash photo URL.');
  if (!Array.isArray(value.tags) || !value.tags.length || value.tags.length > 30 || !Array.isArray(value.instructions) || !value.instructions.length || value.instructions.length > 10) fail('Reference tags and instructions are required.');
  result.tags = value.tags.map(t => text(t, 'Tag', 80, true));
  result.instructions = value.instructions.map(t => text(t, 'Instruction', 500, true));
  return result;
}
export function assessment(value: Assessment): Assessment {
  if (!value || !['assessed', 'unavailable'].includes(value.status) || !['local-model', 'manual'].includes(value.method)) fail('Invalid assessment response.');
  if (value.status === 'assessed' && (value.method !== 'local-model' || !Number.isFinite(value.score) || value.score! < 0 || value.score! > 100 || !value.model)) fail('Invalid model assessment.');
  if (value.status === 'unavailable' && value.score !== null) fail('Unavailable assessment must have no score.');
  if (value.method === 'local-model' && !value.model) fail('Model assessment needs provenance.');
  if (!Array.isArray(value.feedback) || value.feedback.length < 1 || value.feedback.length > 10) fail('Assessment feedback is required.');
  return { status: value.status, method: value.method, score: value.score, feedback: value.feedback.map(t => text(t, 'Feedback', 1000, true)), ...(value.model ? { model: text(value.model, 'Model', 200, true) } : {}) };
}
export function caption(value: Caption, p: Platform): Caption {
  if (!value || value.platform !== p || !['template', 'local-model', 'user'].includes(value.method) || !Number.isInteger(value.regenerations) || value.regenerations < 0 || value.regenerations > 2) fail('Invalid caption.');
  if (value.method === 'local-model' && !value.model) fail('Model caption needs provenance.');
  return { platform: p, text: text(value.text, 'Caption', p === 'instagram' ? 2200 : 3000, true), method: value.method, regenerations: value.regenerations, ...(value.model ? { model: text(value.model, 'Model', 200, true) } : {}) };
}

function object(v: unknown): asserts v is Record<string, any> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('Invalid record.'); }
function integer(v: unknown, min = 0): void { if (!Number.isSafeInteger(v) || (v as number) < min) fail('Invalid number.'); }
function date(v: unknown): void { if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(v) || !Number.isFinite(Date.parse(v))) fail('Invalid timestamp.'); }
function media(v: Media): void { object(v); photo(v); text(v.id, 'Media ID', 100, true); if (v.isDemo !== (v.origin === 'demo')) fail('Invalid demo provenance.'); }
function captions(v: any): void {
  object(v);
  for (const p of Object.keys(v)) { if (!['instagram', 'linkedin'].includes(p)) fail('Invalid caption platform.'); caption(v[p], p as Platform); }
}
function draft(v: Draft): void {
  object(v); text(v.id, 'Draft ID', 100, true); integer(v.revision); date(v.createdAt); date(v.updatedAt);
  if (v.sport !== 'tennis') fail('Invalid sport.');
  patch({ content: v.content, toneBrief: v.toneBrief, poseBrief: v.poseBrief, topic: v.topic, photoCount: v.photoCount, platforms: v.platforms });
  if (!Array.isArray(v.shots) || v.shots.length !== (v.content === 'written' ? 0 : v.photoCount)) fail('Invalid shot count.');
  v.shots.forEach((s, i) => {
    object(s); if (s.id !== `shot-${i + 1}` || typeof s.accepted !== 'boolean') fail('Invalid shot.');
    if (s.referenceId !== null) text(s.referenceId, 'Reference', 100, true);
    if (s.photo !== null) media(s.photo);
    if (s.assessment !== null) assessment(s.assessment);
    if (s.accepted && !s.photo) fail('Accepted shot needs a photo.');
  });
  captions(v.captions); object(v.previewRevisions);
  for (const p of Object.keys(v.previewRevisions)) { if (!v.platforms.includes(p as Platform)) fail('Invalid preview platform.'); integer(v.previewRevisions[p as Platform]); }
  text(v.title, 'Title', 120); if (!['template', 'local-model', 'user'].includes(v.titleMethod)) fail('Invalid title provenance.');
  if (v.completedPostId !== null) text(v.completedPostId, 'Post ID', 100, true);
}
function post(v: Post): void {
  object(v); text(v.id, 'Post ID', 100, true); text(v.draftId, 'Draft ID', 100, true); text(v.title, 'Title', 120, true); date(v.createdAt);
  if (v.sport !== 'tennis' || !['photos', 'written', 'both'].includes(v.content) || !['template', 'local-model', 'user'].includes(v.titleMethod)) fail('Invalid post.');
  if (!platforms(v.platforms).length || !Array.isArray(v.photos) || v.photos.length > 3) fail('Invalid post payload.');
  v.photos.forEach(media); captions(v.captions);
  if (v.isDemo !== v.photos.some(m => m.isDemo)) fail('Invalid post provenance.');
  if (v.content === 'written' ? v.photos.length !== 0 : v.photos.length === 0) fail('Invalid post photos.');
  if (v.content !== 'photos' && v.platforms.some(p => !v.captions[p])) fail('Missing saved caption.');
}
export function decodeDatabase(raw: string | null): Database {
  if (raw === null) return { schemaVersion: 1, nextId: 1, drafts: [], posts: [], garbage: [] };
  try {
    if (raw.length > 8_000_000) fail('Storage limit exceeded.');
    const v = JSON.parse(raw); object(v);
    if (v.schemaVersion !== 1) throw new BackendError('UNSUPPORTED_VERSION', 'This data needs a compatible app version. Your saved data was not changed.');
    integer(v.nextId, 1);
    if (!Array.isArray(v.drafts) || v.drafts.length > 1200 || !Array.isArray(v.posts) || v.posts.length > 1000 || !Array.isArray(v.garbage) || v.garbage.length > 4000) fail('Invalid database.');
    v.drafts.forEach(draft); v.posts.forEach(post); v.garbage.forEach(media);
    for (const rows of [v.drafts, v.posts]) if (new Set(rows.map((r: any) => r.id)).size !== rows.length) fail('Duplicate records.');
    for (const d of v.drafts) if (d.completedPostId && !v.posts.some((p: Post) => p.id === d.completedPostId && p.draftId === d.id)) fail('Broken completed draft.');
    const allocated: number[] = [];
    for(const d of v.drafts) {if(!/^draft-[1-9]\d*$/.test(d.id))fail('Invalid draft identity.');allocated.push(Number(d.id.slice(6)));}
    for(const p of v.posts) {if(!/^post-[1-9]\d*$/.test(p.id) || !/^draft-[1-9]\d*$/.test(p.draftId))fail('Invalid post identity.');allocated.push(Number(p.id.slice(5)),Number(p.draftId.slice(6)));}
    const allMedia:Media[]=[...v.garbage,...v.drafts.flatMap((d:Draft)=>d.shots.flatMap(s=>s.photo?[s.photo]:[])),...v.posts.flatMap((p:Post)=>p.photos)];
    for(const m of allMedia){if(!/^media-[1-9]\d*-[a-z0-9]+-[a-z0-9]+$/.test(m.id))fail('Invalid media identity.');allocated.push(Number(m.id.split('-')[1]));}
    if(allocated.some(n=>!Number.isSafeInteger(n)||n>=v.nextId))fail('Invalid next record identity.');
    // Reconstruct only the known top-level state; do not merge untrusted prototype keys.
    return { schemaVersion: 1, nextId: v.nextId, drafts: v.drafts, posts: v.posts, garbage: v.garbage };
  } catch (error) {
    if (error instanceof BackendError && error.code === 'UNSUPPORTED_VERSION') throw error;
    throw new BackendError('CORRUPT_STORAGE', 'Saved data could not be read safely. It has not been overwritten.');
  }
}
