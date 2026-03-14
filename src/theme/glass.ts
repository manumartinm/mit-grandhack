import { colors } from "./colors";

export const glass = {
  surface: {
    default: "rgba(255, 255, 255, 0.58)",
    elevated: "rgba(255, 255, 255, 0.7)",
    nav: "rgba(4, 44, 83, 0.84)",
  },
  border: {
    default: "rgba(255, 255, 255, 0.34)",
    strong: "rgba(255, 255, 255, 0.5)",
  },
  shadow: {
    color: colors.palette.navyBase,
    opacity: 0.14,
    radius: 18,
    offsetY: 8,
    elevation: 8,
  },
} as const;
