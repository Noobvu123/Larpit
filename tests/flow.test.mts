import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDraft,
  afterContent,
  afterStyle,
  togglePlatform,
  validDraftForPhoto,
  nextReference,
} from "../src/lib/flow.ts";
test("photos skip the written brief; written posts never route to camera", () => {
  assert.equal(afterContent("photos"), "/photo-count");
  assert.equal(afterContent("both"), "/style");
  assert.equal(afterContent("written"), "/style");
  assert.equal(afterStyle("written"), "/topic");
  assert.equal(afterStyle("both"), "/photo-count");
});
test("platform selection supports multiple and removes only the toggled platform", () => {
  const first = togglePlatform([], "Instagram");
  const second = togglePlatform(first, "LinkedIn");
  assert.deepEqual(second, ["Instagram", "LinkedIn"]);
  assert.deepEqual(togglePlatform(second, "Instagram"), ["LinkedIn"]);
  assert.deepEqual(first, ["Instagram"]);
});
test("camera route supports setup before platform selection and excludes written-only", () => {
  assert.equal(validDraftForPhoto(initialDraft), false);
  const d = {
    ...initialDraft,
    sport: "Tennis" as const,
    platforms: ["Instagram" as const],
    pose: "   ",
  };
  assert.equal(validDraftForPhoto(d), true);
  assert.equal(validDraftForPhoto({ ...d, platforms: [] }), true);
  assert.equal(validDraftForPhoto({ ...d, shotCount: 0 }), false);
  assert.equal(validDraftForPhoto({ ...d, shotCount: 4 }), false);
  assert.equal(validDraftForPhoto({ ...d, pose: "Tennis portrait" }), true);
  assert.equal(
    validDraftForPhoto({ ...d, pose: "Tennis portrait", content: "written" }),
    false,
  );
});
test("reference controls wrap both directions without losing bounds", () => {
  assert.equal(nextReference(0, -1, 3), 2);
  assert.equal(nextReference(2, 1, 3), 0);
  assert.equal(nextReference(0, 1, 3), 1);
});
