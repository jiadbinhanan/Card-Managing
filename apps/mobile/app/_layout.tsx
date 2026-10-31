import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CedarColors } from '@credics/core';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 1. Initial Session Check
    supabase.auth.getSession().then(({ data }: any) => {
      setSessionChecked(true);
      if (!data?.session) {
        router.replace('/login');
      }
    });

    // 2. Auth State Transition Listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      const inAuthGroup = segments[0] === 'login';

      if (!session && !inAuthGroup) {
        router.replace('/login');
      } else if (session && inAuthGroup) {
        router.replace('/(tabs)');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CedarColors.canvas }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={CedarColors.canvas} translucent={false} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: CedarColors.canvas },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
