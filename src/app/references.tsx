import { FocusPressable as Pressable } from "../components/FocusPressable";
import React, { useState, useEffect, useRef } from "react";
import {
  Image,
  View,
  Modal,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Shell, Title, Label, Action, IconButton } from "../components/ui";
import { validDraftForPhoto, nextReference } from "../lib/flow";
import { references } from "../lib/references";
import { useApp, GREEN } from "../lib/state";
import { pickPhoto } from "../lib/pickPhoto";
export default function References() {
  const { draft, colors, setPhoto, dark, shots, activeShot, setActiveShot, setReference, setShotChecks, referenceMatches, referenceMatchStatus } = useApp();
  const shot = shots[activeShot];
  const referenceIndex = Math.max(0, references.findIndex(r => r.id === shot?.referenceId));
  const [enlarged, setEnlarged] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const focused = useRef(true);
  const picking = useRef(false);
  const choosing = useRef(false);
  async function choose(index: number) {
    if (choosing.current || picking.current || references[index]?.id === shot?.referenceId) return;
    choosing.current = true; setBusy(true); setError("");
    try { await setReference(references[index].id); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select this reference."); }
    finally { choosing.current = false; setBusy(false); }
  }
  useFocusEffect(React.useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, Platform.OS === "web" ? 393 : 480);
  const carousel = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    carousel.current?.scrollTo({
      x: referenceIndex * pageWidth,
      y: 0,
      animated: false,
    });
  }, [referenceIndex, pageWidth]);
  if (!validDraftForPhoto(draft)) return <Redirect href="/photo-count" />;
  const ref = references[referenceIndex];
  const cardWidth = pageWidth - 48;
  async function upload() {
    if (picking.current) return;
    picking.current = true;
    const targetShot = shot?.id;
    setBusy(true);
    setError("");
    try {
      const p = await pickPhoto();
      if (p && focused.current && await setPhoto(p, targetShot)) {
        router.push("/confirm");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open your photos. Please try again or take a photo.");
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  return (
    <Shell
      step={3}
      onBack={() => { if (busy) return; if (activeShot > 0 && shots[activeShot - 1]?.photo) { setActiveShot(activeShot - 1); router.push("/review"); } else router.dismissTo("/pose"); }}
      footer={
        <>
          <Action
            label="Take photo"
            icon="camera"
            disabled={busy}
            onPress={() => router.push("/camera")}
          />
          <Action
            label={busy ? "Opening photos…" : "Upload photo"}
            icon="cloud-upload-outline"
            secondary
            disabled={busy}
            onPress={upload}
          />
        </>
      }
    >
      <Title size={54}>FIND YOUR SHOT</Title>
      <Label style={{ color: colors.muted, marginBottom: 12 }}>Shot {activeShot + 1} of {draft.shotCount}</Label>
      {referenceMatchStatus === "no-match" && <Label style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>No close match for this idea in the bundled collection. Browse these three references or go back to change your idea.</Label>}
      {referenceMatches.includes(ref.id) && referenceMatchStatus === "matched" && <Label style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>Suggested for your photo idea · keyword match</Label>}
      <View style={{ marginHorizontal: -24 }}>
        <ScrollView
          ref={carousel}
          onLayout={() =>
            carousel.current?.scrollTo({
              x: referenceIndex * pageWidth,
              y: 0,
              animated: false,
            })
          }
          horizontal
          scrollEnabled={!busy}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{
            x: referenceIndex * pageWidth,
            y: 0,
          }}
          onMomentumScrollEnd={(e) =>
            void choose(Math.max(0, Math.min(references.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageWidth))))
          }
        >
          {references.map((r, i) => (
            <View
              key={r.id}
              style={{ width: pageWidth, paddingHorizontal: 24 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Enlarge reference ${i + 1}: ${r.title}`}
                onPress={() => {
                  void choose(i).then(() => setEnlarged(true));
                }}
              >
                <Image
                  source={r.image}
                  accessibilityLabel={r.alt}
                  style={{ width: cardWidth, height: 245, borderRadius: 18 }}
                />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
        }}
      >
        <IconButton
          name="chevron-back"
          label="Previous reference"
          disabled={busy}
          onPress={() =>
            void choose(nextReference(referenceIndex, -1, references.length))
          }
        />
        {references.map((r, i) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`Reference ${i + 1}`}
            accessibilityState={{ selected: referenceIndex === i }}
            disabled={busy}
            onPress={() => void choose(i)}
            style={{
              minWidth: 35,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="ellipse"
              size={10}
              color={referenceIndex === i ? GREEN : colors.muted}
            />
          </Pressable>
        ))}
        <IconButton
          name="chevron-forward"
          label="Next reference"
          disabled={busy}
          onPress={() =>
            void choose(nextReference(referenceIndex, 1, references.length))
          }
        />
      </View>
      <Label style={{ textAlign: "center", color: colors.muted, fontSize: 12 }}>
        Swipe to explore · Tap to enlarge
      </Label>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 18,
          padding: 16,
          marginTop: 18,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Title size={23}>HOW TO GET THE SHOT</Title>
        {ref.steps.map((step, i) => {
          const key = `${ref.id}-${i}`;
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityLabel={step}
              accessibilityState={{ checked: !!shot?.checks[i] }}
              aria-checked={!!shot?.checks[i]}
              onPress={() => setShotChecks(ref.steps.map((_, j) => j === i ? !shot?.checks[j] : !!shot?.checks[j]))}
              style={{
                minHeight: 48,
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                paddingVertical: 8,
              }}
            >
              <Ionicons
                name={shot?.checks[i] ? "checkbox" : "square-outline"}
                color={shot?.checks[i] ? (dark ? GREEN : "#3B6200") : colors.text}
                size={26}
              />
              <Label style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {step}
              </Label>
            </Pressable>
          );
        })}
      </View>
      <Label style={{ color: colors.muted, fontSize: 11, marginTop: 12 }}>
        {ref.credit} · Bundled reference photo.
      </Label>
      {shot?.photo && <Action label="Review saved shot" secondary onPress={() => router.push("/confirm")} />}
      {!!error && (
        <Label accessibilityRole="alert" style={{ marginTop: 12 }}>
          {error}
        </Label>
      )}
      <Modal
        visible={enlarged}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setEnlarged(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
            }}
          >
            <Label style={{ fontFamily: "Anton", fontSize: 22 }}>
              {ref.title}
            </Label>
            <IconButton
              name="close"
              label="Close enlarged reference"
              onPress={() => setEnlarged(false)}
            />
          </View>
          <Image
            source={ref.image}
            accessibilityLabel={ref.alt}
            resizeMode="contain"
            style={{ flex: 1, width: "100%" }}
          />
          <Label
            style={{ color: colors.muted, textAlign: "center", padding: 20 }}
          >
            {ref.credit}
          </Label>
        </SafeAreaView>
      </Modal>
    </Shell>
  );
}
