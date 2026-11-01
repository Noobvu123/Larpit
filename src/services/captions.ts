import type { ContentKind, PlatformName } from "../lib/flow";

/** Offline templates adapted from the Back End handoff. No model is called. */
export const captionMethod = "template" as const;

export type CaptionInput = {
  platforms: PlatformName[];
  style: string;
  topic: string;
  content: ContentKind;
  variation?: number;
};

const platforms: readonly PlatformName[] = [
  "Instagram",
  "LinkedIn",
  "Snapchat",
  "TikTok",
];

type Tone = "casual" | "confident" | "professional";

// This selects a template only. The app preserves the full written style brief.
function templateTone(style: string): Tone {
  if (/professional|formal|reflective|business/i.test(style)) return "professional";
  if (/confident|bold|energetic|motivational/i.test(style)) return "confident";
  return "casual";
}

const copy: Record<Tone, Record<PlatformName, readonly [string, string, string]>> = {
  casual: {
    Instagram: ["A little court time.", "A moment between sets.", "Just a little tennis energy."],
    LinkedIn: ["Making room for tennis and a change of pace.", "A moment on court, with a fresh perspective.", "Tennis, movement, and a welcome change of scenery."],
    Snapchat: ["Court-side moments.", "Between sets.", "Tennis time."],
    TikTok: ["A little court time.", "The court-time edit.", "A little tennis in the mix."],
  },
  confident: {
    Instagram: ["Showing up, racket in hand.", "One shot at a time.", "Bring the focus. Enjoy the game."],
    LinkedIn: ["Focus and consistency, one step at a time.", "A reminder to keep showing up.", "A chance to approach the next shot with intention."],
    Snapchat: ["One shot at a time.", "Court energy.", "Next shot. Fresh focus."],
    TikTok: ["Court energy. One shot at a time.", "Racket ready. Focus forward.", "Bring the energy to the next shot."],
  },
  professional: {
    Instagram: ["Time on court. Room to grow.", "A moment of focus on court.", "Movement, perspective, and the game."],
    LinkedIn: ["Tennis offers an opportunity to practise focus and consistency.", "Time on court can offer space for movement and perspective.", "A thoughtful approach to tennis, one moment at a time."],
    Snapchat: ["Time on court.", "A moment of focus.", "Court-side perspective."],
    TikTok: ["Time on court. Room to grow.", "Focus, movement, and court time.", "A closer look at time on court."],
  },
};

/** Produces editable local drafts. It does not analyse photos or infer facts. */
export function generateLocalCaptions(input: CaptionInput): Partial<Record<PlatformName, string>> {
  if (!input || typeof input !== "object") throw new Error("Add a post brief first.");
  if (!["photos", "written", "both"].includes(input.content)) throw new Error("Choose a supported content type.");
  if (!Array.isArray(input.platforms) || input.platforms.some((p) => !platforms.includes(p))) {
    throw new Error("Choose a supported social platform.");
  }
  if (typeof input.topic !== "string" || typeof input.style !== "string") throw new Error("Add a valid post brief.");
  if (input.topic.length > 4000 || input.style.length > 2000) throw new Error("Shorten your post brief before creating a caption.");
  if (input.variation !== undefined && (!Number.isInteger(input.variation) || input.variation < 0)) {
    throw new Error("Choose a valid caption variation.");
  }
  if (input.content === "photos") return {};
  const tone = templateTone(input.style);
  const topic = input.topic.trim();
  const variant = (input.variation ?? 0) % 3;
  return Object.fromEntries([...new Set(input.platforms)].map((platform) => {
    const lines = [topic, copy[tone][platform][variant]].filter(Boolean);
    if (platform === "Instagram") lines.push("#Tennis #CourtTime");
    if (platform === "TikTok") lines.push("#Tennis #OnCourt");
    return [platform, lines.join("\n\n")];
  }));
}

/** A short label from the supplied brief, never an invented achievement. */
export function generateLocalTitle(topic: string): string {
  if (typeof topic !== "string") return "Court moments";
  const text = topic.trim().replace(/^this post is about\s+/i, "").replace(/\s+/g, " ");
  if (!text) return "Court moments";
  const sentence = text.split(/[.!?](?:\s|$)/u)[0].trim() || text;
  const characters = Array.from(sentence);
  const limited = characters.length <= 60
    ? sentence
    : `${characters.slice(0, 59).join("").replace(/\s+\S*$/, "").trim() || characters.slice(0, 59).join("")}…`;
  return limited.charAt(0).toUpperCase() + limited.slice(1);
}
