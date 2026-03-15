import React from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAuth } from "../../src/providers/AuthProvider";
import { Header } from "../../src/components";

function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons
        name={name}
        size={19}
        color={focused ? "#FFFFFF" : "rgba(255,255,255,0.82)"}
      />
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: true,
        header: ({ route }) => (
          <Header
            title={
              route.name === "home"
                ? "Patient Roster"
                : route.name === "new-visit"
                  ? "New Visit"
                  : route.name === "ai-chat"
                    ? "AI Doctor Chat"
                    : route.name === "dashboard"
                      ? "Community Dashboard"
                      : route.name === "doctor-chat"
                        ? "Doctor Support"
                        : "Stethoscan"
            }
            subtitle={
              route.name === "home"
                ? "Manage and prioritize all patients"
                : route.name === "new-visit"
                  ? "Select a patient and begin screening"
                  : route.name === "ai-chat"
                    ? "AI assistant for clinical support"
                    : route.name === "dashboard"
                      ? "Population trends and outbreak alerts"
                      : route.name === "doctor-chat"
                        ? "Coordinate referrals and calls"
                        : undefined
            }
          />
        ),
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView
            tint="dark"
            intensity={48}
            style={StyleSheet.absoluteFillObject}
          />
        ),
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Patients",
          tabBarAccessibilityLabel: "Patients tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="people-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="new-visit"
        options={{
          title: "New Visit",
          tabBarAccessibilityLabel: "New Visit tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="add-circle-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarAccessibilityLabel: "Dashboard tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="stats-chart-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: "AI Chat",
          tabBarAccessibilityLabel: "AI Doctor Chat tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chatbubble-ellipses-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="doctor-chat"
        options={{
          title: "Doctor",
          tabBarAccessibilityLabel: "Doctor tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chatbox-ellipses-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="lung-check" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 78,
    paddingTop: 9,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(4, 44, 83, 0.66)",
    shadowColor: "#001834",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
    position: "absolute",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
});
