import React, { useState } from "react";
import {
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  ViewStyle,
} from "react-native";
type Props = Omit<PressableProps, "style"> & {
  style?:
    | StyleProp<ViewStyle>
    | ((
        state: PressableStateCallbackType & { focused: boolean },
      ) => StyleProp<ViewStyle>);
};
// React Native's callback exposes `pressed`; keep keyboard focus explicit on native and web.
export function FocusPressable({ style, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={(state) =>
        typeof style === "function" ? style({ ...state, focused }) : style
      }
    />
  );
}
