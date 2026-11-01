import { FocusPressable as Pressable } from "../components/FocusPressable";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Shell, Title, Label, Action, IconButton } from "../components/ui";
import { useApp, GREEN } from "../lib/state";
import { validDraftForPhoto } from "../lib/flow";
import { references } from "../lib/references";
import { pickPhoto } from "../lib/pickPhoto";
export default function Camera() {
  const { draft, colors, setPhoto, shots, activeShot } = useApp();
  const ref = references.find(r => r.id === shots[activeShot]?.referenceId) ?? references[0];
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [grid, setGrid] = useState(true);
  const taking = useRef(false);
  const focused = useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      focused.current = true;
      setActive(true);
      return () => {
        focused.current = false;
        setActive(false);
        setReady(false);
      };
    }, []),
  );
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const ok =
          Platform.OS === "ios" && !Device.isDevice
            ? false
            : await CameraView.isAvailableAsync();
        if (mounted) setAvailable(ok);
      } catch {
        if (mounted) setAvailable(false);
      }
    }
    void check();
    return () => {
      mounted = false;
    };
  }, []);
  if (!validDraftForPhoto(draft)) return <Redirect href="/photo-count" />;
  async function grant() {
    setError("");
    try {
      await requestPermission();
    } catch {
      setError(
        "Camera access could not be requested. You can upload a photo instead.",
      );
    }
  }
  async function capture() {
    if (taking.current) return;
    taking.current = true;
    const targetShot = shots[activeShot]?.id;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        if (focused.current && await setPhoto({ source: ref.image, isDemo: true, origin: "demo", assetKey: ref.id }, targetShot)) router.push("/confirm");
      } else {
        if (!ready || !camera.current)
          throw new Error("Camera is not ready yet.");
        const p = await camera.current.takePictureAsync({ quality: 0.9 });
        if (!p?.uri) throw new Error("No photo returned. Please try again.");
        if (focused.current && await setPhoto({ source: { uri: p.uri }, isDemo: false, origin: "camera", width: p.width, height: p.height, mimeType: p.format === "png" ? "image/png" : "image/jpeg" }, targetShot)) router.push("/confirm");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not take a photo. Please try again.",
      );
    } finally {
      taking.current = false;
      setBusy(false);
    }
  }
  async function upload() {
    if (taking.current) return;
    taking.current = true;
    const targetShot = shots[activeShot]?.id;
    setBusy(true);
    setError("");
    try {
      const p = await pickPhoto();
      if (p && focused.current && await setPhoto(p, targetShot)) {
        router.push("/confirm");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the photo library. Please try again.");
    } finally {
      taking.current = false;
      setBusy(false);
    }
  }
  const live = available && permission?.granted && !demo;
  return (
    <Shell step={3.5} scroll={true} onBack={() => { if (!busy) router.dismissTo("/references"); }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title size={34}>SHOT {activeShot + 1} OF {draft.shotCount}</Title>
        <IconButton
          name={grid ? "grid" : "grid-outline"}
          label={grid ? "Hide camera grid" : "Show camera grid"}
          onPress={() => setGrid((v) => !v)}
        />
      </View>
      <View
        style={{
          height: 390,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {demo ? (
          <Image
            source={ref.image}
            accessibilityLabel="Bundled sample photo for camera demo"
            style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
          />
        ) : live && active ? (
          <CameraView
            key={facing}
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="picture"
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false);
              setAvailable(false);
              setError(
                "Camera could not start. Upload a photo or use the demo.",
              );
            }}
          />
        ) : (
          <View
            style={{ flex: 1, justifyContent: "center", padding: 22, gap: 14 }}
          >
            {available === null ? (
              <>
                <ActivityIndicator color={GREEN} />
                <Label style={{ textAlign: "center" }}>
                  Checking the camera…
                </Label>
              </>
            ) : (
              <>
                <Ionicons
                  name="camera-outline"
                  color={colors.text}
                  size={42}
                  style={{ alignSelf: "center" }}
                />
                <Title size={25} style={{ textAlign: "center" }}>
                  {available ? "ALLOW YOUR CAMERA" : "CAMERA UNAVAILABLE"}
                </Title>
                <Label
                  style={{
                    textAlign: "center",
                    fontSize: 14,
                    lineHeight: 21,
                    color: colors.muted,
                  }}
                >
                  {available
                    ? "Allow access to frame your photo beside the reference."
                    : "This device or simulator has no available camera. Choose a photo or try the camera demo."}
                </Label>
                {available &&
                  (permission?.canAskAgain !== false ? (
                    <Action label="Allow camera" onPress={grant} />
                  ) : Platform.OS !== "web" ? (
                    <Action
                      label="Open Settings"
                      onPress={() => {
                        void Linking.openSettings().catch(() =>
                          setError("Open device Settings to allow the camera."),
                        );
                      }}
                    />
                  ) : (
                    <Label style={{ fontSize: 13 }}>
                      Allow camera access in your browser settings, then return
                      here.
                    </Label>
                  ))}
                <Action
                  label="Use camera demo"
                  secondary
                  onPress={() => {
                    setDemo(true);
                    setError("");
                  }}
                />
              </>
            )}
          </View>
        )}
        {(demo || live) && (
          <>
            {grid && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {[1, 2].map((i) => (
                  <React.Fragment key={i}>
                    <View
                      style={{
                        position: "absolute",
                        left: `${(i * 100) / 3}%`,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        backgroundColor: "#ffffff70",
                      }}
                    />
                    <View
                      style={{
                        position: "absolute",
                        top: `${(i * 100) / 3}%`,
                        left: 0,
                        right: 0,
                        height: 1,
                        backgroundColor: "#ffffff70",
                      }}
                    />
                  </React.Fragment>
                ))}
              </View>
            )}
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                backgroundColor: "#080808",
                padding: 5,
                borderRadius: 12,
                width: 88,
              }}
            >
              <Image
                source={ref.image}
                accessibilityLabel="Selected pose reference"
                style={{ width: 78, height: 92, borderRadius: 8 }}
              />
              <TextWhite>Reference</TextWhite>
            </View>
            {demo && (
              <View
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  right: 12,
                  backgroundColor: "#080808",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <TextWhite>DEMO · Sample image, not a live camera</TextWhite>
              </View>
            )}
          </>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 18,
          paddingHorizontal: 16,
        }}
      >
        <IconButton
          name="images-outline"
          label="Choose photo from library"
          disabled={busy}
          onPress={upload}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={demo ? "Capture demo photo" : "Take photo"}
          accessibilityState={{ disabled: busy || (!demo && !ready) }}
          disabled={busy || (!demo && !ready)}
          onPress={capture}
          style={({ pressed, focused }) => [
            {
              width: 76,
              height: 76,
              borderRadius: 40,
              borderWidth: 4,
              borderColor: colors.text,
              padding: 4,
              opacity: busy || (!demo && !ready) ? 0.35 : pressed ? 0.7 : 1,
            },
            focused && {
              outlineColor: GREEN,
              outlineWidth: 3,
              outlineOffset: 4,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={GREEN} style={{ flex: 1 }} />
          ) : (
            <View
              style={{
                flex: 1,
                borderRadius: 40,
                backgroundColor: colors.text,
              }}
            />
          )}
        </Pressable>
        <IconButton
          name="camera-reverse-outline"
          label="Switch front and back camera"
          disabled={busy || !live}
          onPress={() => {
            setReady(false);
            setFacing((v) => (v === "back" ? "front" : "back"));
          }}
        />
      </View>
      <Action
        label={busy ? "Opening photos…" : "Upload photo"}
        secondary
        icon="cloud-upload-outline"
        disabled={busy}
        onPress={upload}
      />
      {demo && (
        <View style={{ marginTop: 10 }}>
          <Action
            label="Exit camera demo"
            secondary
            onPress={() => setDemo(false)}
          />
        </View>
      )}
      {!!error && (
        <Label accessibilityRole="alert" style={{ marginTop: 12 }}>
          {error}
        </Label>
      )}
      <Label
        style={{
          fontSize: 12,
          lineHeight: 18,
          color: colors.muted,
          textAlign: "center",
          marginTop: 12,
        }}
      >
        Your photo stays on this device. Nothing is uploaded.
      </Label>
    </Shell>
  );
}
function TextWhite({ children }: { children: React.ReactNode }) {
  return (
    <Label
      style={{
        color: "#fff",
        textAlign: "center",
        fontSize: 11,
        lineHeight: 16,
      }}
    >
      {children}
    </Label>
  );
}
