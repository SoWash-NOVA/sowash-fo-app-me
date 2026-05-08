import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';

// 1. Removed the unused '{ navigation }: any' prop
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 2. Extract the login action using the Zustand hook (React Best Practice)
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg("SYSTEM ALERT: Provide credentials.");
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const token = response.data?.token;
      const name = response.data?.user?.firstname || response.data?.user?.name || 'OPERATOR';
      
      if (token) {
        // Pass both the token AND the name into our Zustand store
        await login(token, name); 
      } else {
        setErrorMsg("ACCESS DENIED: No token received.");
      }
    } catch (error: any) {
      if (error.response) {
        setErrorMsg(error.response.data?.error || "ACCESS DENIED: Invalid credentials.");
      } else if (error.request) {
        setErrorMsg("UPLINK FAILED: Check server IP connection.");
      } else {
        setErrorMsg("SYSTEM ERROR: Unexpected fault.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient 
      colors={['#050B14', '#0B192C', '#050B14']} // Deep space/solar void background
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Futuristic Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>NOVA</Text>
          <Text style={styles.subtitle}>SOLAR MAINTENANCE O.S.</Text>
          <View style={styles.glowingLine} />
        </View>

        {/* Glassmorphism Form Container */}
        <BlurView intensity={20} tint="dark" style={styles.glassPanel}>
          
          {errorMsg !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>OPERATOR EMAIL</Text>
            <TextInput 
              placeholder="Enter designated email..." 
              placeholderTextColor="#4B5563"
              style={styles.input} 
              onChangeText={(text) => { setEmail(text); setErrorMsg(''); }} 
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>AUTHORIZATION CODE</Text>
            <TextInput 
              placeholder="Enter secure password..." 
              placeholderTextColor="#4B5563"
              style={styles.input} 
              secureTextEntry 
              onChangeText={(text) => { setPassword(text); setErrorMsg(''); }} 
            />
          </View>

          {/* Solar Energy Button */}
          <TouchableOpacity 
            style={styles.buttonContainer} 
            onPress={handleLogin}
            disabled={loading}
          >
            <LinearGradient
              colors={['#F59E0B', '#EA580C']} // Solar Flare Gradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientButton}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>INITIALIZE SESSION</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </BlurView>

      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: { 
    fontSize: 56, 
    fontWeight: '900', 
    color: '#FFFFFF',
    letterSpacing: 8,
    textShadowColor: '#F59E0B', // Glowing sun effect
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    letterSpacing: 4,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', // Tech font
  },
  glowingLine: {
    marginTop: 16,
    width: 60,
    height: 3,
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  glassPanel: {
    padding: 30,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  inputWrapper: {
    marginBottom: 24,
  },
  inputLabel: {
    color: '#F59E0B', // Solar orange label
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  input: { 
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#E2E8F0',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)', // Subtle orange border
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 10,
    borderRadius: 12,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  gradientButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)', // Translucent red
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: '#FECACA',
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  }
});