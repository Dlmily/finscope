import React from "react";

type PrimitiveProps = { children?: React.ReactNode; [key: string]: unknown };
const primitive = (name: string) => ({ children, ...props }: PrimitiveProps) => React.createElement(name, props, children);

export const View = primitive("View");
export const Text = primitive("Text");
export const Pressable = primitive("Pressable");
export const ScrollView = primitive("ScrollView");
export const Switch = primitive("Switch");
export const TextInput = primitive("TextInput");
export const ActivityIndicator = primitive("ActivityIndicator");
export const Modal = primitive("Modal");
export const SafeAreaView = primitive("SafeAreaView");
export const StyleSheet = { create: <T,>(styles: T) => styles, absoluteFill: {} };
export const Platform = { OS: "android" };
export const AppState = { addEventListener: () => ({ remove: () => undefined }) };
class AnimatedValue {
  setValue() {}
  stopAnimation(callback?: () => void) { callback?.(); }
  interpolate() { return 0; }
}
const completedAnimation = { start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }) };
export const Animated = { Value: AnimatedValue, timing: () => completedAnimation, parallel: () => completedAnimation, View };
export const Easing = { out: <T,>(value: T) => value, in: <T,>(value: T) => value, cubic: "cubic" };
export const Alert = { alert: () => undefined };
export const Linking = { openURL: async () => true };
export const useWindowDimensions = () => ({ width: 375, height: 812, scale: 1, fontScale: 1 });
