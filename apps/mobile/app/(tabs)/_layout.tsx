import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { CedarColors } from '@credics/core';
import { Home, BarChart3, Repeat, CreditCard, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: CedarColors.gold500,
        tabBarInactiveTintColor: CedarColors.pine300,
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.activeTabWrapper]}>
              <Home size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.activeTabWrapper]}>
              <BarChart3 size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          tabBarIcon: () => (
            <View style={styles.centerActionBtn}>
              <Repeat size={24} color={CedarColors.pine900} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.activeTabWrapper]}>
              <CreditCard size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="ledgers"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.activeTabWrapper]}>
              <Layers size={22} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 16 : 24,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    backgroundColor: CedarColors.pine800,
    borderTopWidth: 0,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabIconWrapper: {
    padding: 8,
    borderRadius: 16,
  },
  activeTabWrapper: {
    backgroundColor: 'rgba(231, 178, 74, 0.12)',
  },
  centerActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CedarColors.gold500,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CedarColors.gold500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
