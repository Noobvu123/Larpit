import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";
import type { Photo } from "./state";

/** Opens the native share sheet only after the user presses Share. */
export async function sharePhoto(photo: Photo): Promise<string> {
  if (photo.unavailable) throw new Error("This photo is unavailable on this device.");
  let uri: string | undefined;
  if (typeof photo.source === "number") {
    const asset = Asset.fromModule(photo.source);
    await asset.downloadAsync();
    uri = asset.localUri ?? undefined;
  } else if (photo.source && "uri" in photo.source) {
    uri = photo.source.uri;
  }
  if (!uri || !/^(file|content):\/\//.test(uri)) throw new Error("This photo is not available as a local file. Try saving the post first.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable on this device. Your post is still saved in Larp It.");
  await Sharing.shareAsync(uri, { dialogTitle: "Share your Larp It photo" });
  return "Share sheet closed. Choose a destination there to share your photo.";
}
