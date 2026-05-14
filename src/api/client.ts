import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Toast from "react-native-toast-message";
import { useAuthStore } from "../store/authStore";

const API_BASE_URL = "https://app.sowashusa.com/api/mideast";
const CORE_API_URL = "https://app.sowashusa.com/api/"; // 🚀 Root API for global Attendance
const FACE_API_URL = "http://app.sowashusa.com:5001/";

// 1. Mideast API Gateway (Jobs, Annotations, etc.)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// 2. Core API Gateway (Global Attendance)
export const coreApiClient = axios.create({
  baseURL: CORE_API_URL,
  timeout: 10000,
});

// 3. Face Recognition Instance (Processing Heavy Images)
export const faceInstance = axios.create({
  baseURL: FACE_API_URL,
  timeout: 45000,
  headers: {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});

// ── Interceptors ─────────────────────────────────────────────────────────────

const attachToken = async (config: any) => {
  try {
    const token = await SecureStore.getItemAsync("userToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("SecureStore Error:", error);
  }
  return config;
};

const handleAuthError = async (error: any) => {
  if (error.response?.status === 401) {
    Toast.show({
      type: "error",
      text1: "Session Expired",
      text2: "Please log in again.",
    });
    useAuthStore.getState().logout();
  }
  return Promise.reject(error);
};

// Apply security rules to Mideast Client
apiClient.interceptors.request.use(attachToken, (error) =>
  Promise.reject(error),
);
apiClient.interceptors.response.use((response) => response, handleAuthError);

// Apply security rules to Core Client (Attendance)
coreApiClient.interceptors.request.use(attachToken, (error) =>
  Promise.reject(error),
);
coreApiClient.interceptors.response.use(
  (response) => response,
  handleAuthError,
);

export default apiClient;
