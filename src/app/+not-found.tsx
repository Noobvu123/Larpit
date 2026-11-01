import React from "react";
import { router } from "expo-router";
import { Shell, Title, Action } from "../components/ui";
export default function NotFound() {
  return (
    <Shell
      footer={
        <Action label="Go to start" onPress={() => router.replace("/")} />
      }
    >
      <Title>LET’S GET YOU BACK</Title>
    </Shell>
  );
}
