import { Ionicons } from "@expo/vector-icons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from "@react-navigation/drawer";
import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "../store/authStore";
// Import our existing screens
import Compliance from "../screens/Compliance";
import DashboardScreen from "../screens/DashboardScreen";
import MarkAttendanceScreen from "../screens/MarkAttendanceScreen";
import JobDetailScreen from "../screens/jobs/JobDetailScreen";
// Temporary Placeholders for the screens we are about to build step-by-step
const PlaceholderScreen = ({ route }: any) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="construct-outline" size={64} color="#3B82F6" />
    <Text style={styles.placeholderText}>BUILDING MODULE: {route.name}</Text>
  </View>
);

const Drawer = createDrawerNavigator();

// Futuristic Custom Sidebar UI
function CustomDrawerContent(props: any) {
  const logout = useAuthStore((state) => state.logout);

  return (
    <View style={styles.drawerContainer}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Blended Sleek Dark Header from your previous app + NOVAA Theme */}
        <View style={styles.drawerHeader}>
          <View style={styles.headerOverlay} />
          <View style={styles.logoWrapper}>
            <View style={styles.logoGlow} />
            <View style={styles.logoContainer}>
              {/* Update this path if your logo is somewhere else */}
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.appTitle}>NOVAA FIELD OPERATOR</Text>
        </View>

        {/* Navigation Label */}
        <View style={styles.navSection}>
          <Text style={styles.sectionLabel}>SYSTEM NAVIGATION</Text>
        </View>

        {/* Standard Navigation Links */}
        <View style={styles.linkContainer}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>

      {/* Premium Footer with Status Indicator */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <View style={styles.footerContent}>
          <View style={styles.statusIndicator} />
          <View>
            <Text style={styles.statusText}>Uplink Online</Text>
            <Text style={styles.versionText}>NOVAA OS • Build 1.0.0</Text>
          </View>
        </View>

        {/* Terminate Session Button */}
        <DrawerItem
          label="TERMINATE SESSION"
          labelStyle={styles.logoutText}
          icon={({ size }) => (
            <Ionicons name="power" size={size} color="#EF4444" />
          )}
          onPress={logout}
          style={styles.logoutButton}
        />
      </View>
    </View>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: "#050B14",
          width: 300, // Slightly wider for the new layout
          borderRightWidth: 1,
          borderColor: "rgba(59, 130, 246, 0.2)", // Blue glow border
        },
        drawerActiveBackgroundColor: "rgba(59, 130, 246, 0.15)",
        drawerActiveTintColor: "#60A5FA", // Light Neon Blue
        drawerInactiveTintColor: "#64748B",
        drawerItemStyle: {
          borderRadius: 10,
          marginHorizontal: 12,
          marginVertical: 4,
        },
        drawerLabelStyle: {
          fontSize: 14,
          fontWeight: "700",
          letterSpacing: 1,
        },
      }}
    >
      {/* 1. Job Orders (Current Dashboard) */}
      <Drawer.Screen
        name="JobOrders"
        component={DashboardScreen}
        options={{
          title: "Job Orders",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 5. Connect Device Tracker */}
      <Drawer.Screen
        name="ConnectDevice"
        component={PlaceholderScreen}
        options={{
          title: "Connect Wrist Band",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="bluetooth-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 7. Mark Attendance */}
      <Drawer.Screen
        name="MarkAttendance"
        component={MarkAttendanceScreen}
        options={{
          title: "Mark Attendance",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />

      <Drawer.Screen
        name="JobDetail"
        component={JobDetailScreen}
        options={{
          drawerItemStyle: { display: "none" }, // This hides it from the sidebar!
          headerShown: false,
        }}
      />

      {/* 8. Compliance */}
      <Drawer.Screen
        name="Compliance"
        component={Compliance}
        options={{
          title: "Compliance",
          drawerIcon: ({ color, size }) => (
            <Ionicons
              name="shield-checkmark-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* 9. Change Password */}
      <Drawer.Screen
        name="ChangePassword"
        component={PlaceholderScreen}
        options={{
          title: "Change Password",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="lock-closed-outline" size={size} color={color} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContainer: { flex: 1, backgroundColor: "#050B14" },
  drawerHeader: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 30,
    alignItems: "center",
    backgroundColor: "#0A0F1E",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(59, 130, 246, 0.2)",
    position: "relative",
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1E40AF",
    opacity: 0.05,
  },
  logoWrapper: { position: "relative", marginBottom: 16 },
  logoGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#3B82F6",
    opacity: 0.2,
    top: -10,
    left: -10,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
    zIndex: 1,
  },
  logo: { width: 50, height: 50 },
  appTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  navSection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#475569",
    letterSpacing: 2,
  },
  linkContainer: { paddingBottom: 20 },
  footer: { padding: 16, paddingBottom: Platform.OS === "ios" ? 40 : 20 },
  footerDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 12,
    shadowColor: "#10B981",
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statusText: { fontSize: 12, fontWeight: "bold", color: "#E2E8F0" },
  versionText: {
    fontSize: 10,
    color: "#475569",
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  logoutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    marginTop: 10,
  },
  logoutText: { color: "#EF4444", fontWeight: "bold", letterSpacing: 1 },

  // Styles for the temporary placeholders
  placeholderContainer: {
    flex: 1,
    backgroundColor: "#050B14",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#64748B",
    marginTop: 16,
    fontWeight: "bold",
    letterSpacing: 2,
  },
});
