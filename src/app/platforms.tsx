import React, { useRef, useState } from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { FocusPressable as Pressable } from "../components/FocusPressable";
import { Action, Label, Shell, Title } from "../components/ui";
import { LoadingScreen, Notice } from "../components/FlowFeedback";
import { platformIcons, selectionOrder } from "../components/platformMeta";
import { togglePlatform, type PlatformName } from "../lib/flow";
import { GREEN, useApp } from "../lib/state";

export default function Platforms() {
  const { hydrated, draft, update, colors, generateCaptions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const [selected, setSelected] = useState<PlatformName[]>(draft.platforms.filter(name => name === "Instagram" || name === "LinkedIn"));
  if (!hydrated) return <LoadingScreen />;
  if (!draft.sport) return <Redirect href="/sport" />;
  if (draft.content !== "photos" && !draft.topic.trim()) return <Redirect href="/topic" />;
  async function next() {
    if (running.current || !selected.length) return;
    running.current = true; setBusy(true); setError("");
    try {
      await update({ platforms: selected });
      if (draft.content !== "photos") await generateCaptions();
      router.push(draft.content === "photos" ? "/preview" : "/captions");
    } catch (e) { setError(e instanceof Error ? e.message : "Your captions could not be prepared. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <Shell step={5} footer={<><Notice error>{error}</Notice><Action label={busy ? "Preparing captions…" : "Continue"} disabled={busy || !selected.length} onPress={() => void next()} /></>}>
    <Title>WHERE WILL{"\n"}YOU POST?</Title>
    <Label style={{ color: colors.muted, marginBottom: 16 }}>Select all that apply.</Label>
    {selectionOrder.map(name => {
      const supported = name === "Instagram" || name === "LinkedIn";
      const checked = selected.includes(name);
      const disabled = busy || !supported;
      return <Pressable key={name} accessibilityRole="checkbox" accessibilityLabel={name} accessibilityState={{ checked, disabled }} aria-checked={checked} aria-disabled={disabled} disabled={disabled} onPress={() => setSelected(togglePlatform(selected, name))} style={({ pressed, focused }) => ({ flexDirection: "row", alignItems: "center", gap: 18, minHeight: 82, padding: 17, borderRadius: 17, borderWidth: 1.5, borderColor: checked ? GREEN : "transparent", backgroundColor: checked ? colors.selected : colors.card, marginBottom: 11, opacity: disabled ? 0.45 : pressed ? 0.7 : 1, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}>
        <Ionicons name={platformIcons[name]} size={42} color={colors.text} />
        <View style={{ flex: 1 }}><Label style={{ fontFamily: "Anton", fontSize: 24, lineHeight: 32 }}>{name}</Label>{!supported && <Label style={{ fontSize: 12, color: colors.muted }}>Coming later</Label>}</View>
        {checked ? <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }}><Ionicons name="checkmark" size={25} color="#080808" /></View> : <Ionicons name="square-outline" size={30} color={colors.muted} />}
      </Pressable>;
    })}
    <Label style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>Create previews and copy or share when ready. No account connection is needed.</Label>
  </Shell>;
}
