import { test } from "node:test";
import assert from "node:assert/strict";
import { captionMethod, generateLocalCaptions, generateLocalTitle } from "../src/services/captions.ts";

test("all selected platforms have distinct editable templates preserving the supplied topic", () => {
  const topic = "I am returning to tennis after a two-year break.";
  const captions = generateLocalCaptions({
    platforms: ["Instagram", "LinkedIn", "Snapchat", "TikTok"],
    style: "fun and informal",
    topic,
    content: "both",
  });
  assert.equal(captionMethod, "template");
  assert.equal(Object.keys(captions).length, 4);
  assert.equal(new Set(Object.values(captions)).size, 4);
  for (const value of Object.values(captions)) assert.ok(value?.startsWith(topic));
  assert.ok(captions.Instagram?.includes("#Tennis"));
  assert.ok(!captions.LinkedIn?.includes("#"));
});

test("photo-only needs no invented caption and duplicates do not produce duplicate platforms", () => {
  assert.deepEqual(generateLocalCaptions({ platforms: ["Instagram"], style: "", topic: "", content: "photos" }), {});
  const captions = generateLocalCaptions({ platforms: ["Instagram", "Instagram"], style: "", topic: "", content: "written" });
  assert.deepEqual(Object.keys(captions), ["Instagram"]);
});

test("regeneration changes template text while retaining the user's facts", () => {
  const input = { platforms: ["LinkedIn"] as const, style: "professional", topic: "Tennis at my local court.", content: "written" as const };
  const first = generateLocalCaptions({ ...input, platforms: [...input.platforms] });
  const second = generateLocalCaptions({ ...input, platforms: [...input.platforms], variation: 1 });
  assert.notEqual(first.LinkedIn, second.LinkedIn);
  assert.ok(second.LinkedIn?.startsWith(input.topic));
});

test("three successive templates are distinct for every platform and tone", () => {
  const platforms = ["Instagram", "LinkedIn", "Snapchat", "TikTok"] as const;
  const topic = "Tennis at my local court.";
  for (const style of ["casual", "confident", "professional"]) {
    const variants = [0, 1, 2].map((variation) => generateLocalCaptions({ platforms: [...platforms], style, topic, content: "both", variation }));
    for (const platform of platforms) {
      assert.equal(new Set(variants.map((captions) => captions[platform])).size, 3);
      for (const captions of variants) assert.ok(captions[platform]?.startsWith(topic));
    }
  }
});

test("unsupported runtime inputs are rejected without dropping a platform", () => {
  assert.throws(() => generateLocalCaptions({ platforms: ["Unknown" as never], style: "", topic: "", content: "both" }));
  assert.throws(() => generateLocalCaptions({ platforms: ["Instagram"], style: "", topic: "", content: "both", variation: -1 }));
});

test("local titles are bounded and derived only from the user's brief", () => {
  assert.equal(generateLocalTitle("This post is about returning to tennis."), "Returning to tennis");
  assert.equal(generateLocalTitle("   "), "Court moments");
  assert.ok(Array.from(generateLocalTitle("A very long post topic describing time on the tennis court with friends and family this weekend" )).length <= 60);
  assert.ok(Array.from(generateLocalTitle("a".repeat(150))).length <= 60);
});
