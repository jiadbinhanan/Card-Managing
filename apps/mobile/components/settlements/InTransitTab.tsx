import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  CheckCircle2,
  ArrowDownLeft,
  Clock,
  Plus,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Banknote,
  User,
  History,
} from 'lucide-react-native';

export interface SettlementHistoryEntry {
  settle_id: string;
  amount: number;
  settled_date: string;
  settled_to_user: string;
  card_id: string;
  remarks?: string;
}

export interface SettlementDetails {
  total_settled: number;
  total_due: number;
  history: SettlementHistoryEntry[];
}

export interface InTransitTransaction {
  id: string;
  type: 'withdrawal' | 'bill_payment';
  amount: number;
  transaction_date: string;
  status: 'pending_settlement' | 'partially_settled' | 'settled';
  settled_date?: string;
  recorded_by: string;
  qr_id?: string;
  settled_to_user?: string;
  card_id?: string;
  remarks?: string;
  settlement_details?: SettlementDetails | null;
  card_name?: string;
  last_4_digits?: string;
  merchant_name?: string;
  recorder_name?: string;
  settled_to_name?: string;
}

interface InTransitTabProps {
  transactions: InTransitTransaction[];
  onSettle: (tx: InTransitTransaction) => void;
  onNewManualEntry?: () => void;
}

export function InTransitTab({
  transactions,
  onSettle,
  onNewManualEntry,
}: InTransitTabProps) {
  const [expandedHistories, setExpandedHistories] = useState<Record<string, boolean>>({});

  const toggleHistory = (id: string) => {
    setExpandedHistories((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <View style={styles.listContainer}>
      {/* Top Action Row: New Manual Rotation Entry */}
      {onNewManualEntry && (
        <View style={styles.topActionBar}>
          <TouchableOpacity
            style={styles.manualEntryBtn}
            onPress={onNewManualEntry}
            activeOpacity={0.85}
          >
            <View style={styles.manualEntryBtnInner}>
              <Plus size={15} color="#0B3F28" strokeWidth={2.4} />
              <Text style={styles.manualEntryBtnText}>New Manual Rotation Entry</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <CheckCircle2 size={36} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>All Rotations Settled</Text>
          <Text style={styles.emptySub}>
            Zero pending withdrawals in transit. All cash has been accounted for and settled into
            cash-on-hand ledgers.
          </Text>
        </View>
      ) : (
        transactions.map((tx) => {
          const currentDue =
            tx.settlement_details?.total_due !== undefined
              ? Number(tx.settlement_details.total_due)
              : Number(tx.amount);
          const isPartial = tx.status === 'partially_settled';
          const totalSettled = Number(tx.settlement_details?.total_settled || 0);
          const historyList = tx.settlement_details?.history || [];
          const hasHistory = historyList.length > 0;
          const isExpanded = !!expandedHistories[tx.id];

          return (
            <View key={tx.id} style={styles.card}>
              <View style={styles.topRow}>
                <View style={styles.merchantCol}>
                  <Text style={styles.merchantTitle} numberOfLines={1}>
                    {tx.merchant_name || 'Rotation Withdrawal'}
                  </Text>
                  <Text style={styles.subText}>
                    Rotated by {tx.recorder_name?.split(' ')[0] || 'User'} •{' '}
                    {tx.card_name || 'Card'} (**{tx.last_4_digits || '0000'})
                  </Text>
                </View>

                <View style={styles.amountCol}>
                  <Text style={styles.amountText}>₹{currentDue.toLocaleString('en-IN')}</Text>
                  <View style={[styles.badge, isPartial ? styles.partialBadge : styles.pendingBadge]}>
                    <Text
                      style={isPartial ? styles.partialBadgeText : styles.pendingBadgeText}
                    >
                      {isPartial ? 'Partially Settled' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Progress Summary if Partial */}
              {isPartial && (
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    Settled: ₹{totalSettled.toLocaleString('en-IN')} of ₹
                    {Number(tx.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              )}

              {tx.remarks ? (
                <Text style={styles.remarksText} numberOfLines={2}>
                  &quot;{tx.remarks}&quot;
                </Text>
              ) : null}

              {/* Installment History Toggle */}
              {hasHistory && (
                <TouchableOpacity
                  style={styles.historyToggleRow}
                  onPress={() => toggleHistory(tx.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.historyToggleLeft}>
                    <History size={12} color="#0B3F28" />
                    <Text style={styles.historyToggleText}>
                      Settlement Milestones ({historyList.length})
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={14} color="#658270" />
                  ) : (
                    <ChevronDown size={14} color="#658270" />
                  )}
                </TouchableOpacity>
              )}

              {/* Expandable History Timeline */}
              {hasHistory && isExpanded && (
                <View style={styles.historyTimelineBox}>
                  {historyList.map((h, idx) => (
                    <View key={h.settle_id || idx} style={styles.timelineItem}>
                      <View style={styles.timelineNode}>
                        <View style={styles.timelineDot} />
                        {idx < historyList.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineTop}>
                          <Text style={styles.timelineAmount}>
                            +₹{Number(h.amount).toLocaleString('en-IN')}
                          </Text>
                          <Text style={styles.timelineDate}>
                            {h.settled_date
                              ? new Date(h.settled_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                })
                              : 'Settled'}
                          </Text>
                        </View>
                        {h.remarks ? (
                          <Text style={styles.timelineRemarks} numberOfLines={1}>
                            {h.remarks}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.divider} />

              <View style={styles.bottomRow}>
                <View style={styles.dateRow}>
                  <Clock size={11} color="#4A6B56" />
                  <Text style={styles.dateText}>
                    {tx.transaction_date
                      ? new Date(tx.transaction_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Recent'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.settleBtn}
                  onPress={() => onSettle(tx)}
                  activeOpacity={0.85}
                >
                  <CheckCircle2 size={13} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.settleBtnText}>Settle Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    gap: 10,
    paddingBottom: 24,
  },
  topActionBar: {
    marginBottom: 4,
  },
  manualEntryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  manualEntryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  manualEntryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B3F28',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#658270',
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  merchantCol: {
    flex: 1,
    marginRight: 10,
  },
  merchantTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  subText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#072C1C',
    letterSpacing: -0.3,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  partialBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  partialBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0369A1',
  },
  progressRow: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  remarksText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#4A6B56',
    marginTop: 6,
  },
  historyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F4F7F4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0B3F28',
  },
  historyTimelineBox: {
    marginTop: 8,
    paddingLeft: 4,
    paddingVertical: 6,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timelineNode: {
    alignItems: 'center',
    width: 14,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  timelineLine: {
    width: 1.5,
    height: 24,
    backgroundColor: '#C8E6C9',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 6,
  },
  timelineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineAmount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  timelineDate: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
  },
  timelineRemarks: {
    fontSize: 9,
    color: '#658270',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F4F1',
    marginVertical: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0B3F28',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  settleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
