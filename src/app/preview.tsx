import React, { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { FocusPressable as Pressable } from "../components/FocusPressable";
import { Action, Label, Shell, Title } from "../components/ui";
import { LoadingScreen, Notice } from "../components/FlowFeedback";
import { SocialPreview } from "../components/SocialPreview";
import { ResumeDraftRedirect } from "../components/ResumeDraftRedirect";
import { previewOrder } from "../components/platformMeta";
import { useApp, GREEN, type State } from "../lib/state";
import { sharePhoto } from "../lib/sharePhoto";

export default function Preview() {
  const params = useLocalSearchParams<{ platform?: string }>();
  const { hydrated, draft, shots, captions, colors, savePost, isSaving, getPreview, confirmPreview, draftRevision } = useApp();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const platforms = previewOrder.filter(name => draft.platforms.includes(name) && (name === "Instagram" || name === "LinkedIn"));
  const currentIndex = Math.max(0, platforms.findIndex(name => name === params.platform));
  const current = platforms[currentIndex];
  const [preview, setPreview] = useState<Awaited<ReturnType<State["getPreview"]>> | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!hydrated || !current) return;
    void getPreview(current).then(value => { if (active) { setPreview(value); setError(""); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load your preview."); });
    return () => { active = false; };
  }, [hydrated, current, draftRevision, getPreview, retry]);
  if (!hydrated) return <LoadingScreen />;
  if (!draft.sport) return <Redirect href="/sport" />;
  if (!platforms.length) return <Redirect href="/platforms" />;
  if (draft.content !== "written" && (shots.length !== draft.shotCount || shots.some(shot => !shot.photo || shot.photo.unavailable || !shot.accepted))) return <ResumeDraftRedirect />;
  if (draft.content !== "photos" && draft.platforms.some(name => !captions[name]?.trim())) return <Redirect href="/captions" />;
  const photos = preview?.uiPhotos ?? [];
  const caption = preview?.caption?.text ?? "";
  const ready = !!preview && preview.revision === draftRevision && preview.platform === current.toLowerCase();
  const last = currentIndex === platforms.length - 1;
  async function copy() {
    setNotice(""); setError("");
    try {
      const copied = await Clipboard.setStringAsync(caption);
      if (!copied) throw new Error("Clipboard access was denied. Select the caption text above to copy it manually.");
      setNotice(`Caption copied. Paste it into ${current}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not copy the caption. Select the text above to copy it manually."); }
  }
  async function share() {
    if (running.current) return;
    const photo = photos[Math.min(photoIndex, photos.length - 1)];
    if (!photo) return;
    running.current = true; setBusy(true); setError(""); setNotice("");
    try { setNotice(await sharePhoto(photo)); }
    catch (e) { setError(e instanceof Error ? e.message : "The photo could not be shared. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  async function next() {
    if (running.current || !preview || !ready) return;
    setNotice(""); setError("");
    running.current = true; setBusy(true);
    try {
      await confirmPreview(current, preview.revision);
      if (!last) {
        setPhotoIndex(0);
        router.push({ pathname: "/preview", params: { platform: platforms[currentIndex + 1] } });
      } else {
        await savePost(); router.dismissTo("/home");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Your post could not be saved. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <Shell step={6} onBack={() => { if (busy || isSaving) return; if (currentIndex > 0) { setPhotoIndex(0); router.replace({ pathname: "/preview", params: { platform: platforms[currentIndex - 1] } }); } else router.dismissTo(draft.content === "photos" ? "/platforms" : "/captions"); }} footer={<>
    <Notice error>{error}</Notice>{!!error && !ready && <Action label="Retry preview" secondary onPress={() => setRetry(value => value + 1)} />}<Notice>{notice}</Notice>
    {caption ? <Action label="Copy caption" icon="copy-outline" disabled={busy || isSaving || !ready} onPress={() => void copy()} /> : <Action label={Platform.OS === "web" ? "Download photo" : "Share photo"} icon="share-outline" disabled={busy || isSaving || !ready || !photos.length} onPress={() => void share()} />}
    <Pressable accessibilityRole="button" accessibilityLabel={last ? "All done" : "Continue"} disabled={busy || isSaving || !ready} accessibilityState={{ disabled: busy || isSaving || !ready }} aria-disabled={busy || isSaving || !ready} onPress={() => void next()} style={({ pressed, focused }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", opacity: busy || isSaving ? 0.4 : pressed ? 0.6 : 1, ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ fontFamily: "Anton", fontSize: 21, lineHeight: 29 }}>{busy || isSaving ? "Working…" : last ? "All done" : "Continue"}</Label></Pressable>
  </>}>
    <Title size={52}>READY TO POST.</Title>
    <Label style={{ color: colors.muted, marginBottom: 14 }}>Preview your {current} post.</Label>
    {!ready ? <Label style={{ color: colors.muted, textAlign: "center", marginVertical: 30 }}>Preparing your saved preview…</Label> : <SocialPreview key={current} platform={current} caption={caption} photos={photos} photoIndex={photoIndex} onPhotoIndex={setPhotoIndex} onEdit={draft.content === "photos" ? undefined : () => router.dismissTo("/captions")} onShare={() => void share()} busy={busy || isSaving} />}
    <Label style={{ textAlign: "center", color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }}>{caption ? `Copy your caption, then paste it into ${current}.` : "Your selected photos are ready to share."}</Label>
    {!!caption && photos.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={Platform.OS === "web" ? "Download current photo" : "Share current photo"} disabled={busy || isSaving || !ready} onPress={() => void share()} style={({ focused }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ color: colors.muted, fontSize: 13 }}>{Platform.OS === "web" ? "Download current photo" : "Share current photo"}</Label></Pressable>}
    {draft.content !== "photos" && <View style={{ marginTop: 2 }}><Pressable accessibilityRole="button" onPress={() => router.dismissTo("/captions")} disabled={busy || isSaving || !ready} style={({ focused }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", ...(focused ? { outlineColor: GREEN, outlineWidth: 2 } : {}) })}><Label style={{ color: colors.muted, fontSize: 13 }}>Edit captions</Label></Pressable></View>}
    <Label style={{ fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: "center" }}>All done saves in Larp It. Nothing is posted automatically.</Label>
  </Shell>;
}
