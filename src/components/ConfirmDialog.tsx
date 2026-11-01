import React from "react";
import { Modal, View } from "react-native";
import { Action, Label, Title } from "./ui";
import { useApp } from "../lib/state";

export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel, busy = false }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 24 }}>
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 420, alignSelf: "center", padding: 24, borderRadius: 22, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, gap: 16 }}>
          <Title size={27}>{title}</Title>
          <Label style={{ color: colors.muted }}>{message}</Label>
          <Action label={busy ? "Working…" : confirmLabel} disabled={busy} onPress={onConfirm} />
          <Action label="Cancel" secondary disabled={busy} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
