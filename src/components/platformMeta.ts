import type { IconName } from "./ui";
import type { PlatformName } from "../lib/flow";

export const platformIcons: Record<PlatformName, IconName> = {
  Instagram: "logo-instagram",
  LinkedIn: "logo-linkedin",
  Snapchat: "logo-snapchat",
  TikTok: "logo-tiktok",
};
export const selectionOrder: PlatformName[] = ["LinkedIn", "Instagram", "Snapchat", "TikTok"];
export const previewOrder: PlatformName[] = ["Instagram", "LinkedIn", "Snapchat", "TikTok"];
