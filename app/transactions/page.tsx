"use client";

import { useState, useEffect, useMemo } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { 
  ArrowDownLeft, 
  CreditCard, 
  Plus, 
  Wallet, 
  Banknote,
  Receipt,
  AlertCircle,
  CheckCircle2,
  QrCode,
  ChevronDown,
  Edit3,
  Filter,
  Zap,
  CalendarClock,
  ShieldCheck,
  CalendarDays,
  Info
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// --- Interfaces ---
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

interface QR {
  id: string;
  merchant_name: string;
  status: string;
}

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string;
}

interface CardAccess {
  card_id: string;
  user_id: string;
  role: string;
}

// Stagger Animation Variants
const listContainerVars: Variants = {
  hidden: { opacity: 0, transition: { duration: 0 } },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const listItemVars: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "rotations" | "spends" | "bill_paid">("all");
  const [filterUser, setFilterUser] = useState<string>("all"); 

  // Expanded Card State
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Simplified Native Date Filter States
  const [filterDateType, setFilterDateType] = useState<"all" | "today" | "month" | "custom">("all"); 
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState<"rotate" | "spend" | "bill">("rotate");

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

  // Global Selected Card Filter
  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();

  // Balances
  const [familyLimitsMap, setFamilyLimitsMap] = useState<Record<string, number>>({});
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});

  // Form States
  const [amount, setAmount] = useState("");
  const [selectedQrId, setSelectedQrId] = useState("");
  const [spendMethod, setSpendMethod] = useState<"credit_card" | "cash_on_hand">("credit_card");
  const [billMethod, setBillMethod] = useState<"cash_on_hand" | "own_pocket">("cash_on_hand");
  const [remarks, setRemarks] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(""); 
  const [entryCardId, setEntryCardId] = useState(""); 
  const [txDate, setTxDate] = useState(""); 
  const [isDebtRepayment, setIsDebtRepayment] = useState(false);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchInitialData();

    const channel = supabase.channel('ledger_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchLedgerData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchLedgerData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLedgerData(allCards))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [globalSelectedCardId]);

  const cleanUrl = (url?: string | null) => {
    if (!url) return "";
    return url.trim().replace(/^['"]|['"]$/g, '');
  };

  async function fetchInitialData() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: cData } = await supabase.from('cards').select('*');
    const { data: aData } = await supabase.from('card_access').select('*');
    const cardsList = cData || [];
    const accessList = aData || [];

    setAllCards(cardsList);
    setAllCardAccess(accessList);

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) {
         setCurrentUser({ ...profile, avatar_url: cleanUrl(profile.avatar_url) });
         setSelectedUserId(profile.id);
      }

      const myCardIds = accessList.filter(a => a.user_id === user.id).map(a => a.card_id);
      const myCards = cardsList.filter(c => myCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);
    }

    const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url');
    if (profs) setProfiles(profs);

    const { data: qrData } = await supabase.from('qrs').select('id, merchant_name, status').eq('status', 'active');
    if (qrData) setQrs(qrData);

    setTxDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));

    await fetchLedgerData(cardsList);
    setIsLoading(false);
  };

  async function fetchLedgerData(currentCards: CardData[]) {
    let targetCardIds: string[] = [];
    if (globalSelectedCardId !== 'all') {
      const selected = currentCards.find(c => c.id === globalSelectedCardId);
      if (selected) {
         const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
         targetCardIds = currentCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId).map(c => c.id);
      }
    }

    let txQuery = supabase.from('card_transactions').select(`*, qrs (merchant_name), profiles:recorded_by (name, avatar_url), cards(card_name, last_4_digits)`).order('transaction_date', { ascending: false });
    let spendsQuery = supabase.from('spends').select('*, profiles (name, avatar_url), cards(card_name, last_4_digits)').order('spend_date', { ascending: false });

    if (globalSelectedCardId !== 'all' && targetCardIds.length > 0) {
       txQuery = txQuery.in('card_id', targetCardIds);
       spendsQuery = spendsQuery.in('card_id', targetCardIds);
    }

    const [{ data: txs }, { data: spnds }, { data: coh }] = await Promise.all([
       txQuery, spendsQuery, supabase.from('cash_on_hand').select('*')
    ]);

    if (txs) setTransactions(txs as any);
    if (spnds) setSpends(spnds as any);

    const allTxsRes = await supabase.from('card_transactions').select('card_id, amount, type, payment_method');
    const allSpndsRes = await supabase.from('spends').select('card_id, amount, payment_method');

    const limitsMap: Record<string, number> = {};
    const primaryCards = currentCards.filter(c => c.is_primary);

    primaryCards.forEach(primary => {
       const familyIds = currentCards.filter(c => c.id === primary.id || c.parent_card_id === primary.id).map(c => c.id);

       const famTxs = allTxsRes.data?.filter(t => familyIds.includes(t.card_id || '')) || [];
       const famSpnds = allSpndsRes.data?.filter(s => familyIds.includes(s.card_id || '')) || [];

       const w = famTxs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0);
       const b = famTxs.filter(t => t.type === 'bill_payment').reduce((s, t) => s + Number(t.amount), 0);
       const s = famSpnds.filter(sp => sp.payment_method === 'credit_card').reduce((sum, sp) => sum + Number(sp.amount), 0);

       limitsMap[primary.id] = Number(primary.total_limit) - w - s + b;
    });
    setFamilyLimitsMap(limitsMap);

    const cashMap: Record<string, number> = {};
    coh?.forEach(c => { cashMap[c.user_id] = (cashMap[c.user_id] || 0) + Number(c.current_balance); });
    setUserCashMap(cashMap);
  };

  // --- ENTRY MODAL DYNAMIC CARD LIST ---
  const entryUserAccessibleCardIds = allCardAccess.filter(a => a.user_id === selectedUserId).map(a => a.card_id);
  const entryUserCards = allCards.filter(c => entryUserAccessibleCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
     if (entryUserCards.length > 0 && !entryUserCards.find(c => c.id === entryCardId)) {
        setEntryCardId(entryUserCards[0].id);
     }
  }, [selectedUserId, entryUserCards, entryCardId]);


  // --- Helper: Cash Update with Ledger ---
  async function updateCashBalance(userId: string, cardId: string, amt: number, type: 'credit' | 'debit', note: string) {
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
        user_id: userId,
        card_id: cardId,
        current_balance: newBalance
      });
      if (cashInsertError) throw cashInsertError;
    }

    const { error: cashLedgerError } = await supabase.from('cash_on_hand_ledger').insert({
       card_id: cardId,
       user_id: userId, amount: amt, transaction_type: type, remarks: note, transaction_date: new Date().toISOString()
    });
    if (cashLedgerError) throw cashLedgerError;
  };

  // --- Helper: Process Bill Payment (Billing Cycles) ---
  async function processBillPayment(cardId: string, amt: number, txDate: string) {
    let activeCycleId = null;
    const txDateObj = new Date(txDate);
    const startOfMonth = new Date(txDateObj.getFullYear(), txDateObj.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const endOfMonth = new Date(txDateObj.getFullYear(), txDateObj.getMonth() + 1, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { data: cycles } = await supabase
       .from('billing_cycles')
       .select('*')
       .eq('card_id', cardId)
       .gte('billing_month', startOfMonth)
       .lte('billing_month', endOfMonth);

    if (cycles && cycles.length > 0) {
       const cycle = cycles[0];
       const generatedAmt = Number(cycle.generated_amount);
       const paidAmt = Number(cycle.paid_amount);

       if (paidAmt < generatedAmt) {
          const newPaidAmt = paidAmt + amt;
          let cycleStatus = cycle.status;
          if (newPaidAmt >= generatedAmt) cycleStatus = 'paid';
          else if (newPaidAmt > 0) cycleStatus = 'partially_paid';

          await supabase.from('billing_cycles').update({
             paid_amount: newPaidAmt,
             status: cycleStatus
          }).eq('id', cycle.id);

          activeCycleId = cycle.id;
       }
    }
    return activeCycleId;
  };


  // --- AUTOMATIC SPLIT CALCULATION ---
  const amtNum = Number(amount) || 0;
  const currentActorCash = userCashMap[selectedUserId || (currentUser?.id as string)] || 0;
  const selectedEntryCardObj = allCards.find(c => c.id === entryCardId);
  const entryPrimaryId = selectedEntryCardObj?.is_primary ? selectedEntryCardObj.id : selectedEntryCardObj?.parent_card_id;
  const currentFamilyLimit = familyLimitsMap[entryPrimaryId || ''] || 0;

  let cardSplitAmt = 0;
  let cashSplitAmt = 0;
  let pocketSplitAmt = 0;
  let isSplitting = false;

  if (txType === 'spend') {
     if (spendMethod === 'credit_card') {
        if (amtNum > currentFamilyLimit && currentFamilyLimit > 0) {
           cardSplitAmt = currentFamilyLimit;
           cashSplitAmt = amtNum - currentFamilyLimit;
           isSplitting = true;
        } else {
           cardSplitAmt = amtNum;
        }
     } else { 
        if (amtNum > currentActorCash && currentActorCash > 0) {
           cashSplitAmt = currentActorCash;
           cardSplitAmt = amtNum - currentActorCash;
           isSplitting = true;
        } else {
           cashSplitAmt = amtNum;
        }
     }
  } else if (txType === 'bill') {
     if (billMethod === 'cash_on_hand') {
        if (amtNum > currentActorCash && currentActorCash > 0) {
           cashSplitAmt = currentActorCash;
           pocketSplitAmt = amtNum - currentActorCash;
           isSplitting = true;
        } else {
           cashSplitAmt = amtNum;
        }
     } else {
        pocketSplitAmt = amtNum;
     }
  }

  const handleSave = async () => {
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    if (!entryCardId) {
      alert("Please select a linked card for this entry.");
      return;
    }

    const actingUserId = selectedUserId || (currentUser?.id as string);
    const finalDate = txDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const profileData = profiles.find(p => p.id === actingUserId) || { name: 'User' };
    const cardDataPayload = selectedEntryCardObj ? { card_name: selectedEntryCardObj.card_name, last_4_digits: selectedEntryCardObj.last_4_digits } : undefined;

    setIsModalOpen(false);

    // 1. OPTIMISTIC UI UPDATES
    if (txType === "rotate") {
        const tempTx: any = {
           id: `temp-${Date.now()}`, type: 'withdrawal', amount: amtNum, status: 'pending_settlement', 
           transaction_date: finalDate, recorded_by: actingUserId,
           qrs: { merchant_name: qrs.find(q=>q.id===selectedQrId)?.merchant_name || 'QR' },
           profiles: profileData, remarks: remarks, card_id: entryCardId, cards: cardDataPayload
        };
        setTransactions(prev => [tempTx, ...prev]);
        if (entryPrimaryId) setFamilyLimitsMap(prev => ({...prev, [entryPrimaryId]: prev[entryPrimaryId] - amtNum}));
    } 
    else if (txType === "spend") {
        if (isSplitting) {
           if (cardSplitAmt > 0) {
              const tempCard: any = { id: `temp-c-${Date.now()}`, user_id: actingUserId, amount: cardSplitAmt, payment_method: 'credit_card', remarks: remarks, spend_date: finalDate, profiles: profileData, card_id: entryCardId, cards: cardDataPayload };
              setSpends(prev => [tempCard, ...prev]);
              if (entryPrimaryId) setFamilyLimitsMap(prev => ({...prev, [entryPrimaryId]: prev[entryPrimaryId] - cardSplitAmt}));
           }
           if (cashSplitAmt > 0) {
              const tempCash: any = { id: `temp-h-${Date.now()}`, user_id: actingUserId, amount: cashSplitAmt, payment_method: 'cash_on_hand', remarks: remarks + " (Auto-Split)", spend_date: finalDate, profiles: profileData, card_id: entryCardId, cards: cardDataPayload };
              setSpends(prev => [tempCash, ...prev]);
              setUserCashMap(prev => ({ ...prev, [actingUserId]: (prev[actingUserId]||0) - cashSplitAmt }));
           }
        } else {
           const tempSpend: any = { id: `temp-${Date.now()}`, user_id: actingUserId, amount: amtNum, payment_method: spendMethod, remarks: remarks, spend_date: finalDate, profiles: profileData, card_id: entryCardId, cards: cardDataPayload };
           setSpends(prev => [tempSpend, ...prev]);
           if (spendMethod === "credit_card" && entryPrimaryId) {
               setFamilyLimitsMap(prev => ({...prev, [entryPrimaryId]: prev[entryPrimaryId] - amtNum}));
           }
           else setUserCashMap(prev => ({ ...prev, [actingUserId]: (prev[actingUserId]||0) - amtNum }));
        }
    } 
    else if (txType === "bill") {
        if (isDebtRepayment) {
            const tempRepay: any = { id: `temp-r-${Date.now()}`, user_id: actingUserId, amount: -amtNum, spend_type: 'repayment', payment_method: billMethod, remarks: "Debt Cleared" + (remarks ? `: ${remarks}` : ''), spend_date: finalDate, profiles: profileData, card_id: entryCardId, cards: cardDataPayload };
            setSpends(prev => [tempRepay, ...prev]);
        }

        if (isSplitting) {
           if (cashSplitAmt > 0) {
              const tempCash: any = { id: `temp-cb-${Date.now()}`, type: 'bill_payment', amount: cashSplitAmt, status: 'settled', transaction_date: finalDate, payment_method: 'cash_on_hand', profiles: profileData, remarks: remarks, card_id: entryCardId, cards: cardDataPayload };
              setTransactions(prev => [tempCash, ...prev]);
              setUserCashMap(prev => ({ ...prev, [actingUserId]: (prev[actingUserId]||0) - cashSplitAmt }));
           }
           if (pocketSplitAmt > 0) {
              const tempPocket: any = { id: `temp-pb-${Date.now()}`, type: 'bill_payment', amount: pocketSplitAmt, status: 'settled', transaction_date: finalDate, payment_method: 'own_pocket', profiles: profileData, remarks: remarks, card_id: entryCardId, cards: cardDataPayload };
              setTransactions(prev => [tempPocket, ...prev]);
           }
        } else {
           const tempBill: any = { id: `temp-b-${Date.now()}`, type: 'bill_payment', amount: amtNum, status: 'settled', transaction_date: finalDate, payment_method: billMethod, profiles: profileData, remarks: remarks, card_id: entryCardId, cards: cardDataPayload };
           setTransactions(prev => [tempBill, ...prev]);
           if (billMethod === "cash_on_hand") setUserCashMap(prev => ({ ...prev, [actingUserId]: (prev[actingUserId]||0) - amtNum }));
        }
        if (entryPrimaryId) setFamilyLimitsMap(prev => ({...prev, [entryPrimaryId]: prev[entryPrimaryId] + amtNum})); 
    }

    resetForm();

    // 2. BACKGROUND DATABASE SYNC (With New Ledger & Billing Logic)
    try {
      if (txType === "rotate") {
        await supabase.from('card_transactions').insert({
          amount: amtNum, type: 'withdrawal', status: 'pending_settlement', qr_id: selectedQrId, transaction_date: finalDate, recorded_by: actingUserId, remarks: remarks, card_id: entryCardId
        });
      } 
      else if (txType === "spend") {
        if (isSplitting) {
           if (cardSplitAmt > 0) await supabase.from('spends').insert({ user_id: actingUserId, amount: cardSplitAmt, spend_type: 'personal', payment_method: 'credit_card', remarks: remarks, spend_date: finalDate, card_id: entryCardId });
           if (cashSplitAmt > 0) {
              await supabase.from('spends').insert({ user_id: actingUserId, amount: cashSplitAmt, spend_type: 'personal', payment_method: 'cash_on_hand', remarks: remarks + " (Auto-Split)", spend_date: finalDate, card_id: entryCardId });
              await updateCashBalance(actingUserId, entryCardId, cashSplitAmt, 'debit', `Personal spend ${remarks ? '- '+remarks : ''} (Auto-Split)`);
           }
        } else {
           await supabase.from('spends').insert({ user_id: actingUserId, amount: amtNum, spend_type: 'personal', payment_method: spendMethod, remarks: remarks, spend_date: finalDate, card_id: entryCardId });
           if (spendMethod === "cash_on_hand") {
              await updateCashBalance(actingUserId, entryCardId, amtNum, 'debit', `Personal spend ${remarks ? '- '+remarks : ''}`);
           }
        }
      } 
      else if (txType === "bill") {
        // Find if there is an active billing cycle for this month to update
        let activeCycleId = await processBillPayment(entryCardId, amtNum, finalDate);

        if (isDebtRepayment) {
            await supabase.from('spends').insert({ user_id: actingUserId, amount: -amtNum, spend_type: 'repayment', payment_method: billMethod, remarks: "Debt Cleared" + (remarks ? `: ${remarks}` : ''), spend_date: finalDate, card_id: entryCardId });
        }

        if (isSplitting) {
           if (cashSplitAmt > 0) {
              await supabase.from('card_transactions').insert({ amount: cashSplitAmt, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: actingUserId, payment_method: 'cash_on_hand', remarks: remarks, card_id: entryCardId, billing_cycle_id: activeCycleId });
              await updateCashBalance(actingUserId, entryCardId, cashSplitAmt, 'debit', `Bill payment ${remarks ? '- '+remarks : ''}`);
           }
           if (pocketSplitAmt > 0) {
              await supabase.from('card_transactions').insert({ amount: pocketSplitAmt, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: actingUserId, payment_method: 'own_pocket', remarks: remarks, card_id: entryCardId, billing_cycle_id: activeCycleId });
           }
        } else {
           await supabase.from('card_transactions').insert({ amount: amtNum, type: 'bill_payment', status: 'settled', transaction_date: finalDate, recorded_by: actingUserId, payment_method: billMethod, remarks: remarks, card_id: entryCardId, billing_cycle_id: activeCycleId });
           if (billMethod === "cash_on_hand") {
              await updateCashBalance(actingUserId, entryCardId, amtNum, 'debit', `Bill payment ${remarks ? '- '+remarks : ''}`);
           }
        }
      }
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
    setTxDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  };

  const openEntryModal = () => {
    resetForm();
    setIsModalOpen(true);
  };


  // --- LEDGER UNIFICATION & TIMELINE GROUPING (Optimized with useMemo) ---
  const groupedLedger = useMemo(() => {
    const list: any[] = [];

    transactions.forEach(t => {
      const cardInfo = t.cards ? `${t.cards.card_name} (**${t.cards.last_4_digits})` : 'Card Not Linked';
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
        paymentMethod: t.type === 'withdrawal' ? 'Credit Card' : (t.payment_method === 'own_pocket' ? 'Own Pocket' : 'Cash on Hand')
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
        paymentMethod: s.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand'
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
       const dateObj = new Date(item.displayDate);
       const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
       if (!acc[dateStr]) acc[dateStr] = [];
       acc[dateStr].push(item);
       return acc;
    }, {} as Record<string, any[]>);

  }, [transactions, spends, filterUser, activeTab, filterDateType, customDateRange]);

  const toggleExpand = (id: string) => {
     setExpandedId(expandedId === id ? null : id);
  };

  // Generate a composite key so that stagger animations trigger on any filter change
  const animationKey = `${activeTab}-${filterUser}-${filterDateType}-${customDateRange.start}-${customDateRange.end}`;

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">

      {/* ================= EXTREME GLOWING BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <motion.div animate={{ x: [0, 50, -40, 0], y: [0, 60, -50, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} className="absolute top-[-10%] right-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#0ea5e9] opacity-[0.18] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ x: [0, -50, 50, 0], y: [0, -60, 60, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} className="absolute bottom-[5%] left-[-25%] w-[100vw] h-[100vw] rounded-full bg-[#a855f7] opacity-[0.18] blur-[130px] mix-blend-screen" />
        <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.08, 0.2, 0.08] }} transition={{ duration: 10, repeat: Infinity }} className="absolute top-[30%] left-[15%] w-[60vw] h-[60vw] rounded-full bg-[#10b981] opacity-[0.15] blur-[100px] mix-blend-screen" />
      </div>

      {/* ================= HEADER ================= */}
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
           <Link href="/settings">
             <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_20px_rgba(14,165,233,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
               <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                 {currentUser?.avatar_url && !imgError ? (
                   <img 
                      src={currentUser.avatar_url} 
                      alt="Profile" 
                      className="w-full h-full object-cover rounded-full" 
                      style={{ aspectRatio: '1/1' }}
                      onError={() => setImgError(true)} 
                   />
                 ) : (
                   <span className="text-sm font-black text-white">{currentUser?.name?.charAt(0) || 'U'}</span>
                 )}
               </div>
             </div>
           </Link>
           <div>
             <motion.div 
               initial={{ filter: "blur(10px)", opacity: 0, x: -10 }} 
               animate={{ filter: "blur(0px)", opacity: 1, x: 0 }} 
               transition={{ duration: 0.8, ease: "easeOut" }}
             >
               <motion.div 
                 animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                 transition={{ duration: 5, ease: "linear", repeat: Infinity }}
                 className="bg-[length:200%_200%] bg-gradient-to-r from-[#0ea5e9] via-[#a855f7] to-[#0ea5e9] bg-clip-text"
               >
                 <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">
                   Live Ledger
                 </p>
               </motion.div>
             </motion.div>
             <motion.h1 
               initial={{ filter: "blur(10px)", opacity: 0, y: -5 }} 
               animate={{ filter: "blur(0px)", opacity: 1, y: 0 }} 
               transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
               className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
             >
               Transactions
             </motion.h1>
           </div>
        </div>

        <div className="relative">
          <select 
             value={globalSelectedCardId}
             onChange={(e) => setGlobalSelectedCardId(e.target.value)}
             className="appearance-none bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-7 rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md"
          >
             <option value="all" className="bg-[#050505]">All Vault Cards</option>
             {accessibleCards.map(c => (
                <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
             ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </motion.header>

      <main className="relative z-10 px-4 pt-5 max-w-md mx-auto space-y-5">

        {/* ================= DYNAMIC FILTERS ================= */}
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-3">
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
                     transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                   />
                 )}
                 <span className="relative z-10">{tab.label}</span>
               </button>
             ))}
           </div>

           {/* User & Date Filters */}
           <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 relative z-30">
             <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
               <Filter className="w-3 h-3" /> Filters
             </div>

             {/* User Filter */}
             <div className="relative shrink-0">
               <select 
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="appearance-none px-4 py-1.5 rounded-xl text-xs font-bold bg-[#a855f7]/10 text-[#e879f9] border border-[#a855f7]/30 outline-none focus:border-[#a855f7]/50 shadow-[0_0_10px_rgba(168,85,247,0.1)] pr-8"
               >
                  <option value="all" className="bg-black">All Users</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id} className="bg-black">{p.name.split(' ')[0]}</option>
                  ))}
               </select>
               <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#e879f9] pointer-events-none" />
             </div>

             {/* Native Date Filter */}
             <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                   <select 
                      value={filterDateType} 
                      onChange={(e) => {
                         setFilterDateType(e.target.value as any);
                         if (e.target.value !== 'custom') setCustomDateRange({ start: "", end: "" });
                      }} 
                      className="appearance-none pl-8 pr-6 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 outline-none focus:border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                   >
                      <option value="all" className="bg-black">All Time</option>
                      <option value="today" className="bg-black">Today</option>
                      <option value="month" className="bg-black">This Month</option>
                      <option value="custom" className="bg-black">Custom Range</option>
                   </select>
                   <CalendarClock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500 pointer-events-none" />
                   <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500 pointer-events-none" />
                </div>

                {/* Date Range Inputs when Custom is selected */}
                {filterDateType === 'custom' && (
                   <div className="flex items-center gap-1.5">
                      <input 
                         type="date" 
                         value={customDateRange.start} 
                         onChange={(e) => setCustomDateRange(r => ({ ...r, start: e.target.value }))} 
                         className="h-[30px] bg-white/[0.03] border border-emerald-500/30 rounded-xl text-[11px] font-bold text-white px-2 outline-none focus:border-emerald-500" 
                      />
                      <span className="text-[10px] font-bold text-slate-500 shrink-0">to</span>
                      <input 
                         type="date" 
                         value={customDateRange.end} 
                         min={customDateRange.start || undefined}
                         onChange={(e) => setCustomDateRange(r => ({ ...r, end: e.target.value }))} 
                         className="h-[30px] bg-white/[0.03] border border-emerald-500/30 rounded-xl text-[11px] font-bold text-white px-2 outline-none focus:border-emerald-500" 
                      />
                   </div>
                )}
             </div>
           </div>
        </motion.div>

        {/* ================= TIMELINE TRANSACTION LIST WITH SMOOTH EXPAND ================= */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0ea5e9]"></div>
          </div>
        ) : (
          <motion.div 
            key={animationKey} // Forces re-animation on tab or filter change
            variants={listContainerVars}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-6 relative z-10"
          >
            <AnimatePresence mode="popLayout">
              {(Object.entries(groupedLedger) as [string, any[]][]).map(([date, items]) => (
                 <div key={date} className="space-y-3">

                    {/* Timeline Date Header */}
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
                          layout
                          variants={listItemVars}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3 }}
                          onClick={() => toggleExpand(item.id)}
                          className="group relative p-4 bg-white/[0.03] border border-white/5 rounded-[24px] backdrop-blur-xl flex flex-col hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer overflow-hidden shadow-inner ml-2 border-l-2 border-l-white/10"
                        >
                          <div className={`absolute -inset-4 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-2xl ${item.bg}`} />

                          {/* Top Compact View */}
                          <div className="flex items-center justify-between relative z-10 w-full">
                             <div className="flex items-center gap-3 w-[65%]">
                               <div className={`w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center border border-white/5 shadow-inner ${item.bg}`}>
                                 <Icon className={`w-4 h-4 ${item.color}`} />
                               </div>
                               <div className="flex-1 min-w-0">
                                 <h3 className="text-sm font-bold text-slate-100 mb-0.5 truncate">{item.title}</h3>
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

                          {/* Expanded Detailed View */}
                          <AnimatePresence>
                             {isExpanded && (
                                <motion.div 
                                   initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                   animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                                   exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                   className="relative z-10 border-t border-white/10 pt-4 overflow-hidden"
                                >
                                   <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
                                      <div>
                                         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Card Used</p>
                                         <p className="font-bold text-slate-200">{item.cardDetails}</p>
                                      </div>
                                      <div>
                                         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fund Source</p>
                                         <p className="font-bold text-slate-200">{item.paymentMethod}</p>
                                      </div>
                                      <div className="col-span-2">
                                         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Full Remarks</p>
                                         <p className="font-medium text-slate-300 bg-black/20 p-2 rounded-lg border border-white/5">{item.remarks || "No remarks added for this transaction."}</p>
                                      </div>
                                      <div className="col-span-2 flex items-center justify-between bg-[#0ea5e9]/5 p-2 rounded-lg border border-[#0ea5e9]/20">
                                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#0ea5e9]">
                                            <Info className="w-3.5 h-3.5" /> ID: {item.id.split('-')[1].substring(0, 8)}...
                                         </div>
                                         <div className="text-[10px] font-bold text-slate-400">
                                            Status: <span className="text-emerald-400">Settled</span>
                                         </div>
                                      </div>
                                   </div>
                                </motion.div>
                             )}
                          </AnimatePresence>

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
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#0ea5e9] to-[#a855f7] flex items-center justify-center shadow-[0_10px_40px_rgba(168,85,247,0.6)] border border-white/20 z-40"
      >
        <Plus className="w-7 h-7 text-white" />
      </motion.button>

      {/* ================= CENTERED ENTRY MODAL ================= */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]">
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar p-6">

            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">
                Record Entry
              </DialogTitle>
              <DialogDescription className="hidden">Record new transaction</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">

              {/* Type Segmented Control */}
              <div className="flex p-1.5 bg-white/[0.03] border border-white/10 rounded-2xl shadow-inner">
                {[
                  { id: "rotate", label: "Rotate Limit", icon: ArrowDownLeft, color: "#0ea5e9" },
                  { id: "spend", label: "Add Spend", icon: Receipt, color: "#a855f7" },
                  { id: "bill", label: "Pay Bill", icon: CheckCircle2, color: "#10b981" }
                ].map((type) => {
                  const Icon = type.icon;
                  const isActive = txType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setTxType(type.id as any)}
                      className={`flex-1 flex flex-col items-center justify-center py-2.5 relative rounded-xl transition-all ${
                        isActive ? "text-white" : "text-slate-500"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="txTypeBg"
                          className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-md"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <Icon className="w-4 h-4 mb-1 relative z-10" style={{ color: isActive ? type.color : undefined }} />
                      <span className="text-[10px] font-bold relative z-10">{type.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Amount Input */}
              <div className="bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 rounded-[32px] p-5 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] pointer-events-none opacity-20 ${txType === 'rotate' ? 'bg-[#0ea5e9]' : txType === 'spend' ? 'bg-[#a855f7]' : 'bg-[#10b981]'}`} />
                <label htmlFor="tx_amount" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 relative z-10">Amount (₹)</label>
                <input
                  id="tx_amount"
                  name="transaction_amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  className="w-full bg-transparent text-center text-5xl font-black text-white placeholder:text-white/10 outline-none relative z-10"
                />
              </div>

              {/* Date & User Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date</label>
                   <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input 
                         type="date" 
                         value={txDate} 
                         onChange={(e) => setTxDate(e.target.value)} 
                         className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-9 pr-2 outline-none focus:border-[#0ea5e9] transition-all appearance-none"
                      />
                   </div>
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                     {txType === 'rotate' ? 'Initiated By' : txType === 'spend' ? 'Spent By' : 'Paid By'}
                   </label>
                   <div className="relative">
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <select 
                         value={selectedUserId} 
                         onChange={(e) => setSelectedUserId(e.target.value)}
                         className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold text-white pl-3 pr-8 outline-none focus:border-[#0ea5e9] transition-all appearance-none"
                      >
                         {profiles.map(p => (
                            <option key={p.id} value={p.id} className="bg-black">{p.name.split(' ')[0]}</option>
                         ))}
                      </select>
                   </div>
                </div>
              </div>

              {/* Smart Card Linkage Dropdown */}
              <div className="space-y-1.5">
                 <label className="text-[11px] font-bold text-[#0ea5e9] uppercase ml-1 flex items-center gap-1.5">
                   <CreditCard className="w-3.5 h-3.5" /> Attach Card
                 </label>
                 <div className="relative">
                    <select 
                       value={entryCardId} 
                       onChange={(e) => setEntryCardId(e.target.value)}
                       className="w-full h-14 bg-gradient-to-r from-white/[0.05] to-transparent border border-white/10 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none shadow-[0_0_15px_rgba(14,165,233,0.1)]"
                    >
                       <option value="" disabled className="bg-black">Select a Card...</option>
                       {entryUserCards.map(c => (
                          <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>
                       ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                 </div>
              </div>

              {/* ================= CONDITIONAL FIELDS ================= */}
              <AnimatePresence mode="wait">

                {/* 1. ROTATE */}
                {txType === "rotate" && (
                  <motion.div key="rotate" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Destination QR</label>
                      <div className="relative">
                        <select 
                          value={selectedQrId} 
                          onChange={(e) => setSelectedQrId(e.target.value)}
                          className="w-full appearance-none bg-white/[0.03] border border-white/10 text-white text-sm font-bold h-14 pl-12 pr-10 rounded-2xl outline-none focus:border-[#0ea5e9] shadow-inner"
                        >
                          <option value="" className="bg-[#050505]">Select QR Code</option>
                          {qrs.map(qr => (
                            <option key={qr.id} value={qr.id} className="bg-[#050505]">{qr.merchant_name}</option>
                          ))}
                        </select>
                        <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 2. SPEND */}
                {txType === "spend" && (
                  <motion.div key="spend" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">
                         Payment Source <span className="text-[9px] lowercase text-indigo-400">(Auto-splits if amt exceeds)</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => setSpendMethod("credit_card")}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                             spendMethod === "credit_card" || isSplitting 
                             ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                             : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs font-bold">Direct Card</span></div>
                          {isSplitting ? (
                             <span className="text-sm font-black text-white">₹{cardSplitAmt.toLocaleString()}</span>
                          ) : (
                             <span className="text-[9px] font-black opacity-70">Avail: ₹{(currentFamilyLimit/1000).toFixed(1)}k</span>
                          )}
                        </button>
                        <button 
                          onClick={() => setSpendMethod("cash_on_hand")}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                             spendMethod === "cash_on_hand" || isSplitting 
                             ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                             : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">Cash on Hand</span></div>
                          {isSplitting ? (
                             <span className="text-sm font-black text-white">₹{cashSplitAmt.toLocaleString()}</span>
                          ) : (
                             <span className="text-[9px] font-black opacity-70">Bal: ₹{currentActorCash.toLocaleString()}</span>
                          )}
                        </button>
                      </div>

                      {isSplitting && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 mt-2 text-indigo-400">
                           <Zap className="w-3 h-3 animate-pulse" /> <span className="text-[10px] font-black uppercase tracking-widest">Auto-Split Activated</span>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* 3. BILL */}
                {txType === "bill" && (
                  <motion.div key="bill" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-5">

                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                       <div>
                          <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4"/> Clear Personal Debt?</div>
                          <div className="text-[9px] text-emerald-500/70 mt-0.5">Toggle ON to reduce your &quot;Total Personal Due&quot;</div>
                       </div>
                       <Switch 
                          checked={isDebtRepayment} 
                          onCheckedChange={setIsDebtRepayment} 
                          className="data-[state=checked]:bg-[#10b981]" 
                       />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">
                         Fund Source <span className="text-[9px] lowercase text-emerald-400">(Auto-splits to pocket)</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => setBillMethod("cash_on_hand")}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                             billMethod === "cash_on_hand" || isSplitting 
                             ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                             : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">Collected Cash</span></div>
                          {isSplitting ? (
                             <span className="text-sm font-black text-white">₹{cashSplitAmt.toLocaleString()}</span>
                          ) : (
                             <span className="text-[9px] font-black opacity-70">Bal: ₹{currentActorCash.toLocaleString()}</span>
                          )}
                        </button>
                        <button 
                          onClick={() => setBillMethod("own_pocket")}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                             billMethod === "own_pocket" || isSplitting 
                             ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                             : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs font-bold">Own Pocket</span></div>
                          {isSplitting ? (
                             <span className="text-sm font-black text-white">₹{pocketSplitAmt.toLocaleString()}</span>
                          ) : (
                             <span className="text-[9px] font-black opacity-70">Personal Funds</span>
                          )}
                        </button>
                      </div>

                      {isSplitting && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 mt-2 text-emerald-400">
                           <Zap className="w-3 h-3 animate-pulse" /> <span className="text-[10px] font-black uppercase tracking-widest">Auto-Split Activated</span>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Universal Remarks Field */}
              <div className="space-y-1.5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Remarks (Optional)</label>
                 <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#0ea5e9] transition-all shadow-inner">
                   <Edit3 className="w-4 h-4 text-slate-500 mr-3" />
                   <input 
                     type="text" 
                     autoComplete="off"
                     value={remarks}
                     onChange={(e) => setRemarks(e.target.value)}
                     placeholder="Add a note for this record..." 
                     className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 font-bold" 
                   />
                 </div>
              </div>

              {/* Instant Save Button */}
              <div className="pt-4">
                <Button 
                  onClick={handleSave}
                  className={`w-full h-14 rounded-2xl text-white font-black text-lg transition-all border-0 ${
                    txType === 'rotate' ? 'bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] shadow-[0_0_30px_rgba(14,165,233,0.3)]' :
                    txType === 'spend' ? 'bg-gradient-to-r from-[#a855f7] to-[#d946ef] shadow-[0_0_30px_rgba(168,85,247,0.3)]' :
                    'bg-gradient-to-r from-[#10b981] to-[#34d399] shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                  }`}
                >
                  {txType === 'rotate' ? "Record Rotation" : txType === 'spend' ? "Record Spend" : "Record Payment"}
                </Button>
              </div>

            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}