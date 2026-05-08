import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import { navigate } from '../navigation/navigationRef';
import { useAuthStore } from '../store/authStore';

// IMPORTANT: Replace these with your computer's local Wi-Fi IP during testing
// For production, change back to: https://app.sowashusa.com/api/mideast
const API_BASE_URL = 'https://app.sowashusa.com/api/mideast'; 
const FACE_API_URL = 'http://192.168.1.100:5001/';

// 1. Standard API Gateway Instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// 2. Face Recognition Instance (Processing Heavy Images)
export const faceInstance = axios.create({
  baseURL: FACE_API_URL,
  timeout: 45000, 
  headers: {
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
});

// Interceptor to attach the secure token to every standard request
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Using SecureStore for enhanced security (replacing AsyncStorage)
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('SecureStore Error:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 errors globally
// Handle 401 errors globally
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Show toast notification
      Toast.show({
        type: 'error',
        text1: 'Session Expired',
        text2: 'Please log in again.',
      });

      // Instantly trigger global logout. 
      // This deletes the SecureStore token AND switches the screen automatically!
      useAuthStore.getState().logout();
    }

    return Promise.reject(error);
  }
);

export default apiClient;