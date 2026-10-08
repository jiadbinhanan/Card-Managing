"use client";

import { useState, useEffect, useMemo } from "react";
import { useCardStore } from "@/store/cardStore";
import { useAuthStore } from "@/store/authStore";
import { useDataCacheStore } from "@/store/dataCacheStore";
import { motion, AnimatePresence, type Variants } from "motion/react";
import {
  ArrowDownLeft,
  CreditCard,
  Plus,
  Wallet,
  Receipt,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Filter,
  CalendarClock,
  CalendarDays,
  Check,
  FileDown,
  Layers,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import TransactionTraceInline, { type TraceTarget } from "@/components/TransactionTraceInline";

// WaAlert ফাইল থেকে Alert লজিক ইমপোর্ট করা হলো
import { sendTransactionAlerts } from "./WaAlert";
// এন্ট্রি ফর্ম মোডাল আলাদা ফাইলে
import RecordEntryModal, { type CardData, type Profile, type QR, type CashSourceRow } from "./RecordEntryModal";
// PDF export বিল্ডার আলাদা ফাইলে (Dynamically imported on export to optimize bundle size)
import type { TransactionPdfRow } from "./pdfExport";

// --- Interfaces ---
interface CashSourceBreakdownEntry { card_id: string; amount: number; }

interface Transaction {
  id: string;
  type: 'withdrawal' | 'bill_payment';
  amount: number;
  transaction_date: string;
  status: 'pending_settlement' | 'settled';
  recorded_by: string;
  qr_id?: string;
  payment_method?: string;
  settled_to_user?: string;
  card_id?: string;
  remarks?: string;
  cash_source_breakdown?: CashSourceBreakdownEntry[] | null;
  qrs?: { merchant_name: string };
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
}

interface Spend {
  id: string;
  user_id: string;
  amount: number;
  spend_type: string;
  payment_method: 'credit_card' | 'cash_on_hand';
  remarks: string;
  spend_date: string;
  card_id?: string;
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
}

interface CardAccess {
  card_id: string;
  user_id: string;
  role: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Stagger Animation Variants
const listContainerVars: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } }
};

const listItemVars: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring", stiffness: 320, damping: 26 }
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "rotations" | "spends" | "bill_paid">("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterDateType, setFilterDateType] = useState<"all" | "today" | "month" | "custom">("all");
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);
  const [txType, setTxType] = useState<"rotate" | "spend" | "bill">("bill");

  // Data States
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [qrs, setQrs] = useState<QR[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allCardAccess, setAllCardAccess] = useState<CardAccess[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { globalSelectedCardIds, setGlobalSelectedCardIds } = useCardStore();

  // Balances & Insights
  const [familyLimitsMap, setFamilyLimitsMap] = useState<Record<string, number>>({});
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});
  const [userCardCashMap, setUserCardCashMap] = useState<Record<string, Record<string, number>>>({});

  const [cardDueMap, setCardDueMap] = useState<Record<string, number>>({});
  const [cardDueDateMap, setCardDueDateMap] = useState<Record<string, string>>({});
  const [userFamilySpendMap, setUserFamilySpendMap] = useState<Record<string, Record<string, number>>>({});

  // Form States
  const [amount, setAmount] = useState("");
  const [selectedQrId, setSelectedQrId] = useState("");
  const [spendMethod, setSpendMethod] = useState<"credit_card" | "cash_on_hand">("credit_card");
  const [billMethod, setBillMethod] = useState<"cash_on_hand" | "own_pocket">("cash_on_hand");
  const [remarks, setRemarks] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [entryCardId, setEntryCardId] = useState("");
  const [billCardId, setBillCardId] = useState("");
  const [txDate, setTxDate] = useState("");
  const [isDebtRepayment, setIsDebtRepayment] = useState(false);

  // ── নতুন: ম্যানুয়াল multi-source cash-on-hand allocation (শুধু বিল পে) ──
  const [cashSources, setCashSources] = useState<CashSourceRow[]>([{ uid: uid(), cardId: "", amount: "" }]);

  // Transaction Journey Trace State
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchInitialData();
    const channel = supabase.channel('ledger_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchLedgerData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchLedgerData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLedgerData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_cycles' }, () => fetchLedgerData(allCards))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [JSON.stringify(globalSelectedCardIds)]);

  const cleanUrl = (url?: string | null) => {
    if (!url) return "";
    return url.trim().replace(/^['"]|['"]$/g, '');
  };

  async function fetchInitialData() {
    const cacheKey = 'transactions_ledger_' + JSON.stringify(globalSelectedCardIds);
    const cached = useDataCacheStore.getState().get<any>(cacheKey, 60000);
    if (cached) {
      if (cached.transactions) setTransactions(cached.transactions);
      if (cached.spends) setSpends(cached.spends);
      if (cached.familyLimitsMap) setFamilyLimitsMap(cached.familyLimitsMap);
      if (cached.userCashMap) setUserCashMap(cached.userCashMap);
      if (cached.userCardCashMap) setUserCardCashMap(cached.userCardCashMap);
      if (cached.userFamilySpendMap) setUserFamilySpendMap(cached.userFamilySpendMap);
      if (cached.cardDueMap) setCardDueMap(cached.cardDueMap);
      if (cached.cardDueDateMap) setCardDueDateMap(cached.cardDueDateMap);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    // 1. Get User, Profile, and Accessible Cards from Central Store (0ms on repeated visits!)
    const { user, profile, allProfiles: profs, cards: cachedCards } = await useAuthStore.getState().initAuth();

    const [cRes, aRes, qrRes] = await Promise.all([
      supabase.from('cards').select('*'),
      supabase.from('card_access').select('*'),
      supabase.from('qrs').select('id, merchant_name, status').eq('status', 'active')
    ]);

    const cardsList = cRes.data || [];
    const accessList = aRes.data || [];

    setAllCards(cardsList);
    setAllCardAccess(accessList);
    setProfiles(profs as any);
    if (qrRes.data) setQrs(qrRes.data);

    if (user) {
      const myProfile = profs.find(p => p.id === user.id) || profile;
      if (myProfile) {
        setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) } as any);
        setSelectedUserId(myProfile.id);
      }

      const myCardIds = accessList.filter(a => a.user_id === user.id).map(a => a.card_id);
      const myCards = cardsList.filter(c => myCardIds.includes(c.id))
        .sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);
    }

    setTxDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));

    await fetchLedgerData(cardsList);
    setIsLoading(false);
  };

  async function fetchLedgerData(currentCards: CardData[]) {
    let targetCardIds: string[] = [];
    if (!globalSelectedCardIds.includes('all')) {
      const primaryIds = new Set<string>();
      globalSelectedCardIds.forEach(id => {
        const selected = currentCards.find(c => c.id === id);
        if (selected) {
          const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
          if (primaryId) primaryIds.add(primaryId);
        }
      });
      primaryIds.forEach(primaryId => {
        currentCards
          .filter(c => c.id === primaryId || c.parent_card_id === primaryId)
          .forEach(c => targetCardIds.push(c.id));
      });
    }

    let txQuery = supabase.from('card_transactions')
      .select(`*, qrs (merchant_name), profiles:recorded_by (name, avatar_url), cards(card_name, last_4_digits)`)
      .order('transaction_date', { ascending: false })
      .limit(100);
    let spendsQuery = supabase.from('spends')
      .select('*, profiles (name, avatar_url), cards(card_name, last_4_digits)')
      .order('spend_date', { ascending: false })
      .limit(100);

    if (!globalSelectedCardIds.includes('all') && targetCardIds.length > 0) {
      txQuery = txQuery.in('card_id', targetCardIds);
      spendsQuery = spendsQuery.in('card_id', targetCardIds);
    }

    const [
      { data: txs },
      { data: spnds },
      { data: coh },
      allTxsRes,
      allSpndsRes,
      activeCyclesRes
    ] = await Promise.all([
      txQuery,
      spendsQuery,
      supabase.from('cash_on_hand').select('*'),
      supabase.from('card_transactions').select('card_id, amount, type, payment_method, status, qr_id, settled_to_user, remarks, transaction_date'),
      supabase.from('spends').select('card_id, amount, payment_method, user_id, spend_type'),
      supabase.from('billing_cycles').select('card_id, generated_amount, paid_amount, billing_month').in('status', ['unpaid', 'partially_paid'])
    ]);

    if (txs) setTransactions(txs as any);
    if (spnds) setSpends(spnds as any);
    const activeCycles = activeCyclesRes.data || [];

    const limitsMap: Record<string, number> = {};
    const primaryCards = currentCards.filter(c => c.is_primary);

    primaryCards.forEach(primary => {
      const familyIds = currentCards
        .filter(c => c.id === primary.id || c.parent_card_id === primary.id)
        .map(c => c.id);

      const famTxs = allTxsRes.data?.filter(t => familyIds.includes(t.card_id || '')) || [];
      const famSpnds = allSpndsRes.data?.filter(s => familyIds.includes(s.card_id || '')) || [];

      const w = famTxs.filter(t => {
        if (t.type !== 'withdrawal') return false;
        const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
        if (isRotation) return true;
        return t.status === 'pending_settlement';
      }).reduce((s, t) => s + Number(t.amount), 0);

      const b = famTxs.filter(t => t.type === 'bill_payment').reduce((s, t) => s + Number(t.amount), 0);
      const s = famSpnds.filter(sp => sp.payment_method === 'credit_card').reduce((sum, sp) => sum + Number(sp.amount), 0);

      limitsMap[primary.id] = Number(primary.total_limit) - w - s + b;
    });
    setFamilyLimitsMap(limitsMap);

    const cashMap: Record<string, number> = {};
    const cardCashMap: Record<string, Record<string, number>> = {};
    coh?.forEach(c => {
      cashMap[c.user_id] = (cashMap[c.user_id] || 0) + Number(c.current_balance);
      if (c.user_id && c.card_id) {
        if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
        cardCashMap[c.user_id][c.card_id] = Number(c.current_balance);
      }
    });
    setUserCashMap(cashMap);
    setUserCardCashMap(cardCashMap);

    const cardToPrimaryMap: Record<string, string> = {};
    currentCards.forEach(c => {
       cardToPrimaryMap[c.id] = c.is_primary ? c.id : (c.parent_card_id || c.id);
    });

    const ufSpendMap: Record<string, Record<string, number>> = {};
    allSpndsRes.data?.forEach(s => {
       if ((s.spend_type === 'personal' || s.spend_type === 'repayment') && s.card_id && s.user_id) {
          const primaryId = cardToPrimaryMap[s.card_id] || s.card_id;
          if (!ufSpendMap[s.user_id]) ufSpendMap[s.user_id] = {};
          ufSpendMap[s.user_id][primaryId] = (ufSpendMap[s.user_id][primaryId] || 0) + Number(s.amount);
       }
    });
    setUserFamilySpendMap(ufSpendMap);

    const dMap: Record<string, number> = {};
    const dueDateMap: Record<string, string> = {};

    activeCycles?.forEach(c => {
       if (c.card_id) {
          const dueAmt = Number(c.generated_amount) - Number(c.paid_amount);
          dMap[c.card_id] = (dMap[c.card_id] || 0) + dueAmt;

          if (dueAmt > 0) {
              const cardInfo = currentCards.find(card => card.id === c.card_id);
              if (cardInfo && cardInfo.bill_gen_day) {
                  const billMonthDate = new Date(c.billing_month);
                  const genDateObj = new Date(billMonthDate.getFullYear(), billMonthDate.getMonth(), cardInfo.bill_gen_day);
                  const dueDateObj = new Date(genDateObj);
                  dueDateObj.setDate(dueDateObj.getDate() + 19);

                  dueDateMap[c.card_id] = dueDateObj.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
              }
          }
       }
    });
    setCardDueMap(dMap);
    setCardDueDateMap(dueDateMap);

    // Save in-memory cache for instant SWR restoration
    const cacheKey = 'transactions_ledger_' + JSON.stringify(globalSelectedCardIds);
    useDataCacheStore.getState().set(cacheKey, {
      transactions: txs,
      spends: spnds,
      familyLimitsMap: limitsMap,
      userCashMap: cashMap,
      userCardCashMap: cardCashMap,
      userFamilySpendMap: ufSpendMap,
      cardDueMap: dMap,
      cardDueDateMap: dueDateMap,
    });
  };

  const entryUserAccessibleCardIds = allCardAccess.filter(a => a.user_id === selectedUserId).map(a => a.card_id);
  const entryUserCards = allCards.filter(c => entryUserAccessibleCardIds.includes(c.id))
    .sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  const myAccessibleCardIds = allCardAccess.filter(a => a.user_id === (currentUser?.id || '')).map(a => a.card_id);
  const billPrimaryCards = allCards.filter(c => c.is_primary && myAccessibleCardIds.includes(c.id));

  useEffect(() => {
    if (!isModalOpen) return;
    if (billPrimaryCards.length === 0) return;

    if (!globalSelectedCardIds.includes('all') && globalSelectedCardIds.length === 1) {
      const sel = allCards.find(c => c.id === globalSelectedCardIds[0]);
      if (sel) {
        const primaryId = sel.is_primary ? sel.id : sel.parent_card_id;
        const found = billPrimaryCards.find(c => c.id === primaryId);
        if (found) { setBillCardId(found.id); return; }
      }
    }
    if (!billCardId || !billPrimaryCards.find(c => c.id === billCardId)) {
      setBillCardId(billPrimaryCards[0].id);
    }
  }, [isModalOpen, JSON.stringify(globalSelectedCardIds), allCards, billPrimaryCards.length]);

  useEffect(() => {
    if (entryUserCards.length > 0 && !entryUserCards.find(c => c.id === entryCardId)) {
      setEntryCardId(entryUserCards[0].id);
    }
  }, [selectedUserId, entryUserCards.length]);

  const selectedEntryCardObj = allCards.find(c => c.id === entryCardId);
  const entryPrimaryId = selectedEntryCardObj?.is_primary ? selectedEntryCardObj.id : selectedEntryCardObj?.parent_card_id;
  const currentFamilyLimit = familyLimitsMap[entryPrimaryId || ''] || 0;

  const actingUserId = selectedUserId || (currentUser?.id as string);
  const actorCashByCard = userCardCashMap[actingUserId] || {};

  const entryFamilyCardIds = entryPrimaryId ? allCards.filter(c => c.id === entryPrimaryId || c.parent_card_id === entryPrimaryId).map(c => c.id) : [];
  const currentActorCardCash = entryFamilyCardIds.reduce((sum, id) => sum + (actorCashByCard[id] || 0), 0);

  // Bill-পে-এর জন্য: currentUser-এর সব কার্ড জুড়ে cash_on_hand ব্যালেন্স (এখন আর
  // শুধু বিল-কার্ডের ফ্যামিলিতে সীমাবদ্ধ না — যেকোনো কার্ডের ক্যাশ সোর্স হিসেবে বাছা যাবে)
  const currentUserCashByCard = userCardCashMap[currentUser?.id || ''] || {};

  const amtNum = Number(amount) || 0;

  // ── SPEND split logic (অপরিবর্তিত আচরণ) ──
  let cardSplitAmt = 0;
  let spendCashSplitAmt = 0;
  let isSpendSplitting = false;
  if (txType === 'spend') {
    if (spendMethod === 'credit_card') {
      if (amtNum > currentFamilyLimit && currentFamilyLimit > 0) {
        cardSplitAmt = currentFamilyLimit;
        spendCashSplitAmt = amtNum - currentFamilyLimit;
        isSpendSplitting = true;
      } else { cardSplitAmt = amtNum; }
    } else {
      if (amtNum > currentActorCardCash && currentActorCardCash > 0) {
        spendCashSplitAmt = currentActorCardCash;
        cardSplitAmt = amtNum - currentActorCardCash;
        isSpendSplitting = true;
      } else { spendCashSplitAmt = amtNum; }
    }
  }

  // ── BILL: ম্যানুয়াল multi-source cash allocation ──
  const validCashSources = cashSources
    .filter(s => s.cardId && Number(s.amount) > 0)
    .map(s => ({ cardId: s.cardId, amount: Number(s.amount) }));
  const cashAllocatedTotal = validCashSources.reduce((sum, s) => sum + s.amount, 0);
  const pocketSplitAmt = billMethod === 'cash_on_hand'
    ? Math.max(0, amtNum - cashAllocatedTotal)
    : (billMethod === 'own_pocket' ? amtNum : 0);

  const allocationValid = billMethod !== 'cash_on_hand' || (
    cashAllocatedTotal <= amtNum &&
    validCashSources.every(s => s.amount <= (currentUserCashByCard[s.cardId] || 0))
  );

  const canSave = amtNum > 0 &&
    (txType !== 'bill' || (!!billCardId && allocationValid)) &&
    (txType !== 'spend' || !!entryCardId) &&
    (txType !== 'rotate' || !!entryCardId);

  // মোডাল খোলা অবস্থায় বিল-কার্ড বদলালে বা প্রথমবার খুললে ডিফল্ট সোর্স-রো সেট করা
  useEffect(() => {
    if (!isModalOpen || txType !== 'bill') return;
    const hasAnyCardSelected = cashSources.some(s => s.cardId);
    if (!hasAnyCardSelected) {
      const defaultCardId = (currentUserCashByCard[billCardId] || 0) > 0
        ? billCardId
        : (Object.keys(currentUserCashByCard).find(id => currentUserCashByCard[id] > 0) || '');
      setCashSources([{ uid: uid(), cardId: defaultCardId, amount: '' }]);
    }
  }, [isModalOpen, txType, billCardId]);

  async function updateCashBalance(userId: string, cardId: string, amt: number, type: 'credit' | 'debit', note: string, linkedCardTxId?: string | null): Promise<string | null> {
    const { data: coh } = await supabase.from('cash_on_hand').select('*').eq('user_id', userId).eq('card_id', cardId).maybeSingle();
    const currentBalance = coh ? Number(coh.current_balance) : 0;
    const newBalance = type === 'credit' ? currentBalance + amt : currentBalance - amt;

    const { data: updatedRows, error: cashUpdateError } = await supabase
      .from('cash_on_hand')
      .update({ current_balance: newBalance })
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .select('user_id');
    if (cashUpdateError) throw cashUpdateError;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: cashInsertError } = await supabase.from('cash_on_hand').insert({
        user_id: userId, card_id: cardId, current_balance: newBalance
      });
      if (cashInsertError) throw cashInsertError;
    }

    const { data: ledgerRow, error: cashLedgerError } = await supabase.from('cash_on_hand_ledger').insert({
      card_id: cardId, user_id: userId, amount: amt, transaction_type: type,
      remarks: note, transaction_date: new Date().toISOString(),
      linked_card_transaction_id: linkedCardTxId || null
    }).select('id').single();
    if (cashLedgerError) throw cashLedgerError;
    return ledgerRow?.id || null;
  }

  // পুরনো family-cascading deductBillCash() এর বদলে — ইউজার নিজে যে কার্ড+amount
  // বেছেছে ঠিক সেখান থেকেই কাটা হবে, কোনো implicit family fallback নেই।
  // linkedCardTxId: bill payment-এর card_transaction.id — cash_on_hand_ledger-এ link সংরক্ষণের জন্য
  async function deductBillCashFromSources(userId: string, sources: { cardId: string; amount: number }[], note: string, linkedCardTxId?: string | null) {
    for (const src of sources) {
      if (src.amount > 0) {
        await updateCashBalance(userId, src.cardId, src.amount, 'debit', note, linkedCardTxId);
      }
    }
  }

  async function processBillPayment(cardId: string, amt: number, txDate: string): Promise<{ cycleId: string | null; status: string | null; remainingDue: number }> {
    const result: { cycleId: string | null; status: string | null; remainingDue: number } = { cycleId: null, status: null, remainingDue: 0 };
    const txDateObj = new Date(txDate);
    const startOfMonth = new Date(txDateObj.getFullYear(), txDateObj.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const endOfMonth = new Date(txDateObj.getFullYear(), txDateObj.getMonth() + 1, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { data: cycles } = await supabase.from('billing_cycles').select('*')
      .eq('card_id', cardId).gte('billing_month', startOfMonth).lte('billing_month', endOfMonth);

    if (cycles && cycles.length > 0) {
      const cycle = cycles[0];
      const generatedAmt = Number(cycle.generated_amount);
      const paidAmt = Number(cycle.paid_amount);

      if (paidAmt < generatedAmt) {
        const newPaidAmt = paidAmt + amt;
        let cycleStatus = cycle.status;

        if (newPaidAmt >= generatedAmt) {
            cycleStatus = 'paid';
            result.remainingDue = 0;
        } else if (newPaidAmt > 0) {
            cycleStatus = 'partially_paid';
            result.remainingDue = generatedAmt - newPaidAmt;
        }

        await supabase.from('billing_cycles').update({ paid_amount: newPaidAmt, status: cycleStatus }).eq('id', cycle.id);
        result.cycleId = cycle.id;
        result.status = cycleStatus;
      }
    }
    return result;
  };

  const handleSave = async () => {
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      alert("Please enter a valid amount"); return;
    }

    const activeCardId = txType === 'bill' ? billCardId : entryCardId;
    if (!activeCardId) {
      alert("Please select a card."); return;
    }

    if (txType === 'bill' && billMethod === 'cash_on_hand' && !allocationValid) {
      alert("Cash allocation invalid — check per-card balances and total doesn't exceed the bill amount.");
      return;
    }

    const finalActingUserId = actingUserId;
    const finalDate = txDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const profileData = profiles.find(p => p.id === finalActingUserId) || { name: 'User' };

    const activePrimaryId = txType === 'bill'
      ? billCardId
      : (selectedEntryCardObj?.is_primary ? selectedEntryCardObj.id : selectedEntryCardObj?.parent_card_id);

    const activeCardObj = allCards.find(c => c.id === activeCardId);
    const cardDataPayload = activeCardObj ? { card_name: activeCardObj.card_name, last_4_digits: activeCardObj.last_4_digits } : undefined;
    let billResult: { cycleId: string | null; status: string | null; remainingDue: number } = { cycleId: null, status: null, remainingDue: 0 };

    // বিল-পে-এর cash অংশ ও pocket অংশ (multi-source থেকে)
    const billCashAmt = txType === 'bill' && billMethod === 'cash_on_hand' ? cashAllocatedTotal : 0;
    const billPocketAmt = txType === 'bill' ? pocketSplitAmt : 0;
    const billIsSplitting = billCashAmt > 0 && billPocketAmt > 0;
    const breakdownForInsert = billCashAmt > 0 ? validCashSources.map(s => ({ card_id: s.cardId, amount: s.amount })) : null;

    setIsModalOpen(false);

    // 1. OPTIMISTIC UI UPDATES
    if (txType === "rotate") {
      const tempTx: any = { id: `temp-${Date.now()}`, type: 'withdrawal', amount: amtNum, status: 'pending_settlement', transaction_date: finalDate, recorded_by: finalActingUserId, qrs: { merchant_name: qrs.find(q => q.id === selectedQrId)?.merchant_name || 'QR' }, profiles: profileData, remarks, card_id: activeCardId, cards: cardDataPayload };
      setTransactions(prev => [tempTx, ...prev]);
      if (activePrimaryId) setFamilyLimitsMap(prev => ({ ...prev, [activePrimaryId]: prev[activePrimaryId] - amtNum }));
    } else if (txType === "spend") {
      if (isSpendSplitting) {
        if (cardSplitAmt > 0) {
          const t: any = { id: `temp-c-${Date.now()}`, user_id: finalActingUserId, amount: cardSplitAmt, payment_method: 'credit_card', remarks, spend_date: finalDate, profiles: profileData, card_id: activeCardId, cards: cardDataPayload };
          setSpends(prev => [t, ...prev]);
          if (activePrimaryId) setFamilyLimitsMap(prev => ({ ...prev, [activePrimaryId]: prev[activePrimaryId] - cardSplitAmt }));
        }
        if (spendCashSplitAmt > 0) {
          const t: any = { id: `temp-h-${Date.now()}`, user_id: finalActingUserId, amount: spendCashSplitAmt, payment_method: 'cash_on_hand', remarks: remarks + " (Auto-Split)", spend_date: finalDate, profiles: profileData, card_id: activeCardId, cards: cardDataPayload };
          setSpends(prev => [t, ...prev]);
          setUserCashMap(prev => ({ ...prev, [finalActingUserId]: (prev[finalActingUserId] || 0) - spendCashSplitAmt }));
        }
      } else {
        const t: any = { id: `temp-${Date.now()}`, user_id: finalActingUserId, amount: amtNum, payment_method: spendMethod, remarks, spend_date: finalDate, profiles: profileData, card_id: activeCardId, cards: cardDataPayload };
        setSpends(prev => [t, ...prev]);
        if (spendMethod === "credit_card" && activePrimaryId) setFamilyLimitsMap(prev => ({ ...prev, [activePrimaryId]: prev[activePrimaryId] - amtNum }));
        else setUserCashMap(prev => ({ ...prev, [finalActingUserId]: (prev[finalActingUserId] || 0) - amtNum }));
      }
    } else if (txType === "bill") {
      if (isDebtRepayment) {
        const t: any = { id: `temp-r-${Date.now()}`, user_id: finalActingUserId, amount: -amtNum, spend_type: 'repayment', payment_method: billMethod, remarks: "Debt Cleared" + (remarks ? `: ${remarks}` : ''), spend_date: finalDate, profiles: profileData, card_id: activeCardId, cards: cardDataPayload };
        setSpends(prev => [t, ...prev]);
      }
      if (billIsSplitting) {
        if (billCashAmt > 0) {
          const t: any = { id: `temp-cb-${Date.now()}`, type: 'bill_payment', amount: billCashAmt, status: 'settled', transaction_date: finalDate, payment_method: 'cash_on_hand', profiles: profileData, remarks, card_id: activeCardId, cards: cardDataPayload, cash_source_breakdown: breakdownForInsert };
          setTransactions(prev => [t, ...prev]);
          validCashSources.forEach(s => {
            setUserCardCashMap(prev => ({
              ...prev,
              [finalActingUserId]: { ...(prev[finalActingUserId] || {}), [s.cardId]: (prev[finalActingUserId]?.[s.cardId] || 0) - s.amount }
            }));
          });
        }
        if (billPocketAmt > 0) {
          const t: any = { id: `temp-pb-${Date.now()}`, type: 'bill_payment', amount: billPocketAmt, status: 'settled', transaction_date: finalDate, payment_method: 'own_pocket', profiles: profileData, remarks, card_id: activeCardId, cards: cardDataPayload };
          setTransactions(prev => [t, ...prev]);
        }
      } else {
        const t: any = { id: `temp-b-${Date.now()}`, type: 'bill_payment', amount: amtNum, status: 'settled', transaction_date: finalDate, payment_method: billMethod, profiles: profileData, remarks, card_id: activeCardId, cards: cardDataPayload, cash_source_breakdown: billMethod === 'cash_on_hand' ? breakdownForInsert : undefined };
        setTransactions(prev => [t, ...prev]);
        if (billMethod === "cash_on_hand") {
          validCashSources.forEach(s => {
            setUserCardCashMap(prev => ({
              ...prev,
              [finalActingUserId]: { ...(prev[finalActingUserId] || {}), [s.cardId]: (prev[finalActingUserId]?.[s.cardId] || 0) - s.amount }
            }));
          });
        }
      }
      if (activePrimaryId) setFamilyLimitsMap(prev => ({ ...prev, [activePrimaryId]: prev[activePrimaryId] + amtNum }));
    }

    resetForm();

    // 2. BACKGROUND DATABASE SYNC & WHATSAPP
    try {
      if (txType === "rotate") {
        await supabase.from('card_transactions').insert({ amount: amtNum, type: 'withdrawal', status: 'pending_settlement', qr_id: selectedQrId, transaction_date: finalDate, recorded_by: finalActingUserId, remarks, card_id: activeCardId });
      }
      else if (txType === "spend") {
        if (isSpendSplitting) {
          if (cardSplitAmt > 0) await supabase.from('spends').insert({ user_id: finalActingUserId, amount: cardSplitAmt, spend_type: 'personal', payment_method: 'credit_card', remarks, spend_date: finalDate, card_id: activeCardId });
          if (spendCashSplitAmt > 0) {
            await supabase.from('spends').insert({ user_id: finalActingUserId, amount: spendCashSplitAmt, spend_type: 'personal', payment_method: 'cash_on_hand', remarks: remarks + " (Auto-Split)", spend_date: finalDate, card_id: activeCardId });
            await updateCashBalance(finalActingUserId, activeCardId, spendCashSplitAmt, 'debit', `Personal spend ${remarks ? '- ' + remarks : ''} (Auto-Split)`);
          }
        } else {
          await supabase.from('spends').insert({ user_id: finalActingUserId, amount: amtNum, spend_type: 'personal', payment_method: spendMethod, remarks, spend_date: finalDate, card_id: activeCardId });
          if (spendMethod === "cash_on_hand") await updateCashBalance(finalActingUserId, activeCardId, amtNum, 'debit', `Personal spend ${remarks ? '- ' + remarks : ''}`);
        }
      }
      else if (txType === "bill") {
        billResult = await processBillPayment(activeCardId, amtNum, finalDate);
        let activeCycleId = billResult.cycleId;

        let createdBillTxId: string | null = null;

        if (billIsSplitting) {
          if (billCashAmt > 0) {
            const { data: billTxCash } = await supabase.from('card_transactions').insert({ amount: billCashAmt, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: finalActingUserId, payment_method: 'cash_on_hand', remarks, card_id: activeCardId, billing_cycle_id: activeCycleId, cash_source_breakdown: breakdownForInsert }).select('id').single();
            createdBillTxId = billTxCash?.id || null;
            await deductBillCashFromSources(finalActingUserId, validCashSources, `Bill payment ${remarks ? '- ' + remarks : ''}`, billTxCash?.id || null);
          }
          if (billPocketAmt > 0) {
            const { data: billTxPocket } = await supabase.from('card_transactions').insert({ amount: billPocketAmt, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: finalActingUserId, payment_method: 'own_pocket', remarks, card_id: activeCardId, billing_cycle_id: activeCycleId }).select('id').single();
            if (!createdBillTxId) createdBillTxId = billTxPocket?.id || null;
            await supabase.from('pocket_advances_ledger').insert({
              user_id: finalActingUserId,
              card_id: activeCardId,
              amount: -billPocketAmt,
              entry_type: 'advance',
              transaction_date: finalDate,
              linked_card_transaction_id: billTxPocket?.id || null,
              remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`
            });
            const { data: curAdv } = await supabase.from('pocket_advances').select('current_balance').eq('user_id', finalActingUserId).eq('card_id', activeCardId).maybeSingle();
            const nextAdv = (Number(curAdv?.current_balance) || 0) - billPocketAmt;
            await supabase.from('pocket_advances').upsert({ user_id: finalActingUserId, card_id: activeCardId, current_balance: nextAdv });
          }
        } else {
          const { data: billTx } = await supabase.from('card_transactions').insert({ amount: amtNum, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: finalActingUserId, payment_method: billMethod, remarks, card_id: activeCardId, billing_cycle_id: activeCycleId, cash_source_breakdown: billMethod === 'cash_on_hand' ? breakdownForInsert : null }).select('id').single();
          createdBillTxId = billTx?.id || null;
          if (billMethod === "cash_on_hand") {
            await deductBillCashFromSources(finalActingUserId, validCashSources, `Bill payment ${remarks ? '- ' + remarks : ''}`, billTx?.id || null);
          } else if (billMethod === "own_pocket") {
            await supabase.from('pocket_advances_ledger').insert({
              user_id: finalActingUserId,
              card_id: activeCardId,
              amount: -amtNum,
              entry_type: 'advance',
              transaction_date: finalDate,
              linked_card_transaction_id: billTx?.id || null,
              remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`
            });
            const { data: curAdv } = await supabase.from('pocket_advances').select('current_balance').eq('user_id', finalActingUserId).eq('card_id', activeCardId).maybeSingle();
            const nextAdv = (Number(curAdv?.current_balance) || 0) - amtNum;
            await supabase.from('pocket_advances').upsert({ user_id: finalActingUserId, card_id: activeCardId, current_balance: nextAdv });
          }
        }

        if (isDebtRepayment) {
          await supabase.from('spends').insert({
            user_id: finalActingUserId,
            amount: -amtNum,
            spend_type: 'repayment',
            payment_method: billMethod,
            remarks: "Debt Cleared" + (remarks ? `: ${remarks}` : ''),
            spend_date: finalDate,
            card_id: activeCardId,
            linked_card_transaction_id: createdBillTxId
          });
        }
      }

      // WHATSAPP ALERTS (Using WaAlert.tsx helper)
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();
      const sanitize = (v: string) => (v || '').normalize('NFC').replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim().substring(0, 60);

      const cardNameSafe = sanitize(activeCardObj?.card_name || 'Card');
      const cardLast4Safe = sanitize(activeCardObj?.last_4_digits || '0000');

      const remainingBal = spendMethod === 'credit_card'
        ? String((familyLimitsMap[activePrimaryId || ''] || 0) - amtNum)
        : String((userCashMap[finalActingUserId] || 0) - amtNum);
      const currentFamilySpend = userFamilySpendMap[finalActingUserId]?.[activePrimaryId || ''] || 0;

      sendTransactionAlerts({
        txType,
        profiles,
        entryUserName: sanitize(currentUser?.name || '-'),
        amount: amtNum,
        remarks: sanitize(remarks || "N/A"),
        timeStr,
        cardNameSafe,
        cardLast4Safe,
        billStatus: billResult?.status,
        dueDate: cardDueDateMap[activeCardId] || "Updated Soon",
        remainingDue: billResult?.remainingDue,
        availableLimitAfterBill: String((familyLimitsMap[activePrimaryId || ''] || 0) + amtNum),
        qrName: sanitize(qrs.find(q => q.id === selectedQrId)?.merchant_name || 'QR'),
        availableLimitAfterRotate: String((familyLimitsMap[activePrimaryId || ''] || 0) - amtNum),
        sourceName: spendMethod === 'credit_card' ? cardNameSafe : 'Cash on Hand',
        remainingBalAfterSpend: remainingBal,
        totalSpendAfterSpend: String(currentFamilySpend + amtNum)
      });

    } catch (error: any) {
      console.error("Save Error:", error);
    }
  };

  const resetForm = () => {
    setAmount("");
    setSelectedQrId("");
    setRemarks("");
    setSpendMethod("credit_card");
    setBillMethod("cash_on_hand");
    setIsDebtRepayment(false);
    setCashSources([{ uid: uid(), cardId: "", amount: "" }]);
    setTxDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  };

  const openEntryModal = () => {
    resetForm();
    setTxType("bill");
    setIsModalOpen(true);
  };

  // কার্ড আইডি → লেবেল (breakdown ডিসপ্লে/PDF-এর জন্য)
  const cardLabel = (cardId?: string | null) => {
    if (!cardId) return "Unknown Card";
    const c = allCards.find(cc => cc.id === cardId);
    return c ? `${c.card_name} (**${c.last_4_digits})` : "Unknown Card";
  };

  const groupedLedger = useMemo(() => {
    const list: any[] = [];

    transactions.forEach(t => {
      const cardInfo = t.cards ? `${t.cards.card_name} (**${t.cards.last_4_digits})` : 'Card Not Linked';
      const hasCrossCardCash = !!(t.cash_source_breakdown && t.cash_source_breakdown.length > 0 &&
        t.cash_source_breakdown.some(b => b.card_id !== t.card_id));
      list.push({
        id: `tx-${t.id}`,
        userId: t.recorded_by,
        sortDate: new Date(t.transaction_date).getTime(),
        displayDate: t.transaction_date,
        amount: t.amount,
        type: t.type,
        status: t.status,
        title: t.type === 'withdrawal' ? (t.qrs?.merchant_name || 'Rotation Withdrawal') : 'Card Bill Payment',
        subtitle: t.type === 'withdrawal' ? `Rotated by ${t.profiles?.name?.split(' ')[0]}` : `Paid by ${t.profiles?.name?.split(' ')[0]}`,
        icon: t.type === 'withdrawal' ? ArrowDownLeft : CheckCircle2,
        color: t.type === 'withdrawal' ? 'text-rose-400' : 'text-emerald-400',
        bg: t.type === 'withdrawal' ? 'bg-rose-500/10' : 'bg-emerald-500/10',
        remarks: t.remarks || '',
        cardDetails: cardInfo,
        paymentMethod: t.type === 'withdrawal' ? 'Credit Card' : (t.payment_method === 'own_pocket' ? 'Own Pocket' : 'Cash on Hand'),
        cashSourceBreakdown: t.cash_source_breakdown && t.cash_source_breakdown.length > 0
          ? t.cash_source_breakdown.map(b => ({ cardLabel: cardLabel(b.card_id), amount: b.amount }))
          : undefined,
        isCrossCardCash: hasCrossCardCash,
        recordedBy: t.profiles?.name || 'User',
      });
    });

    spends.forEach(s => {
      const isRepayment = s.amount < 0;
      const cardInfo = s.cards ? `${s.cards.card_name} (**${s.cards.last_4_digits})` : 'Card Not Linked';
      list.push({
        id: `sp-${s.id}`,
        userId: s.user_id,
        sortDate: new Date(s.spend_date).getTime(),
        displayDate: s.spend_date,
        amount: Math.abs(s.amount),
        type: 'spend',
        status: 'settled',
        title: isRepayment ? 'Debt Repayment' : (s.remarks || 'Personal Spend'),
        subtitle: `Spent by ${s.profiles?.name?.split(' ')[0]}`,
        icon: isRepayment ? Wallet : Receipt,
        color: isRepayment ? 'text-emerald-400' : 'text-amber-400',
        bg: isRepayment ? 'bg-emerald-500/10' : 'bg-amber-500/10',
        isRepaymentFlag: isRepayment,
        remarks: s.remarks || '',
        cardDetails: cardInfo,
        paymentMethod: s.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand',
        recordedBy: s.profiles?.name || 'User',
      });
    });

    const filteredList = list.filter(item => {
      if (filterUser !== 'all' && item.userId !== filterUser) return false;
      if (activeTab === "all") return true;
      if (activeTab === "rotations") return item.type === 'withdrawal';
      if (activeTab === "spends") return item.type === 'spend' && !item.isRepaymentFlag;
      if (activeTab === "bill_paid") return item.type === 'bill_payment' || item.isRepaymentFlag;
      return true;
    }).filter(item => {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const monthStr = todayStr.substring(0, 7);
      if (filterDateType === 'today') return item.displayDate === todayStr;
      if (filterDateType === 'month') return item.displayDate.startsWith(monthStr);
      if (filterDateType === 'custom') {
        const { start, end } = customDateRange;
        if (!start && !end) return true;
        if (start && !end) return item.displayDate >= start;
        if (!start && end) return item.displayDate <= end;
        return item.displayDate >= start && item.displayDate <= end;
      }
      return true;
    }).sort((a, b) => b.sortDate - a.sortDate);

    return filteredList.reduce((acc, item) => {
      const dateStr = new Date(item.displayDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(item);
      return acc;
    }, {} as Record<string, any[]>);
  }, [transactions, spends, filterUser, activeTab, filterDateType, customDateRange, allCards]);

  const sortedVaultCards = useMemo(() => {
    const primaries = accessibleCards.filter(c => c.is_primary);
    const result: Array<CardData & { _isSub?: boolean }> = [];
    primaries.forEach(primary => {
      result.push(primary);
      const subs = accessibleCards.filter(c => !c.is_primary && c.parent_card_id === primary.id);
      subs.forEach(sub => result.push({ ...sub, _isSub: true }));
    });
    accessibleCards.filter(c => !c.is_primary && !primaries.find(p => p.id === c.parent_card_id))
      .forEach(c => result.push({ ...c, _isSub: true }));
    return result;
  }, [accessibleCards]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const allItems: any[] = Object.values(groupedLedger).flat();
      const rows: TransactionPdfRow[] = allItems.map((item: any) => ({
        date: item.displayDate.split('-').reverse().join('/'),
        type: item.type === 'withdrawal' ? 'Rotation' : item.type === 'bill_payment' ? 'Bill Payment' : item.isRepaymentFlag ? 'Repayment' : 'Spend',
        title: item.title,
        direction: (item.type === 'withdrawal' || (item.type === 'spend' && !item.isRepaymentFlag)) ? 'debit' : 'credit',
        amount: item.amount,
        cardDetails: item.cardDetails,
        paymentMethod: item.paymentMethod,
        cashBreakdown: item.cashSourceBreakdown,
        recordedBy: item.recordedBy,
        remarks: item.remarks,
      }));

      const tabLabel = { all: "All", rotations: "Rotations", spends: "Spends", bill_paid: "Bill Paid" }[activeTab];
      const userLabel = filterUser === 'all' ? 'All Users' : (profiles.find(p => p.id === filterUser)?.name || 'User');
      const dateLabel = { all: "All Time", today: "Today", month: "This Month", custom: "Custom Range" }[filterDateType];

      const { exportTransactionsPdf } = await import("./pdfExport");
      await exportTransactionsPdf({ rows, filterLabel: `${tabLabel} • ${userLabel} • ${dateLabel}` });
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("PDF export failed. Please try again.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const animationKey = `${activeTab}-${filterUser}-${filterDateType}-${customDateRange.start}-${customDateRange.end}`;

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">

      {/* ================= BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-[-10%] right-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#0ea5e9] opacity-[0.18] blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[5%] left-[-25%] w-[100vw] h-[100vw] rounded-full bg-[#a855f7] opacity-[0.18] blur-[130px] mix-blend-screen" />
        <div className="absolute top-[30%] left-[15%] w-[60vw] h-[60vw] rounded-full bg-[#10b981] opacity-[0.15] blur-[100px] mix-blend-screen" />
      </div>

      {/* ================= HEADER ================= */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative z-50 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_20px_rgba(14,165,233,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
              <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                {currentUser?.avatar_url && !imgError ? (
                  <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" style={{ aspectRatio: '1/1' }} onError={() => setImgError(true)} />
                ) : (
                  <span className="text-sm font-black text-white">{currentUser?.name?.charAt(0) || 'U'}</span>
                )}
              </div>
            </div>
          </Link>
          <div>
            <motion.div
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 5, ease: "linear", repeat: Infinity }}
              className="bg-[length:200%_200%] bg-gradient-to-r from-[#0ea5e9] via-[#a855f7] to-[#0ea5e9] bg-clip-text"
            >
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">Live Ledger</p>
            </motion.div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              Transactions
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* PDF Export */}
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="h-9 w-9 flex items-center justify-center bg-white/[0.03] border border-white/10 text-white rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md disabled:opacity-40"
            title="Export PDF"
          >
            {isExportingPdf ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-3.5 h-3.5 rounded-full border-b-2 border-[#0ea5e9]" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
          </button>

          {/* Custom Header Dropdown — Multi-Select */}
          <div className="relative">
            <button
              onClick={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-3 rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md"
            >
              <span className="truncate max-w-[120px]">
                {globalSelectedCardIds.includes('all')
                  ? 'All Vault Cards'
                  : globalSelectedCardIds.length === 1
                    ? (() => {
                        const card = allCards.find(c => c.id === globalSelectedCardIds[0]);
                        return card ? `${card.card_name} (**${card.last_4_digits})` : 'Select Card';
                      })()
                    : `${globalSelectedCardIds.length} Cards`
                }
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isCardDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isCardDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsCardDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 top-[calc(100%+8px)] w-60 bg-[#050505]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 py-1"
                    style={{ transformOrigin: 'top right' }}
                  >
                    <button
                      onClick={() => setGlobalSelectedCardIds(['all'])}
                      className={`w-full text-left px-4 py-3 text-xs font-bold transition-colors border-b border-white/5 flex items-center justify-between ${globalSelectedCardIds.includes('all') ? 'text-[#0ea5e9] bg-[#0ea5e9]/10' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                      All Vault Cards
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${globalSelectedCardIds.includes('all') ? 'bg-[#0ea5e9] border-[#0ea5e9]' : 'border-white/20'}`}>
                        {globalSelectedCardIds.includes('all') && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </button>
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                      {sortedVaultCards.map((c: any) => {
                        const isSub = c._isSub;
                        const isSelected = !globalSelectedCardIds.includes('all') && globalSelectedCardIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              if (globalSelectedCardIds.includes('all')) {
                                setGlobalSelectedCardIds([c.id]);
                              } else {
                                const next = isSelected
                                  ? globalSelectedCardIds.filter(id => id !== c.id)
                                  : [...globalSelectedCardIds, c.id];
                                setGlobalSelectedCardIds(next.length === 0 ? ['all'] : next);
                              }
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center gap-2 ${
                              isSelected ? 'text-[#0ea5e9] bg-[#0ea5e9]/5' : 'text-slate-300 hover:bg-white/5'
                            } ${isSub ? 'pl-8 bg-white/[0.01]' : 'font-bold mt-1'}`}
                          >
                            <span className="truncate flex-1">{c.card_name} <span className="opacity-60 text-[10px]">(**{c.last_4_digits})</span></span>
                            {isSub && <span className="text-[8px] font-black uppercase text-slate-500 bg-white/5 px-1.5 py-0.5 rounded shrink-0">(Sub)</span>}
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#0ea5e9] border-[#0ea5e9]' : 'border-white/20'}`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      <main className="relative z-10 px-4 pt-5 max-w-md mx-auto space-y-5">

        {/* ================= FILTERS ================= */}
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="space-y-3"
        >
          <div className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 flex items-center justify-between backdrop-blur-xl shadow-inner overflow-x-auto custom-scrollbar">
            {[
              { id: "all", label: "All" },
              { id: "rotations", label: "Rotations" },
              { id: "spends", label: "Spends" },
              { id: "bill_paid", label: "Bill Paid" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                  activeTab === tab.id ? "text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabBg"
                    className="absolute inset-0 bg-[#0ea5e9]/20 border border-[#0ea5e9]/40 rounded-xl shadow-[0_0_15px_rgba(14,165,233,0.2)]"
                    transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 relative z-30">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
              <Filter className="w-3 h-3" /> Filters
            </div>

            <div className="relative shrink-0">
              <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="appearance-none px-4 py-1.5 rounded-xl text-xs font-bold bg-[#a855f7]/10 text-[#e879f9] border border-[#a855f7]/30 outline-none focus:border-[#a855f7]/50 pr-8">
                <option value="all" className="bg-black">All Users</option>
                {profiles.map(p => <option key={p.id} value={p.id} className="bg-black">{p.name.split(' ')[0]}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#e879f9] pointer-events-none" />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <select value={filterDateType} onChange={(e) => { setFilterDateType(e.target.value as any); if (e.target.value !== 'custom') setCustomDateRange({ start: "", end: "" }); }} className="appearance-none pl-8 pr-6 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 outline-none focus:border-emerald-500/50">
                  <option value="all" className="bg-black">All Time</option>
                  <option value="today" className="bg-black">Today</option>
                  <option value="month" className="bg-black">This Month</option>
                  <option value="custom" className="bg-black">Custom Range</option>
                </select>
                <CalendarClock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500 pointer-events-none" />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500 pointer-events-none" />
              </div>
              {filterDateType === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange(r => ({ ...r, start: e.target.value }))} className="h-[30px] bg-white/[0.03] border border-emerald-500/30 rounded-xl text-[11px] font-bold text-white px-2 outline-none focus:border-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">to</span>
                  <input type="date" value={customDateRange.end} min={customDateRange.start || undefined} onChange={(e) => setCustomDateRange(r => ({ ...r, end: e.target.value }))} className="h-[30px] bg-white/[0.03] border border-emerald-500/30 rounded-xl text-[11px] font-bold text-white px-2 outline-none focus:border-emerald-500" />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ================= TIMELINE TRANSACTION LIST ================= */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 rounded-full border-b-2 border-[#0ea5e9]" />
          </div>
        ) : (
          <motion.div
            key={animationKey}
            variants={listContainerVars}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-6 relative z-10"
          >
            <AnimatePresence mode="popLayout">
              {(Object.entries(groupedLedger) as [string, any[]][]).map(([date, items]) => (
                <div key={date} className="space-y-3">
                  <motion.div variants={listItemVars} className="sticky top-20 z-20 flex items-center gap-3">
                    <span className="px-3 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-[#0ea5e9] shadow-[0_0_10px_rgba(14,165,233,0.2)]">
                      {date}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  </motion.div>

                  {items.map((item) => {
                    const Icon = item.icon;
                    const isExpanded = expandedId === item.id;

                    return (
                      <motion.div
                        key={item.id}
                        variants={listItemVars}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                        onClick={() => toggleExpand(item.id)}
                        className="group relative p-4 bg-white/[0.03] border border-white/5 rounded-[24px] backdrop-blur-xl flex flex-col hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer overflow-hidden shadow-inner ml-2 border-l-2 border-l-white/10 [content-visibility:auto] [contain-intrinsic-size:0_76px]"
                      >
                        <div className={`absolute -inset-4 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-2xl ${item.bg}`} />

                        <div className="flex items-center justify-between relative z-10 w-full">
                          <div className="flex items-center gap-3 w-[65%]">
                            <div className={`w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center border border-white/5 shadow-inner ${item.bg}`}>
                              <Icon className={`w-4 h-4 ${item.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-slate-100 mb-0.5 truncate flex items-center gap-1.5">
                                {item.title}
                                {item.isCrossCardCash && (
                                  <span className="text-[7px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full shrink-0">Cross-Card</span>
                                )}
                              </h3>
                              <div className="flex flex-col gap-0.5 leading-tight">
                                {item.remarks && <span className="text-[10px] text-slate-300 italic truncate">&quot;{item.remarks}&quot;</span>}
                                <span className="text-[9px] font-medium text-slate-400">{item.subtitle}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 relative z-10 shrink-0 pl-2">
                            <span className={`text-base font-black tracking-tight drop-shadow-md flex items-center gap-1 ${item.color}`}>
                              {item.type === 'withdrawal' || (item.type === 'spend' && !item.isRepaymentFlag) ? "-" : "+"}₹{item.amount.toLocaleString('en-IN')}
                              <ChevronDown className={`w-3.5 h-3.5 opacity-50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </span>
                            <span className="text-[9px] font-bold text-slate-500">{item.displayDate.split('-').reverse().join('/')}</span>
                          </div>
                        </div>

                        {/* ── Expanded ── */}
                        <div
                          style={{
                            maxHeight: isExpanded ? (activeTraceId === item.id ? '1400px' : '450px') : '0px',
                            opacity: isExpanded ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
                            marginTop: isExpanded ? '16px' : '0'
                          }}
                        >
                          <div className="relative z-10 border-t border-white/10 pt-4">
                            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                              <div>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Card Used</p>
                                <p className="font-bold text-slate-200">{item.cardDetails}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fund Source</p>
                                <p className="font-bold text-slate-200">{item.paymentMethod}</p>
                              </div>
                              {item.cashSourceBreakdown && (
                                <div className="col-span-2">
                                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">Cash Source Breakdown</p>
                                  <div className="space-y-1">
                                    {item.cashSourceBreakdown.map((b: any, i: number) => (
                                      <div key={i} className="flex justify-between bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                                        <span className="text-slate-300 font-medium">{b.cardLabel}</span>
                                        <span className="text-amber-400 font-black">₹{b.amount.toLocaleString('en-IN')}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="col-span-2">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</p>
                                <p className="font-medium text-slate-300 bg-black/20 p-2 rounded-lg border border-white/5">
                                  {item.remarks || "No remarks added."}
                                </p>
                              </div>

                              <div className="col-span-2 pt-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTraceId(activeTraceId === item.id ? null : item.id);
                                  }}
                                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                                    activeTraceId === item.id
                                      ? "bg-[#0ea5e9]/20 text-sky-300 border-[#0ea5e9]"
                                      : "bg-gradient-to-r from-[#0ea5e9]/10 to-[#a855f7]/10 hover:from-[#0ea5e9]/20 hover:to-[#a855f7]/20 text-[#0ea5e9] border-[#0ea5e9]/30"
                                  }`}
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                  {activeTraceId === item.id ? "ট্রেস ফ্লো বন্ধ করুন" : "টাকার উৎস ও গন্তব্য জার্নি দেখুন (Trace Flow)"}
                                </button>
                              </div>

                              {/* Inline Trace Card (Transparent backdrop, local to item) */}
                              {activeTraceId === item.id && (
                                <div className="col-span-2">
                                  <TransactionTraceInline
                                    target={{
                                      id: item.id,
                                      sourceType: item.type === 'spend' ? 'spend' : 'card_transaction',
                                      title: item.title,
                                      amount: item.amount,
                                      date: item.displayDate,
                                      remarks: item.remarks
                                    }}
                                    onClose={() => setActiveTraceId(null)}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </AnimatePresence>

            {Object.keys(groupedLedger).length === 0 && (
              <motion.div variants={listItemVars} className="text-center py-12 px-4 bg-white/[0.02] rounded-[28px] border border-white/10 border-dashed backdrop-blur-md">
                <AlertCircle className="w-10 h-10 text-slate-500/40 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">No records found for this view.</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </main>

      {/* ================= FLOATING ACTION BUTTON ================= */}
      <motion.button
        onClick={openEntryModal}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.2 }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#0ea5e9] to-[#a855f7] flex items-center justify-center shadow-[0_10px_40px_rgba(168,85,247,0.6)] border border-white/20 z-40"
      >
        <Plus className="w-7 h-7 text-white" />
      </motion.button>

      {/* ================= ENTRY MODAL (আলাদা ফাইলে) ================= */}
      <RecordEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        txType={txType}
        setTxType={setTxType}
        amount={amount}
        setAmount={setAmount}
        amtNum={amtNum}
        txDate={txDate}
        setTxDate={setTxDate}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        profiles={profiles}
        entryCardId={entryCardId}
        setEntryCardId={setEntryCardId}
        entryUserCards={entryUserCards}
        billCardId={billCardId}
        setBillCardId={setBillCardId}
        billPrimaryCards={billPrimaryCards}
        cardDueMap={cardDueMap}
        cardDueDateMap={cardDueDateMap}
        currentFamilyLimit={currentFamilyLimit}
        currentActorCardCash={currentActorCardCash}
        userFamilySpendMap={userFamilySpendMap}
        selectedEntryCardObj={selectedEntryCardObj}
        entryPrimaryId={entryPrimaryId}
        selectedQrId={selectedQrId}
        setSelectedQrId={setSelectedQrId}
        qrs={qrs}
        spendMethod={spendMethod}
        setSpendMethod={setSpendMethod}
        cardSplitAmt={cardSplitAmt}
        spendCashSplitAmt={spendCashSplitAmt}
        isSpendSplitting={isSpendSplitting}
        billMethod={billMethod}
        setBillMethod={setBillMethod}
        isDebtRepayment={isDebtRepayment}
        setIsDebtRepayment={setIsDebtRepayment}
        allCards={allCards}
        currentUserCashByCard={currentUserCashByCard}
        cashSources={cashSources}
        setCashSources={setCashSources}
        cashAllocatedTotal={cashAllocatedTotal}
        pocketSplitAmt={pocketSplitAmt}
        allocationValid={allocationValid}
        canSave={canSave}
        remarks={remarks}
        setRemarks={setRemarks}
      />


      <BottomNav />
    </div>
  );
}