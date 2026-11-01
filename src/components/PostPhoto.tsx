import React, { useState } from "react";
import { Image, StyleProp, View, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Photo } from "../lib/state";
import { useApp } from "../lib/state";
import { Label } from "./ui";

export function PostPhoto({ photo, style, compact = false }: { photo: Photo; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const sourceId = photo.assetKey ?? (typeof photo.source === "number" ? String(photo.source) : photo.source && "uri" in photo.source ? photo.source.uri : JSON.stringify(photo.source));
  // A different photo gets a fresh image-load state, including recycled list rows.
  return <PhotoContent key={`${sourceId}:${!!photo.unavailable}`} photo={photo} style={style} compact={compact} />;
}

function PhotoContent({ photo, style, compact }: { photo: Photo; style?: StyleProp<ViewStyle>; compact: boolean }) {
  const { colors } = useApp();
  const [failed, setFailed] = useState(false);
  return <View style={[{ overflow: "hidden", backgroundColor: colors.card }, style]}>
    {failed || photo.unavailable ? <View accessibilityRole="image" accessibilityLabel="Photo unavailable on this device" style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 10, gap: 6 }}><Ionicons name="image-outline" size={compact ? 25 : 36} color={colors.muted} />{!compact && <Label style={{ color: colors.muted, textAlign: "center", fontSize: 13 }}>Photo unavailable on this device</Label>}</View> : <Image source={photo.source} accessibilityLabel={photo.isDemo ? "Sample tennis photo" : "Your photo"} onError={() => setFailed(true)} style={{ width: "100%", height: "100%" }} resizeMode="cover" />}
  </View>;
}
