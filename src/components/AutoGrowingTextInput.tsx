import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Platform, TextInput } from "react-native";

type InputInstance = React.ComponentRef<typeof TextInput>;
type Props = React.ComponentProps<typeof TextInput> & {
  inputRef?: (input: InputInstance | null) => void;
  minimumHeight?: number;
};

/** Expands the editor so the page, rather than a nested textarea, scrolls. */
export function AutoGrowingTextInput({ inputRef, minimumHeight = 112, style, onContentSizeChange, onLayout, ...props }: Props) {
  const input = useRef<InputInstance | null>(null);
  const [height, setHeight] = useState(minimumHeight);
  const measureWeb = useCallback(() => {
    if (Platform.OS !== "web" || !input.current) return;
    const element = input.current as unknown as HTMLTextAreaElement;
    // Reset before measuring so shortening a caption also shrinks the editor.
    element.style.height = "0px";
    element.style.height = `${Math.max(minimumHeight, element.scrollHeight + 2)}px`;
  }, [minimumHeight]);
  useLayoutEffect(() => { measureWeb(); }, [props.value, measureWeb]);
  return <TextInput {...props} ref={element => { input.current = element; inputRef?.(element); }} multiline scrollEnabled={false}
    onContentSizeChange={event => {
      if (Platform.OS === "web") measureWeb();
      else setHeight(Math.max(minimumHeight, Math.ceil(event.nativeEvent.contentSize.height) + 2));
      onContentSizeChange?.(event);
    }}
    onLayout={event => { measureWeb(); onLayout?.(event); }}
    style={[style, { minHeight: minimumHeight }, Platform.OS !== "web" && { height }]} />;
}
