import React, { useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { FocusPressable as Pressable } from "../components/FocusPressable";
import { Action, Label, Shell, Title } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LoadingScreen, Notice } from "../components/FlowFeedback";
import { SocialPreview } from "../components/SocialPreview";
import { previewOrder } from "../components/platformMeta";
import type { PlatformName } from "../lib/flow";
import { GREEN, useApp } from "../lib/state";
import { sharePhoto } from "../lib/sharePhoto";

export default function Post() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hydrated, posts, colors, deletePost } = useApp();
  const [selected, setSelected] = useState<PlatformName | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  if (!hydrated) return <LoadingScreen />;
  const post = posts.find(item => item.id === id);
  if (!post) return <Shell footer={<Action label="Back to posts" onPress={() => router.dismissTo("/home")} />}><Title>POST NOT FOUND.</Title><Label style={{ color: colors.muted }}>This post may have been deleted or is unavailable on this device.</Label></Shell>;
  const platforms = previewOrder.filter(name => post.platforms.includes(name));
  const current = selected && platforms.includes(selected) ? selected : platforms[0];
  const caption = post.captions[current] ?? "";
  async function copy() {
    setError(""); setNotice("");
    try {
      if (!(await Clipboard.setStringAsync(caption))) throw new Error("Clipboard access was denied. Select the caption text above to copy it manually.");
      setNotice(`Caption copied. Paste it into ${current}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not copy the caption."); }
  }
  async function share() {
    if (!post || running.current) return;
    const photo = post.photos[Math.min(photoIndex, post.photos.length - 1)];
    if (!photo) return;
    running.current = true; setBusy(true); setError(""); setNotice("");
    try { setNotice(await sharePhoto(photo)); }
    catch (e) { setError(e instanceof Error ? e.message : "This photo could not be shared."); }
    finally { running.current = false; setBusy(false); }
  }
  async function remove() {
    if (!post || running.current) return;
    running.current = true; setBusy(true); setError("");
    try { await deletePost(post.id); setConfirm(false); router.dismissTo("/home"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete this post. Try again."); setConfirm(false); }
    finally { running.current = false; setBusy(false); }
  }
  return <Shell onBack={() => { if (!busy) router.dismissTo("/home"); }} footer={<><Notice error>{error}</Notice><Notice>{notice}</Notice>{!!caption && <Action label="Copy caption" icon="copy-outline" disabled={busy} onPress={() => void copy()} />}<Action label="Back to posts" secondary disabled={busy} onPress={() => router.dismissTo("/home")} /></>}>
    <Title size={32}>{post.title}</Title>
    <Label style={{ color: colors.muted, fontSize: 13, marginBottom: 15 }}>{post.sport} · Saved {new Date(post.createdAt).toLocaleDateString()}</Label>
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>{platforms.map(name => <Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: current === name, disabled: busy }} aria-selected={current === name} aria-disabled={busy} disabled={busy} onPress={() => { setSelected(name); setPhotoIndex(0); setNotice(""); setError(""); }} style={({ focused }) => ({ paddingHorizontal: 12, minHeight: 44, justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: current === name ? GREEN : colors.border, backgroundColor: current === name ? colors.selected : colors.card, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ fontSize: 13 }}>{name}</Label></Pressable>)}</View>
    <SocialPreview key={current} platform={current} caption={caption} photos={post.photos} photoIndex={photoIndex} onPhotoIndex={setPhotoIndex} onShare={() => void share()} busy={busy} />
    {post.photos.length > 0 && <View style={{ marginTop: 14 }}><Action label={Platform.OS === "web" ? "Download current photo" : "Share current photo"} secondary icon="share-outline" disabled={busy} onPress={() => void share()} /></View>}
    <Label style={{ color: colors.muted, fontSize: 12, marginTop: 14 }}>Saved on this device. This does not mean the post has been published.</Label>
    <Pressable accessibilityRole="button" accessibilityLabel="Delete saved post" disabled={busy} onPress={() => setConfirm(true)} style={({ focused }) => ({ minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 14, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ color: "#E77A65", fontSize: 14 }}>Delete post</Label></Pressable>
    <ConfirmDialog visible={confirm} title="DELETE THIS POST?" message="This removes the saved post from Larp It on this device. Your original photos and posts in other apps are not affected." confirmLabel="Delete post" onConfirm={() => void remove()} onCancel={() => setConfirm(false)} busy={busy} />
  </Shell>;
}
