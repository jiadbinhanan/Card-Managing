import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CedarColors } from '@credics/core';

export default function RootLayout() {
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
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
