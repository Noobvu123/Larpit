export type ContentKind = "photos" | "written" | "both";
export type PlatformName = "Instagram" | "LinkedIn" | "Snapchat" | "TikTok";
export type Draft = {
  sport: "Tennis" | null;
  platforms: PlatformName[];
  content: ContentKind;
  style: string;
  pose: string;
  referenceIndex: number;
  shotCount: number;
  topic: string;
  title: string;
};
export const initialDraft: Draft = {
  sport: null,
  platforms: [],
  content: "both",
  style: "",
  pose: "Tennis portrait",
  referenceIndex: 0,
  shotCount: 3,
  topic: "",
  title: "",
};
export function togglePlatform(
  values: PlatformName[],
  value: PlatformName,
): PlatformName[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}
export function afterContent(content: ContentKind): "/style" | "/photo-count" {
  return content === "photos" ? "/photo-count" : "/style";
}
export function afterStyle(content: ContentKind): "/photo-count" | "/topic" {
  return content === "written" ? "/topic" : "/photo-count";
}
export function validDraftForPhoto(d: Draft): boolean {
  return (
    d.sport === "Tennis" &&
    d.content !== "written" &&
    Number.isInteger(d.shotCount) && d.shotCount >= 1 && d.shotCount <= 3
  );
}
export function nextReference(
  index: number,
  delta: number,
  count: number,
): number {
  if (count < 1) return 0;
  return (((index + delta) % count) + count) % count;
}
