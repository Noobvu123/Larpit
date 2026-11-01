import React, { useState } from "react";
import { Keyboard, TextInput } from "react-native";
import { Redirect, router } from "expo-router";
import { Action, Label, Shell, Title } from "../components/ui";
import { LoadingScreen, Notice } from "../components/FlowFeedback";
import { GREEN, useApp } from "../lib/state";

export default function Topic() {
  const { hydrated, draft, update, colors } = useApp();
  const [focused, setFocused] = useState(false);
  const [topic, setTopic] = useState(draft.topic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function next() {
    if (busy || !topic.trim()) return;
    Keyboard.dismiss(); setBusy(true); setError("");
    try { await update({ topic }); router.push("/platforms"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your topic. Please try again."); }
    finally { setBusy(false); }
  }
  if (!hydrated) return <LoadingScreen />;
  if (!draft.sport) return <Redirect href="/sport" />;
  if (draft.content === "photos") return <Redirect href="/platforms" />;
  return <Shell step={5} footer={<><Notice error>{error}</Notice><Action label={busy ? "Saving…" : "Continue"} disabled={busy || !topic.trim()} onPress={() => void next()} /></>}>
    <Title>WHAT WILL YOUR{"\n"}POST BE ABOUT?</Title>
    <TextInput accessibilityLabel="Describe what your post is about" value={topic} editable={!busy} onChangeText={setTopic} placeholder="Ex: This post is about how I started playing tennis again after a 2 year break and am finally going to start playing daily again." placeholderTextColor={colors.muted} multiline maxLength={500} textAlignVertical="top" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ minHeight: 300, backgroundColor: colors.card, color: colors.text, fontSize: 18, lineHeight: 27, padding: 20, marginTop: 10, borderWidth: 1.5, borderColor: focused ? GREEN : colors.border, borderRadius: 18 }} />
    <Label style={{ color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 7 }}>{topic.length}/500</Label>
  </Shell>;
}
