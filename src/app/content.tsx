import React, { useState } from "react";
import { Redirect, router } from "expo-router";
import { Shell, Title, Label, Choice, Action } from "../components/ui";
import { afterContent, ContentKind } from "../lib/flow";
import { useApp } from "../lib/state";
import { Notice } from "../components/FlowFeedback";
export default function Content() {
  const { draft, update, colors } = useApp();
  const [selected, setSelected] = useState(draft.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function next() {
    if (busy) return;
    setBusy(true); setError("");
    try { await update({ content: selected }); router.push(afterContent(selected)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your choice."); }
    finally { setBusy(false); }
  }
  if (!draft.sport) return <Redirect href="/sport" />;
  return (
    <Shell
      step={1.5}
      onBack={() => { if (!busy) router.dismissTo("/home"); }}
      footer={
        <><Notice error>{error}</Notice><Action
          label={busy ? "Saving…" : "Continue"}
          disabled={busy}
          onPress={() => void next()}
        /></>
      }
    >
      <Title size={46}>WHAT DO YOU{"\n"}WANT TO CREATE?</Title>
      <Label style={{ color: colors.muted, marginBottom: 12 }}>
        Choose what you need today.
      </Label>
      {(
        [
          {
            id: "photos",
            label: "Photos only",
            detail: "Example: Insta story",
            icon: "image",
          },
          {
            id: "written",
            label: "Written post",
            detail: "Example: LinkedIn post",
            icon: "document-text",
          },
          {
            id: "both",
            label: "Both",
            detail: "Post with images and text",
            icon: "albums",
          },
        ] as const
      ).map((c) => (
        <Choice
          key={c.id}
          label={c.label}
          detail={c.detail}
          icon={c.icon}
          selected={selected === c.id}
          disabled={busy}
          onPress={() => setSelected(c.id as ContentKind)}
        />
      ))}
    </Shell>
  );
}
