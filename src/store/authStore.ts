import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  isAuthenticated: boolean | null;
  userName: string;
  checkToken: () => Promise<void>;
  login: (token: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: null, // null means "loading/checking"
  userName: 'OPERATOR',  // Fallback default

  // Checks if a token and name exist when the app starts
  checkToken: async () => {
    const token = await SecureStore.getItemAsync('userToken');
    const name = await SecureStore.getItemAsync('userName');
    
    set({ 
      isAuthenticated: !!token,
      userName: name || 'OPERATOR' 
    });
  },

  // Saves the token AND name, instantly updating the whole app
  login: async (token: string, name: string = 'OPERATOR') => {
    await SecureStore.setItemAsync('userToken', token);
    await SecureStore.setItemAsync('userName', name);
    set({ isAuthenticated: true, userName: name });
  },

  // Deletes data and instantly kicks the user to Login
  logout: async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userName');
    set({ isAuthenticated: false, userName: 'OPERATOR' });
  }
}));