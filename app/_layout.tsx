import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet } from "react-native";
import "../src/i18n";
import { loadApiUrl } from "../src/config/api";
import AppProvider from "../src/providers/AppProvider";
import { OfflineBanner } from "../src/components";
import { useReducedMotion } from "react-native-reanimated";

export default function RootLayout() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    loadApiUrl();
  }, []);

  return (
    <AppProvider>
      <View style={styles.container}>
        <StatusBar style="dark" />
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FFFFFF" },
            animation: reduceMotion ? "none" : "slide_from_right",
          }}
        />
      </View>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
