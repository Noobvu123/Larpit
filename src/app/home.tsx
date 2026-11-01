import React, { useState } from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { FocusPressable as Pressable } from "../components/FocusPressable";
import { Label, Shell, Title } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LoadingScreen, Notice, StorageNotice } from "../components/FlowFeedback";
import { PostPhoto } from "../components/PostPhoto";
import { GREEN, useApp } from "../lib/state";

export default function Home() {
  const { colors, hydrated, hasOnboarded, posts, newDraft, hasDraft, resumeDraft } = useApp();
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!hydrated) return <LoadingScreen />;
  if (!hasOnboarded) return <Redirect href="/welcome" />;
  async function start() {
    if (busy) return;
    setBusy(true); setError("");
    try { await newDraft(); setConfirmNew(false); router.push("/content"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start your post. Please try again."); }
    finally { setBusy(false); }
  }
  return <Shell back={false}>
    <View style={{ paddingTop: 15 }}>
      <Title size={40}>WHAT WILL YOU{"\n"}LARP TODAY?</Title>
      <Pressable accessibilityRole="button" accessibilityLabel="New post" disabled={busy} onPress={() => hasDraft ? setConfirmNew(true) : void start()} style={({ pressed, focused }) => ({ alignItems: "center", justifyContent: "center", minHeight: 130, gap: 8, backgroundColor: colors.card, borderRadius: 16, marginTop: 10, opacity: pressed ? 0.75 : 1, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}>
        <View style={{ width: 58, height: 54, borderRadius: 12, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }}><Ionicons name="add" size={42} color="#080808" /></View>
        <Label style={{ fontFamily: "Anton", fontSize: 23, lineHeight: 30 }}>New post</Label>
      </Pressable>
      {hasDraft && <Pressable accessibilityRole="button" accessibilityLabel="Resume unfinished post" onPress={() => router.push(resumeDraft())} style={({ focused }) => ({ minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 8, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ color: colors.muted, fontSize: 14 }}>Resume unfinished post →</Label></Pressable>}
      <View style={{ marginTop: 24, marginBottom: 12 }}><Title size={32} style={{ marginBottom: 0 }}>Posts</Title><Label style={{ color: colors.muted }}>Recent larped posts</Label></View>
      <StorageNotice /><Notice error>{error}</Notice>
      {posts.length === 0 ? <Label style={{ color: colors.muted, textAlign: "center", marginTop: 43 }}>You haven’t made anything yet.</Label> : posts.map(post => <Pressable key={post.id} accessibilityRole="button" accessibilityLabel={`Open ${post.title}, ${post.sport}`} onPress={() => router.push({ pathname: "/post", params: { id: post.id } })} style={({ pressed, focused }) => ({ flexDirection: "row", alignItems: "center", padding: 10, minHeight: 116, gap: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.background, marginBottom: 12, opacity: pressed ? 0.75 : 1, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}>
        {post.photos[0] ? <PostPhoto photo={post.photos[0]} compact style={{ width: 96, height: 96, borderRadius: 9 }} /> : <View style={{ width: 74, height: 96, borderRadius: 9, backgroundColor: colors.card, justifyContent: "center", alignItems: "center" }}><Ionicons name="document-text-outline" color={colors.text} size={34} /></View>}
        <View style={{ flex: 1 }}><Label style={{ fontFamily: "Anton", fontSize: 19, lineHeight: 26 }}>{post.title}</Label><Label style={{ color: colors.muted, fontSize: 13 }}>{post.sport}</Label>{post.isDemo && <Label style={{ color: colors.muted, fontSize: 11 }}>Includes sample photos</Label>}</View>
        <Ionicons name="chevron-forward" size={23} color={colors.muted} />
      </Pressable>)}
    </View>
    <ConfirmDialog visible={confirmNew} title="START A NEW POST?" message="Your unfinished post will be replaced. Saved posts will stay in your list." confirmLabel="Start new post" onConfirm={() => void start()} onCancel={() => setConfirmNew(false)} busy={busy} />
  </Shell>;
}
