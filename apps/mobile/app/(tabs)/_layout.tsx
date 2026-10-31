import React from 'react';
import { Tabs } from 'expo-router';
import { CedarColors } from '@credics/core';
import { FloatingBottomNav } from '../../components/FloatingBottomNav';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingBottomNav {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: CedarColors.canvas },
      }}
    >
      {/* 1. Dashboard / Home */}
      <Tabs.Screen name="index" options={{ title: 'Home' }} />

      {/* 2. Transactions Master Ledger */}
      <Tabs.Screen name="transactions" options={{ title: 'Trans' }} />

      {/* 3. Central FAB Target: Settlements & QR */}
      <Tabs.Screen name="settlements" options={{ title: 'Settlement' }} />

      {/* 4. Loans / Lents */}
      <Tabs.Screen name="lents" options={{ title: 'Loans' }} />

      {/* 5. Analytics & Spending Insights */}
      <Tabs.Screen name="insights" options={{ title: 'Analytics' }} />

      {/* Hidden Routes (Opened from Swipe-Up Drawer / Deep links) */}
      <Tabs.Screen name="cards" options={{ href: null }} />
      <Tabs.Screen name="ledgers" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
    </Tabs>
  );
}
