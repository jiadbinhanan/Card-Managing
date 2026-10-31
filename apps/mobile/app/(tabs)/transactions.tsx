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
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Plus,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
  Receipt,
  CheckCircle2,
  Clock,
  ChevronDown,
  X,
  Calendar,
  Layers,
  Banknote,
  QrCode,
  AlertCircle,
  Trash2,
  Check,
  User,
  ShieldCheck,
  Coins,
} from 'lucide-react-native';

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string;
  bill_gen_day?: number;
  bill_due_day?: number;
}

interface ProfileData {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

interface QRData {
  id: string;
  merchant_name: string;
  status: string;
}

interface CashSourceBreakdownEntry {
  card_id: string;
  amount: number;
}

interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string;
}

interface UnifiedTransactionItem {
  id: string;
  rawId: string;
  type: 'withdrawal' | 'bill_payment' | 'spend';
  amount: number;
  displayDate: string;
  sortDate: number;
  status: string;
  title: string;
  subtitle: string;
  iconName: 'withdrawal' | 'bill_payment' | 'spend' | 'repayment';
  color: string;
  bgColor: string;
  remarks?: string;
  cardId?: string;
  cardDetails: string;
  paymentMethod: string;
  recordedBy: string;
  userId: string;
  isRepaymentFlag?: boolean;
  cashSourceBreakdown?: Array<{ cardLabel: string; amount: number }>;
  isCrossCardCash?: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TransactionsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'rotations' | 'spends' | 'bill_paid'>('all');

  // Filters
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterDateType, setFilterDateType] = useState<'all' | 'today' | 'month'>('all');
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string>('all');
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);
  const [isUserFilterModalOpen, setIsUserFilterModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Data States
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileData[]>([]);
  const [allQrs, setAllQrs] = useState<QRData[]>([]);
  const [currentUser, setCurrentUser] = useState<ProfileData | null>(null);
  const [familyLimitsMap, setFamilyLimitsMap] = useState<Record<string, number>>({});
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});
  const [userCardCashMap, setUserCardCashMap] = useState<Record<string, Record<string, number>>>({});
  const [cardDueMap, setCardDueMap] = useState<Record<string, number>>({});
  const [cardDueDateMap, setCardDueDateMap] = useState<Record<string, string>>({});
  const [unifiedList, setUnifiedList] = useState<UnifiedTransactionItem[]>([]);

  // Record Entry Modal States
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordType, setRecordType] = useState<'rotate' | 'spend' | 'bill'>('bill');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState('');
  const [selectedActorUserId, setSelectedActorUserId] = useState('');
  const [entryCardId, setEntryCardId] = useState('');
  const [billCardId, setBillCardId] = useState('');
  const [selectedQrId, setSelectedQrId] = useState('');
  const [spendMethod, setSpendMethod] = useState<'credit_card' | 'cash_on_hand'>('credit_card');
  const [billMethod, setBillMethod] = useState<'cash_on_hand' | 'own_pocket'>('cash_on_hand');
  const [isDebtRepayment, setIsDebtRepayment] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [cashSources, setCashSources] = useState<CashSourceRow[]>([{ uid: uid(), cardId: '', amount: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper: Card label
  const getCardLabel = useCallback(
    (cardId?: string | null) => {
      if (!cardId) return 'Unknown Card';
      const c = allCards.find((cc) => cc.id === cardId);
      return c ? `${c.card_name} (**${c.last_4_digits})` : 'Unknown Card';
    },
    [allCards]
  );

  // Load Transactions & Ledger Data
  const fetchData = useCallback(async () => {
    try {
      // Current session user
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [cardsRes, profilesRes, qrsRes, txsRes, spendsRes, cohRes, cyclesRes] = await Promise.all([
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('*').order('name'),
        supabase.from('qrs').select('*').order('merchant_name'),
        supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('spends').select('*').order('spend_date', { ascending: false }),
        supabase.from('cash_on_hand').select('*'),
        supabase.from('billing_cycles').select('*').in('status', ['unpaid', 'partially_paid']),
      ]);

      const cards: CardData[] = cardsRes.data || [];
      const profiles: ProfileData[] = profilesRes.data || [];
      const qrs: QRData[] = qrsRes.data || [];
      const rawTxs = txsRes.data || [];
      const rawSpends = spendsRes.data || [];
      const coh = cohRes.data || [];
      const activeCycles = cyclesRes.data || [];

      setAllCards(cards);
      setAllProfiles(profiles);
      setAllQrs(qrs);

      if (currentAuthUser) {
        const found = profiles.find((p) => p.id === currentAuthUser.id);
        if (found) setCurrentUser(found);
      } else if (profiles.length > 0) {
        setCurrentUser(profiles[0]);
      }

      // Default actor user
      if (!selectedActorUserId && profiles.length > 0) {
        setSelectedActorUserId(currentAuthUser?.id || profiles[0].id);
      }

      // 1. Calculate Limits Map
      const limitsMap: Record<string, number> = {};
      const primaryCards = cards.filter((c) => c.is_primary);
      primaryCards.forEach((primary) => {
        const familyIds = cards
          .filter((c) => c.id === primary.id || c.parent_card_id === primary.id)
          .map((c) => c.id);

        const famTxs = rawTxs.filter((t) => familyIds.includes(t.card_id || ''));
        const famSpnds = rawSpends.filter((s) => familyIds.includes(s.card_id || ''));

        const w = famTxs
          .filter((t) => {
            if (t.type !== 'withdrawal') return false;
            const isRotation = t.qr_id || (t.remarks || '').toLowerCase().includes('rotation');
            if (isRotation) return true;
            return t.status === 'pending_settlement' || t.status === 'partially_settled';
          })
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        const b = famTxs.filter((t) => t.type === 'bill_payment').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const s = famSpnds.filter((sp) => sp.payment_method === 'credit_card').reduce((sum, sp) => sum + Number(sp.amount || 0), 0);

        limitsMap[primary.id] = Number(primary.total_limit || 0) - w - s + b;
      });
      setFamilyLimitsMap(limitsMap);

      // 2. Calculate Cash on Hand Map
      const cashMap: Record<string, number> = {};
      const cardCashMap: Record<string, Record<string, number>> = {};
      coh.forEach((c) => {
        cashMap[c.user_id] = (cashMap[c.user_id] || 0) + Number(c.current_balance || 0);
        if (c.user_id && c.card_id) {
          if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
          cardCashMap[c.user_id][c.card_id] = Number(c.current_balance || 0);
        }
      });
      setUserCashMap(cashMap);
      setUserCardCashMap(cardCashMap);

      // 3. Calculate Due & Due Date Map
      const dMap: Record<string, number> = {};
      const dueDateMap: Record<string, string> = {};
      activeCycles.forEach((c) => {
        if (c.card_id) {
          const dueAmt = Number(c.generated_amount || 0) - Number(c.paid_amount || 0);
          dMap[c.card_id] = (dMap[c.card_id] || 0) + dueAmt;
          if (dueAmt > 0) {
            const cardInfo = cards.find((card) => card.id === c.card_id);
            if (cardInfo && (cardInfo.bill_due_day || cardInfo.bill_gen_day)) {
              const billMonthDate = new Date(c.billing_month);
              const genDay = cardInfo.bill_gen_day || 7;
              const dueDay = cardInfo.bill_due_day || genDay + 19;
              const dueYear = billMonthDate.getFullYear();
              let dueMonth = billMonthDate.getMonth() + (dueDay < genDay ? 1 : 0);
              const dueDateObj = new Date(dueYear, dueMonth, dueDay);
              dueDateMap[c.card_id] = dueDateObj.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
            }
          }
        }
      });
      setCardDueMap(dMap);
      setCardDueDateMap(dueDateMap);

      // 4. Build Unified Master Transactions List
      const items: UnifiedTransactionItem[] = [];

      rawTxs.forEach((t) => {
        const cardObj = cards.find((c) => c.id === t.card_id);
        const cardInfo = cardObj ? `${cardObj.card_name} (**${cardObj.last_4_digits})` : 'Card Not Linked';
        const profileObj = profiles.find((p) => p.id === t.recorded_by);
        const qrObj = qrs.find((q) => q.id === t.qr_id);

        const breakdown = t.cash_source_breakdown as CashSourceBreakdownEntry[] | null;
        const hasCrossCardCash = !!(
          breakdown &&
          breakdown.length > 0 &&
          breakdown.some((b) => b.card_id !== t.card_id)
        );

        const isWithdrawal = t.type === 'withdrawal';
        const displayDate = t.transaction_date || '';

        items.push({
          id: `tx-${t.id}`,
          rawId: t.id,
          type: t.type,
          amount: Number(t.amount || 0),
          displayDate,
          sortDate: new Date(displayDate).getTime() || 0,
          status: t.status || 'settled',
          title: isWithdrawal ? qrObj?.merchant_name || 'Rotation Withdrawal' : 'Card Bill Payment',
          subtitle: isWithdrawal
            ? `Rotated by ${profileObj?.name?.split(' ')[0] || 'User'}`
            : `Paid by ${profileObj?.name?.split(' ')[0] || 'User'}`,
          iconName: isWithdrawal ? 'withdrawal' : 'bill_payment',
          color: isWithdrawal ? '#E05D52' : '#2D7A5D',
          bgColor: isWithdrawal ? '#FCEBEA' : '#E8F5E9',
          remarks: t.remarks || undefined,
          cardId: t.card_id,
          cardDetails: cardInfo,
          paymentMethod: isWithdrawal
            ? 'Credit Card'
            : t.payment_method === 'own_pocket'
            ? 'Own Pocket'
            : 'Cash on Hand',
          recordedBy: profileObj?.name || 'User',
          userId: t.recorded_by || '',
          cashSourceBreakdown: breakdown?.map((b) => {
            const bc = cards.find((c) => c.id === b.card_id);
            return {
              cardLabel: bc ? `${bc.card_name} (**${bc.last_4_digits})` : 'Card',
              amount: Number(b.amount || 0),
            };
          }),
          isCrossCardCash: hasCrossCardCash,
        });
      });

      rawSpends.forEach((s) => {
        const isRepayment = Number(s.amount || 0) < 0;
        const cardObj = cards.find((c) => c.id === s.card_id);
        const cardInfo = cardObj ? `${cardObj.card_name} (**${cardObj.last_4_digits})` : 'Card Not Linked';
        const profileObj = profiles.find((p) => p.id === s.user_id);

        const breakdown = s.cash_source_breakdown as CashSourceBreakdownEntry[] | null;
        const hasCrossCardCash = !!(
          breakdown &&
          breakdown.length > 0 &&
          breakdown.some((b) => b.card_id !== s.card_id)
        );

        const displayDate = s.spend_date || '';

        items.push({
          id: `sp-${s.id}`,
          rawId: s.id,
          type: 'spend',
          amount: Math.abs(Number(s.amount || 0)),
          displayDate,
          sortDate: new Date(displayDate).getTime() || 0,
          status: 'settled',
          title: isRepayment ? 'Debt Repayment' : s.remarks || 'Personal Spend',
          subtitle: `Spent by ${profileObj?.name?.split(' ')[0] || 'User'}`,
          iconName: isRepayment ? 'repayment' : 'spend',
          color: isRepayment ? '#2D7A5D' : '#D97706',
          bgColor: isRepayment ? '#E8F5E9' : '#FEF3C7',
          isRepaymentFlag: isRepayment,
          remarks: s.remarks || undefined,
          cardId: s.card_id,
          cardDetails: cardInfo,
          paymentMethod: s.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand',
          recordedBy: profileObj?.name || 'User',
          userId: s.user_id || '',
          cashSourceBreakdown: breakdown?.map((b) => {
            const bc = cards.find((c) => c.id === b.card_id);
            return {
              cardLabel: bc ? `${bc.card_name} (**${bc.last_4_digits})` : 'Card',
              amount: Number(b.amount || 0),
            };
          }),
          isCrossCardCash: hasCrossCardCash,
        });
      });

      items.sort((a, b) => b.sortDate - a.sortDate);
      setUnifiedList(items);

      // Default card selections for form
      if (cards.length > 0 && !entryCardId) {
        setEntryCardId(cards[0].id);
      }
      const prims = cards.filter((c) => c.is_primary);
      if (prims.length > 0 && !billCardId) {
        setBillCardId(prims[0].id);
      }
      if (qrs.length > 0 && !selectedQrId) {
        setSelectedQrId(qrs[0].id);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedActorUserId, entryCardId, billCardId, selectedQrId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('mobile-transactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_cycles' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Grouped and Filtered Transactions
  const groupedLedger = useMemo(() => {
    const filtered = unifiedList.filter((item) => {
      // 1. User Filter
      if (filterUser !== 'all' && item.userId !== filterUser) return false;

      // 2. Card Filter
      if (selectedVaultCardId !== 'all' && item.cardId !== selectedVaultCardId) return false;

      // 3. Tab Filter
      if (activeTab === 'rotations' && item.type !== 'withdrawal') return false;
      if (activeTab === 'spends' && (item.type !== 'spend' || item.isRepaymentFlag)) return false;
      if (activeTab === 'bill_paid' && item.type !== 'bill_payment' && !item.isRepaymentFlag) return false;

      // 4. Date Filter
      if (filterDateType !== 'all' && item.displayDate) {
        const itemDate = new Date(item.displayDate);
        const now = new Date();
        if (filterDateType === 'today') {
          if (itemDate.toDateString() !== now.toDateString()) return false;
        } else if (filterDateType === 'month') {
          if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        }
      }
      return true;
    });

    const groups: Record<string, UnifiedTransactionItem[]> = {};
    filtered.forEach((item) => {
      const dateKey = item.displayDate
        ? new Date(item.displayDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Recent Activity';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    return groups;
  }, [unifiedList, filterUser, selectedVaultCardId, activeTab, filterDateType]);

  // Multi-Source Cash Helpers
  const actingUserId = selectedActorUserId || currentUser?.id || '';
  const currentActorCashByCard = userCardCashMap[actingUserId] || {};
  const cardsWithCash = useMemo(() => {
    return allCards.filter((c) => (currentActorCashByCard[c.id] || 0) > 0);
  }, [allCards, currentActorCashByCard]);

  const addCashSourceRow = () => {
    const used = new Set(cashSources.map((s) => s.cardId));
    const nextCard = cardsWithCash.find((c) => !used.has(c.id));
    setCashSources([...cashSources, { uid: uid(), cardId: nextCard?.id || '', amount: '' }]);
  };

  const updateCashSourceRow = (index: number, patch: Partial<CashSourceRow>) => {
    setCashSources(cashSources.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeCashSourceRow = (index: number) => {
    setCashSources(cashSources.filter((_, i) => i !== index));
  };

  const validCashSources = useMemo(() => {
    return cashSources
      .filter((s) => s.cardId && Number(s.amount) > 0)
      .map((s) => ({ cardId: s.cardId, amount: Number(s.amount) }));
  }, [cashSources]);

  const cashAllocatedTotal = useMemo(() => {
    return validCashSources.reduce((sum, s) => sum + s.amount, 0);
  }, [validCashSources]);

  const numAmount = Number(amount) || 0;
  const isCashSourceMode =
    (recordType === 'bill' && billMethod === 'cash_on_hand') ||
    (recordType === 'spend' && spendMethod === 'cash_on_hand');

  const allocationValid =
    !isCashSourceMode ||
    (numAmount > 0 &&
      cashAllocatedTotal === numAmount &&
      validCashSources.length > 0 &&
      validCashSources.every((s) => s.amount <= (currentActorCashByCard[s.cardId] || 0)));

  // Open Record Modal
  const openRecordModal = (type: 'rotate' | 'spend' | 'bill') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setRecordType(type);
    setAmount('');
    setRemarks('');
    setIsDebtRepayment(false);
    setTxDate(new Date().toISOString().slice(0, 10));

    // Reset default cash source
    const defaultCardId =
      cardsWithCash.length > 0
        ? cardsWithCash[0].id
        : allCards.length > 0
        ? allCards[0].id
        : '';
    setCashSources([{ uid: uid(), cardId: defaultCardId, amount: '' }]);

    setIsRecordModalOpen(true);
  };

  // FIFO Bill Payment Processor
  const processBillPaymentFIFO = async (cardId: string, amt: number) => {
    const result = { cycleId: null as string | null, status: null as string | null };

    const { data: dueCycles } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('card_id', cardId)
      .in('status', ['unpaid', 'partially_paid'])
      .order('billing_month', { ascending: true });

    let targetCycle = dueCycles && dueCycles.length > 0 ? dueCycles[0] : null;

    if (!targetCycle) {
      const { data: latestCycles } = await supabase
        .from('billing_cycles')
        .select('*')
        .eq('card_id', cardId)
        .order('billing_month', { ascending: false })
        .limit(1);
      if (latestCycles && latestCycles.length > 0) {
        targetCycle = latestCycles[0];
      }
    }

    if (targetCycle) {
      const genAmt = Number(targetCycle.generated_amount || 0);
      const paidAmt = Number(targetCycle.paid_amount || 0);
      const newPaid = paidAmt + amt;
      let newStatus = targetCycle.status;

      if (newPaid >= genAmt) {
        newStatus = 'paid';
      } else if (newPaid > 0) {
        newStatus = 'partially_paid';
      }

      await supabase
        .from('billing_cycles')
        .update({ paid_amount: newPaid, status: newStatus })
        .eq('id', targetCycle.id);

      result.cycleId = targetCycle.id;
      result.status = newStatus;
    }

    return result;
  };

  // Submit Record
  const handleSaveRecord = async () => {
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    const activeCardId = recordType === 'bill' ? billCardId : entryCardId;
    if (!activeCardId) {
      Alert.alert('Card Required', 'Please select a card.');
      return;
    }

    if (isCashSourceMode && !allocationValid) {
      Alert.alert(
        'Allocation Incomplete',
        `Please allocate exactly ₹${numAmount.toLocaleString('en-IN')} across valid cards with sufficient cash balance.`
      );
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const finalDate = txDate || new Date().toISOString().slice(0, 10);
      const isSpendCash = recordType === 'spend' && spendMethod === 'cash_on_hand';
      const isBillCash = recordType === 'bill' && billMethod === 'cash_on_hand';
      const breakdownForInsert =
        isBillCash || isSpendCash
          ? validCashSources.map((s) => ({ card_id: s.cardId, amount: s.amount }))
          : null;

      if (recordType === 'rotate') {
        await supabase.from('card_transactions').insert({
          card_id: activeCardId,
          type: 'withdrawal',
          amount: numAmount,
          qr_id: selectedQrId || null,
          remarks: remarks || 'Rotation Withdrawal',
          status: 'pending_settlement',
          transaction_date: finalDate,
          recorded_by: actingUserId || null,
        });
      } else if (recordType === 'spend') {
        await supabase.from('spends').insert({
          user_id: actingUserId,
          card_id: activeCardId,
          amount: numAmount,
          spend_type: 'personal',
          payment_method: spendMethod,
          remarks: remarks || 'Personal Spend',
          spend_date: finalDate,
          cash_source_breakdown: breakdownForInsert,
        });

        if (spendMethod === 'cash_on_hand' && validCashSources.length > 0) {
          for (const src of validCashSources) {
            await supabase.from('cash_on_hand_ledger').insert({
              card_id: src.cardId,
              user_id: actingUserId,
              amount: src.amount,
              transaction_type: 'debit',
              remarks: `Personal spend ${remarks ? '- ' + remarks : ''}`,
              transaction_date: new Date().toISOString(),
            });
          }
        }
      } else if (recordType === 'bill') {
        const billCycleResult = await processBillPaymentFIFO(activeCardId, numAmount);

        const { data: billTx } = await supabase
          .from('card_transactions')
          .insert({
            card_id: activeCardId,
            type: 'bill_payment',
            amount: numAmount,
            status: 'settled',
            payment_method: billMethod,
            remarks: remarks || 'Card Bill Repayment',
            transaction_date: finalDate,
            recorded_by: actingUserId || null,
            billing_cycle_id: billCycleResult.cycleId,
            cash_source_breakdown: billMethod === 'cash_on_hand' ? breakdownForInsert : null,
          })
          .select('id')
          .single();

        if (billMethod === 'cash_on_hand' && validCashSources.length > 0) {
          for (const src of validCashSources) {
            await supabase.from('cash_on_hand_ledger').insert({
              card_id: src.cardId,
              user_id: actingUserId,
              amount: src.amount,
              transaction_type: 'debit',
              remarks: `Bill payment ${remarks ? '- ' + remarks : ''}`,
              transaction_date: new Date().toISOString(),
              linked_card_transaction_id: billTx?.id || null,
            });
          }
        } else if (billMethod === 'own_pocket') {
          await supabase.from('pocket_advances_ledger').insert({
            user_id: actingUserId,
            card_id: activeCardId,
            amount: -numAmount,
            entry_type: 'advance',
            transaction_date: finalDate,
            linked_card_transaction_id: billTx?.id || null,
            remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`,
          });

          const { data: curAdv } = await supabase
            .from('pocket_advances')
            .select('current_balance')
            .eq('user_id', actingUserId)
            .eq('card_id', activeCardId)
            .maybeSingle();

          const nextAdv = (Number(curAdv?.current_balance) || 0) - numAmount;
          await supabase.from('pocket_advances').upsert({
            user_id: actingUserId,
            card_id: activeCardId,
            current_balance: nextAdv,
          });
        }

        if (isDebtRepayment) {
          await supabase.from('spends').insert({
            user_id: actingUserId,
            card_id: activeCardId,
            amount: -numAmount,
            spend_type: 'repayment',
            payment_method: billMethod,
            remarks: `Debt Cleared ${remarks ? ': ' + remarks : ''}`,
            spend_date: finalDate,
            linked_card_transaction_id: billTx?.id || null,
          });
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRecordModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Save error:', err);
      Alert.alert('Error', err?.message || 'Failed to record entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ================= 1. HEADER ================= */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            {currentUser?.avatar_url ? (
              <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{currentUser?.name?.[0] || 'U'}</Text>
              </View>
            )}
            <View style={styles.avatarStatusDot} />
          </TouchableOpacity>

          <View>
            <Text style={styles.headerSub}>Live Ledger</Text>
            <Text style={styles.headerTitle}>Transactions</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Vault Selector Pill */}
          <TouchableOpacity
            style={styles.vaultPill}
            onPress={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
            activeOpacity={0.8}
          >
            <Layers size={13} color="#2D7A5D" />
            <Text style={styles.vaultPillText} numberOfLines={1}>
              {selectedVaultCardId === 'all'
                ? 'All Cards'
                : allCards.find((c) => c.id === selectedVaultCardId)?.card_name || 'Card'}
            </Text>
            <ChevronDown size={12} color={CedarColors.ink500} />
          </TouchableOpacity>

          {/* Record Button */}
          <HapticButton
            style={styles.recordBtn}
            onPress={() => openRecordModal('bill')}
            feedbackType="rigid"
          >
            <Plus size={16} color="#F6F9F5" strokeWidth={2.5} />
            <Text style={styles.recordBtnText}>Record</Text>
          </HapticButton>
        </View>
      </View>

      {/* ================= 2. MAIN SEGMENTED FILTER TABS ================= */}
      <View style={styles.tabsRow}>
        {(['all', 'rotations', 'spends', 'bill_paid'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'all'
              ? 'All'
              : tab === 'rotations'
              ? 'Rotations'
              : tab === 'spends'
              ? 'Spends'
              : 'Bill Paid';
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

      {/* ================= 3. FILTER PILLS (USER & DATE) ================= */}
      <View style={styles.filterPillsRow}>
        <View style={styles.filterBadge}>
          <Filter size={11} color={CedarColors.ink500} />
          <Text style={styles.filterBadgeText}>Filter</Text>
        </View>

        {/* User Filter Pill */}
        <TouchableOpacity
          style={[styles.filterChip, filterUser !== 'all' && styles.activeFilterChip]}
          onPress={() => setIsUserFilterModalOpen(true)}
          activeOpacity={0.8}
        >
          <User size={12} color={filterUser !== 'all' ? '#1B4D3E' : CedarColors.ink500} />
          <Text style={[styles.filterChipText, filterUser !== 'all' && styles.activeFilterChipText]}>
            {filterUser === 'all'
              ? 'All Users'
              : allProfiles.find((p) => p.id === filterUser)?.name?.split(' ')[0] || 'User'}
          </Text>
          <ChevronDown size={11} color={filterUser !== 'all' ? '#1B4D3E' : CedarColors.ink500} />
        </TouchableOpacity>

        {/* Date Filter Pill */}
        {(['all', 'today', 'month'] as const).map((dType) => {
          const isDateActive = filterDateType === dType;
          const dateLabel = dType === 'all' ? 'All Time' : dType === 'today' ? 'Today' : 'This Month';
          return (
            <TouchableOpacity
              key={dType}
              style={[styles.filterChip, isDateActive && styles.activeFilterChip]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterDateType(dType);
              }}
              activeOpacity={0.8}
            >
              <Clock size={11} color={isDateActive ? '#1B4D3E' : CedarColors.ink500} />
              <Text style={[styles.filterChipText, isDateActive && styles.activeFilterChipText]}>
                {dateLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ================= 4. TIMELINE MASTER FEED ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1B4D3E" />
          <Text style={styles.loaderText}>Loading Ledger Master Feed...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B4D3E']} />}
        >
          {Object.keys(groupedLedger).length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Receipt size={32} color={CedarColors.ink500} />
              </View>
              <Text style={styles.emptyTitle}>No Transactions Found</Text>
              <Text style={styles.emptySub}>
                Try adjusting your filters or record a new transaction above.
              </Text>
            </View>
          ) : (
            Object.entries(groupedLedger).map(([dateLabel, items]) => (
              <View key={dateLabel} style={styles.dateGroup}>
                {/* Date Header Pill */}
                <View style={styles.dateHeaderRow}>
                  <View style={styles.dateBadge}>
                    <Calendar size={11} color="#1B4D3E" />
                    <Text style={styles.dateBadgeText}>{dateLabel}</Text>
                  </View>
                  <View style={styles.dateDivider} />
                </View>

                {/* Items in this date */}
                {items.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const isNegative = item.type === 'withdrawal' || (item.type === 'spend' && !item.isRepaymentFlag);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.txCard, isExpanded && styles.txCardExpanded]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setExpandedId(isExpanded ? null : item.id);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.txMainRow}>
                        {/* Icon */}
                        <View style={[styles.txIconBox, { backgroundColor: item.bgColor }]}>
                          {item.iconName === 'withdrawal' && <ArrowDownLeft size={16} color={item.color} />}
                          {item.iconName === 'bill_payment' && <CheckCircle2 size={16} color={item.color} />}
                          {item.iconName === 'repayment' && <Wallet size={16} color={item.color} />}
                          {item.iconName === 'spend' && <Receipt size={16} color={item.color} />}
                        </View>

                        {/* Middle Info */}
                        <View style={styles.txInfoCol}>
                          <View style={styles.txTitleRow}>
                            <Text style={styles.txTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            {item.isCrossCardCash && (
                              <View style={styles.crossCardBadge}>
                                <Text style={styles.crossCardBadgeText}>Cross-Card</Text>
                              </View>
                            )}
                          </View>

                          {item.remarks ? (
                            <Text style={styles.txRemarks} numberOfLines={1}>
                              "{item.remarks}"
                            </Text>
                          ) : null}

                          <Text style={styles.txSubtitle}>{item.subtitle}</Text>
                        </View>

                        {/* Right Amount & Chevron */}
                        <View style={styles.txAmountCol}>
                          <Text style={[styles.txAmountText, { color: item.color }]}>
                            {isNegative ? '-' : '+'}₹{item.amount.toLocaleString('en-IN')}
                          </Text>
                          <View style={styles.chevronRow}>
                            <Text style={styles.txCardPillText}>{item.cardDetails.split(' ')[0]}</Text>
                            <ChevronDown
                              size={12}
                              color={CedarColors.ink500}
                              style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                            />
                          </View>
                        </View>
                      </View>

                      {/* Expandable Deep Breakdown */}
                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          <View style={styles.expandedDivider} />
                          <View style={styles.expandedGrid}>
                            <View style={styles.expandedGridItem}>
                              <Text style={styles.expandedFieldLabel}>Card Used</Text>
                              <Text style={styles.expandedFieldValue}>{item.cardDetails}</Text>
                            </View>
                            <View style={styles.expandedGridItem}>
                              <Text style={styles.expandedFieldLabel}>Fund Source</Text>
                              <Text style={styles.expandedFieldValue}>{item.paymentMethod}</Text>
                            </View>
                          </View>

                          {item.cashSourceBreakdown && item.cashSourceBreakdown.length > 0 && (
                            <View style={styles.breakdownBox}>
                              <Text style={styles.breakdownTitle}>Cash Source Breakdown</Text>
                              {item.cashSourceBreakdown.map((b, bIdx) => (
                                <View key={bIdx} style={styles.breakdownRow}>
                                  <Text style={styles.breakdownCard}>{b.cardLabel}</Text>
                                  <Text style={styles.breakdownAmount}>₹{b.amount.toLocaleString('en-IN')}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {item.remarks ? (
                            <View style={styles.remarksBox}>
                              <Text style={styles.expandedFieldLabel}>Remarks & Notes</Text>
                              <Text style={styles.remarksText}>{item.remarks}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ================= CARD FILTER MODAL ================= */}
      <Modal visible={isCardDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsCardDropdownOpen(false)}
        >
          <View style={styles.filterMenuBox}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Select Vault Card</Text>
              <TouchableOpacity onPress={() => setIsCardDropdownOpen(false)}>
                <X size={16} color={CedarColors.ink500} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.menuOption, selectedVaultCardId === 'all' && styles.menuOptionActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedVaultCardId('all');
                setIsCardDropdownOpen(false);
              }}
            >
              <Text
                style={[
                  styles.menuOptionText,
                  selectedVaultCardId === 'all' && styles.menuOptionTextActive,
                ]}
              >
                All Vault Cards
              </Text>
              {selectedVaultCardId === 'all' && <Check size={14} color="#1B4D3E" />}
            </TouchableOpacity>

            {allCards.map((card) => {
              const isSelected = selectedVaultCardId === card.id;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.menuOption, isSelected && styles.menuOptionActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedVaultCardId(card.id);
                    setIsCardDropdownOpen(false);
                  }}
                >
                  <View>
                    <Text style={[styles.menuOptionText, isSelected && styles.menuOptionTextActive]}>
                      {card.card_name}
                    </Text>
                    <Text style={styles.menuOptionSub}>**{card.last_4_digits}</Text>
                  </View>
                  {isSelected && <Check size={14} color="#1B4D3E" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ================= USER FILTER MODAL ================= */}
      <Modal visible={isUserFilterModalOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsUserFilterModalOpen(false)}
        >
          <View style={styles.filterMenuBox}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Filter By User</Text>
              <TouchableOpacity onPress={() => setIsUserFilterModalOpen(false)}>
                <X size={16} color={CedarColors.ink500} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.menuOption, filterUser === 'all' && styles.menuOptionActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterUser('all');
                setIsUserFilterModalOpen(false);
              }}
            >
              <Text style={[styles.menuOptionText, filterUser === 'all' && styles.menuOptionTextActive]}>
                All Users
              </Text>
              {filterUser === 'all' && <Check size={14} color="#1B4D3E" />}
            </TouchableOpacity>

            {allProfiles.map((prof) => {
              const isSelected = filterUser === prof.id;
              return (
                <TouchableOpacity
                  key={prof.id}
                  style={[styles.menuOption, isSelected && styles.menuOptionActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setFilterUser(prof.id);
                    setIsUserFilterModalOpen(false);
                  }}
                >
                  <Text style={[styles.menuOptionText, isSelected && styles.menuOptionTextActive]}>
                    {prof.name}
                  </Text>
                  {isSelected && <Check size={14} color="#1B4D3E" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ================= RECORD ENTRY FULL MODAL ================= */}
      <Modal visible={isRecordModalOpen} animationType="slide" transparent>
        <View style={styles.entryModalOverlay}>
          <View style={styles.entryModalCard}>
            {/* Modal Header */}
            <View style={styles.entryModalHeader}>
              <View>
                <Text style={styles.entryModalTitle}>Record Transaction</Text>
                <Text style={styles.entryModalSub}>Vault & Ledger Direct Entry</Text>
              </View>
              <TouchableOpacity
                style={styles.entryModalCloseBtn}
                onPress={() => setIsRecordModalOpen(false)}
              >
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.entryModalBody}>
              {/* 3 Entry Type Tabs */}
              <View style={styles.entryTypeRow}>
                {(['bill', 'rotate', 'spend'] as const).map((t) => {
                  const isSelected = recordType === t;
                  const label = t === 'bill' ? 'Pay Bill' : t === 'rotate' ? 'Rotate QR' : 'Record Spend';
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.entryTypeBtn, isSelected && styles.entryTypeBtnActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setRecordType(t);
                      }}
                    >
                      <Text
                        style={[styles.entryTypeBtnText, isSelected && styles.entryTypeBtnTextActive]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Amount Input */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Amount (₹)</Text>
                <View style={styles.amountInputRow}>
                  <Text style={styles.currencySymbol}>₹</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor={CedarColors.ink500}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>
              </View>

              {/* Acting User Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Acting User</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {allProfiles.map((p) => {
                    const isSelected = actingUserId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.userPill, isSelected && styles.userPillActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedActorUserId(p.id);
                        }}
                      >
                        <Text style={[styles.userPillText, isSelected && styles.userPillTextActive]}>
                          {p.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Date Input */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Transaction Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={txDate}
                  onChangeText={setTxDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={CedarColors.ink500}
                />
              </View>

              {/* ROTATE FLOW */}
              {recordType === 'rotate' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Select Card</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                      {allCards.map((c) => {
                        const isSelected = entryCardId === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.cardPill, isSelected && styles.cardPillActive]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setEntryCardId(c.id);
                            }}
                          >
                            <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                              {c.card_name} (**{c.last_4_digits})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Select Merchant QR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                      {allQrs.map((q) => {
                        const isSelected = selectedQrId === q.id;
                        return (
                          <TouchableOpacity
                            key={q.id}
                            style={[styles.qrPill, isSelected && styles.qrPillActive]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setSelectedQrId(q.id);
                            }}
                          >
                            <Text style={[styles.qrPillText, isSelected && styles.qrPillTextActive]}>
                              {q.merchant_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              )}

              {/* SPEND FLOW */}
              {recordType === 'spend' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Select Card</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                      {allCards.map((c) => {
                        const isSelected = entryCardId === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.cardPill, isSelected && styles.cardPillActive]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setEntryCardId(c.id);
                            }}
                          >
                            <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                              {c.card_name} (**{c.last_4_digits})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Payment Method</Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          spendMethod === 'credit_card' && styles.toggleBtnActive,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSpendMethod('credit_card');
                        }}
                      >
                        <CreditCard size={14} color={spendMethod === 'credit_card' ? '#1B4D3E' : CedarColors.ink500} />
                        <Text
                          style={[
                            styles.toggleBtnText,
                            spendMethod === 'credit_card' && styles.toggleBtnTextActive,
                          ]}
                        >
                          Credit Card
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          spendMethod === 'cash_on_hand' && styles.toggleBtnActive,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSpendMethod('cash_on_hand');
                        }}
                      >
                        <Wallet size={14} color={spendMethod === 'cash_on_hand' ? '#1B4D3E' : CedarColors.ink500} />
                        <Text
                          style={[
                            styles.toggleBtnText,
                            spendMethod === 'cash_on_hand' && styles.toggleBtnTextActive,
                          ]}
                        >
                          Cash on Hand
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}

              {/* BILL FLOW */}
              {recordType === 'bill' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Target Bill Card (Primary Vault)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                      {allCards
                        .filter((c) => c.is_primary)
                        .map((c) => {
                          const isSelected = billCardId === c.id;
                          const due = cardDueMap[c.id] || 0;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[styles.cardPill, isSelected && styles.cardPillActive]}
                              onPress={() => {
                                Haptics.selectionAsync();
                                setBillCardId(c.id);
                              }}
                            >
                              <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                                {c.card_name}
                              </Text>
                              {due > 0 && (
                                <Text style={styles.cardPillDue}>Due: ₹{due.toLocaleString('en-IN')}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Bill Fund Source</Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, billMethod === 'cash_on_hand' && styles.toggleBtnActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setBillMethod('cash_on_hand');
                        }}
                      >
                        <Coins size={14} color={billMethod === 'cash_on_hand' ? '#1B4D3E' : CedarColors.ink500} />
                        <Text
                          style={[
                            styles.toggleBtnText,
                            billMethod === 'cash_on_hand' && styles.toggleBtnTextActive,
                          ]}
                        >
                          Cash on Hand
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.toggleBtn, billMethod === 'own_pocket' && styles.toggleBtnActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setBillMethod('own_pocket');
                        }}
                      >
                        <Wallet size={14} color={billMethod === 'own_pocket' ? '#1B4D3E' : CedarColors.ink500} />
                        <Text
                          style={[
                            styles.toggleBtnText,
                            billMethod === 'own_pocket' && styles.toggleBtnTextActive,
                          ]}
                        >
                          Own Pocket
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Debt Repayment Toggle */}
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchTitle}>Clear Personal Debt</Text>
                      <Text style={styles.switchSub}>
                        Marks this bill payment as personal debt repayment
                      </Text>
                    </View>
                    <Switch
                      value={isDebtRepayment}
                      onValueChange={(val) => {
                        Haptics.selectionAsync();
                        setIsDebtRepayment(val);
                      }}
                      trackColor={{ false: '#DCE4DA', true: '#2D7A5D' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </>
              )}

              {/* MULTI-SOURCE CASH ALLOCATION (If cash_on_hand is selected) */}
              {isCashSourceMode && (
                <View style={styles.cashSourceContainer}>
                  <View style={styles.cashSourceHeader}>
                    <View>
                      <Text style={styles.cashSourceTitle}>Multi-Card Cash Allocation</Text>
                      <Text style={styles.cashSourceSub}>
                        Allocated: ₹{cashAllocatedTotal.toLocaleString('en-IN')} / ₹
                        {numAmount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.addSourceBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        addCashSourceRow();
                      }}
                    >
                      <Plus size={13} color="#1B4D3E" />
                      <Text style={styles.addSourceBtnText}>Add Card</Text>
                    </TouchableOpacity>
                  </View>

                  {cashSources.map((row, idx) => {
                    const cardBal = currentActorCashByCard[row.cardId] || 0;
                    return (
                      <View key={row.uid} style={styles.sourceRowBox}>
                        <View style={styles.sourceRowTop}>
                          <Text style={styles.sourceRowCardTitle}>
                            {getCardLabel(row.cardId)}
                          </Text>
                          <Text style={styles.sourceRowBal}>Avail: ₹{cardBal.toLocaleString('en-IN')}</Text>
                          {cashSources.length > 1 && (
                            <TouchableOpacity
                              onPress={() => {
                                Haptics.selectionAsync();
                                removeCashSourceRow(idx);
                              }}
                            >
                              <Trash2 size={14} color="#E05D52" />
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={styles.sourceRowBottom}>
                          {/* Pick Card Scroll */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                            {allCards.map((c) => {
                              const isPicked = row.cardId === c.id;
                              const bal = currentActorCashByCard[c.id] || 0;
                              return (
                                <TouchableOpacity
                                  key={c.id}
                                  style={[styles.sourceCardPill, isPicked && styles.sourceCardPillActive]}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    updateCashSourceRow(idx, { cardId: c.id });
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.sourceCardPillText,
                                      isPicked && styles.sourceCardPillTextActive,
                                    ]}
                                  >
                                    {c.card_name.split(' ')[0]} (₹{bal})
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>

                          {/* Amount Input */}
                          <TextInput
                            style={styles.sourceAmountInput}
                            placeholder="Amount"
                            placeholderTextColor={CedarColors.ink500}
                            keyboardType="numeric"
                            value={row.amount}
                            onChangeText={(txt) => updateCashSourceRow(idx, { amount: txt })}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Remarks Input */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Remarks & Notes</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional note / purpose"
                  placeholderTextColor={CedarColors.ink500}
                  value={remarks}
                  onChangeText={setRemarks}
                />
              </View>
            </ScrollView>

            {/* Modal Footer Submit */}
            <View style={styles.entryModalFooter}>
              <HapticButton
                style={[styles.saveBtn, isSubmitting && styles.saveBtnDisabled]}
                onPress={handleSaveRecord}
                disabled={isSubmitting}
                feedbackType="rigid"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.saveBtnText}>Save Entry</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
    backgroundColor: '#EFF3EE',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarButton: {
    position: 'relative',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#2D7A5D',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#071A12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#2D7A5D',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#EFF3EE',
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2D7A5D',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#F6F9F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  vaultPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
    maxWidth: 80,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1B4D3E',
    borderRadius: 12,
  },
  recordBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EFF3EE',
  },
  tabChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    marginHorizontal: 3,
    borderRadius: 10,
    backgroundColor: '#F6F9F5',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  activeTabChip: {
    backgroundColor: '#1B4D3E',
    borderColor: '#1B4D3E',
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  activeTabChipText: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#EFF3EE',
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#E4ECE3',
    borderRadius: 8,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#F6F9F5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  activeFilterChip: {
    backgroundColor: '#E4ECE3',
    borderColor: '#2D7A5D',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  activeFilterChipText: {
    color: '#1B4D3E',
    fontWeight: '800',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: CedarColors.ink700,
    marginTop: 10,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 11,
    color: CedarColors.ink500,
    textAlign: 'center',
    maxWidth: 240,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 8,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E4ECE3',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  dateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1B4D3E',
    textTransform: 'uppercase',
  },
  dateDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#DCE4DA',
  },
  txCard: {
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
    marginBottom: 8,
  },
  txCardExpanded: {
    borderColor: '#2D7A5D',
    backgroundColor: '#FFFFFF',
  },
  txMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  txInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: CedarColors.ink900,
    maxWidth: 160,
  },
  crossCardBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  crossCardBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#B45309',
    textTransform: 'uppercase',
  },
  txRemarks: {
    fontSize: 10,
    color: CedarColors.ink700,
    fontStyle: 'italic',
    marginTop: 1,
  },
  txSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: CedarColors.ink500,
    marginTop: 2,
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  txCardPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: CedarColors.ink500,
  },
  expandedContent: {
    marginTop: 10,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: '#DCE4DA',
    marginBottom: 10,
  },
  expandedGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  expandedGridItem: {
    flex: 1,
  },
  expandedFieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: CedarColors.ink500,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  expandedFieldValue: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  breakdownBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  breakdownTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  breakdownCard: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  breakdownAmount: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  remarksBox: {
    backgroundColor: '#E4ECE3',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  remarksText: {
    fontSize: 10,
    color: CedarColors.ink700,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  filterMenuBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#F6F9F5',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuOptionActive: {
    backgroundColor: '#E4ECE3',
  },
  menuOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  menuOptionTextActive: {
    color: '#1B4D3E',
    fontWeight: '800',
  },
  menuOptionSub: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
  entryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  entryModalCard: {
    backgroundColor: '#F6F9F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  entryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
  },
  entryModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  entryModalSub: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
  entryModalCloseBtn: {
    padding: 4,
  },
  entryModalBody: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  entryTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#E4ECE3',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  entryTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  entryTypeBtnActive: {
    backgroundColor: '#1B4D3E',
  },
  entryTypeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  entryTypeBtnTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2D7A5D',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B4D3E',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    height: 48,
    fontSize: 18,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  pillsScroll: {
    flexDirection: 'row',
  },
  userPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  userPillActive: {
    backgroundColor: '#1B4D3E',
  },
  userPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  userPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  cardPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  cardPillActive: {
    backgroundColor: '#1B4D3E',
  },
  cardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  cardPillDue: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E05D52',
    marginTop: 2,
  },
  qrPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  qrPillActive: {
    backgroundColor: '#1B4D3E',
  },
  qrPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  qrPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E4ECE3',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  toggleBtnActive: {
    backgroundColor: '#F6F9F5',
    borderColor: '#1B4D3E',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  toggleBtnTextActive: {
    color: '#1B4D3E',
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E4ECE3',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  switchSub: {
    fontSize: 9,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cashSourceContainer: {
    backgroundColor: '#E4ECE3',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  cashSourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cashSourceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  cashSourceSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1B4D3E',
    marginTop: 1,
  },
  addSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2D7A5D',
  },
  addSourceBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1B4D3E',
  },
  sourceRowBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  sourceRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sourceRowCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  sourceRowBal: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2D7A5D',
  },
  sourceRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceCardPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E4ECE3',
    marginRight: 4,
  },
  sourceCardPillActive: {
    backgroundColor: '#1B4D3E',
  },
  sourceCardPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  sourceCardPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  sourceAmountInput: {
    width: 80,
    height: 32,
    backgroundColor: '#F6F9F5',
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 11,
    fontWeight: '800',
    color: CedarColors.ink900,
    textAlign: 'right',
  },
  textInput: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 12,
    color: CedarColors.ink900,
  },
  entryModalFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1B4D3E',
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
