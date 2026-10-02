import React from "react";

type PrimitiveProps = { children?: React.ReactNode; [key: string]: unknown };
const primitive = (name: string) => ({ children, ...props }: PrimitiveProps) => React.createElement(name, props, children);

export const MaterialCommunityIcons = primitive("MaterialCommunityIcons");
export const StatusBar = primitive("StatusBar");
export const Svg = primitive("Svg");
export const Polyline = primitive("Polyline");
export const Line = primitive("Line");
export const Path = primitive("Path");
export const Rect = primitive("Rect");
export const Circle = primitive("Circle");
export default Svg;
