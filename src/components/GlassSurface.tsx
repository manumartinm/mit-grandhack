import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { glass } from "../theme/glass";
import { radius } from "../theme/spacing";

interface GlassSurfaceProps extends ViewProps {
  elevated?: boolean;
  rounded?: keyof typeof radius;
}

export function GlassSurface({
  elevated = false,
  rounded = "lg",
  style,
  children,
  ...props
}: GlassSurfaceProps) {
  return (
    <View
      style={[
        styles.base,
        elevated && styles.elevated,
        { borderRadius: radius[rounded] },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: glass.surface.default,
    borderWidth: 1,
    borderColor: glass.border.default,
  },
  elevated: {
    backgroundColor: glass.surface.elevated,
    shadowColor: glass.shadow.color,
    shadowOffset: { width: 0, height: glass.shadow.offsetY },
    shadowOpacity: glass.shadow.opacity,
    shadowRadius: glass.shadow.radius,
    elevation: glass.shadow.elevation,
  },
});
