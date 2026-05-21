import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import apiClient from "../api/client";
const SERVER_BASE = "https://app.sowashusa.com";

import { useAuthStore } from "../store/authStore";

interface Job {
  id: number;
  site_name: string;
  job_id?: number | string;
  location: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_date: string;
  scheduled_time: string;
  has_diagram: boolean;
  diagram_id: number | null;
}

export default function DashboardScreen({ navigation }: any) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // 🚀 1. Check for offline data when dashboard opens
  useFocusEffect(
    React.useCallback(() => {
      const checkOfflineQueue = async () => {
        try {
          const stored = await AsyncStorage.getItem("@sowash_offline_queue");
          if (stored) {
            setOfflineQueue(JSON.parse(stored));
          }
        } catch (e) {}
      };
      checkOfflineQueue();
    }, []),
  );

  // 🚀 2. The Master Sync Function
  const processOfflineQueue = async () => {
    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) {
      Toast.show({
        type: "error",
        text1: "Still Offline",
        text2: "Connect to internet to sync.",
      });
      return;
    }
    if (offlineQueue.length === 0) return;

    setIsSyncing(true);
    const token = await SecureStore.getItemAsync("userToken");
    let remainingQueue = [...offlineQueue];

    for (const action of offlineQueue) {
      try {
        if (action.type === "EVENT") {
          const res = await fetch(
            `${SERVER_BASE}/api/mideast/jobs/${action.jobId}/event`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(action.payload),
            },
          );
          if (!res.ok) throw new Error(await res.text());
        } else if (action.type === "PHOTO") {
          const form = new FormData();
          form.append("photo", {
            uri: action.payload.uri,
            type: "image/jpeg",
            name: action.payload.name,
          } as any);
          form.append("point_id", action.payload.point_id);
          form.append("photo_type", action.payload.photo_type);
          form.append("taken_at", action.payload.taken_at);
          const res = await fetch(
            `${SERVER_BASE}/api/mideast/point-photos/job/${action.jobId}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          );
          if (!res.ok) throw new Error(await res.text());
        } else if (action.type === "ANNOTATION") {
          const res = await fetch(
            `${SERVER_BASE}/api/mideast/fo-annotations/job/${action.jobId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(action.payload),
            },
          );
          if (!res.ok) throw new Error(await res.text());
        } else if (action.type === "TPT") {
          const form = new FormData();
          form.append("photo", {
            uri: action.payload.uri,
            type: "image/jpeg",
            name: "tpt.jpg",
          } as any);
          form.append("taken_at", action.payload.taken_at);
          const res = await fetch(
            `${SERVER_BASE}/api/mideast/jobs/${action.jobId}/tpt-photo`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          );
          if (!res.ok) throw new Error(await res.text());
        } else if (action.type === "FSR") {
          const form = new FormData();
          form.append("signature", {
            uri: action.payload.signatureUri,
            type: "image/png",
            name: "signature.png",
          } as any);
          form.append(
            "panels_cleaned",
            String(action.payload.panels_cleaned || "0"),
          );
          form.append("observations", action.payload.observations || "");
          form.append("work_done", action.payload.work_done || "");
          form.append("submitted_at", action.payload.submitted_at || "");
          form.append("cable_condition", action.payload.cable_condition || "");
          form.append("cable_quantity", action.payload.cable_quantity || "");
          form.append("panel_damage", action.payload.panel_damage || "");
          form.append("panel_brand", action.payload.panel_brand || "");
          form.append("inverter_alarm", action.payload.inverter_alarm || "");
          form.append("alarm_code", action.payload.alarm_code || "");
          form.append(
            "potential_shading",
            action.payload.potential_shading || "",
          );
          form.append("shading_details", action.payload.shading_details || "");
          form.append("rusting", String(action.payload.rusting || "false"));
          form.append(
            "bird_dropping",
            String(action.payload.bird_dropping || "false"),
          );
          form.append(
            "mos_and_debris",
            String(action.payload.mos_and_debris || "false"),
          );
          form.append("earthing", String(action.payload.earthing || "false"));
          const res = await fetch(
            `${SERVER_BASE}/api/mideast/fsrs/job/${action.jobId}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          );
          // 409 = already submitted (synced twice) → treat as success, remove from queue
          if (!res.ok && res.status !== 409) throw new Error(await res.text());
        }

        // ✅ Remove from queue on success and persist immediately
        remainingQueue = remainingQueue.filter((q) => q.id !== action.id);
        setOfflineQueue(remainingQueue);
        await AsyncStorage.setItem(
          "@sowash_offline_queue",
          JSON.stringify(remainingQueue),
        );
      } catch (e: any) {
        console.error("Sync failed for action:", action.id, e.message);
        // Don't break the loop — try remaining items
      }
    }

    setIsSyncing(false);

    if (remainingQueue.length === 0) {
      Toast.show({
        type: "success",
        text1: "Sync Complete!",
        text2: "All offline data uploaded.",
      });
    } else {
      Toast.show({
        type: "info",
        text1: "Partial Sync",
        text2: `${remainingQueue.length} items failed. Will retry.`,
      });
    }
  };

  const userName = useAuthStore((state) => state.userName);

  const fetchJobs = async () => {
    try {
      const response = await apiClient.get("/jobs/fo"); // Adjusted to SOW route
      console.log(
        "DASHBOARD API RESPONSE:",
        JSON.stringify(response.data, null, 2),
      );
      setJobs(response.data.jobs || response.data || []);
    } catch (error) {
      console.warn("Backend fetch failed. Displaying empty queue.", error);
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchJobs();
  }, []);

  // 👇 UPDATED: Matches exact Mideast App status colors from SOW
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#22D3A5"; // Success Green
      case "in_progress":
        return "#F59E0B"; // Warning Gold
      case "cancelled":
        return "#EF4444"; // Danger Red
      case "scheduled":
      default:
        return "#0EA5E9"; // Accent Blue
    }
  };

  const formatDate = (dateStr: string, timeStr: string) => {
    if (!dateStr) return "TBD";
    const datePart = new Date(dateStr).toLocaleDateString();
    return timeStr ? `${datePart} | ${timeStr.substring(0, 5)}` : datePart;
  };

  const renderJobCard = ({ item }: { item: Job }) => {
    // 1. Create safe fallbacks for missing data
    const safeStatus = item?.status || "scheduled"; // Default to scheduled if missing
    const safeId = item?.id || item?.job_id || "N/A"; // Check both id and job_id
    const safeSiteName = item?.site_name || "Unknown Site";
    const safeLocation = item?.location || "Location Not Specified";

    return (
      <BlurView intensity={20} tint="dark" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.jobId}>JOB #{safeId}</Text>
          <View
            style={[
              styles.statusBadge,
              { borderColor: getStatusColor(safeStatus) },
            ]}
          >
            <Text
              style={[styles.statusText, { color: getStatusColor(safeStatus) }]}
            >
              {safeStatus.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.jobTitle}>{safeSiteName}</Text>
        <Text style={styles.jobLocation}>
          <Ionicons name="location-outline" size={12} color="#94A3B8" />{" "}
          {safeLocation}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.jobDate}>
            {formatDate(item?.scheduled_date, item?.scheduled_time)}
          </Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("JobDetail", { jobId: safeId })}
          >
            <Text
              style={[
                styles.actionButtonText,
                { color: getStatusColor(safeStatus) },
              ]}
            >
              View Details
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={getStatusColor(safeStatus)}
            />
          </TouchableOpacity>
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
        {/* Top Nav */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.openDrawer()}
            style={styles.menuButton}
          >
            <Ionicons name="menu" size={28} color="#0EA5E9" />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              WELCOME, {userName ? userName.toUpperCase() : "OPERATOR"}
            </Text>
            <Text style={styles.headerSubtitle}>ACTIVE QUEUE</Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        {/* 🔄 Offline Sync Banner */}
        {offlineQueue.length > 0 && (
          <TouchableOpacity
            onPress={processOfflineQueue}
            disabled={isSyncing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F59E0B",
              padding: 12,
              marginHorizontal: 16,
              marginTop: 8,
              borderRadius: 12,
            }}
          >
            {isSyncing ? (
              <ActivityIndicator color="#080C18" />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload"
                  size={20}
                  color="#080C18"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: "#080C18", fontWeight: "bold" }}>
                  TAP TO SYNC {offlineQueue.length} PENDING ITEMS
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0EA5E9" />
            <Text style={styles.loadingText}>SYNCING SATELLITE DATA...</Text>
          </View>
        ) : (
          <FlatList
            data={jobs}
            // 👇 FIX: Safely check for item.id, fallback to index if missing
            keyExtractor={(item, index) =>
              item?.id ? item.id.toString() : index.toString()
            }
            renderItem={renderJobCard}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0EA5E9"
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={64}
                  color="#0EA5E9"
                />
                <Text style={styles.emptyText}>NO ACTIVE JOBS ASSIGNED</Text>
              </View>
            }
          />
        )}
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
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 20 : 0,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.2)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
    textShadowColor: "#F59E0B",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 4,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  listContainer: { padding: 20, paddingBottom: 100 },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  jobId: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  jobLocation: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 20,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  jobDate: {
    color: "#64748B",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.5)",
  },
  actionButtonText: {
    color: "#F59E0B",
    fontWeight: "bold",
    marginRight: 4,
    letterSpacing: 1,
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 100,
  },
  loadingText: {
    color: "#F59E0B",
    marginTop: 16,
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyText: {
    color: "#3B82F6",
    marginTop: 16,
    letterSpacing: 2,
    fontWeight: "bold",
  },

  menuButton: {
    padding: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },

  headerTextContainer: {
    alignItems: "center", // Centers the text block
  },
});
