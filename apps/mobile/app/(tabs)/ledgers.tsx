import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { supabase } from '../../lib/supabase';
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
  Users,
  ChevronDown,
  ChevronUp,
  Send,
  Layers,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react-native';

import {
  CrossCardReclaimDrawer,
  type CardItem as ReclaimCardItem,
} from '../../components/ledgers/CrossCardReclaimDrawer';
import {
  SpendEntryDrawer,
  type ProfileItem as SpendProfileItem,
} from '../../components/ledgers/SpendEntryDrawer';
import {
  P2PCashTransferDrawer,
} from '../../components/ledgers/P2PCashTransferDrawer';

interface ProfileItem {
  id: string;
  name: string;
  avatar_url?: string;
}

interface CardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary?: boolean;
  parent_card_id?: string;
}

interface CashOnHandRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
}

interface CashLedgerRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  transaction_type: 'credit' | 'debit';
  remarks: string | null;
  transaction_date: string;
  linked_card_transaction_id: string | null;
  cash_source_breakdown?: { card_id: string; amount: number }[] | null;
}

interface SpendRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  spend_type: string;
  payment_method: string;
  remarks: string | null;
  spend_date: string;
  linked_card_transaction_id: string | null;
  cash_source_breakdown?: { card_id: string; amount: number }[] | null;
}

interface PocketAdvanceBalanceRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
}

interface PocketAdvanceLedgerRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  entry_type: string;
  remarks: string | null;
  transaction_date: string;
  linked_card_transaction_id: string | null;
  cash_source_breakdown?: { card_id: string; amount: number }[] | null;
  created_at: string;
}

export default function LedgersScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cash' | 'spends' | 'pocket'>('cash');

  // Master Data
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string>('');

  // Ledgers Data
  const [cashBalances, setCashBalances] = useState<CashOnHandRow[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerRow[]>([]);
  const [spendsList, setSpendsList] = useState<SpendRow[]>([]);
  const [pocketBalances, setPocketBalances] = useState<PocketAdvanceBalanceRow[]>([]);
  const [pocketLedger, setPocketLedger] = useState<PocketAdvanceLedgerRow[]>([]);

  // Filter States
  const [activeUserId, setActiveUserId] = useState<string>('all');
  const [selectedCardFamilyId, setSelectedCardFamilyId] = useState<string>('all');
  const [cashFilterType, setCashFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Drawer States
  const [isReclaimDrawerOpen, setIsReclaimDrawerOpen] = useState(false);
  const [isSpendDrawerOpen, setIsSpendDrawerOpen] = useState(false);
  const [isTransferDrawerOpen, setIsTransferDrawerOpen] = useState(false);

  // Initial Fetch & Auth
  const fetchAllData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (authUser?.id && !currentAuthUserId) {
        setCurrentAuthUserId(authUser.id);
      }

      const [
        profilesRes,
        cardsRes,
        cohRes,
        cohLedgerRes,
        spendsRes,
        pocketRes,
        pocketLedgerRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url'),
        supabase.from('cards').select('id, card_name, last_4_digits, is_primary, parent_card_id'),
        supabase.from('cash_on_hand').select('*'),
        supabase.from('cash_on_hand_ledger').select('*').order('transaction_date', { ascending: false }).limit(200),
        supabase.from('spends').select('*').order('spend_date', { ascending: false }).limit(200),
        supabase.from('pocket_advances').select('*'),
        supabase.from('pocket_advances_ledger').select('*').order('transaction_date', { ascending: false }).limit(200),
      ]);

      const profs: ProfileItem[] = profilesRes.data || [];
      setProfiles(profs);
      setCards(cardsRes.data || []);
      setCashBalances(cohRes.data || []);
      setCashLedger(cohLedgerRes.data || []);
      setSpendsList(spendsRes.data || []);
      setPocketBalances(pocketRes.data || []);
      setPocketLedger(pocketLedgerRes.data || []);
    } catch (err) {
      console.error('Error fetching ledgers data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [currentAuthUserId]);

  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel('mobile-ledgers-central')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand_ledger' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pocket_advances' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pocket_advances_ledger' }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAllData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllData();
  };

  // Helper Maps
  const cardNameMap = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach((c) => {
      map.set(c.id, `${c.card_name} (••${c.last_4_digits})`);
    });
    return map;
  }, [cards]);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => {
      map.set(p.id, p.name);
    });
    return map;
  }, [profiles]);

  // Card Family Matching
  const familyCardIds = useMemo(() => {
    if (selectedCardFamilyId === 'all') return null;
    const ids = new Set<string>();
    ids.add(selectedCardFamilyId);
    cards.forEach((c) => {
      if (c.parent_card_id === selectedCardFamilyId) {
        ids.add(c.id);
      }
    });
    return ids;
  }, [selectedCardFamilyId, cards]);

  // Primary Cards for family selector
  const primaryCards = useMemo(() => {
    return cards.filter((c) => c.is_primary || !c.parent_card_id);
  }, [cards]);

  // Nested userCardCashMap: userId -> cardId -> balance
  const userCardCashMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    cashBalances.forEach((b) => {
      if (!map[b.user_id]) map[b.user_id] = {};
      map[b.user_id][b.card_id] = Number(b.current_balance || 0);
    });
    return map;
  }, [cashBalances]);

  // Active user single-depth cash map: cardId -> balance
  const effectiveUserId = activeUserId === 'all' ? (currentAuthUserId || profiles[0]?.id || '') : activeUserId;
  const activeUserCashMap = useMemo(() => {
    const map: Record<string, number> = {};
    cashBalances
      .filter((b) => (activeUserId === 'all' ? true : b.user_id === activeUserId))
      .forEach((b) => {
        map[b.card_id] = (map[b.card_id] || 0) + Number(b.current_balance || 0);
      });
    return map;
  }, [cashBalances, activeUserId]);

  // Active user pocket balances
  const activeUserPocketBalances = useMemo(() => {
    return pocketBalances.filter((p) => (activeUserId === 'all' ? true : p.user_id === activeUserId));
  }, [pocketBalances, activeUserId]);

  // Filtered Cash on Hand Balances (Per Card)
  const filteredCashPerCard = useMemo(() => {
    return cards
      .map((c) => {
        const bal = Number(activeUserCashMap[c.id] || 0);
        return {
          ...c,
          balance: bal,
        };
      })
      .filter((c) => {
        if (familyCardIds && !familyCardIds.has(c.id)) return false;
        return c.balance > 0;
      });
  }, [cards, activeUserCashMap, familyCardIds]);

  // Filtered Cash Ledger Feed
  const filteredCashLedger = useMemo(() => {
    return cashLedger.filter((row) => {
      if (activeUserId !== 'all' && row.user_id !== activeUserId) return false;
      if (familyCardIds && !familyCardIds.has(row.card_id)) return false;
      if (cashFilterType !== 'all' && row.transaction_type !== cashFilterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const remarks = (row.remarks || '').toLowerCase();
        const cardName = (cardNameMap.get(row.card_id) || '').toLowerCase();
        const userName = (userNameMap.get(row.user_id) || '').toLowerCase();
        if (!remarks.includes(q) && !cardName.includes(q) && !userName.includes(q)) return false;
      }
      return true;
    });
  }, [cashLedger, activeUserId, familyCardIds, cashFilterType, searchQuery, cardNameMap, userNameMap]);

  // Filtered Spends Feed
  const filteredSpends = useMemo(() => {
    return spendsList.filter((s) => {
      if (activeUserId !== 'all' && s.user_id !== activeUserId) return false;
      if (familyCardIds && s.card_id && !familyCardIds.has(s.card_id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const remarks = (s.remarks || '').toLowerCase();
        const spendType = (s.spend_type || '').toLowerCase();
        const userName = (userNameMap.get(s.user_id) || '').toLowerCase();
        if (!remarks.includes(q) && !spendType.includes(q) && !userName.includes(q)) return false;
      }
      return true;
    });
  }, [spendsList, activeUserId, familyCardIds, searchQuery, userNameMap]);

  // Filtered Pocket Advances Feed & Cards
  const filteredPocketLedger = useMemo(() => {
    return pocketLedger.filter((p) => {
      if (activeUserId !== 'all' && p.user_id !== activeUserId) return false;
      if (familyCardIds && !familyCardIds.has(p.card_id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const remarks = (p.remarks || '').toLowerCase();
        const cardName = (cardNameMap.get(p.card_id) || '').toLowerCase();
        if (!remarks.includes(q) && !cardName.includes(q)) return false;
      }
      return true;
    });
  }, [pocketLedger, activeUserId, familyCardIds, searchQuery, cardNameMap]);

  // Pocket deficit cards (where current_balance < 0)
  const pocketDeficitCards = useMemo(() => {
    return cards
      .map((c) => {
        const balObj = activeUserPocketBalances.find((p) => p.card_id === c.id);
        const bal = balObj ? Number(balObj.current_balance) : 0;
        return {
          ...c,
          balance: bal,
          deficit: bal < 0 ? Math.abs(bal) : 0,
        };
      })
      .filter((c) => {
        if (familyCardIds && !familyCardIds.has(c.id)) return false;
        return c.deficit > 0;
      });
  }, [cards, activeUserPocketBalances, familyCardIds]);

  // Summary Totals
  const totalCashOnHand = useMemo(() => {
    return Object.entries(activeUserCashMap).reduce((sum, [cId, bal]) => {
      if (familyCardIds && !familyCardIds.has(cId)) return sum;
      return sum + Math.max(0, bal);
    }, 0);
  }, [activeUserCashMap, familyCardIds]);

  const totalSpendsAmount = useMemo(() => {
    return filteredSpends.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  }, [filteredSpends]);

  const totalPocketDeficit = useMemo(() => {
    return pocketDeficitCards.reduce((sum, c) => sum + c.deficit, 0);
  }, [pocketDeficitCards]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const today = new Date();
      const isToday =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
      if (isToday) return 'Today';
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ledgers & Vault</Text>
          <Text style={styles.headerSubtitle}>Cash on Hand, Spends & Pocket</Text>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.spendHeaderBtn}
            onPress={() => setIsSpendDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Plus size={15} color="#F6F9F5" strokeWidth={2.4} />
            <Text style={styles.spendHeaderBtnText}>Spend</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.transferHeaderBtn}
            onPress={() => setIsTransferDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Send size={14} color="#0B2B1D" strokeWidth={2.4} />
            <Text style={styles.transferHeaderBtnText}>Transfer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Horizontal User Switcher Pill Bar */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillScroll}
        >
          <TouchableOpacity
            style={[styles.userPill, activeUserId === 'all' && styles.userPillActive]}
            onPress={() => setActiveUserId('all')}
            activeOpacity={0.7}
          >
            <Users size={13} color={activeUserId === 'all' ? '#F6F9F5' : CedarColors.ink700} />
            <Text style={[styles.userPillText, activeUserId === 'all' && styles.userPillTextActive]}>
              All Users
            </Text>
          </TouchableOpacity>

          {profiles.map((p) => {
            const isSelected = activeUserId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.userPill, isSelected && styles.userPillActive]}
                onPress={() => setActiveUserId(p.id)}
                activeOpacity={0.7}
              >
                <User size={13} color={isSelected ? '#F6F9F5' : CedarColors.ink700} />
                <Text style={[styles.userPillText, isSelected && styles.userPillTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Card Family Selector Bar */}
      {cards.length > 0 && (
        <View style={styles.cardFamilySection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardFamilyScroll}
          >
            <TouchableOpacity
              style={[
                styles.familyChip,
                selectedCardFamilyId === 'all' && styles.familyChipActive,
              ]}
              onPress={() => setSelectedCardFamilyId('all')}
              activeOpacity={0.7}
            >
              <CreditCard
                size={12}
                color={selectedCardFamilyId === 'all' ? '#F6F9F5' : CedarColors.ink700}
              />
              <Text
                style={[
                  styles.familyChipText,
                  selectedCardFamilyId === 'all' && styles.familyChipTextActive,
                ]}
              >
                All Cards
              </Text>
            </TouchableOpacity>

            {primaryCards.map((c) => {
              const isSelected = selectedCardFamilyId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.familyChip, isSelected && styles.familyChipActive]}
                  onPress={() => setSelectedCardFamilyId(c.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.familyChipText, isSelected && styles.familyChipTextActive]}
                    numberOfLines={1}
                  >
                    {c.card_name} (••{c.last_4_digits})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Floating Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryBadge}>
            {activeTab === 'cash' ? (
              <Banknote size={14} color="#2E944B" />
            ) : activeTab === 'spends' ? (
              <Receipt size={14} color="#D97706" />
            ) : (
              <Coins size={14} color="#7D5AE0" />
            )}
            <Text style={styles.summaryBadgeText}>
              {activeTab === 'cash'
                ? 'Total Cash in Vault'
                : activeTab === 'spends'
                ? 'Total Spends'
                : 'Pocket Debt Deficit'}
            </Text>
          </View>

          {activeTab === 'pocket' && totalPocketDeficit > 0 && (
            <TouchableOpacity
              style={styles.reclaimQuickBtn}
              onPress={() => setIsReclaimDrawerOpen(true)}
              activeOpacity={0.8}
            >
              <RefreshCw size={13} color="#F6F9F5" />
              <Text style={styles.reclaimQuickBtnText}>Reclaim Pocket</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.summaryAmount}>
          ₹
          {(activeTab === 'cash'
            ? totalCashOnHand
            : activeTab === 'spends'
            ? totalSpendsAmount
            : totalPocketDeficit
          ).toLocaleString('en-IN')}
        </Text>
        <Text style={styles.summarySub}>
          {activeTab === 'cash'
            ? 'Physical cash available across card settlement balances'
            : activeTab === 'spends'
            ? 'Cumulative expenses logged via cards & cash'
            : 'Out-of-pocket payments pending recovery from vault'}
        </Text>
      </View>

      {/* 3 Main Tab Selector Pills */}
      <View style={styles.tabRow}>
        {(['cash', 'spends', 'pocket'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'cash'
              ? 'Cash on Hand'
              : tab === 'spends'
              ? 'Personal Spends'
              : 'Pocket Advances';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => {
                setActiveTab(tab);
                setSearchQuery('');
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

      {/* Tab Specific Filters & Search */}
      {activeTab === 'cash' && (
        <View style={styles.filterRowContainer}>
          {/* Sub Filters: All / Credit / Debit */}
          <View style={styles.pillRow}>
            {(['all', 'credit', 'debit'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.filterSubPill,
                  cashFilterType === mode && styles.filterSubPillActive,
                ]}
                onPress={() => setCashFilterType(mode)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterSubPillText,
                    cashFilterType === mode && styles.filterSubPillTextActive,
                  ]}
                >
                  {mode === 'all' ? 'All Rows' : mode === 'credit' ? 'Inflows (+)' : 'Outflows (-)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <Search size={15} color={CedarColors.ink500} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            activeTab === 'cash'
              ? 'Search vault remarks, cards...'
              : activeTab === 'spends'
              ? 'Search expense categories, remarks...'
              : 'Search pocket advance logs...'
          }
          placeholderTextColor={CedarColors.ink500}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={15} color={CedarColors.ink500} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content Feed List */}
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
            <Text style={styles.loadingText}>Syncing Vault Ledgers...</Text>
          </View>
        ) : activeTab === 'cash' ? (
          /* Tab 1: Cash on Hand */
          <View>
            {/* Quick Balance per Card Carousel */}
            {filteredCashPerCard.length > 0 && !searchQuery.trim() && (
              <View style={styles.cardBalancesSection}>
                <Text style={styles.sectionTitle}>Available Cash per Card</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {filteredCashPerCard.map((card) => (
                    <View key={card.id} style={styles.cardBalanceChip}>
                      <Text style={styles.cardChipName} numberOfLines={1}>
                        {card.card_name}
                      </Text>
                      <Text style={styles.cardChipNumber}>••{card.last_4_digits}</Text>
                      <Text style={styles.cardChipBalance}>
                        ₹{card.balance.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {filteredCashLedger.length === 0 ? (
              <View style={styles.emptyBox}>
                <Banknote size={36} color={CedarColors.ink500} strokeWidth={1.6} />
                <Text style={styles.emptyTitle}>No Cash Vault Records</Text>
                <Text style={styles.emptySubtitle}>
                  Cash is credited on settlement and debited on bill payments or spends.
                </Text>
              </View>
            ) : (
              filteredCashLedger.map((row) => {
                const isCredit = row.transaction_type === 'credit';
                const isExpanded = expandedRowId === row.id;
                const cardName = cardNameMap.get(row.card_id) || 'Unified Card';
                const userName = userNameMap.get(row.user_id) || 'User';

                return (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.ledgerCard}
                    onPress={() => setExpandedRowId(isExpanded ? null : row.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardLeft}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            backgroundColor: isCredit
                              ? 'rgba(46, 148, 75, 0.12)'
                              : 'rgba(217, 119, 6, 0.12)',
                          },
                        ]}
                      >
                        {isCredit ? (
                          <ArrowDownLeft size={18} color="#2E944B" strokeWidth={2.4} />
                        ) : (
                          <ArrowUpRight size={18} color="#D97706" strokeWidth={2.4} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {row.remarks || (isCredit ? 'Cash Inflow' : 'Cash Outflow')}
                        </Text>
                        <Text style={styles.cardSub}>
                          {cardName} • {userName} • {formatDate(row.transaction_date)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardRight}>
                      <Text
                        style={[
                          styles.amountText,
                          { color: isCredit ? '#2E944B' : CedarColors.ink900 },
                        ]}
                      >
                        {isCredit ? '+' : '-'}₹{Number(row.amount).toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.typeBadge}>
                        {isCredit ? 'Credit' : 'Debit'}
                      </Text>
                    </View>

                    {/* Expandable breakdown if details present */}
                    {isExpanded && row.cash_source_breakdown && (
                      <View style={styles.expandedBreakdown}>
                        <Text style={styles.breakdownHeader}>Cash Source Breakdown:</Text>
                        {row.cash_source_breakdown.map((src, idx) => (
                          <View key={idx} style={styles.breakdownRow}>
                            <Text style={styles.breakdownCard}>
                              {cardNameMap.get(src.card_id) || 'Card'}
                            </Text>
                            <Text style={styles.breakdownAmt}>
                              ₹{Number(src.amount).toLocaleString('en-IN')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : activeTab === 'spends' ? (
          /* Tab 2: Personal Spends */
          filteredSpends.length === 0 ? (
            <View style={styles.emptyBox}>
              <Receipt size={36} color={CedarColors.ink500} strokeWidth={1.6} />
              <Text style={styles.emptyTitle}>No Spends Recorded</Text>
              <Text style={styles.emptySubtitle}>
                Tap the &apos;+ Spend&apos; button above to record a new personal expense.
              </Text>
            </View>
          ) : (
            filteredSpends.map((s) => {
              const isCard = s.payment_method === 'credit_card';
              const cardName = cardNameMap.get(s.card_id) || 'Unified Card';
              const userName = userNameMap.get(s.user_id) || 'User';
              const isExpanded = expandedRowId === s.id;

              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.ledgerCard}
                  onPress={() => setExpandedRowId(isExpanded ? null : s.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.spendIconCircle}>
                      <Receipt size={18} color="#D97706" strokeWidth={2.4} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {s.remarks || s.spend_type || 'Personal Expense'}
                      </Text>
                      <Text style={styles.cardSub}>
                        {isCard ? `Card: ${cardName}` : 'Cash on Hand'} • {userName} •{' '}
                        {formatDate(s.spend_date)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    <Text style={styles.spendAmount}>
                      -₹{Number(s.amount).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.methodBadge}>
                      {isCard ? 'Card Spend' : 'Vault Cash'}
                    </Text>
                  </View>

                  {/* Expandable breakdown for multi-source cash */}
                  {isExpanded && s.cash_source_breakdown && (
                    <View style={styles.expandedBreakdown}>
                      <Text style={styles.breakdownHeader}>Multi-Source Deduction:</Text>
                      {s.cash_source_breakdown.map((src, idx) => (
                        <View key={idx} style={styles.breakdownRow}>
                          <Text style={styles.breakdownCard}>
                            {cardNameMap.get(src.card_id) || 'Card'}
                          </Text>
                          <Text style={styles.breakdownAmt}>
                            ₹{Number(src.amount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )
        ) : (
          /* Tab 3: Pocket Advances */
          <View>
            {/* Deficit per card overview */}
            {pocketDeficitCards.length > 0 && (
              <View style={styles.deficitSection}>
                <Text style={styles.sectionTitle}>Cards with Unreclaimed Pocket Deficit</Text>
                {pocketDeficitCards.map((c) => (
                  <View key={c.id} style={styles.deficitCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deficitCardName}>
                        {c.card_name} (••{c.last_4_digits})
                      </Text>
                      <Text style={styles.deficitCardSub}>
                        Advance paid from personal pocket during bill payment
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={styles.deficitAmount}>
                        ₹{c.deficit.toLocaleString('en-IN')}
                      </Text>
                      <TouchableOpacity
                        style={styles.reclaimMiniBtn}
                        onPress={() => setIsReclaimDrawerOpen(true)}
                        activeOpacity={0.7}
                      >
                        <RefreshCw size={11} color="#F6F9F5" />
                        <Text style={styles.reclaimMiniBtnText}>Reclaim</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {filteredPocketLedger.length === 0 ? (
              <View style={styles.emptyBox}>
                <Coins size={36} color={CedarColors.ink500} strokeWidth={1.6} />
                <Text style={styles.emptyTitle}>No Pocket Advances</Text>
                <Text style={styles.emptySubtitle}>
                  All out-of-pocket payments have been settled or cleared.
                </Text>
              </View>
            ) : (
              filteredPocketLedger.map((row) => {
                const isReclaim = row.entry_type === 'reclaim';
                const cardName = cardNameMap.get(row.card_id) || 'Card';
                const userName = userNameMap.get(row.user_id) || 'User';

                return (
                  <View key={row.id} style={styles.ledgerCard}>
                    <View style={styles.cardLeft}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            backgroundColor: isReclaim
                              ? 'rgba(46, 148, 75, 0.12)'
                              : 'rgba(125, 90, 224, 0.12)',
                          },
                        ]}
                      >
                        {isReclaim ? (
                          <CheckCircle2 size={18} color="#2E944B" strokeWidth={2.4} />
                        ) : (
                          <Coins size={18} color="#7D5AE0" strokeWidth={2.4} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {row.remarks || (isReclaim ? 'Pocket Reclaimed' : 'Pocket Advance')}
                        </Text>
                        <Text style={styles.cardSub}>
                          {cardName} • {userName} • {formatDate(row.transaction_date)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardRight}>
                      <Text
                        style={[
                          styles.amountText,
                          { color: isReclaim ? '#2E944B' : '#7D5AE0' },
                        ]}
                      >
                        {isReclaim ? '+' : '-'}₹{Number(row.amount).toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.typeBadge}>
                        {isReclaim ? 'Reclaimed' : 'Advance'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Cross-Card Reclaim Drawer */}
      <CrossCardReclaimDrawer
        isOpen={isReclaimDrawerOpen}
        onClose={() => setIsReclaimDrawerOpen(false)}
        activeUserId={effectiveUserId}
        cards={cards as ReclaimCardItem[]}
        userCardCashMap={activeUserCashMap}
        pocketBalances={activeUserPocketBalances}
        onSuccess={() => {
          fetchAllData();
        }}
      />

      {/* Spend Entry Drawer */}
      <SpendEntryDrawer
        isOpen={isSpendDrawerOpen}
        onClose={() => setIsSpendDrawerOpen(false)}
        activeUserId={effectiveUserId}
        profiles={profiles as SpendProfileItem[]}
        cards={cards as any}
        userCardCashMap={userCardCashMap}
        onSuccess={() => {
          fetchAllData();
        }}
      />

      {/* P2P Cash Transfer Drawer */}
      <P2PCashTransferDrawer
        isOpen={isTransferDrawerOpen}
        onClose={() => setIsTransferDrawerOpen(false)}
        activeUserId={effectiveUserId}
        profiles={profiles}
        cards={cards}
        userCardCashMap={userCardCashMap}
        onSuccess={() => {
          fetchAllData();
        }}
      />
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
    paddingTop: 10,
    paddingBottom: 6,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spendHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CedarColors.forest800,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  spendHeaderBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  transferHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CedarColors.mint100,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  transferHeaderBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#0B2B1D',
  },
  filterSection: {
    paddingVertical: 4,
  },
  filterPillScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  userPillActive: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  userPillText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '600',
    color: CedarColors.ink700,
  },
  userPillTextActive: {
    color: '#F6F9F5',
  },
  cardFamilySection: {
    paddingVertical: 4,
  },
  cardFamilyScroll: {
    paddingHorizontal: 20,
    gap: 6,
  },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  familyChipActive: {
    backgroundColor: CedarColors.ink900,
    borderColor: CedarColors.ink900,
  },
  familyChipText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  familyChipTextActive: {
    color: '#F6F9F5',
    fontWeight: '600',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 22,
    padding: 16,
    backgroundColor: CedarColors.forest900,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 148, 75, 0.18)',
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#A3D9B5',
    fontWeight: '700',
  },
  reclaimQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#7D5AE0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  reclaimQuickBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
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
    marginBottom: 8,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
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
  filterRowContainer: {
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterSubPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  filterSubPillActive: {
    backgroundColor: CedarColors.ink900,
    borderColor: CedarColors.ink900,
  },
  filterSubPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  filterSubPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CedarColors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  cardBalancesSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
    marginBottom: 4,
  },
  cardBalanceChip: {
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    padding: 10,
    marginRight: 8,
    minWidth: 110,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  cardChipName: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardChipNumber: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginVertical: 2,
  },
  cardChipBalance: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#2E944B',
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
    maxWidth: 260,
  },
  ledgerCard: {
    backgroundColor: CedarColors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spendIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
    position: 'absolute',
    right: 12,
    top: 12,
  },
  amountText: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  spendAmount: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  typeBadge: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  methodBadge: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#D97706',
    marginTop: 2,
  },
  expandedBreakdown: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: CedarColors.border,
  },
  breakdownHeader: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  breakdownCard: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  breakdownAmt: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  deficitSection: {
    marginBottom: 12,
  },
  deficitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(125, 90, 224, 0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(125, 90, 224, 0.25)',
  },
  deficitCardName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  deficitCardSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    marginTop: 2,
  },
  deficitAmount: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#7D5AE0',
  },
  reclaimMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7D5AE0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  reclaimMiniBtnText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
});
