"use client";

import { useState, useEffect } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion, AnimatePresence } from "motion/react";
import { 
  AlertCircle, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  User, 
  Users,
  IndianRupee,
  CreditCard,
  Banknote,
  Edit3,
  ChevronDown,
  CalendarDays,
  HandCoins,
  History,
  ArrowRight
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// --- Interfaces ---
interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  method: 'cash' | 'card';
  card_name?: string;
}

interface LentRecord {
  id: string;
  borrower_name: string;
  amount: number;
  lent_date: string;
  due_date: string;
  status: string; // 'unpaid', 'partial', 'paid'
  given_by: string;
  funding_source: string;
  remarks: string;
  created_at: string;
  card_id?: string;
  payment_history?: PaymentHistory[] | null;
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
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
  is_primary: boolean;
  total_limit: number;
  parent_card_id?: string;
}

interface CardAccess {
  card_id: string;
  user_id: string;
  role: string;
}

export default function LentsPage() {
  const [lents, setLents] = useState<LentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allCardAccess, setAllCardAccess] = useState<CardAccess[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]); 

  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- LENDING ENTRY MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [borrowerName, setBorrowerName] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState<"cash_on_hand" | "credit_card">("cash_on_hand");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [lentDate, setLentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // --- COLLECTION MODAL STATES ---
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectingLent, setCollectingLent] = useState<LentRecord | null>(null);
  const [collectType, setCollectType] = useState<"full" | "partial">("full");
  const [collectAmount, setCollectAmount] = useState<string>("");
  const [receiveMethod, setReceiveMethod] = useState<"cash" | "card">("cash");
  const [receiveCardId, setReceiveCardId] = useState<string>("");

  useEffect(() => {
    fetchInitialData();

    const channel = supabase.channel('lents_ledger_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'short_term_lents' }, () => fetchLentsData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLentsData(allCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchLentsData(allCards))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [globalSelectedCardId]);

  const cleanUrl = (url?: string | null) => {
     if (!url) return "";
     return url.trim().replace(/^['"]|['"]$/g, '');
  };

  const getDefaultDueDate = () => {
     const now = new Date();
     let target = new Date(now.getFullYear(), now.getMonth(), 26); 
     if (now > target) target = new Date(now.getFullYear(), now.getMonth() + 1, 26);
     return target.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profData } = await supabase.from('profiles').select('id, name, avatar_url');
    const { data: cData } = await supabase.from('cards').select('*');
    const { data: aData } = await supabase.from('card_access').select('*');

    const profs = profData || [];
    const cardsList = cData || [];
    const accessList = aData || [];

    setAllProfiles(profs);
    setAllCards(cardsList);
    setAllCardAccess(accessList);

    if (user) {
      const myProfile = profs.find(p => p.id === user.id);
      if (myProfile) {
         setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) });
      }

      const myCardIds = accessList.filter(a => a.user_id === user.id).map(a => a.card_id);
      const myCards = cardsList.filter(c => myCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);
    }

    setLentDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    setDueDate(getDefaultDueDate());

    await fetchLentsData(cardsList);
    setIsLoading(false);
  };

  const fetchLentsData = async (currentCards: CardData[]) => {
    let targetCardIds: string[] = [];
    if (globalSelectedCardId !== 'all') {
      const selected = currentCards.find(c => c.id === globalSelectedCardId);
      if (selected) {
         const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
         targetCardIds = currentCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId).map(c => c.id);
      }
    }

    // 1. Fetch Lents
    let lentsQuery = supabase.from('short_term_lents')
      .select('*, profiles:given_by(name, avatar_url), cards(card_name, last_4_digits)')
      .order('lent_date', { ascending: false });

    if (globalSelectedCardId !== 'all' && targetCardIds.length > 0) {
       lentsQuery = lentsQuery.in('card_id', targetCardIds);
    }

    const { data: lData } = await lentsQuery;
    if (lData) setLents(lData as any);

    // 2. Fetch Cash On Hand
    const { data: coh } = await supabase.from('cash_on_hand').select('*');
    const cashMap: Record<string, number> = {};
    coh?.forEach(c => { cashMap[c.user_id] = (cashMap[c.user_id] || 0) + Number(c.current_balance); });
    setUserCashMap(cashMap);

    // 3. Exact Dashboard Logic for Card Available Limits
    const { data: txs } = await supabase.from('card_transactions').select('amount, type, payment_method, card_id, status');
    const { data: spends } = await supabase.from('spends').select('amount, payment_method, user_id, card_id');

    const availableMap: Record<string, number> = {};

    currentCards.filter(c => c.is_primary).forEach(primaryCard => {
       const familyCardIds = currentCards.filter(c => c.id === primaryCard.id || c.parent_card_id === primaryCard.id).map(c => c.id);

       const withdrawals = txs?.filter(t => t.type === 'withdrawal' && t.status === 'pending_settlement' && t.card_id && familyCardIds.includes(t.card_id)).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
       const billPayments = txs?.filter(t => t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id)).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
       const ccSpends = spends?.filter(s => s.payment_method === 'credit_card' && s.card_id && familyCardIds.includes(s.card_id)).reduce((sum, s) => sum + Number(s.amount), 0) || 0;

       const available = Number(primaryCard.total_limit) - withdrawals - ccSpends + billPayments;

       familyCardIds.forEach(id => {
           availableMap[id] = available;
       });
    });
    setCardAvailableMap(availableMap);
  };

  // --- Cash Update using cash_on_hand_ledger ---
  const updateCashBalance = async (userId: string, cardId: string, amt: number, type: 'credit' | 'debit', note: string) => {
     // 1. Get current balance
     const { data: coh } = await supabase.from('cash_on_hand').select('*').eq('user_id', userId).eq('card_id', cardId).maybeSingle();
     const currentBalance = coh ? Number(coh.current_balance) : 0;
     const newBalance = type === 'credit' ? currentBalance + amt : currentBalance - amt;

     // 2. Update cash_on_hand table (Total tracking)
     const { error: cashUpsertError } = await supabase.from('cash_on_hand').upsert({
        user_id: userId,
        card_id: cardId,
        current_balance: newBalance
     }, {
        onConflict: 'user_id,card_id'
     });
     if (cashUpsertError) throw cashUpsertError;

     // 3. Insert into cash_on_hand_ledger (History tracking)
     const { error: cashLedgerError } = await supabase.from('cash_on_hand_ledger').insert({
        user_id: userId,
        card_id: cardId,
        amount: amt,
        transaction_type: type,
        remarks: note,
        transaction_date: new Date().toISOString()
     });
     if (cashLedgerError) throw cashLedgerError;
  };

  // --- RECORD NEW LENDING ---
  const handleSaveLent = async () => {
    if (!currentUser) return;
    const amtNum = Number(amount);
    const actorCash = userCashMap[currentUser.id] || 0;

    let activeLimit = 0;
    if (fundSource === 'credit_card' && selectedCardId) {
        activeLimit = cardAvailableMap[selectedCardId] || 0;
    }

    if (!borrowerName || isNaN(amtNum) || amtNum <= 0 || !dueDate || !lentDate) {
      alert("Please fill all details correctly.");
      return;
    }

    if (fundSource === 'cash_on_hand' && amtNum > actorCash) {
       alert(`Insufficient Cash! You only have ₹${actorCash.toLocaleString()} available.`);
       return;
    }

    if (fundSource === 'credit_card' && amtNum > activeLimit) {
       alert(`Insufficient Limit! The selected card only has ₹${activeLimit.toLocaleString()} available.`);
       return;
    }

    setIsSaving(true);

    try {
      // Cash Update with Ledger History
      if (fundSource === 'cash_on_hand') {
         const cashCardId =
           globalSelectedCardId !== 'all'
             ? globalSelectedCardId
             : accessibleCards[0]?.id;
         if (!cashCardId) throw new Error("No card selected for cash entry.");
         await updateCashBalance(currentUser.id, cashCardId, amtNum, 'debit', `Lent given to ${borrowerName}`);
      }

      // Card Transactions & Spends Update
      if (fundSource === 'credit_card') {
         await supabase.from('card_transactions').insert({
            card_id: selectedCardId,
            amount: amtNum,
            type: 'withdrawal',
            status: 'pending_settlement',
            transaction_date: lentDate,
            recorded_by: currentUser.id,
            remarks: `Lent given to ${borrowerName}`
         });

         await supabase.from('spends').insert({
            user_id: currentUser.id,
            amount: amtNum,
            spend_type: 'personal',
            payment_method: 'credit_card',
            spend_date: lentDate,
            card_id: selectedCardId,
            remarks: `Lent to ${borrowerName} from card`
         });
      }

      // Record in Lents Table
      const { error: lentError } = await supabase.from('short_term_lents').insert({
        borrower_name: borrowerName,
        amount: amtNum,
        lent_date: lentDate,
        due_date: dueDate,
        status: 'unpaid',
        given_by: currentUser.id,
        funding_source: fundSource,
        remarks: remarks,
        card_id: fundSource === 'credit_card' ? selectedCardId : null,
        payment_history: [] // Start with empty JSON array
      });

      if (lentError) throw lentError;

      setIsModalOpen(false);
      fetchLentsData(allCards);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- LENT COLLECTION & PARTIAL RECOVERY ---
  const handleCollectLent = async () => {
     if (!collectingLent || !currentUser) return;

     const totalPaidBefore = (collectingLent.payment_history || []).reduce((s, p) => s + p.amount, 0);
     const remainingDue = collectingLent.amount - totalPaidBefore;
     const amtNum = collectType === 'full' ? remainingDue : Number(collectAmount);

     if (isNaN(amtNum) || amtNum <= 0 || amtNum > remainingDue) {
        alert("Invalid collection amount!");
        return;
     }

     setIsSaving(true);
     const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

     try {
        // Update Lent Table JSON History
        const currentHistory = collectingLent.payment_history || [];
        const newPayment: PaymentHistory = {
           id: crypto.randomUUID(),
           date: today,
           amount: amtNum,
           method: receiveMethod,
           card_name: receiveMethod === 'card' ? accessibleCards.find(c=>c.id === receiveCardId)?.card_name : 'Cash'
        };
        const updatedHistory = [...currentHistory, newPayment];
        const newTotalPaid = updatedHistory.reduce((s, p) => s + p.amount, 0);
        const newStatus = newTotalPaid >= collectingLent.amount ? 'paid' : 'partial';

        await supabase.from('short_term_lents').update({
           status: newStatus,
           payment_history: updatedHistory
        }).eq('id', collectingLent.id);

        // Process Received Funds
        if (receiveMethod === 'cash') {
           // Receive to Cash (Already contains cash_on_hand_ledger entry in updateCashBalance function)
           const cashCardId =
             (globalSelectedCardId !== 'all' ? globalSelectedCardId : null) ||
             collectingLent.card_id ||
             accessibleCards[0]?.id;
           if (!cashCardId) throw new Error("No card selected for cash collection.");
           await updateCashBalance(currentUser.id, cashCardId, amtNum, 'credit', `Collected lent from ${collectingLent.borrower_name}`);
        } else if (receiveMethod === 'card') {
           // --- NEW LOGIC: Check Billing Cycle for the current month ---
           let activeCycleId = null;

           const now = new Date();
           const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
           const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

           const { data: cycles } = await supabase
              .from('billing_cycles')
              .select('*')
              .eq('card_id', receiveCardId)
              .gte('billing_month', startOfMonth)
              .lte('billing_month', endOfMonth);

           if (cycles && cycles.length > 0) {
              const cycle = cycles[0]; // Assuming one billing cycle per month
              const generatedAmt = Number(cycle.generated_amount);
              const paidAmt = Number(cycle.paid_amount);

              if (paidAmt < generatedAmt) {
                 const newPaidAmt = paidAmt + amtNum;
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

           // Receive to Card (with billing_cycle_id if applicable)
           await supabase.from('card_transactions').insert({
              card_id: receiveCardId,
              amount: amtNum,
              transaction_date: today,
              type: 'bill_payment',
              status: 'settled',
              recorded_by: currentUser.id,
              payment_method: 'lent_recovery',
              remarks: `Collected lent from ${collectingLent.borrower_name}`,
              billing_cycle_id: activeCycleId // If no unpaid bill, it stays null
           });
        }

        // Negative Spends Entry (CRITICAL): ONLY if original lent was from a Credit Card
        // This flawlessly offsets the Personal Due in Dashboard.
        if (collectingLent.funding_source === 'credit_card') {
           await supabase.from('spends').insert({
              user_id: currentUser.id,
              amount: -amtNum,
              spend_type: 'personal',
              payment_method: 'credit_card', 
              spend_date: today,
              card_id: receiveMethod === 'card' ? receiveCardId : collectingLent.card_id,
              remarks: `Lent recovery from ${collectingLent.borrower_name}`
           });
        }

        setIsCollectModalOpen(false);
        fetchLentsData(allCards);
     } catch (err: any) {
        alert("Error during collection: " + err.message);
     } finally {
        setIsSaving(false);
     }
  };

  const openEntryModal = () => {
    setBorrowerName("");
    setAmount("");
    setRemarks("");
    setFundSource("cash_on_hand");
    setLentDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    setDueDate(getDefaultDueDate());

    if (globalSelectedCardId !== 'all') {
       setSelectedCardId(globalSelectedCardId);
    } else if (accessibleCards.length > 0) {
       setSelectedCardId(accessibleCards[0].id);
    }

    setIsModalOpen(true);
  };

  const openCollectModal = (loan: LentRecord) => {
     setCollectingLent(loan);
     setCollectType("full");
     setCollectAmount("");
     setReceiveMethod("cash");

     if (globalSelectedCardId !== 'all') {
        setReceiveCardId(globalSelectedCardId);
     } else if (accessibleCards.length > 0) {
        setReceiveCardId(accessibleCards[0].id);
     }

     setIsCollectModalOpen(true);
  };

  // Remaining Calc Helpers
  const getPaidAmount = (loan: LentRecord) => (loan.payment_history || []).reduce((s, p) => s + p.amount, 0);
  const getRemainingAmount = (loan: LentRecord) => loan.amount - getPaidAmount(loan);

  const activeLents = lents.filter(l => l.status !== "paid");
  const totalReceivable = activeLents.reduce((acc, curr) => acc + getRemainingAmount(curr), 0);

  const actorCash = userCashMap[currentUser?.id || ""] || 0;

  const toggleExpand = (id: string) => {
     setExpandedId(expandedId === id ? null : id);
  };

  // User's own accessible cards for entry modal
  const entryUserAccessibleCardIds = allCardAccess.filter(a => a.user_id === currentUser?.id).map(a => a.card_id);
  const entryUserCards = allCards.filter(c => entryUserAccessibleCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#f59e0b]/30">

      {/* ================= AMBER & RED CYBER BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f59e0b0a_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b0a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
        <motion.div
          animate={{ x: [0, -30, 30, 0], y: [0, 40, -40, 0], scale: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-20%] w-[70vw] h-[70vw] rounded-full bg-[#f59e0b] opacity-[0.12] blur-[120px] mix-blend-screen"
        />
        <motion.div
          animate={{ x: [0, 40, -40, 0], y: [0, -30, 30, 0], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#ef4444] opacity-[0.12] blur-[100px] mix-blend-screen"
        />
      </div>

      {/* ================= HEADER ================= */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
           <Link href="/settings">
             <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#f59e0b] to-[#ef4444] p-0.5 shadow-[0_0_20px_rgba(245,158,11,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
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
               animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
               transition={{ duration: 5, ease: "linear", repeat: Infinity }}
               className="bg-[length:200%_200%] bg-gradient-to-r from-[#f59e0b] via-[#ef4444] to-[#f59e0b] bg-clip-text"
             >
               <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">
                 Credit Extensions
               </p>
             </motion.div>
             <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
               Micro-Lending
             </h1>
           </div>
        </div>

        {/* Global Card Selector */}
        <div className="relative">
          <select 
             value={globalSelectedCardId}
             onChange={(e) => setGlobalSelectedCardId(e.target.value)}
             className="appearance-none bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-7 rounded-xl outline-none focus:border-[#f59e0b] shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-md"
          >
             <option value="all" className="bg-[#050505]">All Vault Cards</option>
             {accessibleCards.map(c => (
                <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
             ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </header>

      <main className="relative z-10 px-4 pt-6 max-w-md mx-auto space-y-6">

        {/* ================= ACTIVE LOANS SUMMARY ================= */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative p-6 rounded-[32px] overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent opacity-50 blur-[2px]" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/10 to-[#ef4444]/5 z-0" />

          <div className="relative z-10 flex flex-col items-center text-center mt-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Due (Remaining)</span>
            <div className="text-4xl font-black font-space tracking-tight bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#ef4444] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">
              ₹{totalReceivable.toLocaleString('en-IN')}
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 shadow-inner">
              <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Track friends who owe you money</span>
            </div>
          </div>
        </motion.section>

        {/* ================= BORROWERS LIST ================= */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] uppercase tracking-wider flex items-center gap-2 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">
               Full Lending Ledger
            </h2>
          </div>

          {isLoading ? (
             <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f59e0b]"></div>
             </div>
          ) : (
            <motion.div initial="hidden" animate="visible" className="space-y-3 pb-6">
              <AnimatePresence mode="popLayout">
                {lents.map((loan) => {
                  const isExpanded = expandedId === loan.id;
                  const remainingAmount = getRemainingAmount(loan);
                  const isPaid = loan.status === "paid";
                  const isPartial = loan.status === "partial";
                  const daysToDue = Math.ceil((new Date(loan.due_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  const isUrgent = !isPaid && daysToDue <= 3;
                  const displayDate = loan.lent_date || loan.created_at.split('T')[0];

                  return (
                    <motion.div
                      key={loan.id}
                      layout
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      onClick={() => toggleExpand(loan.id)}
                      className={`group relative p-4 bg-white/[0.03] border rounded-[24px] backdrop-blur-xl flex flex-col hover:bg-white/[0.05] transition-all cursor-pointer overflow-hidden shadow-inner ${
                        isUrgent ? "border-[#ef4444]/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]" : "border-white/5 hover:border-white/10"
                      } ${isPaid ? "opacity-60 grayscale-[30%] hover:grayscale-0 hover:opacity-100" : ""}`}
                    >
                      <div className="flex justify-between items-center relative z-10 w-full">
                        <div className="flex items-center gap-3 w-[65%]">
                          <div className={`w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center border border-white/5 shadow-inner ${isPaid ? 'bg-emerald-500/10' : (isPartial ? 'bg-amber-500/10' : 'bg-[#f59e0b]/10')}`}>
                            <User className={`w-5 h-5 ${isPaid ? 'text-emerald-400' : (isPartial ? 'text-amber-400' : 'text-[#f59e0b]')}`} />
                          </div>
                          <div className="truncate">
                            <h3 className="text-sm font-bold text-slate-100 mb-0.5 truncate">{loan.borrower_name}</h3>
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 truncate">
                              <Calendar className="w-3 h-3" />
                              <span className={isUrgent ? "text-[#ef4444] font-bold" : ""}>
                                Due: {new Date(loan.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 relative z-10 shrink-0">
                          <div className="text-base font-black text-white tracking-tight flex items-center gap-1">
                            ₹{remainingAmount.toLocaleString('en-IN')}
                            <ChevronDown className={`w-3.5 h-3.5 opacity-50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>

                          {/* Dynamic Status Badges */}
                          {isPaid ? (
                             <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#10b981]/10 text-[#10b981] px-1.5 py-0.5 rounded border border-[#10b981]/20">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                             </span>
                          ) : isPartial ? (
                             <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20">
                                Partial
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#ef4444]/10 text-[#ef4444] px-1.5 py-0.5 rounded border border-[#ef4444]/20">
                                Unpaid
                             </span>
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                         {isExpanded && (
                            <motion.div 
                               initial={{ height: 0, opacity: 0, marginTop: 0 }}
                               animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                               exit={{ height: 0, opacity: 0, marginTop: 0 }}
                               className="relative z-10 border-t border-white/10 pt-4 overflow-hidden"
                            >
                               {/* Loan Details */}
                               <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs mb-4">
                                  <div>
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Funded From</p>
                                     <p className="font-bold text-slate-200 flex items-center gap-1">
                                        {loan.funding_source === 'credit_card' ? <><CreditCard className="w-3.5 h-3.5 text-indigo-400"/> Card Swipe</> : <><Banknote className="w-3.5 h-3.5 text-amber-400"/> Held Cash</>}
                                     </p>
                                  </div>
                                  <div>
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Lent</p>
                                     <p className="font-bold text-slate-200">₹{loan.amount.toLocaleString()}</p>
                                  </div>
                                  {loan.funding_source === 'credit_card' && loan.cards && (
                                     <div className="col-span-2">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Card Used</p>
                                        <p className="font-bold text-slate-300">{loan.cards.card_name} (**{loan.cards.last_4_digits})</p>
                                     </div>
                                  )}
                                  <div>
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Lent On</p>
                                     <p className="font-bold text-slate-200">{new Date(displayDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                  </div>
                                  <div className="col-span-2">
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</p>
                                     <p className="font-medium text-slate-300 bg-black/20 p-2 rounded-lg border border-white/5">{loan.remarks || "No remarks added."}</p>
                                  </div>
                               </div>

                               {/* JSON Payment History Render */}
                               {loan.payment_history && loan.payment_history.length > 0 && (
                                  <div className="mb-4 bg-black/30 rounded-xl p-3 border border-white/5">
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><History className="w-3 h-3" /> Recovery History</p>
                                     <div className="space-y-2">
                                        {loan.payment_history.map((ph, idx) => (
                                           <div key={idx} className="flex justify-between items-center text-xs">
                                              <div className="flex items-center gap-2">
                                                 <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                                                 <span className="text-slate-300">{new Date(ph.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                                 <span className="text-[9px] bg-white/10 px-1.5 rounded text-slate-400">{ph.method === 'card' ? `Card (${ph.card_name})` : 'Cash'}</span>
                                              </div>
                                              <span className="font-bold text-[#10b981]">+₹{ph.amount.toLocaleString()}</span>
                                           </div>
                                        ))}
                                     </div>
                                  </div>
                               )}

                               {/* Collection Button */}
                               {!isPaid && (
                                  <Button 
                                    onClick={(e) => { e.stopPropagation(); openCollectModal(loan); }}
                                    className="w-full h-11 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                  >
                                     <HandCoins className="w-4 h-4 mr-2" /> Collect / Mark Received
                                  </Button>
                               )}
                            </motion.div>
                         )}
                      </AnimatePresence>

                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {lents.length === 0 && (
                 <div className="text-center py-12 px-4 bg-white/[0.02] rounded-[28px] border border-white/10 border-dashed backdrop-blur-md">
                   <Users className="w-10 h-10 text-slate-500/40 mx-auto mb-3" />
                   <p className="text-slate-400 text-sm font-medium">No lending records found.</p>
                 </div>
              )}
            </motion.div>
          )}
        </section>

      </main>

      {/* ================= ADD LENT FAB ================= */}
      <motion.button
        onClick={openEntryModal}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#f59e0b] to-[#ef4444] flex items-center justify-center text-white shadow-[0_10px_40px_rgba(245,158,11,0.6)] border border-white/20 z-40"
      >
        <Plus className="w-7 h-7" />
      </motion.button>

      {/* ================= LENDING ENTRY MODAL ================= */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]">
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar p-6">

            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#f59e0b] to-[#ef4444] bg-clip-text text-transparent">
                Record Lending
              </DialogTitle>
              <DialogDescription className="hidden">Add new short term loan</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">

              {/* Borrower & Amount */}
              <div className="space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Borrower Name</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#f59e0b] shadow-inner transition-colors">
                     <User className="w-5 h-5 text-slate-500 mr-3" />
                     <input 
                       type="text" 
                       value={borrowerName}
                       onChange={(e) => setBorrowerName(e.target.value)}
                       placeholder="e.g. Rahul Sharma" 
                       className="bg-transparent border-none outline-none w-full text-sm font-bold text-white placeholder:text-slate-600"
                     />
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Amount (₹)</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#f59e0b] shadow-inner transition-colors">
                     <IndianRupee className="w-5 h-5 text-slate-500 mr-3" />
                     <input 
                       type="text" 
                       inputMode="numeric"
                       value={amount}
                       onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                       placeholder="0" 
                       className="bg-transparent border-none outline-none w-full text-xl font-black text-white placeholder:text-slate-600"
                     />
                   </div>
                 </div>
              </div>

              {/* Funding Source */}
              <div className="space-y-1.5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">
                    Funding Source <span className="text-[9px] lowercase text-[#f59e0b]">(Where is money coming from?)</span>
                 </label>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setFundSource("cash_on_hand")}
                     className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                        fundSource === "cash_on_hand"
                        ? "bg-[#f59e0b]/20 text-[#fbbf24] border-[#f59e0b]/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                        : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                     }`}
                   >
                     <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">My Cash</span></div>
                     <span className="text-[9px] font-black opacity-70">Avail: ₹{actorCash.toLocaleString('en-IN')}</span>
                   </button>
                   <button 
                     onClick={() => setFundSource("credit_card")}
                     className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                        fundSource === "credit_card"
                        ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                        : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                     }`}
                   >
                     <div className="flex items-center gap-1.5 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs font-bold">Card Swipe</span></div>
                     <span className="text-[9px] font-black opacity-70">Swipe Directly</span>
                   </button>
                 </div>
              </div>

              {/* Card Selector (If Credit Card) */}
              <AnimatePresence>
                 {fundSource === 'credit_card' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                       <label className="text-[11px] font-bold text-indigo-400 uppercase ml-1 flex items-center gap-1.5">
                         <CreditCard className="w-3.5 h-3.5" /> Select Card
                       </label>
                       <div className="relative">
                          <select 
                             value={selectedCardId} 
                             onChange={(e) => setSelectedCardId(e.target.value)}
                             className="w-full h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-indigo-400 appearance-none shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                          >
                             <option value="" disabled className="bg-black text-slate-500">Select a Card to swipe...</option>
                             {entryUserCards.map(c => {
                                const avail = cardAvailableMap[c.id] || 0;
                                return (
                                   <option key={c.id} value={c.id} className="bg-black">
                                      {c.card_name} (**{c.last_4_digits}) - Avail: ₹{avail.toLocaleString()}
                                   </option>
                                );
                             })}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              {/* Dates & Remarks */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Lent On (Date)</label>
                   <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input 
                         type="date" 
                         value={lentDate} 
                         onChange={(e) => setLentDate(e.target.value)} 
                         className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-9 pr-2 outline-none focus:border-[#f59e0b] transition-all appearance-none"
                      />
                   </div>
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Est. Due Date</label>
                   <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input 
                         type="date" 
                         value={dueDate} 
                         onChange={(e) => setDueDate(e.target.value)} 
                         className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-9 pr-2 outline-none focus:border-[#f59e0b] transition-all appearance-none"
                      />
                   </div>
                </div>
                <div className="col-span-2 space-y-1.5 mt-2">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Remarks</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-xl h-12 px-3 focus-within:border-[#f59e0b] transition-colors">
                      <Edit3 className="w-3.5 h-3.5 text-slate-500 mr-2" />
                      <input 
                         type="text" 
                         value={remarks} 
                         onChange={(e) => setRemarks(e.target.value)} 
                         placeholder="Optional details"
                         className="bg-transparent border-none outline-none w-full text-[12px] font-bold text-white placeholder:text-slate-600"
                      />
                   </div>
                </div>
              </div>

              {/* Dynamic Action Button */}
              <div className="pt-4">
                {(() => {
                   const amtNum = Number(amount);
                   const isNoAmount = isNaN(amtNum) || amtNum <= 0;
                   let isInsufficient = false;

                   if (fundSource === 'cash_on_hand' && amtNum > actorCash) isInsufficient = true;
                   if (fundSource === 'credit_card' && selectedCardId) {
                      const avail = cardAvailableMap[selectedCardId] || 0;
                      if (amtNum > avail) isInsufficient = true;
                   }

                   const isDisabled = isSaving || !borrowerName || isNoAmount || !lentDate || !dueDate || isInsufficient || (fundSource === 'credit_card' && !selectedCardId);

                   return (
                      <Button 
                         onClick={handleSaveLent}
                         disabled={isDisabled}
                         className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(245,158,11,0.4)] border-0 disabled:opacity-50 transition-all"
                      >
                         {isSaving ? "Saving Record..." : isInsufficient ? (fundSource === 'credit_card' ? "Insufficient Card Limit" : "Insufficient Cash Balance") : "Confirm Lending"}
                      </Button>
                   );
                })()}
              </div>

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= COLLECTION (RECEIVE) MODAL ================= */}
      <Dialog open={isCollectModalOpen} onOpenChange={setIsCollectModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#10b981]/20 rounded-full blur-[50px] pointer-events-none" />
          <DialogHeader className="mb-4 relative z-10">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#34d399] bg-clip-text text-transparent">
              Collect Lent Money
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Receiving from {collectingLent?.borrower_name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 relative z-10">
             <div className="flex bg-black/60 p-1.5 rounded-xl border border-white/5">
               <button onClick={() => { setCollectType("full"); setCollectAmount(""); }} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${collectType === "full" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Full Collection</button>
               <button onClick={() => setCollectType("partial")} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${collectType === "partial" ? "bg-[#10b981]/20 text-[#10b981] shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Partial Amount</button>
             </div>

             {collectType === "full" ? (
                 <div className="text-center p-6 bg-white/[0.02] border border-white/10 rounded-[24px] shadow-inner">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Remaining</p>
                    <p className="text-4xl font-black text-white">₹{collectingLent ? getRemainingAmount(collectingLent).toLocaleString() : 0}</p>
                 </div>
             ) : (
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider ml-1">Received Amount</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">₹</span>
                       <input 
                          type="number" 
                          value={collectAmount} 
                          onChange={(e) => setCollectAmount(e.target.value)} 
                          placeholder="0.00" 
                          className="w-full h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl pl-8 pr-4 text-xl font-bold text-white outline-none focus:border-emerald-500" 
                       />
                    </div>
                    {Number(collectAmount) > 0 && Number(collectAmount) < (collectingLent ? getRemainingAmount(collectingLent) : 0) && (
                       <p className="text-[10px] text-slate-400 font-medium text-right mt-1.5">
                         Remaining debt will be: ₹{((collectingLent ? getRemainingAmount(collectingLent) : 0) - Number(collectAmount)).toLocaleString()}
                       </p>
                    )}
                 </div>
             )}

             <div className="space-y-2 pt-2 border-t border-white/5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Where did you receive it?</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setReceiveMethod("cash")}
                     className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-all border ${
                        receiveMethod === "cash"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                        : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                     }`}
                   >
                     <Banknote className="w-4 h-4" /> <span className="text-xs font-bold">To My Cash</span>
                   </button>
                   <button 
                     onClick={() => setReceiveMethod("card")}
                     className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-all border ${
                        receiveMethod === "card"
                        ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                        : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                     }`}
                   >
                     <CreditCard className="w-4 h-4" /> <span className="text-xs font-bold">Direct to Card</span>
                   </button>
                 </div>
             </div>

             <AnimatePresence>
                 {receiveMethod === 'card' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 pt-2">
                       <label className="text-[11px] font-bold text-indigo-400 uppercase ml-1 flex items-center gap-1.5">
                         <CreditCard className="w-3.5 h-3.5" /> Select Card to Credit
                       </label>
                       <div className="relative">
                          <select 
                             value={receiveCardId} 
                             onChange={(e) => setReceiveCardId(e.target.value)}
                             className="w-full h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-indigo-400 appearance-none shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                          >
                             {accessibleCards.map(c => (
                                <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
                             ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              <div className="pt-2">
                <Button 
                    onClick={handleCollectLent} 
                    disabled={isSaving || (collectType === 'partial' && (!collectAmount || Number(collectAmount) <= 0 || Number(collectAmount) >= (collectingLent ? getRemainingAmount(collectingLent) : 0))) || (receiveMethod === 'card' && !receiveCardId)} 
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#34d399] hover:opacity-90 text-black font-black text-lg border-0 disabled:opacity-50 shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all"
                >
                  {isSaving ? "Processing..." : "Confirm Receipt"}
                </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
