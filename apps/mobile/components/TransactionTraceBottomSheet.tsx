import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { CedarColors, CedarTypography } from '@credics/core';
import { SwipeDownDrawer, DrawerScrollView } from './SwipeDownDrawer';
import {
  ArrowLeftRight,
  CreditCard,
  QrCode,
  CheckCircle2,
  Receipt,
  User,
  Clock,
  ChevronRight,
  AlertCircle,
  Banknote,
  Coins,
  ShieldCheck,
  HandCoins,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';

export interface TraceTarget {
  id: string;
  sourceType: 'card_transaction' | 'spend' | 'cash_ledger' | 'pocket_advance' | 'lent';
  title?: string;
  amount?: number;
  date?: string;
  remarks?: string;
}

interface TransactionTraceBottomSheetProps {
  target: TraceTarget | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionTraceBottomSheet({
  target,
  isOpen,
  onClose,
}: TransactionTraceBottomSheetProps) {
  const [loading, setLoading] = useState(true);
  const [traceData, setTraceData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadTrace() {
      if (!target || !isOpen) {
        setTraceData(null);
        return;
      }
      setLoading(true);
      try {
        const rawId =
          target.id.startsWith('tx-') || target.id.startsWith('sp-')
            ? target.id.slice(3)
            : target.id;

        if (target.sourceType === 'card_transaction') {
          // 1. Fetch main card transaction with settled_to_user foreign key
          const { data: ct } = await supabase
            .from('card_transactions')
            .select(`
              *,
              cards (id, card_name, last_4_digits, is_primary),
              qrs (id, merchant_name, upi_id),
              recorded_profile:recorded_by (id, name),
              settled_profile:settled_to_user (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (!ct) {
            if (isMounted) setTraceData(null);
            return;
          }

          const [{ data: clList }, { data: paList }, { data: spList }, { data: lentList }] =
            await Promise.all([
              supabase
                .from('cash_on_hand_ledger')
                .select('*, profiles:user_id(name)')
                .eq('linked_card_transaction_id', rawId),
              supabase
                .from('pocket_advances_ledger')
                .select('*, profiles:user_id(name)')
                .eq('linked_card_transaction_id', rawId),
              supabase
                .from('spends')
                .select('*, profiles:user_id(name)')
                .eq('linked_card_transaction_id', rawId),
              supabase
                .from('card_lent_ledger')
                .select('*, borrowers(name)')
                .eq('linked_card_transaction_id', rawId),
            ]);

          if (isMounted) {
            setTraceData({
              sourceType: 'card_transaction',
              cardTx: ct,
              cashLedgers: clList || [],
              pocketAdv: paList?.[0] || null,
              spend: spList?.[0] || null,
              lent: lentList?.[0] || null,
            });
          }
        } else if (target.sourceType === 'spend') {
          const { data: sp } = await supabase
            .from('spends')
            .select(`
              *,
              cards (id, card_name, last_4_digits),
              profiles:user_id (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (sp) {
            let cardTx = null;
            if (sp.linked_card_transaction_id) {
              const { data: ct } = await supabase
                .from('card_transactions')
                .select('*, cards(card_name, last_4_digits)')
                .eq('id', sp.linked_card_transaction_id)
                .maybeSingle();
              cardTx = ct;
            }

            if (isMounted) {
              setTraceData({
                sourceType: 'spend',
                spend: sp,
                cardTx,
              });
            }
          } else {
            if (isMounted) setTraceData(null);
          }
        } else if (target.sourceType === 'cash_ledger') {
          const { data: cl } = await supabase
            .from('cash_on_hand_ledger')
            .select(`
              *,
              cards (id, card_name, last_4_digits),
              profiles:user_id (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (cl) {
            let cardTx = null;
            let lentRow = null;
            if (cl.linked_card_transaction_id) {
              const { data: ct } = await supabase
                .from('card_transactions')
                .select('*, cards(card_name, last_4_digits), qrs(merchant_name)')
                .eq('id', cl.linked_card_transaction_id)
                .maybeSingle();
              cardTx = ct;
            }

            const { data: lr } = await supabase
              .from('card_lent_ledger')
              .select('*, borrowers(name)')
              .eq('linked_cash_ledger_id', cl.id)
              .maybeSingle();
            lentRow = lr;

            if (isMounted) {
              setTraceData({
                sourceType: 'cash_ledger',
                cashLedger: cl,
                cardTx,
                lent: lentRow,
              });
            }
          } else {
            if (isMounted) setTraceData(null);
          }
        } else if (target.sourceType === 'pocket_advance') {
          const { data: pa } = await supabase
            .from('pocket_advances_ledger')
            .select(`
              *,
              cards (id, card_name, last_4_digits),
              profiles:user_id (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (pa) {
            let cardTx = null;
            if (pa.linked_card_transaction_id) {
              const { data: ct } = await supabase
                .from('card_transactions')
                .select('*, cards(card_name, last_4_digits)')
                .eq('id', pa.linked_card_transaction_id)
                .maybeSingle();
              cardTx = ct;
            }

            if (isMounted) {
              setTraceData({
                sourceType: 'pocket_advance',
                pocketAdv: pa,
                cardTx,
              });
            }
          } else {
            if (isMounted) setTraceData(null);
          }
        } else if (target.sourceType === 'lent') {
          const { data: lent } = await supabase
            .from('card_lent_ledger')
            .select(`
              *,
              borrowers (id, name, phone),
              cards (id, card_name, last_4_digits),
              recorded_profile:recorded_by (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (lent) {
            let cardTx = null;
            if (lent.linked_card_transaction_id) {
              const { data: ct } = await supabase
                .from('card_transactions')
                .select('*, cards(card_name, last_4_digits)')
                .eq('id', lent.linked_card_transaction_id)
                .maybeSingle();
              cardTx = ct;
            }

            if (isMounted) {
              setTraceData({
                sourceType: 'lent',
                lent,
                cardTx,
              });
            }
          } else {
            if (isMounted) setTraceData(null);
          }
        } else {
          if (isMounted) setTraceData(null);
        }
      } catch (err) {
        console.error('Error loading transaction trace:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTrace();
    return () => {
      isMounted = false;
    };
  }, [target, isOpen]);

  // Journey Breadcrumbs Helpers
  const getOrigin = (d: any) => {
    if (!d) return 'Source';
    if (d.sourceType === 'card_transaction') {
      if (d.cardTx?.type === 'withdrawal') {
        const c = d.cardTx.cards;
        return c ? `${c.card_name} (••${c.last_4_digits})` : 'Credit Card';
      }
      return d.cardTx?.payment_method === 'own_pocket' ? 'Personal Pocket' : 'Cash on Hand';
    }
    if (d.sourceType === 'spend') {
      const c = d.spend?.cards;
      return d.spend?.payment_method === 'credit_card'
        ? c ? `${c.card_name} (••${c.last_4_digits})` : 'Credit Card'
        : 'Cash on Hand';
    }
    if (d.sourceType === 'cash_ledger') {
      return d.cardTx?.cards
        ? `${d.cardTx.cards.card_name} (••${d.cardTx.cards.last_4_digits})`
        : 'Cash Reserves';
    }
    if (d.sourceType === 'pocket_advance') {
      return `${d.pocketAdv?.profiles?.name || 'User'} Pocket`;
    }
    if (d.sourceType === 'lent') {
      return d.lent?.cards
        ? `${d.lent.cards.card_name} (••${d.lent.cards.last_4_digits})`
        : 'Cash on Hand';
    }
    return 'Origin Vault';
  };

  const getAction = (d: any) => {
    if (!d) return 'Action';
    if (d.sourceType === 'card_transaction') {
      if (d.cardTx?.type === 'withdrawal') {
        return d.cardTx.qrs?.merchant_name ? `QR: ${d.cardTx.qrs.merchant_name}` : 'Rotation Withdrawal';
      }
      return 'Bill Repayment';
    }
    if (d.sourceType === 'spend') {
      return d.spend?.spend_type === 'repayment' ? 'Debt Paydown' : 'Personal Spend';
    }
    if (d.sourceType === 'cash_ledger') {
      return d.cashLedger?.transaction_type === 'credit' ? 'Cash Intake' : 'Cash Deduction';
    }
    if (d.sourceType === 'pocket_advance') {
      return 'Pocket Advance';
    }
    if (d.sourceType === 'lent') {
      return d.lent?.entry_type === 'recovery' ? 'Loan Repaid' : 'Loan Given';
    }
    return 'Transaction';
  };

  const getDestination = (d: any) => {
    if (!d) return 'Destination';
    if (d.sourceType === 'card_transaction') {
      if (d.cardTx?.type === 'withdrawal') {
        const rec = d.cardTx.settled_profile?.name || d.cashLedgers?.[0]?.profiles?.name;
        return rec ? `Cash Vault (${rec})` : 'Pending Settlement';
      }
      const c = d.cardTx?.cards;
      return c ? `${c.card_name} Bill Cleared` : 'Card Settled';
    }
    if (d.sourceType === 'spend') {
      return 'Personal Expenses Ledger';
    }
    if (d.sourceType === 'cash_ledger') {
      return `${d.cashLedger?.profiles?.name || 'User'} Cash Balance`;
    }
    if (d.sourceType === 'pocket_advance') {
      return d.cardTx?.cards ? `${d.cardTx.cards.card_name} Bill` : 'Card Settled';
    }
    if (d.sourceType === 'lent') {
      return d.lent?.borrowers?.name ? `Borrower: ${d.lent.borrowers.name}` : 'Loan Ledger';
    }
    return 'Vault Balance';
  };

  return (
    <SwipeDownDrawer
      visible={isOpen}
      onClose={onClose}
      title="Transaction Journey Trace"
      subtitle="Bidirectional Live Database Linkage"
      heightPercent={0.78}
    >
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={CedarColors.forest800} />
            <Text style={styles.loadingText}>Fetching database relationships...</Text>
          </View>
        ) : !traceData ? (
          <View style={styles.emptyBox}>
            <AlertCircle size={32} color={CedarColors.ink500} />
            <Text style={styles.emptyText}>No linked database records found.</Text>
          </View>
        ) : (
          <View style={styles.content}>
            {/* 1. Visual Journey Flow Banner */}
            <View style={styles.journeyCard}>
              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#2E944B' }]} />
                <Text style={styles.nodeLabel}>ORIGIN</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {getOrigin(traceData)}
                </Text>
              </View>

              <ChevronRight size={16} color={CedarColors.ink500} />

              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#D97706' }]} />
                <Text style={styles.nodeLabel}>ACTION / MEDIUM</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {getAction(traceData)}
                </Text>
              </View>

              <ChevronRight size={16} color={CedarColors.ink500} />

              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#2B84D2' }]} />
                <Text style={styles.nodeLabel}>DESTINATION</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {getDestination(traceData)}
                </Text>
              </View>
            </View>

            {/* 2. Core Entity Details */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <CreditCard size={15} color={CedarColors.forest800} />
                <Text style={styles.sectionTitle}>Primary Record</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Record Type</Text>
                <Text style={styles.value}>
                  {traceData.sourceType === 'card_transaction'
                    ? traceData.cardTx?.type === 'withdrawal'
                      ? 'Rotation Withdrawal'
                      : 'Card Bill Payment'
                    : traceData.sourceType === 'spend'
                    ? 'Personal Spend'
                    : traceData.sourceType === 'cash_ledger'
                    ? 'Cash Ledger'
                    : traceData.sourceType === 'pocket_advance'
                    ? 'Pocket Advance'
                    : 'Personal Loan'}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Amount</Text>
                <Text style={[styles.value, { fontWeight: '800', color: CedarColors.ink900 }]}>
                  ₹
                  {Number(
                    traceData.cardTx?.amount ||
                      traceData.spend?.amount ||
                      traceData.cashLedger?.amount ||
                      traceData.pocketAdv?.amount ||
                      traceData.lent?.amount ||
                      target?.amount ||
                      0
                  ).toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Transaction Date</Text>
                <Text style={styles.value}>
                  {traceData.cardTx?.transaction_date ||
                    traceData.spend?.spend_date ||
                    traceData.cashLedger?.transaction_date ||
                    traceData.pocketAdv?.transaction_date ||
                    traceData.lent?.issue_date ||
                    'N/A'}
                </Text>
              </View>

              {(traceData.cardTx?.cards || traceData.spend?.cards || traceData.lent?.cards) && (
                <View style={styles.row}>
                  <Text style={styles.label}>Card</Text>
                  <Text style={styles.value}>
                    {(traceData.cardTx?.cards || traceData.spend?.cards || traceData.lent?.cards)?.card_name} (••
                    {(traceData.cardTx?.cards || traceData.spend?.cards || traceData.lent?.cards)?.last_4_digits})
                  </Text>
                </View>
              )}

              {traceData.cardTx?.recorded_profile && (
                <View style={styles.row}>
                  <Text style={styles.label}>Recorded By</Text>
                  <Text style={styles.value}>{traceData.cardTx.recorded_profile.name}</Text>
                </View>
              )}

              {traceData.cardTx?.settled_profile && (
                <View style={styles.row}>
                  <Text style={styles.label}>Settled To</Text>
                  <Text style={styles.value}>{traceData.cardTx.settled_profile.name}</Text>
                </View>
              )}

              {(traceData.cardTx?.remarks || traceData.spend?.remarks || traceData.lent?.remarks) && (
                <View style={styles.row}>
                  <Text style={styles.label}>Remarks</Text>
                  <Text style={styles.value}>
                    {traceData.cardTx?.remarks || traceData.spend?.remarks || traceData.lent?.remarks}
                  </Text>
                </View>
              )}
            </View>

            {/* 3. Linked Database Entries: Cash Ledgers */}
            {traceData.cashLedgers && traceData.cashLedgers.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Banknote size={15} color="#2E944B" />
                  <Text style={styles.sectionTitle}>
                    Linked Cash on Hand Ledger ({traceData.cashLedgers.length})
                  </Text>
                </View>
                {traceData.cashLedgers.map((cl: any) => (
                  <View key={cl.id} style={styles.subItemBox}>
                    <View style={styles.row}>
                      <Text style={styles.label}>{cl.profiles?.name || 'User Vault'}</Text>
                      <Text
                        style={[
                          styles.value,
                          { color: cl.transaction_type === 'credit' ? '#2E944B' : '#D97706' },
                        ]}
                      >
                        {cl.transaction_type === 'credit' ? '+' : '-'}₹
                        {Number(cl.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <Text style={styles.subNote}>{cl.remarks || 'Cash Ledger entry'}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 4. Linked Pocket Advances */}
            {traceData.pocketAdv && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Coins size={15} color="#7D5AE0" />
                  <Text style={styles.sectionTitle}>Linked Pocket Advance Ledger</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Entry Type</Text>
                  <Text style={styles.value}>{traceData.pocketAdv.entry_type}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Advance Amount</Text>
                  <Text style={[styles.value, { color: '#7D5AE0' }]}>
                    ₹{Math.abs(Number(traceData.pocketAdv.amount)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            )}

            {/* 5. Linked Lent Ledger */}
            {traceData.lent && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <HandCoins size={15} color="#0B3F28" />
                  <Text style={styles.sectionTitle}>Linked Personal Loan Record</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Borrower</Text>
                  <Text style={styles.value}>{traceData.lent.borrowers?.name || 'Borrower'}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Loan Amount</Text>
                  <Text style={[styles.value, { color: '#0B3F28' }]}>
                    ₹{Number(traceData.lent.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            )}

            {/* 6. Database Trace Identifiers */}
            <View style={styles.dbIdCard}>
              <View style={styles.sectionHeader}>
                <ShieldCheck size={14} color={CedarColors.ink500} />
                <Text style={styles.dbIdTitle}>Database Trace Integrity</Text>
              </View>
              <Text style={styles.dbIdText}>
                ID:{' '}
                {traceData.cardTx?.id ||
                  traceData.spend?.id ||
                  traceData.cashLedger?.id ||
                  traceData.pocketAdv?.id ||
                  traceData.lent?.id ||
                  target?.id}
              </Text>
              <Text style={styles.dbIdText}>
                Created:{' '}
                {traceData.cardTx?.created_at ||
                  traceData.spend?.created_at ||
                  traceData.cashLedger?.created_at ||
                  traceData.pocketAdv?.created_at ||
                  traceData.lent?.created_at ||
                  'Verified'}
              </Text>
            </View>
          </View>
        )}
      </DrawerScrollView>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  scrollBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  emptyBox: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  content: {
    gap: 12,
  },
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CedarColors.forest900,
    borderRadius: 18,
    padding: 14,
  },
  journeyNode: {
    flex: 1,
    alignItems: 'center',
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  nodeLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#A3D9B5',
    letterSpacing: 0.5,
  },
  nodeValue: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
    marginTop: 2,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: CedarColors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  value: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  subItemBox: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
  },
  subNote: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  dbIdCard: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
    gap: 4,
  },
  dbIdTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  dbIdText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
});
