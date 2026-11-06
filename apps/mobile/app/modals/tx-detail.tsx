import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import {
  ArrowLeft,
  Share2,
  Check,
  CreditCard,
  QrCode,
  CheckCircle2,
  Receipt,
  User,
  Clock,
  ChevronRight,
  ShieldCheck,
  Banknote,
  Coins,
  ArrowLeftRight,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function TxDetailModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const [loading, setLoading] = useState(true);
  const [txRecord, setTxRecord] = useState<any>(null);
  const [cashLedgers, setCashLedgers] = useState<any[]>([]);

  useEffect(() => {
    async function loadTx() {
      if (!params.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const rawId = params.id.startsWith('tx-') || params.id.startsWith('sp-')
          ? params.id.slice(3)
          : params.id;

        const isSpend = params.type === 'spend' || params.id.startsWith('sp-');

        if (isSpend) {
          const { data: sp } = await supabase
            .from('spends')
            .select(`
              *,
              cards (id, card_name, last_4_digits),
              profiles:user_id (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          setTxRecord(sp ? { ...sp, recordType: 'spend' } : null);
        } else {
          const { data: ct } = await supabase
            .from('card_transactions')
            .select(`
              *,
              cards (id, card_name, last_4_digits),
              qrs (id, merchant_name, upi_id),
              recorded_profile:recorded_by (id, name),
              settled_profile:settled_by (id, name)
            `)
            .eq('id', rawId)
            .maybeSingle();

          if (ct) {
            const { data: clList } = await supabase
              .from('cash_on_hand_ledger')
              .select('*, profiles:user_id(name)')
              .eq('linked_card_transaction_id', rawId);

            setTxRecord({ ...ct, recordType: 'card_transaction' });
            setCashLedgers(clList || []);
          }
        }
      } catch (err) {
        console.error('Error fetching tx details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTx();
  }, [params.id, params.type]);

  const isSpend = txRecord?.recordType === 'spend';
  const isWithdrawal = txRecord?.type === 'withdrawal';
  const amount = Number(txRecord?.amount || 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header with zero haptics */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={CedarColors.ink900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={CedarColors.forest800} />
            <Text style={styles.loadingText}>Loading live transaction record...</Text>
          </View>
        ) : !txRecord ? (
          <View style={styles.heroSection}>
            <Text style={styles.merchantName}>Transaction</Text>
            <Text style={styles.categoryLabel}>No transaction data available.</Text>
          </View>
        ) : (
          <>
            {/* Merchant / Purpose Hero */}
            <View style={styles.heroSection}>
              <View style={styles.merchantLogo}>
                <Text style={styles.merchantInitial}>
                  {(txRecord.cards?.card_name || txRecord.qrs?.merchant_name || 'C').charAt(0)}
                </Text>
              </View>
              <Text style={styles.merchantName}>
                {isWithdrawal
                  ? txRecord.qrs?.merchant_name || 'Rotation Withdrawal'
                  : isSpend
                  ? txRecord.remarks || txRecord.spend_type || 'Personal Spend'
                  : 'Card Bill Payment'}
              </Text>
              <Text style={styles.categoryLabel}>
                {isWithdrawal
                  ? `• Card Rotation (${txRecord.cards?.card_name || 'Card'})`
                  : isSpend
                  ? `• Spend (${txRecord.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand'})`
                  : `• Bill Payment (${txRecord.cards?.card_name || 'Card'})`}
              </Text>
              <Text style={styles.amountText}>
                {isWithdrawal || isSpend ? '-' : '+'}₹{amount.toLocaleString('en-IN')}
              </Text>

              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>
                  {txRecord.status || 'Settled'} • {txRecord.transaction_date || txRecord.spend_date}
                </Text>
              </View>
            </View>

            {/* Journey Flow Trace Card */}
            <View style={styles.journeyCard}>
              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#2E944B' }]} />
                <Text style={styles.nodeLabel}>ORIGIN</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {isWithdrawal
                    ? `${txRecord.cards?.card_name || 'Card'} (••${txRecord.cards?.last_4_digits || '0000'})`
                    : txRecord.payment_method === 'own_pocket'
                    ? 'Personal Pocket'
                    : 'Cash on Hand'}
                </Text>
              </View>

              <ChevronRight size={14} color={CedarColors.ink500} />

              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#D97706' }]} />
                <Text style={styles.nodeLabel}>MEDIUM</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {isWithdrawal
                    ? txRecord.qrs?.merchant_name ? `QR: ${txRecord.qrs.merchant_name}` : 'Rotation'
                    : isSpend
                    ? 'Personal'
                    : 'Bill Paydown'}
                </Text>
              </View>

              <ChevronRight size={14} color={CedarColors.ink500} />

              <View style={styles.journeyNode}>
                <View style={[styles.nodeDot, { backgroundColor: '#2B84D2' }]} />
                <Text style={styles.nodeLabel}>DESTINATION</Text>
                <Text style={styles.nodeValue} numberOfLines={1}>
                  {isWithdrawal
                    ? txRecord.settled_profile?.name ? `Vault (${txRecord.settled_profile.name})` : 'Settlement Vault'
                    : `${txRecord.cards?.card_name || 'Card'} Cleared`}
                </Text>
              </View>
            </View>

            {/* Receipt Details Box */}
            <View style={styles.receiptBox}>
              <Text style={styles.receiptTitle}>RECORD SPECIFICATIONS</Text>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Transaction Date</Text>
                <Text style={styles.receiptValue}>
                  {txRecord.transaction_date || txRecord.spend_date}
                </Text>
              </View>

              {txRecord.cards && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Card</Text>
                  <Text style={styles.receiptValue}>
                    {txRecord.cards.card_name} (••{txRecord.cards.last_4_digits})
                  </Text>
                </View>
              )}

              {txRecord.recorded_profile && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Recorded By</Text>
                  <Text style={styles.receiptValue}>{txRecord.recorded_profile.name}</Text>
                </View>
              )}

              {txRecord.remarks && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Remarks</Text>
                  <Text style={styles.receiptValue}>{txRecord.remarks}</Text>
                </View>
              )}

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Database ID</Text>
                <Text style={[styles.receiptValue, { fontSize: 10, fontFamily: CedarTypography.body }]}>
                  {txRecord.id}
                </Text>
              </View>
            </View>

            {/* Linked Cash On Hand Entries */}
            {cashLedgers.length > 0 && (
              <View style={styles.receiptBox}>
                <Text style={styles.receiptTitle}>LINKED CASH VAULT ENTRIES ({cashLedgers.length})</Text>
                {cashLedgers.map((cl) => (
                  <View key={cl.id} style={styles.subItemBox}>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>{cl.profiles?.name || 'Vault'}</Text>
                      <Text
                        style={[
                          styles.receiptValue,
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
          </>
        )}
      </ScrollView>
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
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CedarColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  scrollContent: {
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
  heroSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  merchantLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CedarColors.forest800,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  merchantInitial: {
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  merchantName: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  categoryLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
    marginBottom: 6,
  },
  amountText: {
    fontSize: 26,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2E944B',
  },
  statusText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#2E944B',
    fontWeight: '700',
  },
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CedarColors.forest900,
    borderRadius: 18,
    padding: 14,
    marginVertical: 10,
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
    fontSize: 8,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#A3D9B5',
    letterSpacing: 0.5,
  },
  nodeValue: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
    marginTop: 2,
    textAlign: 'center',
  },
  receiptBox: {
    backgroundColor: CedarColors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  receiptTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink500,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  receiptLabel: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  receiptValue: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  subItemBox: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },
  subNote: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
});
