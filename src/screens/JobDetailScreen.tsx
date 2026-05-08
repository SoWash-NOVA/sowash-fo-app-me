import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

// Assuming you have your standard apiClient setup
import apiClient from '../api/client';

export default function JobDetailScreen({ route, navigation }: any) {
  // Extract the jobId passed from the Dashboard's "Start Job" / "View" button
  const { jobId } = route.params || {};

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startingJob, setStartingJob] = useState(false);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    } else {
      Alert.alert("Error", "No Job ID provided.");
      navigation.goBack();
    }
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/mideast/jobs/${jobId}`);
      // Assuming your backend returns { success: true, data: { ...jobDetails } }
      setJob(response.data.data || response.data); 
    } catch (error: any) {
      console.error("Job Fetch Error:", error);
      Toast.show({
        type: 'error',
        text1: 'Sync Error',
        text2: 'Could not load job details. Check connection.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartJob = async () => {
    try {
      setStartingJob(true);
      
      // 1. Mark job as in_progress on the server
      await apiClient.patch(`/mideast/jobs/${jobId}/status`, {
        status: 'in_progress'
      });

      Toast.show({
        type: 'success',
        text1: 'System Activated',
        text2: 'Job marked as In Progress.',
      });

      // 2. Navigate to the Diagram Before Screen (we will build this next)
      // navigation.navigate('DiagramBefore', { jobId, siteId: job.site_id });
      Alert.alert("Success", "Navigating to Diagram Before Screen... (Next Step!)");
      
    } catch (error: any) {
      console.error("Status Update Error:", error);
      Toast.show({
        type: 'error',
        text1: 'Action Failed',
        text2: 'Could not start the job. Please try again.',
      });
    } finally {
      setStartingJob(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#080C18', '#0D1120']} style={styles.centered}>
        <ActivityIndicator size="large" color="#0EA5E9" />
        <Text style={styles.loadingText}>DECRYPTING JOB DATA...</Text>
      </LinearGradient>
    );
  }

  if (!job) return null;

  return (
    <LinearGradient colors={['#080C18', '#0D1120']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0EA5E9" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>MISSION BRIEF</Text>
            <Text style={styles.headerSubtitle}>JOB #{job.id || jobId}</Text>
          </View>
          <View style={{ width: 40 }} /> {/* Spacer for alignment */}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Site & Client Details Card */}
          <BlurView intensity={30} tint="dark" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="business" size={20} color="#0EA5E9" />
              <Text style={styles.cardTitle}>SITE PROTOCOL</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Site Name:</Text>
              <Text style={styles.value}>{job.site_name || 'Al-Maktoum Solar Park'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Client:</Text>
              <Text style={styles.value}>{job.client_name || 'Apex Energy Solutions'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Scheduled:</Text>
              <Text style={styles.value}>{job.scheduled_date || '2026-06-15'}</Text>
            </View>
          </BlurView>

          {/* Team Members Card */}
          <BlurView intensity={30} tint="dark" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="people" size={20} color="#0EA5E9" />
              <Text style={styles.cardTitle}>OPERATIVE TEAM</Text>
            </View>
            <Text style={styles.value}>
              {job.team_members ? job.team_members.join(', ') : 'Saad (Lead), Ali, Usman'}
            </Text>
          </BlurView>

          {/* Admin Notes (CRITICAL ALERT) */}
          <BlurView intensity={30} tint="dark" style={[styles.card, styles.alertCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning" size={20} color="#F59E0B" />
              <Text style={[styles.cardTitle, { color: '#F59E0B' }]}>COMMANDER NOTES</Text>
            </View>
            <Text style={styles.alertText}>
              {job.admin_notes || "ATTENTION: Pins 4 and 7 have reported Low PR. Verify string connections before washing. Ensure heavy dust removal on Row B."}
            </Text>
          </BlurView>

        </ScrollView>

        {/* Bottom CTA Bar */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity 
            style={[styles.startBtn, startingJob && styles.startBtnDisabled]} 
            onPress={handleStartJob}
            disabled={startingJob}
          >
            {startingJob ? (
              <ActivityIndicator color="#080C18" />
            ) : (
              <>
                <Text style={styles.startBtnText}>INITIATE WASH CYCLE</Text>
                <Ionicons name="rocket" size={20} color="#080C18" />
              </>
            )}
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#0EA5E9', marginTop: 16, letterSpacing: 2, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  safeArea: { flex: 1 },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1E2A45' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(14, 165, 233, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)' },
  headerTextContainer: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#F1F5F9', letterSpacing: 2 },
  headerSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4, letterSpacing: 1 },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  card: { backgroundColor: 'rgba(13, 17, 32, 0.7)', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1E2A45', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1E2A45', paddingBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#0EA5E9', marginLeft: 8, letterSpacing: 1 },
  
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
  value: { fontSize: 14, color: '#F1F5F9', fontWeight: 'bold', flex: 1, textAlign: 'right', marginLeft: 20 },
  
  alertCard: { borderColor: 'rgba(245, 158, 11, 0.4)', backgroundColor: 'rgba(245, 158, 11, 0.05)' },
  alertText: { fontSize: 14, color: '#F1F5F9', lineHeight: 22 },

  ctaContainer: { padding: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1E2A45', backgroundColor: '#0D1120' },
  startBtn: { flexDirection: 'row', backgroundColor: '#22D3A5', paddingVertical: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#22D3A5', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  startBtnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0 },
  startBtnText: { color: '#080C18', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});