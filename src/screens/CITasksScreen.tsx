import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use our new global API client
import apiClient from '../api/client';

interface Job {
  id: number;
  schedule_id: number;
  site_name: string;
  client_name: string;
  address: string;
  city: string;
  scheduled_date: string;
  service_number: number;
  status: 'scheduled' | 'started' | 'before_photos' | 'after_photos' | 'completed';
  system_size: number | string;
  shift?: string;
}

const STORAGE_KEY = '@offline_ci_jobs';

export default function CITasksScreen({ navigation }: any) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'today' | 'upcoming' | 'all'>('today');
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/fo-schedules/my-assigned-jobs`);
      const fresh: Job[] = res.data.jobs || [];
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      setJobs(fresh);
      setIsOfflineMode(false);
    } catch (error) {
      const cachedData = await AsyncStorage.getItem(STORAGE_KEY);
      const cached: Job[] = cachedData ? JSON.parse(cachedData) : [];
      
      if (cached.length) {
        setJobs(cached);
        setIsOfflineMode(true);
        Toast.show({
          type: 'info',
          text1: 'SYSTEM OFFLINE',
          text2: 'Displaying locally cached tasks.',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'UPLINK FAILED',
          text2: 'No local data. Reconnect to satellite.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  const filteredJobs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    switch (filterStatus) {
      case 'today':
        return jobs.filter((j) => j.scheduled_date.split('T')[0] === today);
      case 'upcoming':
        return jobs.filter((j) => j.scheduled_date.split('T')[0] > today);
      default:
        return jobs;
    }
  }, [jobs, filterStatus]);

  const handleJobAction = (job: Job) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const today = new Date().toISOString().split('T')[0];
    const scheduled = job.scheduled_date.split('T')[0];
    
    if (scheduled > today) {
      Toast.show({
        type: 'info',
        text1: 'TIMELOCK ACTIVE',
        text2: `Task scheduled for ${new Date(job.scheduled_date).toLocaleDateString()}`,
      });
      return;
    }

    // Upgraded Navigation: Replaces Expo Router's router.push()
    navigation.navigate('CITasksDetail', {
      jobId: job.id,
      scheduleId: job.schedule_id,
    });
  };

  const getStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'scheduled': return '#3B82F6'; // Neon Blue
      case 'started': return '#F59E0B'; // Solar Orange
      case 'before_photos': return '#8B5CF6'; // Purple
      case 'after_photos': return '#EC4899'; // Pink
      case 'completed': return '#10B981'; // Neon Green
      default: return '#94A3B8';
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>SYNCING C&I DATABASE...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton}>
            <Ionicons name="menu" size={28} color="#F59E0B" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>C&I TASKS</Text>
            <Text style={styles.headerSubtitle}>
              {filteredJobs.length} TASK{filteredJobs.length !== 1 ? 'S' : ''} DETECTED
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Ionicons name="sync" size={24} color="#3B82F6" />
          </TouchableOpacity>
        </View>

        {isOfflineMode && (
          <View style={styles.offlineBanner}>
            <Ionicons name="warning-outline" size={14} color="#EF4444" />
            <Text style={styles.offlineText}>SYSTEM OFFLINE — LOCAL DATA ONLY</Text>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filterContainer}>
          {(['today', 'upcoming', 'all'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterStatus(k);
              }}
              style={[
                styles.filterTab,
                filterStatus === k && styles.filterTabActive,
              ]}
            >
              <Text style={[styles.filterTabText, filterStatus === k && styles.filterTabTextActive]}>
                {k.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
        >
          {filteredJobs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="shield-checkmark-outline" size={64} color="#3B82F6" />
              <Text style={styles.emptyTitle}>NO ASSIGNMENTS</Text>
              <Text style={styles.emptySubtitle}>Your queue is currently clear.</Text>
            </View>
          ) : (
            filteredJobs.map((job) => (
              <BlurView intensity={20} tint="dark" style={styles.jobCard} key={job.id}>
                <View style={styles.jobHeader}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.siteName}>{job.site_name}</Text>
                    <Text style={styles.clientName}>{job.client_name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: getStatusColor(job.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(job.status) }]}>
                      {job.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={14} color="#94A3B8" />
                  <Text style={styles.infoText} numberOfLines={1}>{job.address}, {job.city}</Text>
                </View>

                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#3B82F6" />
                    <Text style={styles.detailText}>{new Date(job.scheduled_date).toLocaleDateString()}</Text>
                  </View>

                  {!!job.shift && (
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={14} color="#10B981" />
                      <Text style={styles.detailText}>{job.shift}</Text>
                    </View>
                  )}

                  {Number(job.system_size) > 0 && (
                    <View style={styles.detailItem}>
                      <Ionicons name="flash-outline" size={14} color="#F59E0B" />
                      <Text style={styles.detailText}>{job.system_size} kW</Text>
                    </View>
                  )}
                  
                  <View style={styles.detailItem}>
                    <Ionicons name="barcode-outline" size={14} color="#8B5CF6" />
                    <Text style={styles.detailText}>#{job.service_number}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.actionButton} onPress={() => handleJobAction(job)}>
                 <Text style={styles.actionButtonText}>
                    {job.status === 'scheduled' ? 'Start Job' : job.status === 'completed' ? 'View Report' : 'Continue'}
                </Text>
                  <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                </TouchableOpacity>
              </BlurView>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 14, color: '#F59E0B', fontWeight: 'bold', letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 0, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(59, 130, 246, 0.2)' },
  menuButton: { padding: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  headerTextContainer: { alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 3, textShadowColor: '#3B82F6', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  headerSubtitle: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 4, letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  refreshButton: { padding: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#EF4444' },
  offlineText: { color: '#FECACA', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  filterContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  filterTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  filterTabActive: { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: '#3B82F6' },
  filterTabText: { fontSize: 12, fontWeight: '700', color: '#64748B', letterSpacing: 1 },
  filterTabTextActive: { color: '#60A5FA' },
  
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginTop: 16, letterSpacing: 2 },
  emptySubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  
  jobCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  siteName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  clientName: { fontSize: 12, fontWeight: '600', color: '#94A3B8', letterSpacing: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  infoText: { fontSize: 12, color: '#CBD5E1', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', flex: 1 },
  
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  detailText: { fontSize: 11, fontWeight: 'bold', color: '#E2E8F0' },
  
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)' },
  actionButtonText: { fontSize: 12, fontWeight: '900', color: '#F59E0B', marginRight: 8, letterSpacing: 2 },
});