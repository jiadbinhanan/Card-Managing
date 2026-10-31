import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import * as Haptics from 'expo-haptics';
import {
  Banknote,
  Receipt,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Plus,
  X,
  CreditCard,
  User,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react-native';

interface CashOnHandRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
  userName?: string;
  cardName?: string;
}

interface SpendRow {
  id: string;
  user_id: string;
  card_id?: string;
  amount: number;
  spend_type: string;
  payment_method: string;
  remarks: string | null;
  spend_date: string;
  userName?: string;
  cardName?: string;
}

interface PocketBalanceRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
  userName?: string;
  cardName?: string;
}

export default function LedgersScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cash' | 'spends' | 'pocket'>('cash');

  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [cashBalances, setCashBalances] = useState<CashOnHandRow[]>([]);
  const [spendsList, setSpendsList] = useState<SpendRow[]>([]);
  const [pocketBalances, setPocketBalances] = useState<PocketBalanceRow[]>([]);

  // Transfer Cash Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const fetchLedgersData = useCallback(async () => {
    try {
      const [cohRes, spendsRes, pocketRes, profilesRes, cardsRes] = await Promise.all([
        supabase.from('cash_on_hand').select('*'),
        supabase.from('spends').select('*').order('spend_date', { ascending: false }),
        supabase.from('pocket_balances').select('*'),
        supabase.from('profiles').select('id, name'),
        supabase.from('cards').select('id, card_name, last_4_digits'),
      ]);

      const profiles = profilesRes.data || [];
      const cards = cardsRes.data || [];

      // 1. Enrich Cash on Hand
      const rawCoh = cohRes.data || [];
      const enrichedCoh: CashOnHandRow[] = rawCoh.map((c) => {
        const p = profiles.find((prof) => prof.id === c.user_id);
        const card = cards.find((crd) => crd.id === c.card_id);
        return {
          ...c,
          userName: p?.name,
          cardName: card ? `${card.card_name} (••${card.last_4_digits})` : 'General Vault',
        };
      });
      setCashBalances(enrichedCoh);

      // 2. Enrich Spends
      const rawSpends = spendsRes.data || [];
      const enrichedSpends: SpendRow[] = rawSpends.map((s) => {
        const p = profiles.find((prof) => prof.id === s.user_id);
        const card = cards.find((crd) => crd.id === s.card_id);
        return {
          ...s,
          userName: p?.name,
          cardName: card?.card_name,
        };
      });
      setSpendsList(enrichedSpends);

      // 3. Enrich Pocket
      const rawPocket = pocketRes.data || [];
      const enrichedPocket: PocketBalanceRow[] = rawPocket.map((pk) => {
        const p = profiles.find((prof) => prof.id === pk.user_id);
        const card = cards.find((crd) => crd.id === pk.card_id);
        return {
          ...pk,
          userName: p?.name,
          cardName: card?.card_name,
        };
      });
      setPocketBalances(enrichedPocket);
    } catch (err) {
      console.error('Error fetching ledgers:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLedgersData();

    const channel = supabase
      .channel('mobile-ledgers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLedgersData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchLedgersData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pocket_balances' }, () => fetchLedgersData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLedgersData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLedgersData();
  };

  const totalCashOnHand = cashBalances.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const totalSpendsAmount = spendsList.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const totalPocketBalance = pocketBalances.reduce((sum, p) => sum + Number(p.current_balance || 0), 0);

  // Filtered Spends
  const filteredSpends = useMemo(() => {
    if (!searchQuery.trim()) return spendsList;
    const q = searchQuery.toLowerCase();
    return spendsList.filter(
      (s) =>
        (s.remarks && s.remarks.toLowerCase().includes(q)) ||
        (s.spend_type && s.spend_type.toLowerCase().includes(q)) ||
        (s.userName && s.userName.toLowerCase().includes(q))
    );
  }, [spendsList, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Ledgers & Vault</Text>
          <Text style={styles.headerSubtitle}>Cash on Hand, Spends & Pocket</Text>
        </View>

        <HapticButton
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            setIsTransferModalOpen(true);
          }}
          feedbackType="rigid"
        >
          <Plus size={16} color="#F6F9F5" strokeWidth={2.4} />
          <Text style={styles.addBtnText}>Transfer</Text>
        </HapticButton>
      </View>

      {/* Floating Balance Overview Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryBadge}>
            <Banknote size={14} color="#2E944B" />
            <Text style={styles.summaryBadgeText}>
              {activeTab === 'cash'
                ? 'Total Cash in Vault'
                : activeTab === 'spends'
                ? 'Total Personal Spends'
                : 'Total Pocket Advances'}
            </Text>
          </View>
        </View>

        <Text style={styles.summaryAmount}>
          ₹
          {(activeTab === 'cash'
            ? totalCashOnHand
            : activeTab === 'spends'
            ? totalSpendsAmount
            : totalPocketBalance
          ).toLocaleString('en-IN')}
        </Text>
        <Text style={styles.summarySub}>
          {activeTab === 'cash'
            ? 'Live balance available in physical cash vaults across users'
            : activeTab === 'spends'
            ? 'Cumulative card & cash expenses logged this period'
            : 'Un-reclaimed out-of-pocket advances'}
        </Text>
      </View>

      {/* 3 Tab Selector Pills */}
      <View style={styles.tabRow}>
        {(['cash', 'spends', 'pocket'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'cash' ? 'Cash on Hand' : tab === 'spends' ? 'Personal Spends' : 'Pocket Advances';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab(tab);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabChipText, isActive && styles.activeTabChipText]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Spends Search Input */}
      {activeTab === 'spends' && (
        <View style={styles.searchContainer}>
          <Search size={16} color={CedarColors.ink500} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search expense remarks, categories..."
            placeholderTextColor={CedarColors.ink500}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={CedarColors.ink500} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Content List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CedarColors.forest800}
            colors={[CedarColors.forest800]}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={CedarColors.forest800} />
            <Text style={styles.loadingText}>Loading Vault Ledgers...</Text>
          </View>
        ) : activeTab === 'cash' ? (
          cashBalances.length === 0 ? (
            <View style={styles.emptyBox}>
              <Banknote size={36} color={CedarColors.ink500} strokeWidth={1.6} />
              <Text style={styles.emptyTitle}>No Cash Vault Records</Text>
              <Text style={styles.emptySubtitle}>Settle a rotation to add cash to the vault.</Text>
            </View>
          ) : (
            cashBalances.map((item) => (
              <View key={item.id} style={styles.ledgerCard}>
                <View style={styles.cardLeft}>
                  <View style={styles.cashIconCircle}>
                    <Banknote size={20} color="#2E944B" strokeWidth={2.4} />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>{item.userName || 'User Vault'}</Text>
                    <Text style={styles.cardSub}>{item.cardName}</Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.cashAmount}>
                    ₹{Number(item.current_balance || 0).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.balanceStatus}>Available Cash</Text>
                </View>
              </View>
            ))
          )
        ) : activeTab === 'spends' ? (
          filteredSpends.length === 0 ? (
            <View style={styles.emptyBox}>
              <Receipt size={36} color={CedarColors.ink500} strokeWidth={1.6} />
              <Text style={styles.emptyTitle}>No Spends Recorded</Text>
              <Text style={styles.emptySubtitle}>Log personal expenses from the transactions tab.</Text>
            </View>
          ) : (
            filteredSpends.map((s) => (
              <View key={s.id} style={styles.ledgerCard}>
                <View style={styles.cardLeft}>
                  <View style={styles.spendIconCircle}>
                    <Receipt size={18} color="#D97706" strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {s.remarks || 'Personal Expense'}
                    </Text>
                    <Text style={styles.cardSub}>
                      {s.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand'} • {s.spend_date}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.spendAmount}>-₹{Number(s.amount).toLocaleString('en-IN')}</Text>
                  <Text style={styles.userNameBadge}>{s.userName || 'User'}</Text>
                </View>
              </View>
            ))
          )
        ) : (
          pocketBalances.length === 0 ? (
            <View style={styles.emptyBox}>
              <Coins size={36} color={CedarColors.ink500} strokeWidth={1.6} />
              <Text style={styles.emptyTitle}>No Pocket Advances</Text>
              <Text style={styles.emptySubtitle}>All pocket advances have been cleared.</Text>
            </View>
          ) : (
            pocketBalances.map((pk) => (
              <View key={pk.id} style={styles.ledgerCard}>
                <View style={styles.cardLeft}>
                  <View style={styles.pocketIconCircle}>
                    <Coins size={18} color="#7D5AE0" strokeWidth={2.4} />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>{pk.userName || 'User'}</Text>
                    <Text style={styles.cardSub}>{pk.cardName || 'Unified Card'}</Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.pocketAmount}>
                    ₹{Number(pk.current_balance || 0).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.pocketStatus}>Advance Due</Text>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Simple Cash Transfer Notice Modal */}
      <Modal
        visible={isTransferModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTransferModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vault Cash Transfer</Text>
              <TouchableOpacity onPress={() => setIsTransferModalOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            <Text style={styles.transferHint}>
              Cash balances are automatically updated when rotation withdrawals are settled, or when loan recoveries are completed.
            </Text>

            <HapticButton
              style={styles.closeBtn}
              onPress={() => setIsTransferModalOpen(false)}
              feedbackType="rigid"
            >
              <Text style={styles.closeBtnText}>Understood</Text>
            </HapticButton>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CedarColors.forest800,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 24,
    padding: 16,
    backgroundColor: CedarColors.forest900,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 148, 75, 0.18)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#A3D9B5',
    fontWeight: '700',
  },
  summaryAmount: {
    fontSize: 24,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  summarySub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeTabChip: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  tabChipText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '600',
    color: CedarColors.ink700,
  },
  activeTabChipText: {
    color: '#F6F9F5',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CedarColors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 8,
  },
  emptyBox: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textAlign: 'center',
  },
  ledgerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cashIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spendIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(125, 90, 224, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  cashAmount: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#2E944B',
  },
  spendAmount: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  pocketAmount: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#7D5AE0',
  },
  balanceStatus: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  userNameBadge: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    marginTop: 2,
  },
  pocketStatus: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#7D5AE0',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: CedarColors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  transferHint: {
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    lineHeight: 20,
    marginBottom: 20,
  },
  closeBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
});
