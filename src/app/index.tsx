import React from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Action, Label } from "../components/ui";
import { GREEN, useApp } from "../lib/state";
export default function Logo() {
  const { hasOnboarded } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: GREEN }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: 28,
          justifyContent: "center",
        }}
      >
        <Image
          source={require("../../assets/logo.png")}
          accessibilityLabel="Larp It app logo"
          style={{ width: "100%", aspectRatio: 1 }}
        />
        <Label
          style={{
            color: "#080808",
            textAlign: "center",
            fontFamily: "Anton",
            fontSize: 24,
            lineHeight: 32,
          }}
        >
          LARP IT TILL U MAKE IT
        </Label>
      </View>
      <View
        style={{
          padding: 24,
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
        }}
      >
        <Action
          label="Open Larp It"
          secondary
          onPress={() => router.replace(hasOnboarded ? "/home" : "/welcome")}
        />
      </View>
    </SafeAreaView>
  );
}
