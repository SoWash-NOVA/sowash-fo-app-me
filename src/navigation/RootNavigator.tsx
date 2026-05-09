import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import DrawerNavigator from './DrawerNavigator';

import { useAuthStore } from '../store/authStore';
import { navigationRef } from './navigationRef';

import FSRScreen from '../screens/FSRScreen';
import LoginScreen from '../screens/LoginScreen';
import SLDMapScreen from '../screens/SLDMapScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  // Watch the global state
  const { isAuthenticated, checkToken } = useAuthStore();

  // Check for existing token when app opens
  useEffect(() => {
    checkToken();
  }, [checkToken]);

  // Show nothing while checking SecureStore
  if (isAuthenticated === null) return null; 

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="Login" component={LoginScreen} />
            ) : (
                <>
                {/* Load the Sidebar Menu as the main hub */}
                <Stack.Screen name="MainDrawer" component={DrawerNavigator} />
                
                {/* SLDMap stays outside the drawer so it can slide ON TOP of it with a back button */}
                <Stack.Screen name="SLDMap" component={SLDMapScreen} />
                <Stack.Screen name="FSRScreen" component={FSRScreen} />
                </>
            )}
            </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </>
  );
}