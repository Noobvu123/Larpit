import { BackendError } from './contracts.ts';
import type { Storage, MediaStore, Intelligence, Database, Draft, DraftPatch, Post, PhotoInput, Reference, Media, Platform } from './contracts.ts';
import { decodeDatabase, patch, photo, reference, text, assessment, caption, fail } from './validation.ts';
import { createTemplateIntelligence } from './intelligence.ts';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const orderedPlatforms = (d: Draft): Platform[] => (['instagram', 'linkedin'] as const).filter(p => d.platforms.includes(p));
const normalize = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(t => ({ seated: 'sitting', sit: 'sitting', racquet: 'racket', rackets: 'racket', serving: 'serve', serves: 'serve', details: 'detail' }[t] ?? t));

export type BackendOptions = {
  storage: Storage; media: MediaStore; references?: Reference[]; intelligence?: Intelligence;
  now?: () => string;
};

/** Open once per app. All writes are serialized and persisted before they are returned. */
export async function openBackend(options: BackendOptions) {
  let database: Database;
  try { database = decodeDatabase(await options.storage.load()); }
  catch (e) { if (e instanceof BackendError) throw e; throw new BackendError('STORAGE_ERROR', 'Could not open saved data.'); }
  const refs = (options.references ?? []).map(reference);
  if (new Set(refs.map(r => r.id)).size !== refs.length) fail('Reference IDs must be unique.');
  const intelligence = options.intelligence ?? createTemplateIntelligence();
  const now = options.now ?? (() => new Date().toISOString());
  let queue: Promise<unknown> = Promise.resolve();
  const inFlight = new Set<string>();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const task = queue.then(work); queue = task.catch(() => {}); return task;
  }
  async function commit<T>(change: (next: Database) => T | Promise<T>): Promise<T> {
    const next = copy(database);
    const result = await change(next);
    let raw: string;
    try { raw = JSON.stringify(next); if (raw.length > 8_000_000) throw new Error('size'); await options.storage.save(raw); }
    catch (error) {
      if (error instanceof BackendError && ['STORAGE_ERROR', 'CORRUPT_STORAGE'].includes(error.code)) throw error;
      throw new BackendError('STORAGE_ERROR', 'Could not save. Your previous saved state is unchanged. Try again.');
    }
    database = next;
    return result === undefined ? result : copy(result);
  }
  function get(db: Database, id: string): Draft {
    const draft = db.drafts.find(d => d.id === id);
    if (!draft) throw new BackendError('NOT_FOUND', 'Draft not found.');
    return draft;
  }
  function editable(db: Database, id: string): Draft {
    const d = get(db, id);
    if (d.completedPostId) throw new BackendError('NOT_READY', 'This post is saved. Start a new draft to create another post.');
    return d;
  }
  function touch(d: Draft) { d.revision++; d.updatedAt = now(); d.previewRevisions = {}; }
  function shot(d: Draft, id: string) {
    const s = d.shots.find(s => s.id === id);
    if (!s) throw new BackendError('NOT_FOUND', 'Photo slot not found.');
    return s;
  }
  function discard(db: Database, media: Media | null) {
    if (media && !db.garbage.some(m => m.id === media.id)) {
      if (db.garbage.length >= 4000) throw new BackendError('LIMIT_REACHED','Run photo cleanup before removing more photos.');
      db.garbage.push(copy(media));
    }
  }
  function clearCaptions(d: Draft, preserveEdits: boolean) {
    d.captions = preserveEdits ? Object.fromEntries(Object.entries(d.captions).filter(([, value]) => value?.method === 'user')) : {};
    if (!preserveEdits || d.titleMethod !== 'user') { d.title = ''; d.titleMethod = 'template'; }
  }
  function isUsed(media: Media): boolean {
    return database.drafts.some(d => d.shots.some(s => s.photo?.id === media.id)) || database.posts.some(p => p.photos.some(m => m.id === media.id));
  }
  async function checkPhotos(d: Draft) {
    if (d.content === 'written') return;
    for (const s of d.shots) {
      if (!s.photo || !s.accepted) throw new BackendError('NOT_READY', 'Capture and accept every selected photo first.');
      if (!(await options.media.exists(s.photo))) throw new BackendError('MEDIA_MISSING', 'A saved photo is missing. Retake or choose it again.');
    }
  }
  function checkContent(d: Draft) {
    if (!d.platforms.length) throw new BackendError('NOT_READY', 'Choose a platform first.');
    if (d.content !== 'photos' && d.platforms.some(p => !d.captions[p]?.text.trim())) throw new BackendError('NOT_READY', 'Create or write a caption for each selected platform.');
  }
  function cancelled(signal?: AbortSignal) { if (signal?.aborted) throw new BackendError('CANCELLED', 'Request cancelled.'); }

  const api = {
    capabilities() {
      return { persistence: 'adapter', intelligence: intelligence.kind, imageGeneration: false, paidCloudFallback: false,
        referenceMatching: 'tags', supportedPlatforms: ['instagram', 'linkedin'], maxPhotos: 3, maxRegenerations: 2 } as const;
    },
    async listDrafts(): Promise<Draft[]> { await queue; return copy(database.drafts.filter(d => !d.completedPostId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); },
    async getDraft(id: string): Promise<Draft> { await queue; return copy(get(database, id)); },
    createDraft(input: DraftPatch = {}): Promise<Draft> {
      const valid = patch(input);
      return serial(() => commit(db => {
        if (db.drafts.filter(d=>!d.completedPostId).length >= 200) throw new BackendError('LIMIT_REACHED', 'Remove an older draft before starting another.');
        const at = now();
        const d: Draft = { id: `draft-${db.nextId++}`, revision: 0, createdAt: at, updatedAt: at,
          sport: 'tennis', content: 'both', toneBrief: '', poseBrief: '', topic: '', photoCount: 3, platforms: [],
          shots: [], captions: {}, previewRevisions: {}, title: '', titleMethod: 'template', completedPostId: null, ...valid };
        d.shots = Array.from({ length: d.content === 'written' ? 0 : d.photoCount }, (_, i) => ({ id: `shot-${i+1}`, referenceId: null, photo: null, assessment: null, accepted: false }));
        db.drafts.push(d); return d;
      }));
    },
    updateDraft(id: string, input: DraftPatch): Promise<Draft> {
      const valid = patch(input);
      return serial(() => commit(db => {
        const d = editable(db, id); const before = copy(d);
        Object.assign(d, valid);
        const count = d.content === 'written' ? 0 : d.photoCount;
        for (const s of d.shots.slice(count)) discard(db, s.photo);
        d.shots = Array.from({ length: count }, (_, i) => d.shots[i] ?? { id: `shot-${i+1}`, referenceId: null, photo: null, assessment: null, accepted: false });
        if (d.poseBrief !== before.poseBrief) for (const s of d.shots) { s.assessment = null; s.accepted = false; }
        if (d.content !== before.content || d.topic !== before.topic || d.toneBrief !== before.toneBrief) clearCaptions(d, d.content !== 'photos');
        for (const p of ['instagram', 'linkedin'] as const) if (!d.platforms.includes(p)) delete d.captions[p];
        touch(d); return d;
      }));
    },
    async matchReferences(id: string, limit = 3) {
      const d = await api.getDraft(id);
      if (!Number.isInteger(limit) || limit < 1 || limit > 3) fail('Request one to three references.');
      const tokens = new Set(normalize(d.poseBrief));
      const ranked = refs.map(r => ({ reference: copy(r), matchedTags: [...new Set(r.tags.flatMap(normalize).filter(t => tokens.has(t)))] }))
        .filter(r => r.matchedTags.length > 0).sort((a,b) => b.matchedTags.length - a.matchedTags.length || a.reference.id.localeCompare(b.reference.id)).slice(0, limit);
      return { status: !refs.length ? 'catalog-empty' : ranked.length ? 'matched' : 'no-match', method: 'tags', matches: ranked } as const;
    },
    listReferences(): Reference[] { return copy(refs); },
    setReference(id: string, shotId: string, referenceId: string): Promise<Draft> {
      if (!refs.some(r => r.id === referenceId)) fail('Unknown reference.');
      return serial(() => commit(db => { const d=editable(db,id), s=shot(d,shotId); if (s.referenceId === referenceId) return d; s.referenceId=referenceId; s.assessment=null; s.accepted=false; touch(d); return d; }));
    },
    async getShotPlan(id: string) {
      const d = await api.getDraft(id);
      return d.shots.map((s,i) => ({ shotId: s.id, index: i+1, total: d.shots.length,
        reference: copy(refs.find(r => r.id === s.referenceId) ?? null),
        instructions: [...(refs.find(r => r.id === s.referenceId)?.instructions ?? ['Choose a reference for this shot.', 'Keep the subject in frame and check the light.'])] }));
    },
    attachPhoto(id: string, shotId: string, input: PhotoInput): Promise<Draft> {
      const valid = photo(input);
      return serial(async () => {
        const current=editable(database,id); shot(current,shotId);
        // Sequence allocation is committed with the photo. An import failure leaves old slot intact.
        // A crash can leave a copied file before the metadata commit. Never reuse its name.
        const mediaId=`media-${database.nextId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
        const imported = await options.media.importPhoto(valid,mediaId);
        try {
          photo(imported);
          if (imported.id !== mediaId || imported.isDemo !== (valid.origin === 'demo') || imported.origin !== valid.origin) fail('Invalid stored media provenance.');
          return await commit(db => { db.nextId++; const d=editable(db,id), s=shot(d,shotId); discard(db,s.photo); s.photo=copy(imported); s.assessment=null; s.accepted=false; touch(d); return d; });
        } catch (error) { try { await options.media.remove(imported); } catch { /* Failed cleanup may leave an unreferenced app-owned copy; never remove originals. */ } throw error; }
      });
    },
    removePhoto(id: string, shotId: string): Promise<Draft> {
      return serial(() => commit(db => { const d=editable(db,id), s=shot(d,shotId); discard(db,s.photo); s.photo=null; s.assessment=null; s.accepted=false; touch(d); return d; }));
    },
    acceptPhoto(id: string, shotId: string, accepted = true): Promise<Draft> {
      if (typeof accepted !== 'boolean') fail('Invalid acceptance state.');
      return serial(() => commit(async db => {
        const d=editable(db,id), s=shot(d,shotId);
        if (!s.photo) throw new BackendError('NOT_READY','Choose a photo first.');
        if (accepted && !(await options.media.exists(s.photo))) throw new BackendError('MEDIA_MISSING','Photo is missing. Choose it again.');
        s.accepted=accepted; touch(d); return d;
      }));
    },
    async reviewPhoto(id: string, shotId: string, signal?: AbortSignal): Promise<Draft> {
      cancelled(signal); const key=`review:${id}:${shotId}`;
      if (inFlight.has(key)) throw new BackendError('BUSY','This photo is already being reviewed.');
      inFlight.add(key);
      try {
        const d=await api.getDraft(id), s=shot(d,shotId);
        if (d.completedPostId) throw new BackendError('NOT_READY','This post is already saved.');
        if (!s.photo) throw new BackendError('NOT_READY','Choose a photo first.');
        const r=refs.find(r=>r.id===s.referenceId);
        if (!r) throw new BackendError('NOT_READY','Select a reference first.');
        if (!(await options.media.exists(s.photo))) throw new BackendError('MEDIA_MISSING','Photo is missing.');
        const result=s.photo.isDemo
          ? {status:'unavailable',method:'manual',score:null,feedback:['This is a simulator sample, not a photo captured by you.']} as const
          : await intelligence.review({ photo:s.photo, reference:copy(r), poseBrief:d.poseBrief, signal });
        cancelled(signal);
        const valid=assessment({ ...result, feedback:[...result.feedback] });
        return await serial(()=>commit(db=>{
          cancelled(signal);
          const next=editable(db,id);
          if(next.revision!==d.revision) throw new BackendError('STALE_RESULT','The draft changed. Run the review again.');
          const target=shot(next,shotId); target.assessment=valid; target.accepted=false; touch(next); return next;
        }));
      } finally { inFlight.delete(key); }
    },
    async generateCaptions(id: string, settings: { platform?: Platform; regenerate?: boolean; replaceEdited?: boolean; signal?: AbortSignal } = {}): Promise<Draft> {
      cancelled(settings.signal); const key=`captions:${id}`;
      if (inFlight.has(key)) throw new BackendError('BUSY','Captions are already being generated.');
      inFlight.add(key);
      try {
        const d=await api.getDraft(id);
        if(d.completedPostId) throw new BackendError('NOT_READY','This post is already saved.');
        if(d.content==='photos') throw new BackendError('NOT_READY','Photos-only posts do not need a caption.');
        if(!d.platforms.length || !d.topic.trim()) throw new BackendError('NOT_READY','Enter a topic and choose platforms first.');
        const targets=settings.platform ? [settings.platform] : orderedPlatforms(d);
        if(targets.some(p=>!d.platforms.includes(p))) fail('Caption platform is not selected.');
        for(const p of targets) {
          const existing=d.captions[p];
          if(existing && !settings.regenerate) throw new BackendError('NOT_READY','A caption already exists. Edit it or request regeneration.');
          if(existing?.method==='user' && !settings.replaceEdited) throw new BackendError('NOT_READY','Confirm replacement before regenerating your edited caption.');
          if(settings.regenerate && !existing) throw new BackendError('NOT_READY','Generate the initial caption first.');
          if(existing && existing.regenerations>=2) throw new BackendError('LIMIT_REACHED','Two regenerations have been used. You can still edit the caption.');
        }
        const variant=settings.regenerate ? Math.max(...targets.map(p=>d.captions[p]!.regenerations+1)) : 0;
        const result=await intelligence.captions({ topic:d.topic,toneBrief:d.toneBrief,platforms:targets,variant,signal:settings.signal });
        cancelled(settings.signal);
        if(!result || !['template','local-model'].includes(result.method)) fail('Invalid caption provider response.');
        const title=text(result.title,'Title',120,true);
        const generated=targets.map(p=>caption({ platform:p,text:result.captions?.[p]!,method:result.method,...(result.model ? {model:result.model}:{}),regenerations:settings.regenerate ? d.captions[p]!.regenerations+1 : 0 },p));
        return await serial(()=>commit(db=>{
          cancelled(settings.signal);
          const next=editable(db,id);
          if(next.revision!==d.revision) throw new BackendError('STALE_RESULT','The draft changed. Generate captions again.');
          for(const c of generated) next.captions[c.platform]=c;
          if(next.titleMethod!=='user') {next.title=title;next.titleMethod=result.method;}
          touch(next);return next;
        }));
      } finally { inFlight.delete(key); }
    },
    editCaption(id: string, platform: Platform, value: string): Promise<Draft> {
      return serial(()=>commit(db=>{
        const d=editable(db,id);
        if(d.content==='photos' || !d.platforms.includes(platform)) fail('This draft has no caption for that platform.');
        d.captions[platform]=caption({platform,text:value,method:'user',regenerations:d.captions[platform]?.regenerations??0},platform);
        touch(d);return d;
      }));
    },
    setTitle(id: string, value: string): Promise<Draft> {
      const title=text(value,'Title',120,true);
      return serial(()=>commit(db=>{const d=editable(db,id);d.title=title;d.titleMethod='user';touch(d);return d;}));
    },
    async getPreview(id: string, platform: Platform) {
      const d=await api.getDraft(id);checkContent(d);await checkPhotos(d);
      if(!d.platforms.includes(platform)) fail('Platform is not selected.');
      return { draftId:id,revision:d.revision,platform,caption:copy(d.captions[platform]??null),photos:copy(d.shots.flatMap(s=>s.photo?[s.photo]:[])),
        title:d.title || 'Tennis on the court',isDemo:d.shots.some(s=>s.photo?.isDemo),
        nextPlatform:orderedPlatforms(d)[orderedPlatforms(d).indexOf(platform)+1]??null };
    },
    confirmPreview(id: string, platform: Platform, revision: number): Promise<Draft> {
      return serial(()=>commit(async db=>{
        const d=editable(db,id);checkContent(d);await checkPhotos(d);
        if(!d.platforms.includes(platform)) fail('Platform is not selected.');
        if(d.revision!==revision) throw new BackendError('STALE_RESULT','The preview changed. Review the latest version.');
        d.previewRevisions[platform]=revision;return d;
      }));
    },
    completeDraft(id: string): Promise<Post> {
      return serial(()=>commit(async db=>{
        const d=get(db,id);
        if(d.completedPostId) {
          const existing=db.posts.find(p=>p.id===d.completedPostId);
          if(!existing) throw new BackendError('NOT_FOUND','Saved post no longer exists.');
          return existing;
        }
        checkContent(d);await checkPhotos(d);
        if(d.platforms.some(p=>d.previewRevisions[p]!==d.revision)) throw new BackendError('NOT_READY','Review each selected platform preview before finishing.');
        if(db.posts.length>=1000) throw new BackendError('LIMIT_REACHED','Remove an older post before saving another.');
        const photos=d.shots.flatMap(s=>s.photo?[copy(s.photo)]:[]);
        const p:Post={id:`post-${db.nextId++}`,draftId:d.id,createdAt:now(),title:d.title||'Tennis on the court',titleMethod:d.title?d.titleMethod:'template',sport:'tennis',content:d.content,platforms:orderedPlatforms(d),photos,captions:copy(d.captions),isDemo:photos.some(m=>m.isDemo)};
        db.posts.push(p);d.completedPostId=p.id;d.updatedAt=now();return p;
      }));
    },
    async listPosts(): Promise<Post[]> {await queue;return copy(database.posts.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||Number(b.id.split('-')[1])-Number(a.id.split('-')[1])));},
    async getPost(id:string): Promise<Post> {await queue;const p=database.posts.find(p=>p.id===id);if(!p)throw new BackendError('NOT_FOUND','Post not found.');return copy(p);},
    async inspectPostMedia(id:string) {const p=await api.getPost(id);return Promise.all(p.photos.map(async media=>({media,available:await options.media.exists(media)})));},
    deleteDraft(id:string): Promise<void> {
      return serial(()=>commit(db=>{const d=get(db,id);if(!d.completedPostId)for(const s of d.shots)discard(db,s.photo);db.drafts=db.drafts.filter(x=>x.id!==id);}));
    },
    deletePost(id:string): Promise<void> {
      return serial(()=>commit(db=>{const p=db.posts.find(p=>p.id===id);if(!p)throw new BackendError('NOT_FOUND','Post not found.');for(const m of p.photos)discard(db,m);db.posts=db.posts.filter(x=>x.id!==id);db.drafts=db.drafts.filter(d=>d.completedPostId!==id);}));
    },
    collectGarbage(): Promise<{removed:number;pending:number}> {
      return serial(async()=>{
        const removed:string[]=[];
        for(const m of database.garbage) if(!isUsed(m)) {try{await options.media.remove(m);removed.push(m.id);}catch{/* retain for retry */}}
        if(removed.length)await commit(db=>{db.garbage=db.garbage.filter(m=>!removed.includes(m.id));});
        return {removed:removed.length,pending:database.garbage.length};
      });
    },
  };
  return api;
}
export type Backend = Awaited<ReturnType<typeof openBackend>>;
