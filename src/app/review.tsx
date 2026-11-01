import React, { useEffect, useRef, useState } from "react";
import { View, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { FocusPressable as Pressable } from "../components/FocusPressable";
import { Action, IconButton, Label, Shell, Title } from "../components/ui";
import { GREEN, useApp } from "../lib/state";
import { references } from "../lib/references";
import { Notice } from "../components/FlowFeedback";
export default function Review() {
  const { draft, shots, activeShot, setActiveShot, setShotChecks, acceptShot, reviewShot, colors, dark } = useApp();
  const shot = shots[activeShot];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const reviewed = useRef("");
  const photoSource = shot?.photo?.source;
  const photoKey = photoSource && typeof photoSource === "object" && "uri" in photoSource ? photoSource.uri : shot?.photo?.assetKey;
  const key = `${shot?.id}:${shot?.referenceId}:${photoKey}`;
  useEffect(() => {
    if (!shot?.photo || shot.assessment || reviewed.current === key || running.current) return;
    reviewed.current = key;
    running.current = true; setBusy(true); setError("");
    void reviewShot().catch(e => setError(e instanceof Error ? e.message : "Photo feedback is unavailable. You can still review the shot yourself."))
      .finally(() => { running.current = false; setBusy(false); });
  }, [key, reviewShot, shot?.photo, shot?.assessment]);
  if (!shot?.photo) return <Redirect href="/references" />;
  const ref = references.find(r => r.id === shot.referenceId) ?? references[0];
  const complete = shot.checks.length >= 3 && shot.checks.every(Boolean);
  async function next() {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      await acceptShot();
      if (activeShot + 1 < draft.shotCount) { setActiveShot(activeShot + 1); router.dismissTo("/references"); }
      else router.push(draft.content === "photos" ? "/platforms" : "/topic");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not accept this photo. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <Shell step={4} onBack={() => { if (!busy) router.replace("/confirm"); }} footer={
    <><Notice error>{error}</Notice><View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}><Action label="Retake" icon="refresh" secondary disabled={busy} onPress={() => router.dismissTo("/camera")} /></View>
      <View style={{ flex: 1 }}><Action label={busy ? "Working…" : "Continue"} disabled={busy} icon="chevron-forward" onPress={() => void next()} /></View>
    </View></>
  }>
    <Title size={36} style={{ textAlign: "center" }}>REVIEW YOUR SHOTS</Title>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <IconButton name="chevron-back" label="Previous captured shot" disabled={busy || activeShot === 0 || !shots[activeShot - 1]?.photo} onPress={() => setActiveShot(activeShot - 1)} />
      <Label>{activeShot + 1} of {draft.shotCount}</Label>
      <IconButton name="chevron-forward" label="Next captured shot" disabled={busy || !shots[activeShot + 1]?.photo} onPress={() => setActiveShot(activeShot + 1)} />
    </View>
    <View style={{ flexDirection: "row", gap: 10 }}>
      {[{ label: "Reference", source: ref.image }, { label: "Your photo", source: shot.photo.source }].map(item => <View key={item.label} style={{ flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <Image source={item.source} accessibilityLabel={item.label === "Reference" ? ref.alt : shot.photo?.isDemo ? "Your demo sample" : "Your captured photo"} style={{ width: "100%", height: 215 }} />
        <Label style={{ textAlign: "center", paddingVertical: 8, fontFamily: "Anton", fontSize: 18, backgroundColor: colors.card }}>{item.label}</Label>
      </View>)}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginVertical: 14 }}>
      <Ionicons name={complete ? "checkmark-circle" : "eye-outline"} size={24} color={dark ? GREEN : "#3B6200"} />
      <Label style={{ fontFamily: "Anton", fontSize: 20, flex: 1 }}>{complete ? "Your checklist is complete" : "Check your shot"}</Label>
    </View>
    <View style={{ backgroundColor: colors.card, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
      {ref.steps.map((step, i) => <Pressable key={step} accessibilityRole="checkbox" accessibilityLabel={`Review: ${step}`} accessibilityState={{ checked: !!shot.checks[i] }} aria-checked={!!shot.checks[i]} onPress={() => setShotChecks(ref.steps.map((_, j) => j === i ? !shot.checks[j] : !!shot.checks[j]))} style={({ focused }) => [{ minHeight: 48, flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 8 }, focused && { outlineWidth: 2, outlineColor: GREEN }]}>
        <Ionicons name={shot.checks[i] ? "checkbox" : "square-outline"} size={28} color={shot.checks[i] ? dark ? GREEN : "#3B6200" : colors.text} />
        <Label style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{step}</Label>
      </Pressable>)}
    </View>
    {shot.assessment?.status === "assessed" && shot.assessment.score !== null && <Label style={{ marginTop: 12 }}>Estimated composition match: {Math.round(shot.assessment.score)}/100</Label>}
    {shot.assessment?.feedback.map((feedback, index) => <Label key={`${index}-${feedback}`} style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>{feedback}</Label>)}
    <Label style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>{shot.assessment?.method === "local-model" ? "Local model feedback is an estimate, not a measure of tennis ability. You decide whether to accept this shot." : "Review by you. Automatic photo analysis is not enabled. Continue when you are happy with this shot."}</Label>
    {shot.photo.isDemo && <Label style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>This shot uses a labelled demo sample.</Label>}
  </Shell>;
}
