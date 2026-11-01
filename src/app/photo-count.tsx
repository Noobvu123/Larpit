import React, { useState } from "react";
import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { Shell, Title, Label, Action, IconButton } from "../components/ui";
import { GREEN, useApp } from "../lib/state";
import { Notice } from "../components/FlowFeedback";
export default function PhotoCount() {
  const { draft, update, colors, dark, setActiveShot } = useApp();
  const [count, setCount] = useState(draft.shotCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function next() {
    if (busy) return;
    setBusy(true); setError("");
    try { await update({ shotCount: count }); setActiveShot(0); router.push("/pose"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not prepare your photos."); }
    finally { setBusy(false); }
  }
  if (!draft.sport) return <Redirect href="/sport" />;
  if (draft.content === "written") return <Redirect href="/topic" />;
  return <Shell step={2.5} footer={<><Notice error>{error}</Notice><Action label={busy ? "Saving…" : "Continue"} disabled={busy} onPress={() => void next()} /></>}>
    <Title size={38} style={{ textAlign: "center", marginTop: 15 }}>HOW MANY PHOTOS{"\n"}DO YOU WANT TO{"\n"}TAKE AND USE?</Title>
    <Label style={{ textAlign: "center", marginTop: 8 }}>Choose how many shots to create.</Label>
    <View style={{ backgroundColor: colors.card, borderRadius: 24, paddingVertical: 30, paddingHorizontal: 14, marginTop: 28 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}>
        <View style={{ borderWidth: 2, borderColor: colors.text, borderRadius: 40, padding: 3 }}><IconButton name="remove" label="Fewer photos" disabled={busy || count <= 1} onPress={() => setCount(value => Math.max(1, value - 1))} /></View>
        <Label accessibilityLiveRegion="polite" style={{ fontFamily: "Anton", fontSize: 96, lineHeight: 120, color: dark ? GREEN : "#518000" }}>{count}</Label>
        <View style={{ borderWidth: 2, borderColor: colors.text, borderRadius: 40, padding: 3 }}><IconButton name="add" label="More photos" disabled={busy || count >= 3} onPress={() => setCount(value => Math.min(3, value + 1))} /></View>
      </View>
      <Label style={{ fontSize: 20, textAlign: "center", color: colors.muted }}>{count === 1 ? "photo" : "photos"}</Label>
    </View>
    <Label style={{ textAlign: "center", marginTop: 22, fontSize: 14 }}>One reference and checklist for each photo.</Label>
    <Label style={{ textAlign: "center", color: colors.muted, marginTop: 8, fontSize: 13 }}>Choose 1–3 photos.</Label>
  </Shell>;
}
