import React, { useState } from "react";
import { router } from "expo-router";
import {
  Shell,
  Title,
  Label,
  Choice,
  Action,
  IconName,
} from "../components/ui";
import { useApp } from "../lib/state";
import { Notice } from "../components/FlowFeedback";
const sports: { label: string; icon: IconName }[] = [
  { label: "Tennis", icon: "tennisball" },
  { label: "Basketball", icon: "basketball" },
  { label: "Football", icon: "american-football" },
  { label: "Hockey", icon: "disc" },
  { label: "Soccer", icon: "football" },
];
export default function Sport() {
  const { draft, update, colors, finishOnboarding } = useApp();
  const [selected, setSelected] = useState(draft.sport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function next() {
    if (busy || !selected) return;
    setBusy(true); setError("");
    try { await update({ sport: selected }); await finishOnboarding(); router.replace("/home"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your choice. Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <Shell
      step={1}
      footer={
        <><Notice error>{error}</Notice><Action
          label={busy ? "Saving…" : "Continue"}
          disabled={busy || !selected}
          onPress={() => void next()}
        /></>
      }
    >
      <Title>WHAT SPORT DO YOU{"\n"}WANT TO LARP?</Title>
      <Label style={{ color: colors.muted, marginBottom: 6 }}>
        Choose a sport to get started.
      </Label>
      {sports.map((v) => (
        <Choice
          key={v.label}
          label={v.label}
          icon={v.icon}
          selected={selected === v.label}
          disabled={busy || v.label !== "Tennis"}
          onPress={() => setSelected("Tennis")}
        />
      ))}
    </Shell>
  );
}
