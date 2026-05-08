import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
    StatusBar,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function SLDMapScreen({ navigation, route }: any) {
  // We extract the jobId passed from the Dashboard's "INITIATE" button
  const { jobId } = route.params || { jobId: 'UNKNOWN' };

  return (
    <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        
        {/* Custom NOVA Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#F59E0B" />
          </TouchableOpacity>
          
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>NOVA</Text>
            <Text style={styles.headerSubtitle}>TARGET SLD MAP</Text>
          </View>
          
          {/* Empty view to balance the flex layout so the title stays centered */}
          <View style={{ width: 40 }} /> 
        </View>

        {/* Temporary Content Area for the upcoming SVG */}
        <View style={styles.content}>
          <Ionicons name="map-outline" size={80} color="rgba(245, 158, 11, 0.3)" />
          <Text style={styles.jobText}>AWAITING SVG DATA FOR JOB #{jobId}</Text>
          <Text style={styles.instructionText}>
            Interactive node mapping system will be initialized here.
          </Text>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.2)',
    backgroundColor: 'rgba(5, 11, 20, 0.8)', // Slight background for contrast
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  headerTextContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textShadowColor: '#F59E0B',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  jobText: {
    color: '#F59E0B',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 20,
    textAlign: 'center',
  },
  instructionText: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  }
});