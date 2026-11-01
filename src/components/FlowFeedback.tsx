import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Action, Label, Shell } from "./ui";
import { GREEN, useApp } from "../lib/state";

export function LoadingScreen() {
  return <Shell back={false}><View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}><ActivityIndicator color={GREEN} /><Label>Opening your posts…</Label></View></Shell>;
}

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const { colors } = useApp();
  if (!children) return null;
  return <Label accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 19, color: error ? "#E77A65" : colors.muted, marginVertical: 8 }}>{children}</Label>;
}

export function StorageNotice() {
  const { storageError, retryStorage } = useApp();
  const [busy, setBusy] = React.useState(false);
  if (!storageError) return null;
  return <View style={{ marginBottom: 12 }}><Notice error>{storageError}</Notice><Action label={busy ? "Retrying…" : "Retry saving"} secondary disabled={busy} onPress={() => { setBusy(true); void retryStorage().catch(() => {}).finally(() => setBusy(false)); }} /></View>;
}
