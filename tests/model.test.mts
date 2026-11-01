import { test } from "node:test";
import assert from "node:assert/strict";
import { initialDraft } from "../src/lib/flow.ts";
import { addCompletedPost, canAttachPhoto, makeShots, parseStoredModel, replaceShotPhoto, replaceShotReference, resizeShots, resumeActiveShot, resumePath, validateCompletion } from "../src/services/model.ts";
import type { Photo, SavedPost, StoredModel } from "../src/services/model.ts";
import { createSingleFlight } from "../src/services/tasks.ts";
const photo: Photo = { source: 4, assetKey: "portrait", isDemo: true, origin: "demo" };
function fixture(): StoredModel {
  return { version: 1, dark: true, hasOnboarded: true, sessionId: "test-1", hasDraft: true,
    draft: { ...initialDraft, sport: "Tennis", platforms: ["Instagram"], topic: "Back on the court", style: "casual" },
    shots: makeShots(3, "test-1").map(shot => ({ ...shot, photo, accepted: true })), activeShot: 0,
    captions: { Instagram: "Back on the court" }, captionMethods: { Instagram: "template" },
    regenerationCount: 0, completedPostId: null, posts: [] };
}
test("retaking one shot invalidates only its approval and count resize preserves earlier slots", () => {
  const shots = fixture().shots;
  const replacement = replaceShotPhoto(shots[1], { ...photo, assetKey: "seated" });
  assert.equal(replacement.accepted, false);
  assert.equal(replacement.id, shots[1].id);
  assert.equal(shots[1].accepted, true);
  const shrunk = resizeShots(shots, 1, "test-1");
  assert.equal(shrunk[0], shots[0]);
  assert.equal(shrunk.length, 1);
  const restored = resizeShots(shrunk, 3, "test-1");
  assert.equal(restored[0], shots[0]);
  assert.equal(restored[1].photo, null);
});
test("enlarging the selected reference keeps checks and approval, changing it invalidates review", () => {
  const shot = { ...fixture().shots[0], checks: [true, false, true] };
  assert.equal(replaceShotReference(shot, shot.referenceId), shot);
  const changed = replaceShotReference(shot, "seated");
  assert.equal(changed.accepted, false);
  assert.deepEqual(changed.checks, [false, false, false]);
  assert.equal(changed.photo, shot.photo);
});
test("a photo result belongs only to the active shot that requested it", () => {
  const shots = fixture().shots;
  assert.equal(canAttachPhoto(shots[0], shots[0].id), true);
  assert.equal(canAttachPhoto(shots[1], shots[0].id), false);
  assert.equal(canAttachPhoto(undefined, shots[0].id), false);
  assert.equal(canAttachPhoto(makeShots(3, "new-draft")[0], shots[0].id), false);
});
test("completion enforces every requested photo and every selected platform caption", () => {
  const model = fixture();
  assert.doesNotThrow(() => validateCompletion(model));
  assert.throws(() => validateCompletion({ ...model, shots: model.shots.map((s, i) => i === 2 ? { ...s, accepted: false } : s) }), /every requested photo/);
  assert.throws(() => validateCompletion({ ...model, draft: { ...model.draft, platforms: ["Instagram", "LinkedIn"] } }), /every selected platform/);
  assert.doesNotThrow(() => validateCompletion({ ...model, draft: { ...model.draft, content: "written" }, shots: [] }));
  assert.doesNotThrow(() => validateCompletion({ ...model, draft: { ...model.draft, content: "photos", topic: "" }, captions: {} }));
});
test("restore validates schema and retains explicit sample provenance", () => {
  const model = fixture();
  assert.deepEqual(parseStoredModel(JSON.stringify(model)), model);
  assert.throws(() => parseStoredModel(JSON.stringify({ ...model, version: 99 })), /could not be read/);
  assert.throws(() => parseStoredModel(JSON.stringify({ ...model, shots: [{ ...model.shots[0], photo: { ...photo, isDemo: false } }] })), /could not be read/);
  assert.throws(() => parseStoredModel(JSON.stringify({ ...model, draft: { ...model.draft, shotCount: 200 } })), /could not be read/);
});
test("resume returns the earliest incomplete stage for each branch", () => {
  const model = fixture();
  assert.equal(resumePath(model), "/preview");
  assert.equal(resumePath({ ...model, draft: { ...model.draft, platforms: [] } }), "/platforms");
  assert.equal(resumePath({ ...model, shots: makeShots(3, "test-1") }), "/references");
  assert.equal(resumePath({ ...model, draft: { ...model.draft, content: "written", topic: "" } }), "/topic");
  assert.equal(resumePath({ ...model, captions: {} }), "/captions");
});
test("recovering a missing earlier photo selects that slot instead of trapping the last accepted shot", () => {
  const model = fixture();
  model.activeShot = 2;
  model.shots[0] = { ...model.shots[0], photo: null, accepted: false };
  assert.equal(resumeActiveShot(model), 0);
  assert.equal(resumePath(model), "/references");
  model.shots[0] = { ...model.shots[0], photo: { ...photo, unavailable: true }, accepted: true };
  assert.equal(resumeActiveShot(model), 0);
  assert.equal(resumePath(model), "/references");
  model.shots[0] = { ...model.shots[0], photo, accepted: true };
  model.shots[1] = { ...model.shots[1], accepted: false };
  assert.equal(resumeActiveShot(model), 1);
  model.shots[1].accepted = true;
  assert.equal(resumeActiveShot(model), 2);
});
test("duplicate completion keys do not insert a second post", () => {
  const post: SavedPost = { id: "test-1", title: "Back on the court", sport: "Tennis", createdAt: new Date().toISOString(),
    content: "both", photos: [photo], captions: { Instagram: "hello" }, captionMethods: { Instagram: "template" }, platforms: ["Instagram"], style: "casual", topic: "tennis", isDemo: true };
  assert.equal(addCompletedPost(addCompletedPost([], post), post).length, 1);
});
test("simultaneous completion taps share one operation, failed work can be retried", async () => {
  const run = createSingleFlight<string>();
  let calls = 0;
  const operation = async () => { calls++; return "saved"; };
  const first = run("same", operation);
  const second = run("same", operation);
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), ["saved", "saved"]);
  assert.equal(calls, 1);
  await assert.rejects(run("retry", async () => { throw new Error("no space"); }), /no space/);
  assert.equal(await run("retry", operation), "saved");
});
