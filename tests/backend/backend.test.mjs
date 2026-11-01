import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { openBackend, TENNIS_REFERENCES } from '../../src/backend/index.ts';
import { createMemoryStorage, createMemoryMediaStore } from './helpers/memory.ts';
import { createNodeStorage, createNodeMediaStore } from './helpers/node.ts';

const photo={uri:'file:///camera/photo.jpg',width:1200,height:1600,origin:'camera',mimeType:'image/jpeg'};
const input={content:'both',photoCount:3,topic:'I started playing tennis again.',toneBrief:'casual',poseBrief:'sitting with a racquet',platforms:['linkedin','instagram']};
async function setup(extra={}){const storage=createMemoryStorage(),media=createMemoryMediaStore();return {storage,media,app:await openBackend({storage,media,references:TENNIS_REFERENCES,...extra})};}
async function fill(app,draft){for(const s of draft.shots){await app.setReference(draft.id,s.id,'seated');await app.attachPhoto(draft.id,s.id,photo);await app.acceptPhoto(draft.id,s.id);}if(draft.content!=='photos')await app.generateCaptions(draft.id);}
async function confirm(app,id){const d=await app.getDraft(id);for(const p of d.platforms){const preview=await app.getPreview(id,p);await app.confirmPreview(id,p,preview.revision);}}

test('complete three-shot flow, explicit manual review, previews and idempotent All done',async()=>{
 const {app}=await setup();assert.deepEqual(await app.listPosts(),[]);
 const d=await app.createDraft(input);await fill(app,d);
 await app.reviewPhoto(d.id,'shot-1');let r=await app.getDraft(d.id);
 assert.equal(r.shots[0].assessment.status,'unavailable');assert.equal(r.shots[0].assessment.score,null);assert.equal(r.shots[0].accepted,false);
 await app.acceptPhoto(d.id,'shot-1');await confirm(app,d.id);
 const [a,b]=await Promise.all([app.completeDraft(d.id),app.completeDraft(d.id)]);
 assert.equal(a.id,b.id);assert.equal((await app.listPosts()).length,1);assert.deepEqual(a.platforms,['instagram','linkedin']);
 assert.equal(a.photos.length,3);assert.equal(a.captions.instagram.method,'template');assert.notEqual(a.captions.instagram.text,a.captions.linkedin.text);
});
test('photos-only and written-only branches validate independently',async()=>{
 const {app}=await setup();
 for(const content of ['photos','written']){
  const d=await app.createDraft({...input,content,photoCount:1});await fill(app,d);await confirm(app,d.id);const p=await app.completeDraft(d.id);
  assert.equal(p.photos.length,content==='photos'?1:0);assert.equal(Object.keys(p.captions).length,content==='photos'?0:2);
 }
});
test('supports one, two and three stable photo slots and retakes preserve order',async()=>{
 const {app}=await setup();
 for(const photoCount of [1,2,3]){
  const d=await app.createDraft({...input,photoCount});assert.equal((await app.getShotPlan(d.id)).length,photoCount);await fill(app,d);
  const before=await app.getDraft(d.id);const after=await app.attachPhoto(d.id,'shot-1',photo);
  assert.notEqual(after.shots[0].photo.id,before.shots[0].photo.id);assert.equal(after.shots[0].accepted,false);
  for(let i=1;i<photoCount;i++)assert.equal(after.shots[i].photo.id,before.shots[i].photo.id);
 }
});
test('topic/tone edits invalidate generated captions and previews; photo edits invalidate previews',async()=>{
 const {app}=await setup();const d=await app.createDraft({...input,photoCount:1});await fill(app,d);await confirm(app,d.id);
 const after=await app.updateDraft(d.id,{toneBrief:'professional'});assert.deepEqual(after.captions,{});assert.deepEqual(after.previewRevisions,{});
 await assert.rejects(app.completeDraft(d.id),{code:'NOT_READY'});
 await app.generateCaptions(d.id);await confirm(app,d.id);await app.attachPhoto(d.id,'shot-1',photo);
 await assert.rejects(app.completeDraft(d.id),{code:'NOT_READY'});
});
test('preview revision prevents stale confirmation and platform removal cannot leave captions',async()=>{
 const {app}=await setup();const d=await app.createDraft({...input,content:'written'});await fill(app,d);const p=await app.getPreview(d.id,'instagram');
 await app.editCaption(d.id,'instagram','My own caption');await assert.rejects(app.confirmPreview(d.id,'instagram',p.revision),{code:'STALE_RESULT'});
 const updated=await app.updateDraft(d.id,{platforms:['linkedin']});assert.equal(updated.captions.instagram,undefined);
});
test('regeneration limit survives reopening; edited captions require explicit replacement',async()=>{
 const {app,storage,media}=await setup();const d=await app.createDraft({...input,content:'written'});await app.generateCaptions(d.id);
 await app.editCaption(d.id,'instagram','Keep my edit');
 await assert.rejects(app.generateCaptions(d.id,{platform:'instagram',regenerate:true}),{code:'NOT_READY'});
 await app.generateCaptions(d.id,{platform:'instagram',regenerate:true,replaceEdited:true});
 const reopened=await openBackend({storage,media});await reopened.generateCaptions(d.id,{platform:'instagram',regenerate:true});
 await assert.rejects(reopened.generateCaptions(d.id,{platform:'instagram',regenerate:true}),{code:'LIMIT_REACHED'});
 await reopened.editCaption(d.id,'instagram','Still editable');assert.equal((await reopened.getDraft(d.id)).captions.instagram.text,'Still editable');
});
test('late model responses cannot overwrite draft edits',async()=>{
 let resolve;const intelligence={kind:'local-model',captions:()=>new Promise(r=>{resolve=r;}),review:async()=>{throw Error('unused');}};
 const {app}=await setup({intelligence});const d=await app.createDraft({...input,content:'written'});const pending=app.generateCaptions(d.id);
 while(!resolve)await new Promise(r=>setImmediate(r));await app.updateDraft(d.id,{topic:'An updated topic'});
 resolve({title:'Tennis',method:'local-model',model:'fixture',captions:{instagram:'First',linkedin:'Second'}});
 await assert.rejects(pending,{code:'STALE_RESULT'});assert.deepEqual((await app.getDraft(d.id)).captions,{});
});
test('duplicate in-flight generation is rejected and cancellation preserves state',async()=>{
 let resolve;const intelligence={kind:'local-model',captions:()=>new Promise(r=>{resolve=r;}),review:async()=>{throw Error('unused');}};
 const {app}=await setup({intelligence});const d=await app.createDraft({...input,content:'written'});const controller=new AbortController();const pending=app.generateCaptions(d.id,{signal:controller.signal});
 while(!resolve)await new Promise(r=>setImmediate(r));await assert.rejects(app.generateCaptions(d.id),{code:'BUSY'});controller.abort();
 resolve({title:'Tennis',method:'local-model',model:'fixture',captions:{instagram:'First',linkedin:'Second'}});
 await assert.rejects(pending,{code:'CANCELLED'});assert.deepEqual((await app.getDraft(d.id)).captions,{});
});
test('failed state write preserves previous draft and rolls back imported copy',async()=>{
 const backing=createMemoryStorage();let reject=false;const storage={load:()=>backing.load(),save:v=>reject?Promise.reject(Error('disk full')):backing.save(v)};
 const media=createMemoryMediaStore();const app=await openBackend({storage,media});const d=await app.createDraft(input);reject=true;
 await assert.rejects(app.attachPhoto(d.id,'shot-1',photo),{code:'STORAGE_ERROR'});assert.equal((await app.getDraft(d.id)).shots[0].photo,null);
 reject=false;await app.attachPhoto(d.id,'shot-1',photo);assert.ok((await app.getDraft(d.id)).shots[0].photo);
});
test('missing files block final save; demo metadata stays explicit',async()=>{
 const {app,media}=await setup();const d=await app.createDraft({...input,content:'photos',photoCount:1});await app.attachPhoto(d.id,'shot-1',{...photo,origin:'demo'});
 const state=await app.acceptPhoto(d.id,'shot-1');await confirm(app,d.id);await media.remove(state.shots[0].photo);
 await assert.rejects(app.completeDraft(d.id),{code:'MEDIA_MISSING'});
 await app.attachPhoto(d.id,'shot-1',{...photo,origin:'demo'});await app.acceptPhoto(d.id,'shot-1');await confirm(app,d.id);assert.equal((await app.completeDraft(d.id)).isDemo,true);
});
test('deleted posts queue only owned media; failed cleanup is retryable',async()=>{
 const base=createMemoryMediaStore();let failRemove=true;const media={...base,remove:m=>failRemove?Promise.reject(Error('busy')):base.remove(m)};
 const {app}=await setup({media});const d=await app.createDraft({...input,content:'photos',photoCount:1});await fill(app,d);await confirm(app,d.id);const p=await app.completeDraft(d.id);await app.deletePost(p.id);
 assert.deepEqual(await app.listPosts(),[]);assert.deepEqual(await app.collectGarbage(),{removed:0,pending:1});failRemove=false;assert.deepEqual(await app.collectGarbage(),{removed:1,pending:0});
});
test('disk-backed save/reopen/delete and media copy survive actual adapter recreation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'larpit-flow-'));
 try{
  const source=join(dir,'camera.png');await writeFile(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nJAAAAAASUVORK5CYII=','base64'));
  const options=()=>({storage:createNodeStorage(join(dir,'db.json')),media:createNodeMediaStore(join(dir,'media'))});
  let app=await openBackend(options());const d=await app.createDraft({...input,content:'photos',photoCount:1});
  await app.attachPhoto(d.id,'shot-1',{...photo,uri:pathToFileURL(source).href,mimeType:'image/png',width:1,height:1});await app.acceptPhoto(d.id,'shot-1');await confirm(app,d.id);const saved=await app.completeDraft(d.id);
  await rm(source);app=await openBackend(options());assert.equal((await app.listPosts())[0].id,saved.id);assert.equal((await app.inspectPostMedia(saved.id))[0].available,true);
  assert.equal((await app.completeDraft(d.id)).id,saved.id);await app.deletePost(saved.id);await app.collectGarbage();app=await openBackend(options());assert.deepEqual(await app.listPosts(),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupt or future-version storage is never silently reset',async()=>{
 for(const value of ['{broken',JSON.stringify({schemaVersion:2})]){
  const storage=createMemoryStorage(value);await assert.rejects(openBackend({storage,media:createMemoryMediaStore()}));assert.equal(await storage.load(),value);
 }
 const {app,storage,media}=await setup();await app.createDraft(input);const bad=JSON.parse(await storage.load());bad.nextId=1;await storage.save(JSON.stringify(bad));
 await assert.rejects(openBackend({storage,media}),{code:'CORRUPT_STORAGE'});
});
test('invalid setup is rejected and callers cannot mutate stored values',async()=>{
 const {app}=await setup();for(const value of [{photoCount:0},{photoCount:4},{platforms:['tiktok']},{content:'video'},{role:'admin'}])await assert.rejects(async()=>app.createDraft(value),{code:'INVALID_INPUT'});
 const d=await app.createDraft(input);d.platforms.length=0;assert.equal((await app.getDraft(d.id)).platforms.length,2);
 assert.equal((await app.matchReferences(d.id)).status,'matched');
});
test('completed posts do not consume the unfinished-draft quota',async()=>{
 const {app,storage,media}=await setup();const d=await app.createDraft({...input,content:'written'});await fill(app,d);await confirm(app,d.id);await app.completeDraft(d.id);
 const snapshot=JSON.parse(await storage.load()), originalDraft=snapshot.drafts[0],originalPost=snapshot.posts[0];
 snapshot.drafts=Array.from({length:200},(_,i)=>({...structuredClone(originalDraft),id:`draft-${i+1}`,completedPostId:`post-${i+201}`}));
 snapshot.posts=Array.from({length:200},(_,i)=>({...structuredClone(originalPost),id:`post-${i+201}`,draftId:`draft-${i+1}`}));snapshot.nextId=401;
 await storage.save(JSON.stringify(snapshot));const reopened=await openBackend({storage,media});assert.equal((await reopened.createDraft(input)).id,'draft-401');
});
test('garbage limit rejects new removal safely and cleanup enables a retry',async()=>{
 const {app,storage,media}=await setup();const d=await app.createDraft(input);const current=await app.attachPhoto(d.id,'shot-1',photo);
 const snapshot=JSON.parse(await storage.load());snapshot.nextId=5000;snapshot.garbage=Array.from({length:4000},(_,i)=>({...current.shots[0].photo,id:`media-${i+10}-x-y`,uri:`file:///memory/larpit-media/media-${i+10}-x-y`}));
 await storage.save(JSON.stringify(snapshot));const reopened=await openBackend({storage,media});await assert.rejects(reopened.removePhoto(d.id,'shot-1'),{code:'LIMIT_REACHED'});
 assert.ok((await reopened.getDraft(d.id)).shots[0].photo);await reopened.collectGarbage();await reopened.removePhoto(d.id,'shot-1');assert.equal((await reopened.getDraft(d.id)).shots[0].photo,null);
 await openBackend({storage,media});
});
test('abort while result is queued behind another write prevents the result commit',async()=>{
 const base=createMemoryStorage();let block=false,releaseSave,resolveModel;
 const storage={load:()=>base.load(),save:async v=>{if(block){block=false;await new Promise(r=>{releaseSave=r;});}await base.save(v);}};
 const intelligence={kind:'local-model',captions:()=>new Promise(r=>{resolveModel=r;}),review:async()=>{throw Error('unused');}};
 const app=await openBackend({storage,media:createMemoryMediaStore(),intelligence});const d=await app.createDraft({...input,content:'written'});const controller=new AbortController();
 const generation=app.generateCaptions(d.id,{signal:controller.signal});while(!resolveModel)await new Promise(r=>setImmediate(r));
 block=true;const other=app.createDraft();while(!releaseSave)await new Promise(r=>setImmediate(r));
 resolveModel({title:'Tennis',method:'local-model',model:'fixture',captions:{instagram:'First',linkedin:'Second'}});await new Promise(r=>setImmediate(r));controller.abort();releaseSave();await other;
 await assert.rejects(generation,{code:'CANCELLED'});assert.deepEqual((await app.getDraft(d.id)).captions,{});
});
