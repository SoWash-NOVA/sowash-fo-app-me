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
import DeviceHistory from "../screens/DeviceAttendanceLogScreen";
import MarkAttendanceScreen from "../screens/MarkAttendanceScreen";
import JobDetailScreen from "../screens/jobs/JobDetailScreen";

// Temporary Placeholders
const PlaceholderScreen = ({ route }: any) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="construct-outline" size={64} color="#0EA5E9" />
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
        <View style={styles.drawerHeader}>
          <View style={styles.headerOverlay} />
          <View style={styles.logoWrapper}>
            <View style={styles.logoGlow} />
            <View style={styles.logoContainer}>
              {/* Ensure this path matches your logo location! */}
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.appTitle}>NOVAA FIELD OPERATOR</Text>
        </View>

        <View style={styles.navSection}>
          <Text style={styles.sectionLabel}>SYSTEM NAVIGATION</Text>
        </View>

        <View style={styles.linkContainer}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <View style={styles.footerContent}>
          <View style={styles.statusIndicator} />
          <View>
            <Text style={styles.statusText}>Uplink Online</Text>
            <Text style={styles.versionText}>NOVAA OS • Build 1.0.0</Text>
          </View>
        </View>

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
          width: 300,
          borderRightWidth: 1,
          borderColor: "rgba(14, 165, 233, 0.2)",
        },
        drawerActiveBackgroundColor: "rgba(14, 165, 233, 0.15)",
        drawerActiveTintColor: "#0EA5E9",
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
      {/* 1. Job Orders */}
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

      {/* 2. Mark Attendance */}
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

      {/* 3. Device Ledger / History (NEW!) */}
      <Drawer.Screen
        name="DeviceHistory"
        component={DeviceHistory}
        options={{
          title: "Local Scan Ledger",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 4. Compliance */}
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

      {/* 5. Connect Device */}
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

      {/* 6. Change Password */}
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

      {/* HIDDEN SCREENS (No display in sidebar) */}
      <Drawer.Screen
        name="JobDetail"
        component={JobDetailScreen}
        options={{
          drawerItemStyle: { display: "none" }, // Hidden!
        }}
      />
    </Drawer.Navigator>
  );
}

// ── MISSING STYLES RE-ADDED ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080C18",
  },
  placeholderText: {
    color: "#0EA5E9",
    marginTop: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  drawerContainer: { flex: 1, backgroundColor: "#050B14" },
  drawerHeader: {
    padding: 20,
    paddingTop: Platform.OS === "android" ? 50 : 40,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(14, 165, 233, 0.2)",
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(14, 165, 233, 0.05)",
  },
  logoWrapper: { position: "relative", marginBottom: 16 },
  logoGlow: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    backgroundColor: "rgba(14, 165, 233, 0.2)",
    borderRadius: 50,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#080C18",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.5)",
  },
  logo: { width: 50, height: 50 },
  appTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },

  navSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  linkContainer: { paddingHorizontal: 8 },

  footer: { padding: 20, paddingBottom: Platform.OS === "android" ? 30 : 40 },
  footerDivider: {
    height: 1,
    backgroundColor: "rgba(14, 165, 233, 0.2)",
    marginBottom: 20,
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 12,
    shadowColor: "#10B981",
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statusText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  versionText: { color: "#64748B", fontSize: 10, marginTop: 2 },

  logoutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  logoutText: { color: "#EF4444", fontWeight: "800", letterSpacing: 1 },
});
