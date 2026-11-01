import test from "node:test";
import assert from "node:assert/strict";
import { openBackend } from "../src/backend/service.ts";
import { TENNIS_REFERENCES } from "../src/backend/references.ts";
import { createMemoryMediaStore, createMemoryStorage } from "./backend/helpers/memory.ts";
import { backendPlatform, combinePosts, frontendShotId, freshPreferences, mapDraft, mapPost, parsePreferences, toBackendPatch } from "../src/services/backendBridge.ts";
import { resumePath } from "../src/services/model.ts";

test("frontend fields map to the exact backend contract without dropping photo count", () => {
  assert.deepEqual(toBackendPatch({ content: "both", style: "professional", pose: "equipment from above", shotCount: 2, topic: "My first tennis lesson", platforms: ["Instagram", "LinkedIn"] }), {
    content: "both", toneBrief: "professional", poseBrief: "equipment from above", photoCount: 2,
    topic: "My first tennis lesson", platforms: ["instagram", "linkedin"],
  });
  assert.throws(() => backendPlatform("TikTok"), /Instagram or LinkedIn/);
  assert.notEqual(frontendShotId("draft-1", "shot-1"), frontendShotId("draft-2", "shot-1"));
});

test("integrated photo and caption flow persists, maps to previews and rejects stale approvals", async () => {
  const storage = createMemoryStorage();
  const media = createMemoryMediaStore();
  const api = await openBackend({ storage, media, references: TENNIS_REFERENCES });
  let draft = await api.createDraft(toBackendPatch({ content: "both", style: "casual", pose: "racket detail", shotCount: 1, topic: "Back on the court", platforms: ["Instagram", "LinkedIn"] }));
  assert.equal((await api.matchReferences(draft.id)).status, "matched");
  draft = await api.setReference(draft.id, draft.shots[0].id, "equipment");
  draft = await api.attachPhoto(draft.id, draft.shots[0].id, { uri: "file:///selected/racket.jpg", width: 1000, height: 1200, mimeType: "image/jpeg", origin: "camera" });
  draft = await api.reviewPhoto(draft.id, draft.shots[0].id);
  assert.equal(draft.shots[0].assessment?.score, null);
  assert.equal(draft.shots[0].assessment?.method, "manual");
  draft = await api.acceptPhoto(draft.id, draft.shots[0].id);
  draft = await api.generateCaptions(draft.id);
  const mapped = await mapDraft(draft, 0, {}, async photo => photo.uri);
  assert.equal(mapped.draft.shotCount, 1);
  assert.equal(mapped.draft.referenceIndex, 2);
  assert.equal(mapped.shots[0].id, `${draft.id}:shot-1`);
  assert.equal(mapped.shots[0].photo?.origin, "camera");
  assert.equal(mapped.captionMethods.Instagram, "template");
  assert.notEqual(mapped.captions.Instagram, mapped.captions.LinkedIn);
  assert.equal(resumePath(mapped), "/preview");

  const oldPreview = await api.getPreview(draft.id, "instagram");
  draft = await api.editCaption(draft.id, "instagram", "My own tennis caption");
  await assert.rejects(api.confirmPreview(draft.id, "instagram", oldPreview.revision), /preview changed/);
  for (const platform of draft.platforms) {
    const preview = await api.getPreview(draft.id, platform);
    await api.confirmPreview(draft.id, platform, preview.revision);
  }
  const saved = await api.completeDraft(draft.id);
  assert.equal((await api.completeDraft(draft.id)).id, saved.id);
  const post = await mapPost(saved, async photo => photo.uri);
  assert.equal(post.captions.Instagram, "My own tennis caption");
  assert.equal(post.captionMethods.Instagram, "edited");
  assert.equal(post.isDemo, false);
  const reopened = await openBackend({ storage, media, references: TENNIS_REFERENCES });
  assert.equal((await reopened.listPosts()).length, 1);
  assert.equal((await reopened.inspectPostMedia(saved.id))[0].available, true);
});

test("missing native/browser media retains caption text and marks the photo unavailable", async () => {
  const api = await openBackend({ storage: createMemoryStorage(), media: createMemoryMediaStore(), references: TENNIS_REFERENCES });
  let draft = await api.createDraft({ content: "both", toneBrief: "casual", platforms: ["instagram"], topic: "Tennis", photoCount: 1 });
  draft = await api.setReference(draft.id, "shot-1", "portrait");
  draft = await api.attachPhoto(draft.id, "shot-1", { uri: "file:///sample.jpg", width: 800, height: 1000, mimeType: "image/jpeg", origin: "demo" });
  draft = await api.acceptPhoto(draft.id, "shot-1");
  draft = await api.generateCaptions(draft.id);
  const mapped = await mapDraft(draft, 0, {}, async () => { throw new Error("Missing photo"); });
  assert.equal(mapped.shots[0].photo?.isDemo, true);
  assert.equal(mapped.shots[0].photo?.unavailable, true);
  assert.ok(mapped.captions.Instagram);
  assert.equal(resumePath(mapped), "/references");
});

test("legacy history stays visible without rewriting the old store and can be hidden independently", () => {
  const old = { id: "old-1", createdAt: "2026-11-01T16:00:00Z" } as Parameters<typeof combinePosts>[1][number];
  const current = { id: "post-2", createdAt: "2026-11-01T17:00:00Z" } as Parameters<typeof combinePosts>[0][number];
  assert.deepEqual(combinePosts([current], [old], []).map(p => p.id), ["post-2", "old-1"]);
  assert.deepEqual(combinePosts([current], [old], ["old-1"]).map(p => p.id), ["post-2"]);
  assert.equal(old.id, "old-1");
  const prefs = freshPreferences();
  assert.deepEqual(parsePreferences(JSON.stringify(prefs)), prefs);
  assert.throws(() => parsePreferences('{"version":99}'), /settings could not be read/);
});
