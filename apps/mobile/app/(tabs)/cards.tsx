import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { CedarCard } from '../../components/CedarCard';
import { HapticButton } from '../../components/HapticButton';
import { CardsSkeleton } from '../../components/Skeleton';
import { Plus, Fuel, ShoppingCart } from 'lucide-react-native';

export default function CardsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'virtual' | 'physical'>('virtual');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <CardsSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Cards</Text>
          <HapticButton style={styles.addCardBtn} feedbackType="medium">
            <Plus size={16} color={CedarColors.pine900} />
            <Text style={styles.addCardBtnText}>Add card</Text>
          </HapticButton>
        </View>

        {/* Tab Switcher: Virtual vs Physical */}
        <View style={styles.tabSwitcher}>
          <HapticButton
            style={[styles.tabItem, selectedTab === 'virtual' && styles.activeTabItem]}
            onPress={() => setSelectedTab('virtual')}
          >
            <Text style={[styles.tabText, selectedTab === 'virtual' && styles.activeTabText]}>
              Virtual
            </Text>
          </HapticButton>

          <HapticButton
            style={[styles.tabItem, selectedTab === 'physical' && styles.activeTabItem]}
            onPress={() => setSelectedTab('physical')}
          >
            <Text style={[styles.tabText, selectedTab === 'physical' && styles.activeTabText]}>
              Physical
            </Text>
          </HapticButton>
        </View>

        {/* 3D Realistic Credit Card & Limit Progress */}
        <CedarCard
          cardName="CEDAR TITANIUM"
          last4Digits="4921"
          totalLimit={300000}
          availableLimit={116000}
          holderName="CREDICS USER"
          validThru="08/29"
          onFreeze={() => {}}
          onLimits={() => {}}
          onPin={() => {}}
          onDetails={() => {}}
        />

        {/* Recent on this card */}
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent on this card</Text>
            <HapticButton>
              <Text style={styles.viewAllText}>View all &gt;</Text>
            </HapticButton>
          </View>

          <View style={styles.activityItem}>
            <View style={styles.activityLeft}>
              <View style={[styles.activityIconBox, { backgroundColor: CedarColors.pine700 }]}>
                <Fuel size={20} color={CedarColors.gold500} />
              </View>
              <View>
                <Text style={styles.activityName}>Aureus Fuel Station</Text>
                <Text style={styles.activityTime}>Transport • 2h ago</Text>
              </View>
            </View>
            <Text style={styles.activityAmount}>-₹48.10</Text>
          </View>

          <View style={styles.activityItem}>
            <View style={styles.activityLeft}>
              <View style={[styles.activityIconBox, { backgroundColor: CedarColors.pine700 }]}>
                <ShoppingCart size={20} color={CedarColors.positive} />
              </View>
              <View>
                <Text style={styles.activityName}>Verde Supermarket</Text>
                <Text style={styles.activityTime}>Groceries • Yesterday</Text>
              </View>
            </View>
            <Text style={styles.activityAmount}>-₹120.50</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.pine900,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    color: CedarColors.bone,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.gold500,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addCardBtnText: {
    color: CedarColors.pine900,
    fontSize: 13,
    fontWeight: '800',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 4,
    marginBottom: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTabItem: {
    backgroundColor: CedarColors.bone,
  },
  tabText: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: CedarColors.pine900,
  },
  recentSection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  recentTitle: {
    color: CedarColors.bone,
    fontSize: 16,
    fontWeight: '800',
  },
  viewAllText: {
    color: CedarColors.gold500,
    fontSize: 13,
    fontWeight: '700',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityName: {
    color: CedarColors.bone,
    fontSize: 14,
    fontWeight: '700',
  },
  activityTime: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  activityAmount: {
    color: CedarColors.bone,
    fontSize: 15,
    fontWeight: '800',
  },
});
