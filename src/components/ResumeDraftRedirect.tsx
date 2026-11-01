import React, { useEffect } from "react";
import { router } from "expo-router";
import { useApp } from "../lib/state";
import { LoadingScreen } from "./FlowFeedback";

/** Recover an incomplete draft after hydration or a stale/deep preview link. */
export function ResumeDraftRedirect() {
  const { resumeDraft } = useApp();
  useEffect(() => {
    router.replace(resumeDraft());
  }, [resumeDraft]);
  return <LoadingScreen />;
}
