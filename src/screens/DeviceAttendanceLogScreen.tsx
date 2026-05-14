import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ShiftRecord {
  name: string;
  clockIn: string | null; // Latest clock in
  clockOut: string | null; // Latest clock out
  status: string;
  accumulatedMs: number; // Sum of previous completed segments
}

export default function DeviceAttendanceLogScreen({ navigation }: any) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [now, setNow] = useState(Date.now());

  // 🚀 Live Timer: Updates the screen every minute so active shifts actively tick up!
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAndGroupLogs();
    }, []),
  );

  const loadAndGroupLogs = async () => {
    try {
      const existing = await AsyncStorage.getItem("@device_scan_ledger");
      if (!existing) return;

      const rawLogs = JSON.parse(existing);

      // Sort logs from oldest to newest to build the timeline accurately
      const sortedLogs = rawLogs.sort(
        (a: any, b: any) =>
          new Date(a.time).getTime() - new Date(b.time).getTime(),
      );

      // 🚀 MASTER CARD LOGIC: One record per user
      const userRecords: { [key: string]: ShiftRecord } = {};

      sortedLogs.forEach((log: any) => {
        // Initialize the user if they don't exist yet
        if (!userRecords[log.name]) {
          userRecords[log.name] = {
            name: log.name,
            clockIn: null,
            clockOut: null,
            status: "MISSING IN-PUNCH",
            accumulatedMs: 0,
          };
        }

        const user = userRecords[log.name];

        if (log.action === "clock_in") {
          // They are clocking back in!
          user.clockIn = log.time;
          user.clockOut = null; // Clear the out punch
          user.status = "ON DUTY";
        } else if (log.action === "clock_out") {
          // They are clocking out! Calculate duration of this specific segment
          if (user.clockIn) {
            const segmentMs =
              new Date(log.time).getTime() - new Date(user.clockIn).getTime();
            user.accumulatedMs += segmentMs; // Save the time to their total!
          }
          user.clockOut = log.time;
          user.status = "SHIFT COMPLETE";
        }
      });

      // Convert the dictionary back to an array and sort by most recent activity
      const finalShifts = Object.values(userRecords).sort((a, b) => {
        const timeA = new Date(a.clockIn || a.clockOut || 0).getTime();
        const timeB = new Date(b.clockIn || b.clockOut || 0).getTime();
        return timeB - timeA;
      });

      setShifts(finalShifts);
    } catch (e) {
      console.error("Failed to load and group logs");
    }
  };

  const clearLogs = async () => {
    await AsyncStorage.removeItem("@device_scan_ledger");
    setShifts([]);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "--:--";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return "--:--";
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Unknown Date";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Karachi",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(iso));
    } catch {
      return "Unknown Date";
    }
  };

  // 🚀 Dynamically calculates total time including previous segments + live active time
  const getAccumulatedDuration = (item: ShiftRecord) => {
    let totalMs = item.accumulatedMs || 0;

    // If they are currently ON DUTY, add the time since their latest Clock In
    if (item.clockIn && !item.clockOut) {
      totalMs += now - new Date(item.clockIn).getTime();
    }

    if (totalMs <= 0) return "--";
    const m = Math.floor(totalMs / 60000);
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const renderItem = ({ item }: { item: ShiftRecord }) => {
    const isActive = item.clockIn && !item.clockOut;
    const duration = getAccumulatedDuration(item);

    const borderColor = isActive
      ? "rgba(16, 185, 129, 0.4)"
      : "rgba(255, 255, 255, 0.1)";
    const statusText = isActive ? "ON DUTY" : "SHIFT COMPLETE";
    const statusColor = isActive ? "#10B981" : "#94A3B8";

    return (
      <BlurView
        intensity={20}
        tint="dark"
        style={[styles.card, { borderColor }]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.nameRow}>
            <Ionicons
              name="person-circle"
              size={24}
              color="#0EA5E9"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.name}>{item.name.toUpperCase()}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: `rgba(${statusColor.replace("#", "")}, 0.15)`,
              },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          LATEST ACTIVITY: {formatDate(item.clockIn || item.clockOut)}
        </Text>

        <View style={styles.timeGrid}>
          <View style={styles.timeColumn}>
            <View style={styles.timeLabelRow}>
              <Ionicons
                name="log-in"
                size={14}
                color="#10B981"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.timeLabel}>LATEST PUNCH IN</Text>
            </View>
            <Text style={styles.timeValue}>{formatTime(item.clockIn)}</Text>
          </View>

          <View style={styles.timeDivider} />

          <View style={styles.timeColumn}>
            <View style={styles.timeLabelRow}>
              <Ionicons
                name="log-out"
                size={14}
                color="#EF4444"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.timeLabel}>LATEST PUNCH OUT</Text>
            </View>
            <Text style={styles.timeValue}>{formatTime(item.clockOut)}</Text>
          </View>
        </View>

        <View style={styles.durationFooter}>
          <Text style={styles.durationLabel}>
            TOTAL WORK TIME (ACCUMULATED):
          </Text>
          <Text
            style={[styles.durationValue, isActive && { color: "#10B981" }]}
          >
            {duration}
          </Text>
        </View>
      </BlurView>
    );
  };

  return (
    <LinearGradient
      colors={["#080C18", "#0D1120", "#080C18"]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#0EA5E9" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>DEVICE LEDGER</Text>
            <Text style={styles.headerSubtitle}>LOCAL SHIFT RECORDS</Text>
          </View>
          <TouchableOpacity onPress={clearLogs} style={styles.backBtn}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={shifts}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons
                name="document-text-outline"
                size={48}
                color="#1E2A45"
              />
              <Text style={styles.emptyText}>NO SHIFTS RECORDED YET</Text>
            </View>
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 20 : 0,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(14, 165, 233, 0.2)",
  },
  backBtn: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  headerTextContainer: { alignItems: "center" },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 1,
  },
  listContainer: { padding: 20, paddingBottom: 60 },

  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(5, 11, 20, 0.5)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { fontSize: 18, fontWeight: "900", color: "#F8FAFC", letterSpacing: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  dateText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
    marginBottom: 20,
    marginLeft: 32,
    letterSpacing: 0.5,
  },

  timeGrid: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
  },
  timeColumn: { flex: 1 },
  timeLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  timeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1,
  },
  timeValue: { fontSize: 16, fontWeight: "700", color: "#F8FAFC" },
  timeDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 16,
  },

  durationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  durationLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1,
  },
  durationValue: { fontSize: 18, fontWeight: "900", color: "#0EA5E9" },

  emptyBox: { alignItems: "center", marginTop: 100 },
  emptyText: {
    color: "#94A3B8",
    marginTop: 16,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
