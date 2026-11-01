import React from "react";
import { Image } from "react-native";
import { router } from "expo-router";
import { Shell, Title, Label, Action } from "../components/ui";
import { useApp, GREEN } from "../lib/state";
export default function Welcome() {
  const { dark, colors } = useApp();
  return (
    <Shell
      back={false}
      footer={
        <Action label="Get Started" onPress={() => router.push("/sport")} />
      }
    >
      <Title size={54} style={{ lineHeight: 65, marginTop: 8 }}>
        YOUR SHOT.{"\n"}
        <Label
          style={{
            fontFamily: "Anton",
            fontSize: 54,
            lineHeight: 65,
            color: dark ? GREEN : "#518000",
          }}
        >
          YOUR STORY.
        </Label>
      </Title>
      <Label style={{ fontSize: 18, lineHeight: 25, marginBottom: 5 }}>
        Plan, capture and share{"\n"}with confidence.
      </Label>
      <Label
        style={{
          fontFamily: "Anton",
          fontSize: 24,
          lineHeight: 32,
          color: dark ? GREEN : colors.text,
          marginBottom: 18,
        }}
      >
        LARP IT TILL U MAKE IT
      </Label>
      <Image
        source={require("../../assets/photos/portrait.jpg")}
        accessibilityLabel="Tennis player seated on a red court beside a racket"
        style={{ width: "100%", height: 330, borderRadius: 18 }}
      />
    </Shell>
  );
}
