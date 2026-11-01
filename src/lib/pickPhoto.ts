import * as ImagePicker from "expo-image-picker";
import type { Photo } from "./state";
export async function pickPhoto(): Promise<Photo | null> {
  // System photo picker gives access to the chosen image, not the whole library.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const supported = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
  const provided = asset.mimeType === "image/jpg" ? "image/jpeg" : asset.mimeType;
  const mimeType = supported.find(type => type === provided);
  return {
    source: { uri: asset.uri },
    isDemo: false,
    origin: "library",
    width: asset.width || undefined,
    height: asset.height || undefined,
    mimeType,
  };
}
