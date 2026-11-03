import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckCircle2, ArrowDownLeft, Clock } from 'lucide-react-native';

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
}

export function InTransitTab({ transactions, onSettle }: InTransitTabProps) {
  if (transactions.length === 0) {
    return (
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
    );
  }

  return (
    <View style={styles.listContainer}>
      {transactions.map((tx) => {
        const currentDue =
          tx.settlement_details?.total_due !== undefined
            ? Number(tx.settlement_details.total_due)
            : Number(tx.amount);
        const isPartial = tx.status === 'partially_settled';
        const totalSettled = Number(tx.settlement_details?.total_settled || 0);

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

            {/* If partial, show settled progress */}
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  subText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 3,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E05D52',
    letterSpacing: -0.3,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
  },
  partialBadge: {
    backgroundColor: '#DBEAFE',
  },
  partialBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E40AF',
  },
  progressRow: {
    backgroundColor: '#EFF3EE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0B3F28',
  },
  remarksText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#4A6B56',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#DFE8E0',
    marginVertical: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0B3F28',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  settleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4A6B56',
    textAlign: 'center',
    lineHeight: 18,
  },
});
