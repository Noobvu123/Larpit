import { FocusPressable as Pressable } from "./FocusPressable";
import React, { useState } from "react";
import { TextInput, View, Keyboard } from "react-native";
import { Redirect, router } from "expo-router";
import { Shell, Title, Label, Action } from "./ui";
import { afterStyle } from "../lib/flow";
import { useApp, GREEN } from "../lib/state";
import { Notice } from "./FlowFeedback";
export function PromptScreen({ kind }: { kind: "style" | "pose" }) {
  const { draft, update, colors } = useApp();
  const [focused, setFocused] = useState(false);
  const isStyle = kind === "style";
  const [value, setValue] = useState(isStyle ? draft.style : draft.pose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!draft.sport) return <Redirect href="/sport" />;
  async function next() {
    if (busy || !value.trim()) return;
    Keyboard.dismiss(); setBusy(true); setError("");
    try {
      await update(isStyle ? { style: value } : { pose: value });
      router.push(isStyle ? afterStyle(draft.content) : "/references");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your idea. Please try again."); }
    finally { setBusy(false); }
  }
  const examples = isStyle
    ? ["Fun and casual", "Clean and professional", "Short and confident"]
    : [
        "Relaxed courtside portrait",
        "Sitting with my racket",
        "Racket and ball details",
      ];
  return (
    <Shell
      step={isStyle ? 2 : 2.5}
      footer={
        <><Notice error>{error}</Notice><Action label={busy ? "Saving…" : "Continue"} disabled={busy || !value.trim()} onPress={() => void next()} /></>
      }
    >
      <Title>
        {isStyle
          ? "HOW WOULD YOU\nLIKE YOUR POST TO BE?"
          : "WHAT SHOT DO YOU\nHAVE IN MIND?"}
      </Title>
      {!isStyle && (
        <Label style={{ color: colors.muted, marginBottom: 20 }}>
          Tell us about your pose, setting or mood.
        </Label>
      )}
      <TextInput
        accessibilityLabel={
          isStyle ? "Describe your post style" : "Describe your photo idea"
        }
        multiline
        maxLength={500}
        placeholder={
          isStyle
            ? "Ex: This is a fun and informal post with a casual tone"
            : "Ex: A relaxed tennis photo, sitting courtside with my racket"
        }
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={setValue}
        editable={!busy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textAlignVertical="top"
        style={{
          backgroundColor: colors.card,
          color: colors.text,
          borderWidth: 1.5,
          borderColor: focused ? GREEN : colors.border,
          borderRadius: 18,
          padding: 20,
          fontSize: 18,
          lineHeight: 27,
          minHeight: isStyle ? 260 : 220,
          marginTop: 8,
        }}
      />
      <Label
        style={{
          color: colors.muted,
          fontSize: 12,
          textAlign: "right",
          marginTop: 6,
        }}
      >
        {value.length}/500
      </Label>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 18,
        }}
      >
        {examples.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`Use suggestion: ${e}`}
            disabled={busy}
            onPress={() => setValue(e)}
            style={({ focused }) => [
              {
                backgroundColor: colors.card,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 25,
                borderWidth: 1,
                borderColor: colors.border,
              },
              focused && { outlineColor: GREEN, outlineWidth: 2 },
            ]}
          >
            <Label style={{ fontSize: 13 }}>{e}</Label>
          </Pressable>
        ))}
      </View>
    </Shell>
  );
}
