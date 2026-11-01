import React, { useState } from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FocusPressable as Pressable } from "./FocusPressable";
import { IconButton, Label } from "./ui";
import { Notice } from "./FlowFeedback";
import { PostPhoto } from "./PostPhoto";
import { GREEN, useApp, type Photo } from "../lib/state";
import type { PlatformName } from "../lib/flow";

export function SocialPreview({ platform, caption, photos, photoIndex, onPhotoIndex, onEdit, onShare, busy = false }: {
  platform: PlatformName;
  caption: string;
  photos: Photo[];
  photoIndex: number;
  onPhotoIndex: (index: number) => void;
  onEdit?: () => void;
  onShare: () => void;
  busy?: boolean;
}) {
  const { colors } = useApp();
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const linkedIn = platform === "LinkedIn";
  const index = Math.min(photoIndex, Math.max(0, photos.length - 1));
  const photo = photos[index];
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 11, backgroundColor: colors.background }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <Ionicons name="person-circle" size={39} color={colors.muted} />
      <View style={{ flex: 1 }}><Label style={{ fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{linkedIn ? "Your name" : "your_username"}</Label>{linkedIn && <Label style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}>Profile preview</Label>}</View>
      <IconButton name="ellipsis-horizontal" label="Post preview options" onPress={() => setMenuOpen(v => !v)} />
    </View>
    {menuOpen && <View style={{ backgroundColor: colors.card, borderRadius: 10, marginBottom: 8, padding: 5 }}>{onEdit && <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); onEdit(); }} style={({ focused }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 10, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label>Edit caption</Label></Pressable>}{photo && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMenuOpen(false); onShare(); }} style={({ focused }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 10, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label>Share current photo</Label></Pressable>}<Pressable accessibilityRole="button" onPress={() => setMenuOpen(false)} style={({ focused }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 10, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label>Close menu</Label></Pressable></View>}
    {linkedIn && !!caption && <Label selectable style={{ fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{caption}</Label>}
    {photo && <View>
      <PostPhoto key={index} photo={photo} style={{ width: "100%", aspectRatio: 1.4, borderRadius: 5 }} />
      <View style={{ position: "absolute", top: 9, right: 9, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 20 }}><Label style={{ color: "#fff", fontSize: 12 }}>{index + 1}/{photos.length}</Label></View>
      {photos.length > 1 && <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
        <IconButton name="chevron-back" label="Previous photo" onPress={() => onPhotoIndex((index - 1 + photos.length) % photos.length)} />
        <View style={{ flexDirection: "row" }}>{photos.map((_, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Show photo ${i + 1}`} accessibilityState={{ selected: i === index }} aria-pressed={i === index} onPress={() => onPhotoIndex(i)} style={({ focused }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === index ? "#1687FF" : colors.border }} /></Pressable>)}</View>
        <IconButton name="chevron-forward" label="Next photo" onPress={() => onPhotoIndex((index + 1) % photos.length)} />
      </View>}
      {photo.isDemo && <Label style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>Sample photo</Label>}
    </View>}
    {linkedIn ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginVertical: 3 }}>
      {[
        { label: "Like", icon: liked ? "thumbs-up" as const : "thumbs-up-outline" as const, action: () => { setLiked(v => !v); setNotice("Preview only. No reaction has been posted."); } },
        { label: "Comment", icon: "chatbubble-outline" as const, action: () => setNotice("Comments are added in LinkedIn after you publish there.") },
        { label: "Repost", icon: "repeat-outline" as const, action: () => setNotice("Reposts are made in LinkedIn. Nothing has been posted from this preview.") },
        { label: "Send", icon: "paper-plane-outline" as const, action: () => photo ? onShare() : setNotice("Copy your caption below, then paste it into LinkedIn or a message.") },
      ].map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label === "Like" ? (liked ? "Unlike this preview" : "Like this preview") : item.label === "Send" ? "Send current photo" : `About preview ${item.label.toLowerCase()}`} accessibilityState={{ disabled: busy }} aria-disabled={busy} aria-pressed={item.label === "Like" ? liked : undefined} disabled={busy} onPress={item.action} style={({ focused, pressed }) => ({ flex: 1, minWidth: 68, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.65 : 1, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Ionicons name={item.icon} size={20} color={colors.text} /><Label style={{ fontSize: 11, lineHeight: 17, flexShrink: 1 }}>{item.label}</Label></Pressable>)}
    </View> : <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 3 }}>
      <IconButton name={liked ? "heart" : "heart-outline"} label={liked ? "Unlike this preview" : "Like this preview"} onPress={() => { setLiked(v => !v); setNotice("Preview only. No reaction has been posted."); }} />
      <IconButton name="chatbubble-outline" label="About preview comments" onPress={() => setNotice(`Comments are added in ${platform} after you publish there.`)} />
      <IconButton name="paper-plane-outline" label={photo ? "Share current photo" : "About sharing this post"} disabled={busy} onPress={() => photo ? onShare() : setNotice("Copy your caption below, then paste it into your chosen app.")} />
      <View style={{ flex: 1 }} />
      <IconButton name={bookmarked ? "bookmark" : "bookmark-outline"} label={bookmarked ? "Remove preview bookmark" : "Bookmark this preview"} onPress={() => { setBookmarked(v => !v); setNotice("Preview only. All done saves this post in Larp It."); }} />
    </View>}
    {!linkedIn && !!caption && <Label selectable style={{ fontSize: 14, lineHeight: 20 }}><Label style={{ fontSize: 14, lineHeight: 20, fontWeight: "700" }}>your_username </Label>{caption}</Label>}
    {!caption && !photo && <Label style={{ color: colors.muted }}>Add a photo or caption to preview your post.</Label>}
    {!!notice && <Notice>{notice}</Notice>}
  </View>;
}
