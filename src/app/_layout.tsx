import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Anton_400Regular } from "@expo-google-fonts/anton";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppProvider, GREEN, useApp } from "../lib/state";
function Routes() {
  const { dark, colors, hydrated } = useApp();
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", gap: 16 }}><ActivityIndicator color={GREEN} /><Text style={{ color: colors.text }}>Opening your posts…</Text></View>;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        width: "100%",
        maxWidth: Platform.OS === "web" ? 393 : undefined,
        maxHeight: Platform.OS === "web" ? 852 : undefined,
        alignSelf: "center",
        marginVertical: Platform.OS === "web" ? "auto" : 0,
      }}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      />
    </View>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Anton: Anton_400Regular,
    ...Ionicons.font,
  });
  const [fallback, setFallback] = React.useState(false);
  if (!loaded && !fallback)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#080808",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
        }}
      >
        {error ? (
          <>
            <Text style={{ color: "white" }}>
              The display font could not load.
            </Text>
            <Pressable
              onPress={() => setFallback(true)}
              accessibilityRole="button"
            >
              <Text style={{ color: GREEN, padding: 20 }}>
                Continue with system fonts
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={GREEN} />
            <Text style={{ color: "white" }}>Opening Larp It…</Text>
          </>
        )}
      </View>
    );
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Routes />
      </AppProvider>
    </SafeAreaProvider>
  );
}
