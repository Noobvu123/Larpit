import { FocusPressable as Pressable } from "./FocusPressable";
import React from "react";
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp, GREEN } from "../lib/state";
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Label({
  children,
  style,
  ...rest
}: React.ComponentProps<typeof Text>) {
  const { colors } = useApp();
  return (
    <Text
      {...rest}
      style={[{ color: colors.text, fontSize: 16, lineHeight: 23 }, style]}
    >
      {children}
    </Text>
  );
}
export function Title({
  children,
  size = 38,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  style?: TextStyle;
}) {
  return (
    <Label
      accessibilityRole="header"
      style={[
        {
          fontFamily: "Anton",
          fontSize: size,
          lineHeight: size * 1.22,
          letterSpacing: -0.5,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </Label>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, focused }) => [
        s.iconButton,
        focused && { outlineColor: GREEN, outlineWidth: 2 },
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={name} size={26} color={colors.text} />
    </Pressable>
  );
}
export function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, focused }) => [
        s.action,
        {
          backgroundColor: secondary ? colors.background : GREEN,
          borderColor: secondary ? colors.border : GREEN,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        focused && {
          outlineColor: colors.text,
          outlineWidth: 3,
          outlineOffset: 3,
        },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={23}
          color={secondary ? colors.text : "#080808"}
        />
      )}
      <Text
        style={[s.actionText, { color: secondary ? colors.text : "#080808" }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function ThemeButton() {
  const { dark, toggleTheme, colors } = useApp();
  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityRole="switch"
      accessibilityLabel="Dark mode"
      accessibilityState={{ checked: dark }}
      aria-checked={dark}
      style={({ focused }) => [
        s.theme,
        { backgroundColor: colors.card },
        focused && { outlineColor: GREEN, outlineWidth: 2 },
      ]}
    >
      <Ionicons name={dark ? "moon" : "sunny"} size={22} color={colors.text} />
    </Pressable>
  );
}
export function Shell({
  children,
  footer,
  step = 0,
  back = true,
  scroll = true,
  onBack,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  step?: number;
  back?: boolean;
  scroll?: boolean;
  onBack?: () => void;
}) {
  const { colors } = useApp();
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.header}>
          {back ? (
            <IconButton
              name="chevron-back"
              label="Back"
              onPress={onBack ?? (() =>
                router.canGoBack() ? router.back() : router.replace("/home")
              )}
            />
          ) : (
            <View style={s.iconButton} />
          )}
          <Label style={s.wordmark}>LARP IT</Label>
          <ThemeButton />
        </View>
        {step > 0 && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Setup progress"
            accessibilityValue={{ min: 0, max: 6, now: step }}
            aria-valuemin={0}
            aria-valuemax={6}
            aria-valuenow={step}
            style={[s.progress, { backgroundColor: colors.card }]}
          >
            <View
              style={{
                height: 5,
                borderRadius: 9,
                backgroundColor: GREEN,
                width: `${Math.min(1, step / 6) * 100}%`,
              }}
            />
          </View>
        )}
        {scroll ? (
          <ScrollView
            key={step}
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={s.bodyFixed}>{children}</View>
        )}
        {footer && (
          <View style={[s.footer, { backgroundColor: colors.background }]}>
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Choice({
  label,
  detail,
  icon,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, dark } = useApp();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{ selected, checked: selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, focused }) => [
        s.choice,
        {
          backgroundColor: selected ? colors.selected : colors.card,
          borderColor: selected ? GREEN : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
        focused && { outlineColor: GREEN, outlineWidth: 2 },
      ]}
    >
      <Ionicons
        name={icon}
        size={48}
        color={disabled ? colors.muted : colors.text}
      />
      <View style={s.flex}>
        <Label
          style={[
            s.choiceTitle,
            { color: disabled ? colors.muted : colors.text },
          ]}
        >
          {label}
        </Label>
        {detail && (
          <Label
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: colors.muted,
              marginTop: 4,
            }}
          >
            {detail}
          </Label>
        )}
      </View>
      {disabled ? (
        <Label
          style={[
            s.badge,
            { color: colors.muted, backgroundColor: colors.background },
          ]}
        >
          Coming soon
        </Label>
      ) : (
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={30}
          color={selected ? (dark ? GREEN : "#3B6200") : colors.muted}
        />
      )}
    </Pressable>
  );
}
export const s = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center" },
  header: {
    paddingHorizontal: 18,
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { fontFamily: "Anton", fontSize: 24, lineHeight: 32 },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  theme: {
    width: 54,
    height: 44,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    height: 5,
    borderRadius: 9,
    marginHorizontal: 24,
    marginBottom: 24,
    overflow: "hidden",
  },
  body: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 },
  bodyFixed: { flex: 1, paddingHorizontal: 24 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 10 },
  action: {
    minHeight: 60,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    flexDirection: "row",
    gap: 10,
  },
  actionText: { fontFamily: "Anton", fontSize: 22, lineHeight: 30 },
  choice: {
    borderWidth: 1.5,
    borderRadius: 17,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 108,
    marginTop: 12,
  },
  choiceTitle: { fontFamily: "Anton", fontSize: 23, lineHeight: 30 },
  badge: {
    fontSize: 11,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
});
