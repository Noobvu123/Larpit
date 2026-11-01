import React, { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { Action, IconButton, Label, Shell, Title } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AutoGrowingTextInput } from "../components/AutoGrowingTextInput";
import { LoadingScreen, Notice } from "../components/FlowFeedback";
import { platformIcons, selectionOrder } from "../components/platformMeta";
import type { PlatformName } from "../lib/flow";
import type { Captions as CaptionValues } from "../services/model";
import { GREEN, useApp } from "../lib/state";

export default function Captions() {
  const { hydrated, draft, captions, captionMethods, setCaption, colors, regenerateCaptions, regenerationCount } = useApp();
  const [values, setValues] = useState<CaptionValues>(captions);
  const dirty = useRef(new Set<PlatformName>());
  const [generation, setGeneration] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focused, setFocused] = useState<PlatformName | null>(null);
  const running = useRef(false);
  useEffect(() => {
    setValues(previous => ({ ...captions, ...Object.fromEntries([...dirty.current].map(name => [name, previous[name]])) }));
  }, [captions, generation]);
  if (!hydrated) return <LoadingScreen />;
  if (!draft.sport) return <Redirect href="/sport" />;
  if (!draft.platforms.length) return <Redirect href="/platforms" />;
  if (draft.content === "photos") return <Redirect href="/preview" />;
  const names = selectionOrder.filter(name => draft.platforms.includes(name));
  const ready = names.every(name => !!values[name]?.trim());
  async function saveEdits() {
    for (const name of names) {
      const text = values[name] ?? "";
      if (!text.trim()) throw new Error(`Add a ${name} caption before continuing.`);
      if (text !== captions[name]) {
        await setCaption(name, text);
        dirty.current.delete(name);
      }
    }
  }
  async function continueToPreview() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); Keyboard.dismiss();
    try { await saveEdits(); router.push("/preview"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your caption edits."); }
    finally { running.current = false; setBusy(false); }
  }
  async function goBack() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); Keyboard.dismiss();
    try { await saveEdits(); router.dismissTo("/platforms"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your caption edits."); }
    finally { running.current = false; setBusy(false); }
  }
  async function regenerate() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await regenerateCaptions();
      dirty.current.clear(); setGeneration(value => value + 1); setConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare another version. Please try again."); setConfirm(false); }
    finally { running.current = false; setBusy(false); }
  }
  async function copy(name: PlatformName) {
    setError(""); setNotice("");
    try {
      if (!(await Clipboard.setStringAsync(values[name] ?? ""))) throw new Error("Clipboard access was denied. Select the text to copy it manually.");
      setNotice(`${name} caption copied.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not copy your caption."); }
  }
  return <Shell step={5.5} onBack={() => void goBack()} footer={<><Notice error>{error}</Notice><Notice>{notice}</Notice><View style={{ flexDirection: "row", gap: 9 }}><View style={{ flex: 1 }}><Action label="Regenerate" secondary disabled={busy || regenerationCount >= 2} onPress={() => { Keyboard.dismiss(); setConfirm(true); }} /></View><View style={{ flex: 1 }}><Action label={busy ? "Working…" : "Continue"} disabled={busy || !ready} onPress={() => void continueToPreview()} /></View></View></>}>
    <Title size={52}>MAKE IT YOURS.</Title>
    <Label style={{ color: colors.muted, marginBottom: 17 }}>Your captions are ready. Tap the text to edit.</Label>
    {names.map(name => <View key={name} style={{ padding: 14, borderWidth: 1.5, borderColor: GREEN, borderRadius: 16, backgroundColor: colors.selected, marginBottom: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}><Ionicons name={platformIcons[name]} size={37} color={colors.text} /><Label style={{ flex: 1, fontFamily: "Anton", fontSize: 23, lineHeight: 30 }}>{name}</Label><IconButton name="copy-outline" label={`Copy ${name} caption`} disabled={busy || !values[name]?.trim()} onPress={() => void copy(name)} /></View>
      <AutoGrowingTextInput accessibilityLabel={`${name} caption`} value={values[name] ?? ""} editable={!busy} onChangeText={text => { dirty.current.add(name); setValues(previous => ({ ...previous, [name]: text })); }} multiline maxLength={name === "Instagram" ? 2200 : 3000} onFocus={() => setFocused(name)} onBlur={() => setFocused(null)} textAlignVertical="top" style={{ padding: 12, borderWidth: 1, borderColor: focused === name ? GREEN : colors.border, borderRadius: 12, backgroundColor: colors.card, color: colors.text, fontSize: 16, lineHeight: 23 }} />
      <Label style={{ color: colors.muted, fontSize: 11, marginTop: 7 }}>{values[name] !== captions[name] || captionMethods[name] === "edited" ? "Edited by you" : captionMethods[name] === "local-model" ? "Generated by your local model" : "Local caption template"}</Label>
    </View>)}
    <Label style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>Review every claim before you post. Your edits save when you continue or go back.</Label>
    <Label accessibilityLiveRegion="polite" style={{ textAlign: "center", fontSize: 14, fontWeight: "700", marginTop: 3 }}>{Math.max(0, 2 - regenerationCount)} regenerations remaining</Label>
    <ConfirmDialog visible={confirm} title="TRY ANOTHER VERSION?" message="This replaces your current captions, including your edits. You can edit the new version before continuing." confirmLabel="Replace captions" onConfirm={() => void regenerate()} onCancel={() => setConfirm(false)} busy={busy} />
  </Shell>;
}
