import test from 'node:test';
import assert from 'node:assert/strict';
import {fromFrontendDraft,fromFrontendPhoto} from '../../src/backend/frontend.ts';
test('frontend mapping preserves full briefs and normalizes supported platform names',()=>{
 const r=fromFrontendDraft({sport:'Tennis',platforms:['LinkedIn','Instagram'],content:'both',style:'Fun and informal, not a fixed enum',pose:'Sitting courtside',photoCount:2,topic:'Back on the court'});
 assert.equal(r.toneBrief,'Fun and informal, not a fixed enum');assert.deepEqual(r.platforms,['linkedin','instagram']);assert.equal(r.photoCount,2);assert.equal(r.topic,'Back on the court');
 assert.throws(()=>fromFrontendDraft({sport:'Tennis',platforms:['TikTok'],content:'photos',style:'',pose:''}),{code:'INVALID_INPUT'});
});
test('photo mapping requires actual metadata and never hides simulator provenance',()=>{
 const p=fromFrontendPhoto({source:{uri:'file:///camera/a.jpg'},isDemo:false,origin:'camera'},{width:100,height:200,mimeType:'image/jpeg'});assert.equal(p.uri,'file:///camera/a.jpg');
 assert.throws(()=>fromFrontendPhoto({source:1,isDemo:true,origin:'demo'},{width:100,height:200,mimeType:'image/jpeg'}),{code:'INVALID_INPUT'});
 const demo=fromFrontendPhoto({source:1,isDemo:true,origin:'demo'},{width:100,height:200,mimeType:'image/jpeg',resolvedLocalUri:'file:///cache/demo.jpg'});assert.equal(demo.origin,'demo');
 assert.throws(()=>fromFrontendPhoto({source:{uri:'file:///a.jpg'},isDemo:false,origin:'demo'},{width:100,height:200,mimeType:'image/jpeg'}),{code:'INVALID_INPUT'});
});
