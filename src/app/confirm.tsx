import React, { useRef, useState } from "react";
import { Image, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Shell, Title, Label, Action } from "../components/ui";
import { useApp } from "../lib/state";
import { pickPhoto } from "../lib/pickPhoto";
export default function Confirm() {
  const { photo, setPhoto, colors, activeShot, draft, shots } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const focused = useRef(true);
  const picking = useRef(false);
  useFocusEffect(React.useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  if (!photo) return <Redirect href="/camera" />;
  async function retake() {
    if (photo?.origin !== "library") { router.dismissTo("/camera"); return; }
    if (picking.current) return;
    picking.current = true;
    const targetShot = shots[activeShot]?.id;
    setBusy(true); setError("");
    try { const selected = await pickPhoto(); if (selected && focused.current) await setPhoto(selected, targetShot); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open your photos. Your current photo is still here."); }
    finally { picking.current = false; setBusy(false); }
  }
  return <Shell step={3.8} onBack={() => { if (!busy) router.dismissTo("/references"); }} footer={
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}><Action label={photo.origin === "library" ? "Choose again" : "Retake"} secondary icon="refresh" disabled={busy} onPress={retake} /></View>
      <View style={{ flex: 1 }}><Action label="Use photo" icon="checkmark" disabled={busy} onPress={() => router.replace("/review")} /></View>
    </View>
  }>
    <Title size={32}>HAPPY WITH THIS SHOT?</Title>
    <Label style={{ color: colors.muted, marginBottom: 18, textAlign: "center" }}>Shot {activeShot + 1} of {draft.shotCount}{photo.isDemo ? " · Demo sample" : ""}</Label>
    <Image source={photo.source} accessibilityLabel={photo.isDemo ? "Sample photo captured in demo mode" : "Your selected photo"} resizeMode="cover" style={{ width: "100%", height: 420, borderRadius: 18 }} />
    {photo.isDemo && <Label style={{ color: colors.muted, fontSize: 13, marginTop: 14 }}>Demo sample. Choose your own image to use a real photo.</Label>}
    {!!error && <Label accessibilityRole="alert" style={{ marginTop: 14 }}>{error}</Label>}
  </Shell>;
}
