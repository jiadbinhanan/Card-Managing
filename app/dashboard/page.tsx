"use client";

import { useEffect, useState } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion } from "motion/react";
import { 
  Wallet, 
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  Plus,
  Layers,
  Users
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DashboardQRs from "./qrs";
import DashboardAnalytics from "./analytics";

interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  avatar_url?: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
  parent_card_id?: string;
}

interface BillingCycle {
  id: string;
  card_id: string;
  billing_month: string;
  generated_amount: number;
  paid_amount: number;
  status: string;
}

// ─── Smoke Reveal: per-character ─────────────────────────────────────────
function SmokeText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(10px)", y: 6 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

export default function Dashboard() {
  const [userName, setUserName] = useState<string>("Loading...");
  const [firstName, setFirstName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const { globalSelectedCardId: selectedCardId, setGlobalSelectedCardId: setSelectedCardId } = useCardStore();

  const [totalLimit, setTotalLimit] = useState(0);
  const [availableLimit, setAvailableLimit] = useState(0);
  const [inTransit, setInTransit] = useState(0);        
  const [usersCash, setUsersCash] = useState(0);      // NEW: Users Cash from cash_on_hand
  const [userStats, setUserStats] = useState<UserStat[]>([]);

  const [daysToBill, setDaysToBill] = useState(0);
  const [nextBillDate, setNextBillDate] = useState<string>("");
  const [activeBills, setActiveBills] = useState<BillingCycle[]>([]);

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billFormCardId, setBillFormCardId] = useState("");
  const [billFormMonth, setBillFormMonth] = useState("");
  const [billFormGenAmount, setBillFormGenAmount] = useState("");
  const [billFormPaidAmount, setBillFormPaidAmount] = useState("");
  const [isSavingBill, setIsSavingBill] = useState(false);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase.channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_cycles' }, () => fetchDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedCardId]);

  const cleanUrl = (url?: string | null) => {
     if (!url) return "";
     return url.trim().replace(/^['"]|['"]$/g, '');
  };

  const calculateBillDays = (cards: CardData[], selectedId: string) => {
    let targetDay = 26;
    if (selectedId !== 'all') {
       const card = cards.find(c => c.id === selectedId);
       if (card && card.bill_due_day) targetDay = card.bill_due_day;
    } else if (cards.length > 0) {
       targetDay = cards[0].bill_due_day || 26;
    }

    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), targetDay);
    if (now > target) target = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    setDaysToBill(diff);

    const nth = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
    };
    const month = target.toLocaleString('default', { month: 'short' });
    setNextBillDate(`${targetDay}${nth(targetDay)} ${month}`);
  };

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let currentFName = "";
    if (user) {
      setCurrentUser(user);
      const { data: profile } = await supabase.from('profiles').select('name, avatar_url').eq('id', user.id).single();
      if (profile) {
        setUserName(profile.name);
        currentFName = profile.name.split(' ')[0];
        setFirstName(currentFName.toLowerCase());
        if (profile.avatar_url) { setUserAvatar(cleanUrl(profile.avatar_url)); setImgError(false); }
      }

      const { data: accessData } = await supabase.from('card_access').select('card_id').eq('user_id', user.id);
      let myCards: CardData[] = [];
      if (accessData && accessData.length > 0) {
         const cardIds = accessData.map(a => a.card_id);
         const { data: cardData } = await supabase.from('cards').select('*').in('id', cardIds).order('is_primary', { ascending: false });
         if (cardData) { myCards = cardData; setAccessibleCards(cardData); }
      }
      calculateBillDays(myCards, selectedCardId);

      let currentLimit = 0;
      let activeCardIds: string[] = [];

      if (selectedCardId === 'all') {
         currentLimit = myCards.filter(c => c.is_primary).reduce((sum, c) => sum + Number(c.total_limit), 0);
      } else {
         const selected = myCards.find(c => c.id === selectedCardId);
         if (selected) {
            const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
            const primaryCard = myCards.find(c => c.id === primaryId);
            currentLimit = primaryCard ? Number(primaryCard.total_limit) : Number(selected.total_limit);
            const familyCards = myCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId);
            activeCardIds = familyCards.map(c => c.id);
         }
      }
      if (currentLimit === 0) currentLimit = 180000;
      setTotalLimit(currentLimit);

      let txQuery = supabase.from('card_transactions')
        .select('amount, type, payment_method, card_id, status, qr_id, settled_to_user, remarks');
      let spendsQuery = supabase.from('spends').select('amount, payment_method, user_id, card_id');
      let billsQuery = supabase.from('billing_cycles').select('*').neq('status', 'paid');

      if (activeCardIds.length > 0) {
         txQuery = txQuery.in('card_id', activeCardIds);
         spendsQuery = spendsQuery.in('card_id', activeCardIds);
         billsQuery = billsQuery.in('card_id', activeCardIds);
      }

      const { data: txs } = await txQuery;
      const { data: spends } = await spendsQuery;
      const { data: bills } = await billsQuery;

      if (bills) setActiveBills(bills);

      const withdrawals = txs?.filter(t => {
        if (t.type !== 'withdrawal') return false;
        const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
        if (isRotation) return true;
        return t.status === 'pending_settlement';
      }).reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      const billPayments = txs?.filter(t => t.type === 'bill_payment').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const ccSpends = spends?.filter(s => s.payment_method === 'credit_card').reduce((sum, s) => sum + Number(s.amount), 0) || 0;

      setAvailableLimit(currentLimit - withdrawals - ccSpends + billPayments);

      const inTransitAmt = txs?.filter(t =>
        t.type === 'withdrawal' &&
        (t.qr_id || (t.remarks || '').toLowerCase().includes('rotation')) &&
        !t.settled_to_user
      ).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      setInTransit(inTransitAmt);

      // User Stats & Cash on Hand
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url');
      let cohQuery = supabase.from('cash_on_hand').select('*');
      if (activeCardIds.length > 0) cohQuery = cohQuery.in('card_id', activeCardIds);
      const { data: coh } = await cohQuery;

      // Calculate Total Users Cash based on selection (all, family, or individual)
      const totalCoh = coh?.reduce((sum, c) => sum + Number(c.current_balance), 0) || 0;
      setUsersCash(totalCoh);

      let allSpendsQuery = supabase.from('spends').select('user_id, amount, payment_method, card_id');
      if (activeCardIds.length > 0) allSpendsQuery = allSpendsQuery.in('card_id', activeCardIds);
      const { data: allSpends } = await allSpendsQuery;
      let allTxsQuery = supabase.from('card_transactions').select('recorded_by, amount, type, payment_method, card_id');
      if (activeCardIds.length > 0) allTxsQuery = allTxsQuery.in('card_id', activeCardIds);
      const { data: allTxs } = await allTxsQuery;

      if (profiles) {
        const stats = profiles.map(p => {
          const cash = coh?.find(c => c.user_id === p.id)?.current_balance || 0;
          const totalPersonalSpends = allSpends?.filter(s => s.user_id === p.id && s.payment_method === 'credit_card').reduce((sum, s) => sum + Number(s.amount), 0) || 0;
          const totalRepayments = allTxs?.filter(t => t.recorded_by === p.id && t.type === 'bill_payment' && t.payment_method === 'own_pocket').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
          const due = Math.max(0, totalPersonalSpends - totalRepayments);
          return { id: p.id, name: p.name.split(' ')[0], cash, due, avatar_url: cleanUrl(p.avatar_url) };
        });
        setUserStats(stats);
      }
    }
  };

  const openBillModal = () => {
     setBillFormCardId(selectedCardId !== 'all' ? selectedCardId : (accessibleCards[0]?.id || ""));
     setBillFormMonth(new Date().toISOString().slice(0, 7));
     setBillFormGenAmount("");
     setBillFormPaidAmount("");
     setIsBillModalOpen(true);
  };

  const handleSaveBill = async () => {
     if (!billFormCardId || !billFormMonth || !billFormGenAmount) { alert("Please fill required fields."); return; }
     setIsSavingBill(true);
     const generated = Number(billFormGenAmount);
     const paid = Number(billFormPaidAmount) || 0;
     const status = paid >= generated ? 'paid' : (paid > 0 ? 'partially_paid' : 'unpaid');
     try {
         await supabase.from('billing_cycles').insert({
             card_id: billFormCardId,
             billing_month: `${billFormMonth}-01`,
             generated_amount: generated,
             paid_amount: paid,
             status: status
         });
         setIsBillModalOpen(false);
         fetchDashboardData();
     } catch (err: any) { alert("Error: " + err.message); }
     finally { setIsSavingBill(false); }
  };

  // Adjusted Ring Calculation for smaller SVG
  const percentage = totalLimit > 0 ? Math.max(0, Math.min(100, (availableLimit / totalLimit) * 100)) : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const utilized = totalLimit - availableLimit;

  const totalGenerated = activeBills.reduce((acc, b) => acc + Number(b.generated_amount), 0);
  const totalPaid = activeBills.reduce((acc, b) => acc + Number(b.paid_amount), 0);
  const totalDue = totalGenerated - totalPaid;


  return (
    <div className="min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">

      {/* ── BACKGROUND ── */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
        <motion.div animate={{ x: [0, 40, -40, 0], y: [0, -50, 50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute top-[-15%] left-[-15%] w-[80vw] h-[80vw] rounded-full bg-[#0ea5e9] opacity-[0.15] blur-[100px] mix-blend-screen" />
        <motion.div animate={{ x: [0, -30, 30, 0], y: [0, 40, -40, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute bottom-[20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-[#a855f7] opacity-[0.15] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.08, 0.15, 0.08] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-[40%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-[#38bdf8] opacity-10 blur-[90px] mix-blend-screen" />
      </div>

      {/* ── HEADER ── */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/60 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/settings">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_20px_rgba(168,85,247,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
                <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                  {userAvatar && !imgError ? (
                    <img src={userAvatar} alt="Profile" className="w-full h-full object-cover rounded-full" onError={() => setImgError(true)} />
                  ) : (
                    <span className="text-sm font-black text-white">{userName.charAt(0) || 'U'}</span>
                  )}
                </div>
              </div>
            </Link>
            <div>
              <div className="overflow-hidden mb-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none">
                  {["Live", "Status", "•", "Active"].map((word, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, filter: "blur(6px)", y: 4 }}
                      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                      transition={{ delay: 0.2 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-block mr-[0.25em] bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent"
                    >
                      {word}
                    </motion.span>
                  ))}
                </p>
              </div>
              <h1 className="text-xl font-black tracking-tight leading-none">
                <SmokeText text={`Hey, ${firstName || userName.split(' ')[0]}`} />
              </h1>
            </div>
          </div>

          <div className="relative">
            <select 
               value={selectedCardId}
               onChange={(e) => setSelectedCardId(e.target.value)}
               className="appearance-none bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-7 rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md"
            >
               <option value="all" className="bg-[#050505]">All Vault Cards</option>
               {accessibleCards.map(c => (
                  <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
               ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-5 pt-6 max-w-md mx-auto space-y-7">

        {/* ================= LIMIT RING & STATS (Split Layout) ================= */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-5 bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 rounded-[36px] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-hidden"
          style={{ aspectRatio: '1/1' }}
        >
          {/* Top Edge Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-[#0ea5e9] to-transparent opacity-50 blur-[2px]" />

          <div className="flex w-full flex-1 items-center justify-between pb-2">

            {/* LEFT COLUMN: Ring + Available */}
            <div className="w-[50%] flex flex-col items-center justify-center">
              <div className="relative flex justify-center items-center mb-2">
                <svg className="w-36 h-36 transform -rotate-90 drop-shadow-[0_0_20px_rgba(14,165,233,0.3)]">
                  <circle cx="72" cy="72" r={radius} stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/5" />
                  <motion.circle
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="url(#gradient)"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_15px_rgba(14,165,233,0.6)]"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Limit</span>
                  <motion.span
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="text-sm font-black text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                  >
                    ₹{(totalLimit / 1000).toFixed(0)}k
                  </motion.span>
                </div>
              </div>

              <div className="text-center mt-0">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 block">Available Now</span>
                 <motion.div
                   initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
                   animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                   transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                   className="text-2xl font-black tracking-tight bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#a855f7] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(14,165,233,0.5)]"
                 >
                   ₹{availableLimit.toLocaleString('en-IN')}
                 </motion.div>
              </div>
            </div>

            {/* GLOWING VERTICAL DIVIDER */}
            <div className="w-[1px] h-[85%] bg-gradient-to-b from-transparent via-[#0ea5e9]/50 to-transparent shadow-[0_0_10px_rgba(14,165,233,0.6)]" />

            {/* RIGHT COLUMN: In Transit + Users Cash */}
            <div className="w-[45%] flex flex-col justify-center gap-5 pl-3">

               {/* Transit */}
               <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1">
                     <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Transit</span>
                  </div>
                  <p className="text-lg font-black text-[#38bdf8] drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]">
                    ₹{inTransit.toLocaleString('en-IN')}
                  </p>
               </motion.div>

               {/* Users Cash */}
               <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1">
                     <Users className="w-3.5 h-3.5 text-emerald-400" />
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Users Cash</span>
                  </div>
                  <p className="text-lg font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                    ₹{usersCash.toLocaleString('en-IN')}
                  </p>
               </motion.div>
            </div>

          </div>

          {/* BOTTOM ROW: Settled / Utilized */}
          <div className="flex w-full justify-between items-center pt-3 mt-auto relative">

            {/* GLOWING HORIZONTAL DIVIDER */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent shadow-[0_0_10px_rgba(255,255,255,0.4)]" />

            {/* Settled */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              className="flex items-center gap-2.5"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Settled</p>
                <p className="text-sm font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                  ₹{(availableLimit / 1000).toFixed(1)}k
                </p>
              </div>
            </motion.div>

            {/* Utilized */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              className="flex items-center gap-2.5"
            >
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Utilized</p>
                <p className="text-sm font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                  ₹{(utilized / 1000).toFixed(1)}k
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shadow-inner">
                <Wallet className="w-4 h-4 text-rose-400" />
              </div>
            </motion.div>

          </div>
        </motion.section>

        {/* ================= BILLING CYCLES ================= */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="bg-gradient-to-br from-[#10b981]/10 to-[#0ea5e9]/5 border border-[#10b981]/20 rounded-[28px] p-5 backdrop-blur-2xl shadow-[0_10px_30px_rgba(16,185,129,0.15)] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/20 rounded-full blur-[30px] pointer-events-none" />

          <div className="flex items-center justify-between relative z-10 mb-4">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 shadow-inner">
                 <CalendarClock className="w-5 h-5 text-[#10b981]" />
               </div>
               <div>
                 <p className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-wider mb-0.5">Active Bills</p>
                 <p className="text-sm font-black text-white">{activeBills.length} Bills Pending</p>
               </div>
             </div>
             <Button onClick={openBillModal} size="icon" className="w-10 h-10 rounded-full bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 hover:bg-[#10b981]/40 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all">
                <Plus className="w-5 h-5" />
             </Button>
          </div>

          {selectedCardId === 'all' ? (
             <div className="space-y-3 relative z-10 border-t border-white/10 pt-4 max-h-56 overflow-y-auto custom-scrollbar">
                {activeBills.length > 0 ? activeBills.map((bill, idx) => {
                   const card = accessibleCards.find(c => c.id === bill.card_id);
                   const due = Number(bill.generated_amount) - Number(bill.paid_amount);
                   return (
                      <motion.div
                        key={bill.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className="bg-white/[0.03] border border-white/5 rounded-2xl p-3"
                      >
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                          {card?.card_name || 'Card'} {card ? `(**${card.last_4_digits})` : ''}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Generated</p>
                            <p className="text-xs font-black text-slate-300">₹{Number(bill.generated_amount).toLocaleString()}</p>
                          </div>
                          <div className="text-center border-l border-white/5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Paid</p>
                            <p className="text-xs font-black text-emerald-400">₹{Number(bill.paid_amount).toLocaleString()}</p>
                          </div>
                          <div className="text-center border-l border-white/5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Due</p>
                            <p className="text-xs font-black text-rose-400">₹{due.toLocaleString()}</p>
                          </div>
                        </div>
                      </motion.div>
                   );
                }) : (
                   <p className="text-xs text-center text-slate-500 font-bold py-2">No active bills found.</p>
                )}
             </div>
          ) : (
             <div className="grid grid-cols-3 gap-2 relative z-10 border-t border-white/10 pt-4">
                <div className="text-center">
                   <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Generated</p>
                   <p className="text-sm font-black text-slate-300">₹{totalGenerated.toLocaleString()}</p>
                </div>
                <div className="text-center border-l border-white/5">
                   <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Paid</p>
                   <p className="text-sm font-black text-emerald-400">₹{totalPaid.toLocaleString()}</p>
                </div>
                <div className="text-center border-l border-white/5">
                   <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Due</p>
                   <p className="text-sm font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">₹{totalDue.toLocaleString()}</p>
                </div>
             </div>
          )}
        </motion.section>

        {/* ================= ANALYTICS MODULE ================= */}
        <DashboardAnalytics userStats={userStats} selectedCardId={selectedCardId} accessibleCards={accessibleCards} />

        {/* ================= QR SUGGESTION MODULE ================= */}
        <DashboardQRs firstName={firstName} currentUser={currentUser} accessibleCards={accessibleCards} globalSelectedCardId={selectedCardId} />

      </main>

      {/* ================= BILL ENTRY MODAL ================= */}
      <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#0ea5e9] bg-clip-text text-transparent">Manage Billing Cycle</DialogTitle>
            <DialogDescription className="text-[10px] text-slate-400 uppercase tracking-widest">Add or Update Card Bill</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Select Card</label>
                <select value={billFormCardId} onChange={(e) => setBillFormCardId(e.target.value)} className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#10b981]">
                   {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>)}
                </select>
             </div>
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Billing Month</label>
                <input type="month" value={billFormMonth} onChange={(e) => setBillFormMonth(e.target.value)} className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981] appearance-none" />
             </div>
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Generated Bill Amount (₹)</label>
                <input type="number" value={billFormGenAmount} onChange={(e) => setBillFormGenAmount(e.target.value)} placeholder="0" className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981]" />
             </div>
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Amount Paid So Far (₹)</label>
                <input type="number" value={billFormPaidAmount} onChange={(e) => setBillFormPaidAmount(e.target.value)} placeholder="0" className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981]" />
             </div>

             <Button onClick={handleSaveBill} disabled={isSavingBill} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#0ea5e9] hover:opacity-90 text-white font-black text-lg border-0 mt-4 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
               {isSavingBill ? "Saving..." : "Save Bill Details"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}