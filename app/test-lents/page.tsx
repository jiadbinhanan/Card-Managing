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
  ShieldAlert
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppAlert } from "@/lib/whatsapp";
import Link from "next/link";

// --- Interfaces ---
interface PaymentHistory { id: string; date: string; amount: number; method: 'cash' | 'card'; card_name?: string; }
interface LentRecord { id: string; borrower_name: string; amount: number; lent_date: string; due_date: string; status: string; given_by: string; funding_source: string; remarks: string; created_at: string; card_id?: string; payment_history?: PaymentHistory[] | null; profiles?: { name: string; avatar_url?: string }; cards?: { card_name: string; last_4_digits: string }; }
interface Profile { id: string; name: string; avatar_url?: string; phone?: string; }
interface CardData { id: string; card_name: string; last_4_digits: string; is_primary: boolean; total_limit: number; parent_card_id?: string; }
interface CardAccess { card_id: string; user_id: string; role: string; }

// ─── Smoke Reveal ────────
function SmokeText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span key={i} initial={{ opacity: 0, filter: "blur(12px)", y: 8 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ delay: i * 0.045, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="inline-block bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" style={{ whiteSpace: char === " " ? "pre" : "normal" }}>
          {char}
        </motion.span>
      ))}
    </span>
  );
}

function SmokeWords({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <motion.span key={i} initial={{ opacity: 0, filter: "blur(8px)", y: 5 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ delay: 0.3 + i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="inline-block bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#10b981] bg-clip-text text-transparent">
          {word}
        </motion.span>
      ))}
    </span>
  );
}

export default function TestLentsPage() {
  const [lents, setLents] = useState<LentRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allCardAccess, setAllCardAccess] = useState<CardAccess[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]); 
  const [cardCashMap, setCardCashMap] = useState<Record<string, Record<string, number>>>({});
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [borrowerName, setBorrowerName] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState<"cash_on_hand" | "credit_card">("cash_on_hand");
  const [selectedCardId, setSelectedCardId] = useState(""); 
  const [cashSourceCardId, setCashSourceCardId] = useState(""); 
  const [lentDate, setLentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectingLent, setCollectingLent] = useState<LentRecord | null>(null);
  const [collectType, setCollectType] = useState<"full" | "partial">("full");
  const [collectAmount, setCollectAmount] = useState<string>("");
  const [receiveMethod, setReceiveMethod] = useState<"cash" | "card">("cash");
  const [receiveCardId, setReceiveCardId] = useState<string>(""); 
  const [receiveCashCardId, setReceiveCashCardId] = useState<string>(""); 

  useEffect(() => { fetchInitialData(); }, [globalSelectedCardId]);

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
    const { data: profData } = await supabase.from('profiles').select('id, name, avatar_url, phone');
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

    let lentsQuery = supabase.from('short_term_lents')
      .select('*, profiles:given_by(name, avatar_url), cards(card_name, last_4_digits)')
      .order('lent_date', { ascending: false });

    if (globalSelectedCardId !== 'all' && targetCardIds.length > 0) {
       lentsQuery = lentsQuery.in('card_id', targetCardIds);
    }

    const { data: lData } = await lentsQuery;
    if (lData) setLents(lData as any);

    const { data: coh } = await supabase.from('cash_on_hand').select('user_id, card_id, current_balance');
    const userCardCashMap: Record<string, Record<string, number>> = {};
    coh?.forEach(c => {
      if (c.user_id && c.card_id) {
        if (!userCardCashMap[c.user_id]) userCardCashMap[c.user_id] = {};
        userCardCashMap[c.user_id][c.card_id] = Number(c.current_balance);
      }
    });
    setCardCashMap(userCardCashMap as any);

    const { data: txs } = await supabase.from('card_transactions').select('amount, type, payment_method, card_id, status, qr_id, settled_to_user, remarks');
    const { data: spends } = await supabase.from('spends').select('amount, payment_method, user_id, card_id');

    const availableMap: Record<string, number> = {};
    currentCards.filter(c => c.is_primary).forEach(primaryCard => {
       const familyCardIds = currentCards.filter(c => c.id === primaryCard.id || c.parent_card_id === primaryCard.id).map(c => c.id);
       const withdrawals = txs?.filter(t => {
         if (t.type !== 'withdrawal') return false;
         if (!t.card_id || !familyCardIds.includes(t.card_id)) return false;
         const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
         if (isRotation) return true;
         return t.status === 'pending_settlement';
       }).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
       const billPayments = txs?.filter(t => t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id)).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
       const ccSpends = spends?.filter(s => s.payment_method === 'credit_card' && s.card_id && familyCardIds.includes(s.card_id)).reduce((sum, s) => sum + Number(s.amount), 0) || 0;
       const available = Number(primaryCard.total_limit) - withdrawals - ccSpends + billPayments;
       familyCardIds.forEach(id => { availableMap[id] = available; });
    });
    setCardAvailableMap(availableMap);
  };

  // 🔴 SUPER SANITIZER: Removes all invisible unicode characters & newlines 🔴
  const sanitizeText = (str: any) => {
    if (!str) return "-";
    return String(str)
      .replace(/[\u202F\u00A0]/g, ' ') // Fixes the dreaded Narrow No-Break Space from toLocaleTimeString
      .replace(/[\r\n\t]+/g, ' ')      // Removes newlines
      .trim() || "-";                  // Prevents empty strings
  };

  // =======================================================================
  // 1. SIMULATE SAVE LENT (No Database Saving, Only WhatsApp Alert)
  // =======================================================================
  const handleSaveLent = async () => {
    if (!currentUser) return;
    const amtNum = Number(amount);
    const activeCashCardId = cashSourceCardId;
    const actorCashForCard = currentUser ? getUserCashForCard(currentUser.id, activeCashCardId) : 0;

    let activeLimit = 0;
    if (fundSource === 'credit_card' && selectedCardId) {
        activeLimit = cardAvailableMap[selectedCardId] || 0;
    }

    if (!borrowerName || isNaN(amtNum) || amtNum <= 0 || !dueDate || !lentDate) {
      alert("Please fill all details correctly.");
      return;
    }

    setIsSaving(true);

    try {
      // ⚠️ SIMULATION: Calculate variables WITHOUT saving to DB ⚠️
      const nowTime = new Date();
      // Replace invisible spaces right at creation
      const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

      const sourceName = fundSource === 'credit_card'
        ? (allCards.find(c => c.id === selectedCardId)?.card_name || "Card")
        : "Cash on Hand";

      const remainingBalance = fundSource === 'credit_card' ? (activeLimit - amtNum) : (actorCashForCard - amtNum);

      const prevActiveLents = lents.filter(l => l.status !== "paid");
      const prevTotalReceivable = prevActiveLents.reduce((acc, curr) => {
        const paid = (curr.payment_history || []).reduce((s, p) => s + p.amount, 0);
        return acc + (curr.amount - paid);
      }, 0);
      const totalDue = prevTotalReceivable + amtNum;

      // 🔴 WHATSAPP LOGIC WITH RIGOROUS SAFEGUARDS 🔴
      for (const profile of allProfiles) {
         const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');

         if (cleanPhone.length >= 10) {
            const alertVars: Record<string, string> = {
              greeting_user:     sanitizeText(profile.name),
              entry_user:        sanitizeText(currentUser.name),
              time:              sanitizeText(timeStr),
              borrower_name:     sanitizeText(borrowerName),
              amount:            sanitizeText(String(amtNum)),
              source_name:       sanitizeText(sourceName),
              remaining_balance: sanitizeText(String(remainingBalance)),
              total_due_lent:    sanitizeText(String(totalDue))
            };
            console.log(`Sending lent_issue_alert to ${profile.name} (${cleanPhone}):`, alertVars);
            await sendWhatsAppAlert(cleanPhone, "lent_issue_alert", alertVars);
         } else {
            console.warn(`Skipping profile ${profile.name} due to invalid phone: ${profile.phone}`);
         }
      }

      alert("✅ [TEST MODE] Lent Issue Alert Sent Successfully!\nCheck your console logs for details.");
      setIsModalOpen(false);
    } catch (error: any) {
      alert("Test Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // =======================================================================
  // 2. SIMULATE COLLECT LENT (No Database Saving, Only WhatsApp Alert)
  // =======================================================================
  const handleCollectLent = async () => {
     if (!collectingLent || !currentUser) return;

     const totalPaidBefore = (collectingLent.payment_history || []).reduce((s, p) => s + p.amount, 0);
     const remainingDueBefore = collectingLent.amount - totalPaidBefore;
     const amtNum = collectType === 'full' ? remainingDueBefore : Number(collectAmount);

     if (isNaN(amtNum) || amtNum <= 0 || amtNum > remainingDueBefore) return;

     setIsSaving(true);

     try {
        // ⚠️ SIMULATION: Calculate variables WITHOUT saving to DB ⚠️
        const nowTime = new Date();
        const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

        const fullOrPartial = collectType === 'full' ? "সম্পূর্ণ" : "আংশিক";
        const fullAmmountStr = collectType === 'partial' ? `, মোট ₹${collectingLent.amount} এর মধ্যে থেকে` : "(সম্পূর্ণ)";

        const receivedOn = receiveMethod === 'card'
          ? (accessibleCards.find(c => c.id === receiveCardId)?.card_name || "Card")
          : "Cash on hand";

        const currentBal = receiveMethod === 'card'
          ? ((cardAvailableMap[receiveCardId] || 0) + amtNum)
          : (getUserCashForCard(currentUser.id, receiveCashCardId) + amtNum);

        const newRemainingDue = collectingLent.amount - totalPaidBefore - amtNum;

        // 🔴 WHATSAPP LOGIC WITH RIGOROUS SAFEGUARDS 🔴
        for (const profile of allProfiles) {
           const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');

           if (cleanPhone.length >= 10) {
              const alertVars: Record<string, string> = {
                greeting_user:  sanitizeText(profile.name),
                entry_user:     sanitizeText(currentUser.name),
                time:           sanitizeText(timeStr),
                borrower_name:  sanitizeText(collectingLent.borrower_name),
                full_or_partial: sanitizeText(fullOrPartial),
                amount:         sanitizeText(String(amtNum)),
                full_ammount:   sanitizeText(fullAmmountStr),
                received_on:    sanitizeText(receivedOn),
                current_bal:    sanitizeText(String(currentBal)),
                remaining_due:  sanitizeText(String(newRemainingDue))
              };
              console.log(`Sending lent_recovery_alert to ${profile.name} (${cleanPhone}):`, alertVars);
              await sendWhatsAppAlert(cleanPhone, "lent_recovery_alert", alertVars);
           }
        }

        alert("✅ [TEST MODE] Lent Recovery Alert Sent Successfully!\nCheck your console logs for details.");
        setIsCollectModalOpen(false);
     } catch (err: any) {
        alert("Test Error: " + err.message);
     } finally {
        setIsSaving(false);
     }
  };

  const openEntryModal = () => {
    setBorrowerName(""); setAmount(""); setRemarks(""); setFundSource("cash_on_hand");
    setLentDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    setDueDate(getDefaultDueDate());
    if (globalSelectedCardId !== 'all') { setSelectedCardId(globalSelectedCardId); setCashSourceCardId(globalSelectedCardId); } 
    else if (accessibleCards.length > 0) { setSelectedCardId(accessibleCards[0].id); setCashSourceCardId(accessibleCards[0].id); }
    setIsModalOpen(true);
  };

  const openCollectModal = (loan: LentRecord) => {
     setCollectingLent(loan); setCollectType("full"); setCollectAmount(""); setReceiveMethod("cash");
     if (globalSelectedCardId !== 'all') { setReceiveCardId(globalSelectedCardId); } 
     else if (accessibleCards.length > 0) { setReceiveCardId(accessibleCards[0].id); }
     const defaultCashCard = globalSelectedCardId !== 'all' ? globalSelectedCardId : loan.card_id || accessibleCards[0]?.id || "";
     setReceiveCashCardId(defaultCashCard);
     setIsCollectModalOpen(true);
  };

  const getPaidAmount = (loan: LentRecord) => (loan.payment_history || []).reduce((s, p) => s + p.amount, 0);
  const getRemainingAmount = (loan: LentRecord) => loan.amount - getPaidAmount(loan);
  const activeLents = lents.filter(l => l.status !== "paid");
  const totalReceivable = activeLents.reduce((acc, curr) => acc + getRemainingAmount(curr), 0);

  const getUserCashForCard = (userId: string, cardId: string): number => {
    const userMap = cardCashMap[userId] || {};
    if (!cardId) return Object.values(userMap).reduce((s, v) => s + v, 0);
    const card = allCards.find(c => c.id === cardId);
    const primaryId = card?.is_primary ? card.id : card?.parent_card_id;
    const familyIds = allCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId).map(c => c.id);
    return familyIds.reduce((s, cid) => s + (userMap[cid] || 0), 0);
  };

  const actorCash = currentUser ? getUserCashForCard(currentUser.id, cashSourceCardId) : 0;
  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);
  const entryUserAccessibleCardIds = allCardAccess.filter(a => a.user_id === currentUser?.id).map(a => a.card_id);
  const entryUserCards = allCards.filter(c => entryUserAccessibleCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#10b981]/30">

      {/* ================= CYBER BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b9810a_1px,transparent_1px),linear-gradient(to_bottom,#10b9810a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
        <motion.div
          animate={{ x: [0, -30, 30, 0], y: [0, 40, -40, 0], scale: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-20%] w-[70vw] h-[70vw] rounded-full bg-[#10b981] opacity-[0.10] blur-[120px] mix-blend-screen"
        />
        <motion.div
          animate={{ x: [0, 40, -40, 0], y: [0, -30, 30, 0], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#3b82f6] opacity-[0.10] blur-[100px] mix-blend-screen"
        />
      </div>

      {/* ================= HEADER ================= */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/80 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
           <Link href="/settings">
             <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#10b981] to-[#3b82f6] p-0.5 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
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
             <div className="overflow-hidden">
               <motion.div animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }} transition={{ duration: 5, ease: "linear", repeat: Infinity }}>
                 <p className="text-[10px] font-black text-[#10b981] uppercase tracking-widest leading-none mb-0.5 flex items-center gap-1">
                   <ShieldAlert className="w-3 h-3" /> SIMULATION MODE
                 </p>
               </motion.div>
             </div>
             <h1 className="text-xl font-black tracking-tight leading-none">
               <SmokeText text="Test Lents Alerts" />
             </h1>
           </div>
        </div>
      </header>

      <main className="relative z-10 px-4 pt-6 max-w-md mx-auto space-y-6">

        {/* ⚠️ TEST MODE BANNER ⚠️ */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/50 rounded-2xl p-4 flex items-start gap-3 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        >
          <ShieldAlert className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-emerald-400 font-black text-sm uppercase tracking-widest mb-1">SAFE TEST ENVIRONMENT</h2>
            <p className="text-emerald-100/70 text-[11px] leading-relaxed font-medium">
              এই পেজের ডিজাইন ও ডেটা অরিজিনাল পেজের মতোই। কিন্তু এখানে কোনো ট্রানজ্যাকশন ডাটাবেসে সেভ হবে না। শুধু WhatsApp Alert ট্রিগার হবে।
            </p>
          </div>
        </motion.div>

        {/* ================= BORROWERS LIST ================= */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400 uppercase tracking-wider flex items-center gap-2">
               Select User to Test Recovery
            </h2>
          </div>

          {isLoading ? (
             <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10b981]"></div>
             </div>
          ) : (
            <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }} className="space-y-3 pb-6">
              <AnimatePresence mode="popLayout">
                {lents.map((loan) => {
                  const isExpanded = expandedId === loan.id;
                  const remainingAmount = getRemainingAmount(loan);
                  const isPaid = loan.status === "paid";
                  const isPartial = loan.status === "partial";

                  return (
                    <motion.div
                      key={loan.id} layout
                      variants={{ hidden: { opacity: 0, y: 18, scale: 0.97 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}
                      exit={{ opacity: 0, scale: 0.95 }} onClick={() => toggleExpand(loan.id)}
                      className={`group relative p-4 bg-white/[0.03] border rounded-[24px] backdrop-blur-xl flex flex-col hover:bg-white/[0.05] transition-all cursor-pointer overflow-hidden shadow-inner border-white/5 hover:border-white/10 ${isPaid ? "opacity-60 grayscale-[30%]" : ""}`}
                    >
                      <div className="flex justify-between items-center relative z-10 w-full">
                        <div className="flex items-center gap-3 w-[65%]">
                          <div className={`w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center border border-white/5 shadow-inner ${isPaid ? 'bg-emerald-500/10' : 'bg-[#3b82f6]/10'}`}>
                            <User className={`w-5 h-5 ${isPaid ? 'text-emerald-400' : 'text-[#3b82f6]'}`} />
                          </div>
                          <div className="truncate">
                            <h3 className="text-sm font-bold text-slate-100 mb-0.5 truncate">{loan.borrower_name}</h3>
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 truncate">
                              <Calendar className="w-3 h-3" />
                              <span>Due: {new Date(loan.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 relative z-10 shrink-0">
                          <div className="text-base font-black text-white tracking-tight flex items-center gap-1">
                            ₹{remainingAmount.toLocaleString('en-IN')}
                            <motion.span animate={{ rotate: isExpanded ? 180 : 0 }}><ChevronDown className="w-3.5 h-3.5 opacity-50" /></motion.span>
                          </div>
                          {isPaid ? (
                             <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#10b981]/10 text-[#10b981] px-1.5 py-0.5 rounded border border-[#10b981]/20">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#3b82f6]/10 text-[#3b82f6] px-1.5 py-0.5 rounded border border-[#3b82f6]/20">
                                {isPartial ? "Partial" : "Unpaid"}
                             </span>
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                         {isExpanded && !isPaid && (
                            <motion.div initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: "auto", opacity: 1, marginTop: 16 }} exit={{ height: 0, opacity: 0, marginTop: 0 }} className="relative z-10 border-t border-white/10 pt-4 overflow-hidden">
                                <Button onClick={(e) => { e.stopPropagation(); openCollectModal(loan); }} className="w-full h-11 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                   <HandCoins className="w-4 h-4 mr-2" /> Simulate Recovery Alert
                                </Button>
                            </motion.div>
                         )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </section>

      </main>

      {/* ================= ADD LENT FAB ================= */}
      <motion.button onClick={openEntryModal} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center text-white shadow-[0_10px_40px_rgba(16,185,129,0.4)] border border-white/20 z-40">
        <Plus className="w-7 h-7" />
      </motion.button>

      {/* ================= LENDING ENTRY MODAL ================= */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]">
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar p-6">

            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#3b82f6] bg-clip-text text-transparent">Simulate Lending</DialogTitle>
              <DialogDescription className="hidden">Add new short term loan</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Borrower Name (Test)</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#10b981] shadow-inner transition-colors">
                     <User className="w-5 h-5 text-slate-500 mr-3" />
                     <input type="text" value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} placeholder="e.g. Test Rahul" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white placeholder:text-slate-600" />
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Amount (₹)</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#10b981] shadow-inner transition-colors">
                     <IndianRupee className="w-5 h-5 text-slate-500 mr-3" />
                     <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="0" className="bg-transparent border-none outline-none w-full text-xl font-black text-white placeholder:text-slate-600" />
                   </div>
                 </div>
              </div>

              <div className="space-y-1.5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">Funding Source</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button onClick={() => setFundSource("cash_on_hand")} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${fundSource === "cash_on_hand" ? "bg-[#10b981]/20 text-[#34d399] border-[#10b981]/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                     <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">My Cash</span></div>
                     <span className="text-[9px] font-black opacity-70">Test Select Below</span>
                   </button>
                   <button onClick={() => setFundSource("credit_card")} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${fundSource === "credit_card" ? "bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                     <div className="flex items-center gap-1.5 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs font-bold">Card Swipe</span></div>
                     <span className="text-[9px] font-black opacity-70">Swipe Directly</span>
                   </button>
                 </div>
              </div>

              <AnimatePresence>
                 {fundSource === 'cash_on_hand' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                       <label className="text-[11px] font-bold text-[#10b981] uppercase ml-1 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Cash From Which Card?</label>
                       <div className="relative">
                          <select value={cashSourceCardId} onChange={(e) => setCashSourceCardId(e.target.value)} className="w-full h-14 bg-[#10b981]/10 border border-[#10b981]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981] appearance-none shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                             <option value="" disabled className="bg-black text-slate-500">Select a card...</option>
                             {entryUserCards.map(c => <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              <AnimatePresence>
                 {fundSource === 'credit_card' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                       <label className="text-[11px] font-bold text-[#3b82f6] uppercase ml-1 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Select Card</label>
                       <div className="relative">
                          <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)} className="w-full h-14 bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#3b82f6] appearance-none shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                             <option value="" disabled className="bg-black text-slate-500">Select a Card to swipe...</option>
                             {entryUserCards.map(c => <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b82f6] pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              <div className="pt-4">
                  <Button onClick={handleSaveLent} disabled={isSaving || !borrowerName || !amount} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#3b82f6] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(16,185,129,0.4)] border-0 transition-all">
                     {isSaving ? "Simulating..." : "Simulate Alert (No Save)"}
                  </Button>
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
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#34d399] bg-clip-text text-transparent">Simulate Recovery</DialogTitle>
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
                    <p className="text-4xl font-black text-white">₹{collectingLent ? (collectingLent.amount - (collectingLent.payment_history || []).reduce((s, p) => s + p.amount, 0)).toLocaleString() : 0}</p>
                 </div>
             ) : (
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider ml-1">Received Amount</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">₹</span>
                       <input type="number" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} placeholder="0.00" className="w-full h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl pl-8 pr-4 text-xl font-bold text-white outline-none focus:border-emerald-500" />
                    </div>
                 </div>
             )}

             <div className="space-y-2 pt-2 border-t border-white/5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Where did you receive it?</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button onClick={() => setReceiveMethod("cash")} className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-all border ${receiveMethod === "cash" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                     <Banknote className="w-4 h-4" /> <span className="text-xs font-bold">To My Cash</span>
                   </button>
                   <button onClick={() => setReceiveMethod("card")} className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-all border ${receiveMethod === "card" ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                     <CreditCard className="w-4 h-4" /> <span className="text-xs font-bold">Direct to Card</span>
                   </button>
                 </div>
             </div>

             <AnimatePresence>
                 {receiveMethod === 'cash' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                       <label className="text-[11px] font-bold text-emerald-400 uppercase ml-1 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Add Cash to Which Card?</label>
                       <div className="relative">
                          <select value={receiveCashCardId} onChange={(e) => setReceiveCashCardId(e.target.value)} className="w-full h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-emerald-500 appearance-none shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                             <option value="" disabled className="bg-black text-slate-500">Select a card...</option>
                             {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
             </AnimatePresence>

             <AnimatePresence>
                 {receiveMethod === 'card' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 pt-2">
                       <label className="text-[11px] font-bold text-indigo-400 uppercase ml-1 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Select Card to Credit</label>
                       <div className="relative">
                          <select value={receiveCardId} onChange={(e) => setReceiveCardId(e.target.value)} className="w-full h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-indigo-400 appearance-none shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                             {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              <div className="pt-2">
                <Button onClick={handleCollectLent} disabled={isSaving || (collectType === 'partial' && (!collectAmount || Number(collectAmount) <= 0))} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#34d399] hover:opacity-90 text-black font-black text-lg border-0 disabled:opacity-50 shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all">
                  {isSaving ? "Simulating..." : "Simulate Alert (No Save)"}
                </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}