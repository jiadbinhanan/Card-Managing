import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  LinearTransition,
  FadeInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  User,
  Pencil,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
  CreditCard,
  Wallet,
  Clock,
  Calendar,
  Layers,
  ChevronDown,
  Trash2,
  X,
  AlertCircle,
  MoreVertical,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { BorrowerSummary } from './BorrowerCard';

export interface LedgerEntry {
  id: string;
  borrower_id: string;
  entry_type: 'given' | 'collected';
  amount: number;
  transaction_date: string;
  source_type?: 'cash_on_hand' | 'credit_card' | 'pocket' | null;
  card_id?: string | null;
  remarks?: string | null;
  recorded_by?: string | null;
  created_at?: string;
  linked_cash_ledger_id?: string | null;
  linked_card_transaction_id?: string | null;
  linked_spend_id?: string | null;
  linked_billing_cycle_id?: string | null;
  ledgerSource?: 'card' | 'pocket';
}

interface BorrowerLedgerDrawerProps {
  visible: boolean;
  onClose: () => void;
  borrower: BorrowerSummary | null;
  entries: LedgerEntry[];
  isLoading: boolean;
  onGivePress: () => void;
  onCollectPress: () => void;
  onEditBorrowerPress: () => void;
  onEntriesChanged?: () => void;
  getCardName: (cardId?: string | null) => string;
  getRecorderName: (userId?: string | null) => string;
  currentUserId?: string;
}

type GroupByMode = 'daily' | 'weekly' | 'monthly';

function SkeletonItem() {
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 700 }),
        withTiming(0.3, { duration: 700 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.skeletonCard, animatedStyle]}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonLineLong} />
        <View style={styles.skeletonLineShort} />
      </View>
      <View style={styles.skeletonAmount} />
    </Animated.View>
  );
}

export function BorrowerLedgerDrawer({
  visible,
  onClose,
  borrower,
  entries,
  isLoading,
  onGivePress,
  onCollectPress,
  onEditBorrowerPress,
  onEntriesChanged,
  getCardName,
  getRecorderName,
  currentUserId,
}: BorrowerLedgerDrawerProps) {
  const [groupBy, setGroupBy] = useState<GroupByMode>('daily');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit / Delete Entry States
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleStartEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setEditAmount(String(entry.amount));
    setEditDate(entry.transaction_date || '');
    setEditRemarks(entry.remarks || '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    const amt = Number(editAmount);
    if (!amt || amt <= 0 || !editDate) {
      Alert.alert('Invalid Input', 'Please enter a valid amount and date.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const isPocket = editingEntry.ledgerSource === 'pocket' || editingEntry.source_type === 'pocket';
      if (isPocket) {
        const { error } = await supabase
          .from('pocket_lent_ledger')
          .update({
            amount: amt,
            transaction_date: editDate,
            remarks: editRemarks || null,
          })
          .eq('id', editingEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('edit_card_lent_entry', {
          p_entry_id: editingEntry.id,
          p_new_amount: amt,
          p_new_date: editDate,
          p_new_remarks: editRemarks || null,
        });
        if (error) throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingEntry(null);
      onEntriesChanged?.();
    } catch (err: any) {
      Alert.alert('Edit Error', err?.message || 'Failed to update entry.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEntry = (entry: LedgerEntry) => {
    Alert.alert(
      'Delete Entry',
      `Delete this loan ${entry.entry_type === 'given' ? 'given' : 'collected'} entry of ₹${Number(entry.amount).toLocaleString('en-IN')}? This will reverse all linked cash & card balance adjustments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const isPocket = entry.ledgerSource === 'pocket' || entry.source_type === 'pocket';
              if (isPocket) {
                const { error } = await supabase
                  .from('pocket_lent_ledger')
                  .delete()
                  .eq('id', entry.id);
                if (error) throw error;
              } else {
                const { error } = await supabase.rpc('delete_card_lent_entry', {
                  p_entry_id: entry.id,
                });
                if (error) throw error;
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onEntriesChanged?.();
            } catch (err: any) {
              Alert.alert('Delete Error', err?.message || 'Failed to delete entry.');
            }
          },
        },
      ]
    );
  };

  // Chronological running balance calculation (ascending by date then created_at)
  const chronologicalWithBalance = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const d = (a.transaction_date || '').localeCompare(b.transaction_date || '');
      if (d !== 0) return d;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    let running = 0;
    const withBal = sorted.map((e) => {
      const amt = Number(e.amount || 0);
      running += e.entry_type === 'given' ? amt : -amt;
      return {
        ...e,
        balanceAfter: running,
      };
    });

    // Display order: newest on top
    return withBal.reverse();
  }, [entries]);

  // Grouping logic for Daily, Weekly, and Monthly
  const groupedData = useMemo(() => {
    if (chronologicalWithBalance.length === 0) return [];

    if (groupBy === 'daily') {
      const groups: { title: string; rows: typeof chronologicalWithBalance }[] = [];
      chronologicalWithBalance.forEach((row) => {
        const d = new Date(row.transaction_date);
        const dayLabel = isNaN(d.getTime())
          ? row.transaction_date
          : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        
        // Relative label
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rowD = new Date(row.transaction_date);
        rowD.setHours(0, 0, 0, 0);
        const diffDays = Math.round((today.getTime() - rowD.getTime()) / (1000 * 60 * 60 * 24));
        let relTitle = dayLabel;
        if (diffDays === 0) relTitle = `${dayLabel} • Today`;
        else if (diffDays === 1) relTitle = `${dayLabel} • Yesterday`;
        else if (diffDays > 1 && diffDays < 7) relTitle = `${dayLabel} • ${diffDays} days ago`;

        const last = groups[groups.length - 1];
        if (last && last.title === relTitle) {
          last.rows.push(row);
        } else {
          groups.push({ title: relTitle, rows: [row] });
        }
      });
      return groups;
    }

    if (groupBy === 'weekly') {
      const groups: { title: string; rows: typeof chronologicalWithBalance }[] = [];
      chronologicalWithBalance.forEach((row) => {
        const d = new Date(row.transaction_date);
        if (isNaN(d.getTime())) {
          groups.push({ title: row.transaction_date, rows: [row] });
          return;
        }
        // Start of week (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(d.setDate(diff));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const title = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

        const last = groups[groups.length - 1];
        if (last && last.title === title) {
          last.rows.push(row);
        } else {
          groups.push({ title, rows: [row] });
        }
      });
      return groups;
    }

    // Monthly
    const groups: { title: string; rows: typeof chronologicalWithBalance }[] = [];
    chronologicalWithBalance.forEach((row) => {
      const d = new Date(row.transaction_date);
      const title = isNaN(d.getTime())
        ? row.transaction_date
        : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

      const last = groups[groups.length - 1];
      if (last && last.title === title) {
        last.rows.push(row);
      } else {
        groups.push({ title, rows: [row] });
      }
    });
    return groups;
  }, [chronologicalWithBalance, groupBy]);

  // Aggregate stats
  const totalGiven = useMemo(
    () =>
      entries
        .filter((e) => e.entry_type === 'given')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [entries]
  );

  const totalCollected = useMemo(
    () =>
      entries
        .filter((e) => e.entry_type === 'collected')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [entries]
  );

  const netDue = totalGiven - totalCollected;
  const hasDue = netDue > 0;
  const isOwed = netDue < 0;

  if (!borrower) return null;

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      heightPercent={0.92}
      title={borrower.name}
      subtitle={borrower.phone || 'Borrower Statement'}
      headerRight={
        <TouchableOpacity
          onPress={onEditBorrowerPress}
          style={styles.headerEditBtn}
          activeOpacity={0.7}
        >
          <Pencil size={15} color="#0E4426" strokeWidth={2.4} />
        </TouchableOpacity>
      }
    >
      <View style={styles.container}>
        {/* Top Summary Banner */}
        <View style={styles.summaryBanner}>
          <View style={styles.netDueBox}>
            <Text style={styles.netDueLabel}>
              {hasDue ? 'NET OWES YOU' : isOwed ? 'YOU OWE BORROWER' : 'LEDGER SETTLED'}
            </Text>
            <Text
              style={[
                styles.netDueAmount,
                hasDue
                  ? styles.amountDue
                  : isOwed
                  ? styles.amountOwed
                  : styles.amountSettled,
              ]}
            >
              {hasDue
                ? `₹${netDue.toLocaleString('en-IN')}`
                : isOwed
                ? `₹${Math.abs(netDue).toLocaleString('en-IN')}`
                : '₹0'}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statDotRed} />
              <Text style={styles.statLabel}>Total Given</Text>
              <Text style={styles.statValue}>₹{totalGiven.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.statDotGreen} />
              <Text style={styles.statLabel}>Total Received</Text>
              <Text style={styles.statValue}>₹{totalCollected.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>

        {/* Timeline Grouping Switcher */}
        <View style={styles.filterRow}>
          <View style={styles.groupPillsContainer}>
            <TouchableOpacity
              style={[styles.groupPill, groupBy === 'daily' && styles.groupPillActive]}
              onPress={() => setGroupBy('daily')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.groupPillText,
                  groupBy === 'daily' && styles.groupPillTextActive,
                ]}
              >
                Daily
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.groupPill, groupBy === 'weekly' && styles.groupPillActive]}
              onPress={() => setGroupBy('weekly')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.groupPillText,
                  groupBy === 'weekly' && styles.groupPillTextActive,
                ]}
              >
                Weekly
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.groupPill, groupBy === 'monthly' && styles.groupPillActive]}
              onPress={() => setGroupBy('monthly')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.groupPillText,
                  groupBy === 'monthly' && styles.groupPillTextActive,
                ]}
              >
                Monthly
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Entries List or Skeleton */}
        <DrawerScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.skeletonWrapper}>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </View>
          ) : groupedData.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Clock size={28} color="#8CA394" />
              </View>
              <Text style={styles.emptyTitle}>No Entries Recorded</Text>
              <Text style={styles.emptySubtitle}>
                Tap 'You Gave' or 'You Got' below to add the first loan transaction.
              </Text>
            </View>
          ) : (
            groupedData.map((group, groupIdx) => (
              <View key={`group-${groupIdx}`} style={styles.groupContainer}>
                {/* Group Section Header */}
                <View style={styles.groupHeader}>
                  <View style={styles.groupHeaderLine} />
                  <View style={styles.groupBadge}>
                    <Calendar size={11} color="#4A6B56" style={{ marginRight: 4 }} />
                    <Text style={styles.groupBadgeText}>{group.title}</Text>
                  </View>
                  <View style={styles.groupHeaderLine} />
                </View>

                {/* Group Entries */}
                {group.rows.map((item) => {
                  const isGiven = item.entry_type === 'given';
                  const isExpanded = expandedId === item.id;
                  const sourceType = item.source_type;
                  const isPocket = item.ledgerSource === 'pocket' || sourceType === 'pocket';

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.entryCard, isExpanded && styles.entryCardExpanded]}
                      onPress={() => setExpandedId(isExpanded ? null : item.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.entryMainRow}>
                        {/* Source Icon */}
                        <View
                          style={[
                            styles.entryIconBox,
                            isGiven ? styles.entryIconGiven : styles.entryIconCollected,
                          ]}
                        >
                          {sourceType === 'credit_card' ? (
                            <CreditCard
                              size={15}
                              color={isGiven ? '#E05D52' : '#10B981'}
                              strokeWidth={2.4}
                            />
                          ) : isPocket ? (
                            <Wallet
                              size={15}
                              color={isGiven ? '#E05D52' : '#10B981'}
                              strokeWidth={2.4}
                            />
                          ) : (
                            <Banknote
                              size={15}
                              color={isGiven ? '#E05D52' : '#10B981'}
                              strokeWidth={2.4}
                            />
                          )}
                        </View>

                        {/* Title & Recorder */}
                        <View style={styles.entryInfoCol}>
                          <Text style={styles.entrySourceText} numberOfLines={1}>
                            {sourceType === 'credit_card'
                              ? getCardName(item.card_id)
                              : isPocket
                              ? 'Personal Pocket'
                              : 'Cash on Hand'}
                          </Text>
                          <Text style={styles.entryRecorderText} numberOfLines={1}>
                            By {getRecorderName(item.recorded_by)} • {item.transaction_date}
                          </Text>
                        </View>

                        {/* Amount & Running Balance */}
                        <View style={styles.entryAmountCol}>
                          <View style={styles.amountWithArrow}>
                            {isGiven ? (
                              <ArrowUpRight size={13} color="#E05D52" strokeWidth={2.6} />
                            ) : (
                              <ArrowDownLeft size={13} color="#10B981" strokeWidth={2.6} />
                            )}
                            <Text
                              style={[
                                styles.entryAmountText,
                                isGiven ? styles.amountTextGiven : styles.amountTextCollected,
                              ]}
                            >
                              {isGiven ? '-' : '+'}₹
                              {Number(item.amount).toLocaleString('en-IN')}
                            </Text>
                          </View>
                          <View style={styles.runningBalBadge}>
                            <Text style={styles.runningBalText}>
                              Bal: ₹{Number(item.balanceAfter).toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <Animated.View
                          entering={FadeInDown.duration(180)}
                          layout={LinearTransition.springify()}
                          style={styles.expandedSection}
                        >
                          <View style={styles.expandedDivider} />
                          {item.remarks ? (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.detailLabel}>Remarks:</Text>
                              <Text style={styles.detailValue}>{item.remarks}</Text>
                            </View>
                          ) : null}
                          <View style={styles.expandedDetailRow}>
                            <Text style={styles.detailLabel}>Fund Scope:</Text>
                            <Text style={styles.detailValue}>
                              {isPocket
                                ? 'Personal Pocket (Private)'
                                : 'Shared Card / Cash Pool'}
                            </Text>
                          </View>
                          {item.card_id ? (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.detailLabel}>Linked Card:</Text>
                              <Text style={styles.detailValue}>
                                {getCardName(item.card_id)}
                              </Text>
                            </View>
                          ) : null}
                          {item.created_at ? (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.detailLabel}>Timestamp:</Text>
                              <Text style={styles.detailValue}>
                                {new Date(item.created_at).toLocaleString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </Text>
                            </View>
                          ) : null}

                          {/* Entry Actions: Edit & Delete (Guarded by Ownership) */}
                          {(!currentUserId || item.recorded_by === currentUserId) ? (
                            <View style={styles.entryActionRow}>
                              <TouchableOpacity
                                style={styles.entryEditBtn}
                                onPress={() => handleStartEdit(item)}
                                activeOpacity={0.7}
                              >
                                <Pencil size={12} color="#0B3F28" strokeWidth={2.2} />
                                <Text style={styles.entryEditBtnText}>Edit Entry</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.entryDeleteBtn}
                                onPress={() => handleDeleteEntry(item)}
                                activeOpacity={0.7}
                              >
                                <Trash2 size={12} color="#EF4444" strokeWidth={2.2} />
                                <Text style={styles.entryDeleteBtnText}>Delete Entry</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </Animated.View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </DrawerScrollView>

        {/* Bottom Dual Action Bar */}
        <View style={styles.bottomActionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.giveBtn]}
            onPress={onGivePress}
            activeOpacity={0.88}
          >
            <ArrowUpRight size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.actionBtnText}>YOU GAVE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.collectBtn]}
            onPress={onCollectPress}
            activeOpacity={0.88}
          >
            <ArrowDownLeft size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.actionBtnText}>YOU GOT</Text>
          </TouchableOpacity>
        </View>

        {/* Edit Entry Modal */}
        {editingEntry && (
          <View style={styles.editEntryOverlay}>
            <View style={styles.editEntryModal}>
              <View style={styles.editEntryHeader}>
                <Text style={styles.editEntryTitle}>
                  Edit {editingEntry.entry_type === 'given' ? 'Given Loan' : 'Loan Collection'}
                </Text>
                <TouchableOpacity onPress={() => setEditingEntry(null)}>
                  <X size={16} color="#072C1C" />
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8, marginVertical: 10 }}>
                <View>
                  <Text style={styles.inputLabel}>Amount (₹)</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="Amount"
                    placeholderTextColor="#7E9185"
                    keyboardType="numeric"
                    value={editAmount}
                    onChangeText={setEditAmount}
                  />
                </View>

                <View>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#7E9185"
                    value={editDate}
                    onChangeText={setEditDate}
                  />
                </View>

                <View>
                  <Text style={styles.inputLabel}>Remarks / Note</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="Optional note"
                    placeholderTextColor="#7E9185"
                    value={editRemarks}
                    onChangeText={setEditRemarks}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.saveEditBtn}
                onPress={handleSaveEdit}
                disabled={isSavingEdit}
                activeOpacity={0.8}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveEditBtnText}>Save & Sync</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF8',
  },
  headerEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F3EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  summaryBanner: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  netDueBox: {
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F1',
  },
  netDueLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#658270',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  netDueAmount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 3,
  },
  amountDue: {
    color: '#E05D52',
  },
  amountOwed: {
    color: '#0284C7',
  },
  amountSettled: {
    color: '#10B981',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E05D52',
    marginBottom: 3,
  },
  statDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginBottom: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E4ECE5',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
    marginTop: 2,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupPillsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E9EFEA',
    borderRadius: 12,
    padding: 3,
  },
  groupPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  groupPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#658270',
  },
  groupPillTextActive: {
    color: '#0E4426',
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 95,
  },
  skeletonWrapper: {
    paddingTop: 8,
    gap: 8,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4ECE5',
  },
  skeletonAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#DFE8E0',
    marginRight: 10,
  },
  skeletonContent: {
    flex: 1,
    gap: 6,
  },
  skeletonLineLong: {
    width: '65%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DFE8E0',
  },
  skeletonLineShort: {
    width: '40%',
    height: 9,
    borderRadius: 5,
    backgroundColor: '#DFE8E0',
  },
  skeletonAmount: {
    width: 60,
    height: 18,
    borderRadius: 8,
    backgroundColor: '#DFE8E0',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 45,
    paddingHorizontal: 20,
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EBF3EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#718C79',
    textAlign: 'center',
    lineHeight: 16,
  },
  groupContainer: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  groupHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E4ECE5',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3EC',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    marginHorizontal: 8,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2F5C3F',
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1.1,
    borderColor: '#DFE8E0',
    marginBottom: 6,
  },
  entryCardExpanded: {
    borderColor: '#B9CFBF',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  entryMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  entryIconGiven: {
    backgroundColor: '#FCEBEA',
  },
  entryIconCollected: {
    backgroundColor: '#E8F5E9',
  },
  entryInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  entrySourceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#072C1C',
  },
  entryRecorderText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#718C79',
    marginTop: 2,
  },
  entryAmountCol: {
    alignItems: 'flex-end',
  },
  amountWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  entryAmountText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  amountTextGiven: {
    color: '#E05D52',
  },
  amountTextCollected: {
    color: '#10B981',
  },
  runningBalBadge: {
    backgroundColor: '#F2F6F3',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginTop: 2,
  },
  runningBalText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#53715E',
  },
  expandedSection: {
    marginTop: 8,
    paddingTop: 6,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: '#F0F4F1',
    marginBottom: 6,
  },
  expandedDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
  },
  detailValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#072C1C',
    maxWidth: '70%',
    textAlign: 'right',
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.2,
    borderTopColor: '#DFE8E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 8,
  },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  giveBtn: {
    backgroundColor: '#E05D52',
  },
  collectBtn: {
    backgroundColor: '#10B981',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  entryActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
  },
  entryEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#E4ECE3',
    borderRadius: 8,
    paddingVertical: 6,
  },
  entryEditBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0B3F28',
  },
  entryDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    paddingVertical: 6,
  },
  entryDeleteBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  editEntryOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 999,
  },
  editEntryModal: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  editEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
  },
  editEntryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B56',
    marginBottom: 4,
  },
  modalTextInput: {
    backgroundColor: '#EFF3EE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    color: '#072C1C',
  },
  saveEditBtn: {
    backgroundColor: '#0B3F28',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveEditBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F6F9F5',
  },
});
