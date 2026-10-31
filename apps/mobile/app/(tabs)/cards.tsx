import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { CedarCard } from '../../components/CedarCard';
import { HapticButton } from '../../components/HapticButton';
import { CardsSkeleton } from '../../components/Skeleton';
import { Plus, CreditCard, ArrowUpRight, ArrowDownLeft, ShieldCheck, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

interface CardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
}

interface CardTx {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  isCredit: boolean;
}

export default function CardsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'virtual' | 'physical'>('virtual');
  const [cards, setCards] = useState<CardItem[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [cardTxs, setCardTxs] = useState<CardTx[]>([]);
  const [availableLimit, setAvailableLimit] = useState(0);

  const fetchCardsData = useCallback(async () => {
    try {
      const { data: cardsData } = await supabase
        .from('cards')
        .select('*')
        .order('is_primary', { ascending: false });

      if (cardsData && cardsData.length > 0) {
        setCards(cardsData);

        const currentCard = cardsData[activeCardIndex] || cardsData[0];
        const cardLimit = Number(currentCard.total_limit || 0);

        // Fetch card's transactions
        const { data: txData } = await supabase
          .from('card_transactions')
          .select('*')
          .eq('card_id', currentCard.id)
          .order('transaction_date', { ascending: false })
          .limit(6);

        const withdrawals =
          txData
            ?.filter((t) => t.type === 'withdrawal')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

        const billPayments =
          txData
            ?.filter((t) => t.type === 'bill_payment')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

        const calculated = Math.max(0, cardLimit - withdrawals + billPayments);
        setAvailableLimit(calculated);

        if (txData && txData.length > 0) {
          setCardTxs(
            txData.map((t) => ({
              id: t.id,
              title: t.type === 'bill_payment' ? 'Bill Repayment' : (t.remarks || 'Rotation Withdrawal'),
              category: t.type === 'bill_payment' ? 'Settlement' : 'Credit Rotation',
              amount: Number(t.amount),
              date: t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
              isCredit: t.type === 'bill_payment',
            }))
          );
        } else {
          setCardTxs([]);
        }
      } else {
        setCards([]);
        setAvailableLimit(0);
        setCardTxs([]);
      }
    } catch (err) {
      console.error('Error fetching cards:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [activeCardIndex]);

  useEffect(() => {
    fetchCardsData();
  }, [fetchCardsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCardsData();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <CardsSkeleton />
      </SafeAreaView>
    );
  }

  const currentCard = cards[activeCardIndex] || null;

  return (
    <SafeAreaView style={styles.safeArea}>
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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Card Vault</Text>
            <Text style={styles.subtitle}>Unified Credit Limits & Statements</Text>
          </View>
          <HapticButton
            style={styles.addCardBtn}
            onPress={() => {
              router.push('/(tabs)/transactions');
            }}
            feedbackType="rigid"
          >
            <Plus size={16} color="#F6F9F5" strokeWidth={2.4} />
            <Text style={styles.addCardBtnText}>Record Tx</Text>
          </HapticButton>
        </View>

        {/* Card Selector Pills */}
        {cards.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsPickerRow}>
            {cards.map((c, index) => {
              const isSel = activeCardIndex === index;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cardPill, isSel && styles.activeCardPill]}
                  onPress={() => {
                    setActiveCardIndex(index);
                  }}
                  activeOpacity={0.8}
                >
                  <CreditCard size={14} color={isSel ? CedarColors.forest800 : CedarColors.ink500} />
                  <Text style={[styles.cardPillText, isSel && styles.activeCardPillText]}>
                    {c.card_name} (••{c.last_4_digits})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Card 3D Presentation */}
        {currentCard ? (
          <CedarCard
            cardName={currentCard.card_name}
            last4Digits={currentCard.last_4_digits}
            totalLimit={Number(currentCard.total_limit)}
            availableLimit={availableLimit}
            holderName="CREDICS VAULT"
            validThru={`Day ${currentCard.bill_due_day || 26}`}
            onFreeze={() => {}}
            onLimits={() => {}}
            onPin={() => {}}
            onDetails={() => {}}
          />
        ) : (
          <View style={styles.noCardBox}>
            <CreditCard size={40} color={CedarColors.ink500} strokeWidth={1.5} />
            <Text style={styles.noCardTitle}>No Credit Cards Connected</Text>
            <Text style={styles.noCardSub}>Contact admin to link your credit card to Credics.</Text>
          </View>
        )}

        {/* Recent on this card */}
        <View style={styles.recentCard}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent on this card</Text>
            <TouchableOpacity
              onPress={() => {
                router.push('/(tabs)/transactions');
              }}
            >
              <Text style={styles.viewAllText}>View all →</Text>
            </TouchableOpacity>
          </View>

          {cardTxs.length > 0 ? (
            cardTxs.map((tx) => (
              <View key={tx.id} style={styles.activityItem}>
                <View style={styles.activityLeft}>
                  <View
                    style={[
                      styles.activityIconBox,
                      tx.isCredit ? styles.creditIconBox : styles.debitIconBox,
                    ]}
                  >
                    {tx.isCredit ? (
                      <ArrowDownLeft size={18} color="#2E944B" />
                    ) : (
                      <ArrowUpRight size={18} color={CedarColors.forest800} />
                    )}
                  </View>
                  <View>
                    <Text style={styles.activityName}>{tx.title}</Text>
                    <Text style={styles.activityTime}>{tx.category} • {tx.date}</Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.activityAmount,
                    tx.isCredit ? styles.creditAmount : styles.debitAmount,
                  ]}
                >
                  {tx.isCredit ? `+₹${tx.amount.toLocaleString('en-IN')}` : `-₹${tx.amount.toLocaleString('en-IN')}`}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCardContainer}>
              <ShieldCheck size={28} color="#2E944B" />
              <Text style={styles.emptyCardText}>No recent activity on this card.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas,
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
    paddingBottom: 12,
  },
  title: {
    color: CedarColors.ink900,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: CedarTypography.display,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.forest800,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addCardBtnText: {
    color: '#F6F9F5',
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  cardsPickerRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginRight: 8,
  },
  activeCardPill: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  cardPillText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeCardPillText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  noCardBox: {
    marginHorizontal: 20,
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 16,
  },
  noCardTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
    marginTop: 10,
  },
  noCardSub: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 4,
    textAlign: 'center',
  },
  recentCard: {
    backgroundColor: CedarColors.card,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginTop: 10,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  recentTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CedarColors.border,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditIconBox: {
    backgroundColor: 'rgba(46, 148, 75, 0.1)',
  },
  debitIconBox: {
    backgroundColor: 'rgba(10, 38, 28, 0.06)',
  },
  activityName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  activityTime: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  activityAmount: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  creditAmount: {
    color: '#2E944B',
  },
  debitAmount: {
    color: CedarColors.ink900,
  },
  emptyCardContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyCardText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
});
