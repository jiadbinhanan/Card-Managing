"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Bell, 
  QrCode, 
  Wallet, 
  Sparkles, 
  ArrowRight,
  CalendarClock,
  Banknote,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Receipt,
  ArrowDownLeft,
  CreditCard
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";

// --- Interfaces ---
interface QR {
  id: string;
  merchant_name: string;
  platform: string;
  settlement_time: string;
  qr_image_url: string;
  last_used_date: string | null;
  status: string;
  upi_id: string;
}

interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  avatar_url?: string;
}

interface UserTx {
  id: string;
  type: string;
  amount: number;
  date: string;
  remarks: string;
  isSpend: boolean;
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

export default function Dashboard() {
  const [userName, setUserName] = useState<string>("Loading...");
  const [firstName, setFirstName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [imgError, setImgError] = useState(false); // Track avatar load errors
  const [statImgError, setStatImgError] = useState<Record<string, boolean>>({});

  // Card Context States
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>("all");

  // Financial States
  const [totalLimit, setTotalLimit] = useState(0); 
  const [availableLimit, setAvailableLimit] = useState(0);
  const [userStats, setUserStats] = useState<UserStat[]>([]);
  const [daysToBill, setDaysToBill] = useState(0);
  const [nextBillDate, setNextBillDate] = useState<string>("");

  // Modal States for User Analytics
  const [selectedUserStat, setSelectedUserStat] = useState<UserStat | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<"details" | "history">("details");
  const [userHistory, setUserHistory] = useState<UserTx[]>([]);

  // QR States
  const [suggestedQrs, setSuggestedQrs] = useState<QR[]>([]);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Payment Gen States
  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase.channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchDashboardData())
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
    if (now > target) {
      target = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
    }
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    setDaysToBill(diff);

    const nth = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };
    const month = target.toLocaleString('default', { month: 'short' });
    setNextBillDate(`${targetDay}${nth(targetDay)} ${month}`);
  };

  const fetchDashboardData = async () => {
    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    let currentFName = "";
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('name, avatar_url').eq('id', user.id).single();
      if (profile) {
        setUserName(profile.name);
        currentFName = profile.name.split(' ')[0];
        setFirstName(currentFName.toLowerCase());
        if (profile.avatar_url) {
           setUserAvatar(cleanUrl(profile.avatar_url));
           setImgError(false); // Reset error state on new fetch
        }
      }

      // Fetch Accessible Cards
      const { data: accessData } = await supabase.from('card_access').select('card_id').eq('user_id', user.id);
      let myCards: CardData[] = [];
      if (accessData && accessData.length > 0) {
         const cardIds = accessData.map(a => a.card_id);
         const { data: cardData } = await supabase.from('cards').select('*').in('id', cardIds).order('is_primary', { ascending: false });
         if (cardData) {
            myCards = cardData;
            setAccessibleCards(cardData);
         }
      }
      calculateBillDays(myCards, selectedCardId);

      // 2. Dynamic Limit Calculations
      let currentLimit = 0;
      let familyCardIds: string[] = [];

      if (selectedCardId === 'all') {
         currentLimit = myCards.filter(c => c.is_primary).reduce((sum, c) => sum + Number(c.total_limit), 0);
      } else {
         const selected = myCards.find(c => c.id === selectedCardId);
         if (selected) {
            const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
            const primaryCard = myCards.find(c => c.id === primaryId);
            currentLimit = primaryCard ? Number(primaryCard.total_limit) : Number(selected.total_limit);

            const familyCards = myCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId);
            familyCardIds = familyCards.map(c => c.id);
         }
      }
      if (currentLimit === 0) currentLimit = 180000; // Fallback
      setTotalLimit(currentLimit);

      let txQuery = supabase.from('card_transactions').select('amount, type, payment_method, card_id');
      let spendsQuery = supabase.from('spends').select('amount, payment_method, user_id, card_id');

      if (selectedCardId !== 'all' && familyCardIds.length > 0) {
         txQuery = txQuery.in('card_id', familyCardIds);
         spendsQuery = spendsQuery.in('card_id', familyCardIds);
      }

      const { data: txs } = await txQuery;
      const { data: spends } = await spendsQuery;

      const withdrawals = txs?.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const billPayments = txs?.filter(t => t.type === 'bill_payment').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const ccSpends = spends?.filter(s => s.payment_method === 'credit_card').reduce((sum, s) => sum + Number(s.amount), 0) || 0;

      setAvailableLimit(currentLimit - withdrawals - ccSpends + billPayments);

      // 3. Advanced User Stats
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url');
      const { data: coh } = await supabase.from('cash_on_hand').select('*');
      const { data: allSpends } = await supabase.from('spends').select('user_id, amount, payment_method');
      const { data: allTxs } = await supabase.from('card_transactions').select('recorded_by, amount, type, payment_method');

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

      // 4. QR Suggestion Algorithm
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const { data: qrData } = await supabase.from('qrs').select('*').eq('status', 'active');

      if (qrData) {
        let usable = qrData.filter(q => q.last_used_date !== today);

        usable.sort((a, b) => {
          let scoreA = 0; let scoreB = 0;
          const nameA = a.merchant_name.toLowerCase();
          const nameB = b.merchant_name.toLowerCase();

          if (currentFName && nameA.includes(currentFName)) scoreA += 10000;
          if (currentFName && nameB.includes(currentFName)) scoreB += 10000;

          if (a.platform.includes('BharatPe')) scoreA += 1000;
          if (b.platform.includes('BharatPe')) scoreB += 1000;

          const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
          const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;

          if (!a.last_used_date) scoreA -= 100;
          if (!b.last_used_date) scoreB -= 100;

          scoreA += timeA / 100000000000;
          scoreB += timeB / 100000000000;

          return scoreA - scoreB;
        });

        setSuggestedQrs(usable.slice(0, 3)); 
      }
    }
  };

  const fetchUserHistory = async (userId: string) => {
    const { data: spends } = await supabase.from('spends').select('id, amount, spend_date, remarks').eq('user_id', userId).order('spend_date', { ascending: false }).limit(10);
    const { data: txs } = await supabase.from('card_transactions').select('id, amount, transaction_date, payment_method, type, qrs(merchant_name)').eq('recorded_by', userId).order('transaction_date', { ascending: false }).limit(15);

    const combined: UserTx[] = [];

    if (spends) {
      spends.forEach(s => combined.push({ id: `s-${s.id}`, type: 'Spend', amount: s.amount, date: s.spend_date, remarks: s.remarks || 'Personal', isSpend: true }));
    }
    if (txs) {
      txs.forEach(t => {
         if (t.type === 'withdrawal') {
            const qrObj: any = t.qrs;
            const merchantName = Array.isArray(qrObj) ? qrObj[0]?.merchant_name : qrObj?.merchant_name;
            combined.push({ id: `t-${t.id}`, type: 'Collected', amount: t.amount, date: t.transaction_date, remarks: `Rotated from ${merchantName || 'QR'}`, isSpend: false });
         } else if (t.type === 'bill_payment' && t.payment_method === 'own_pocket') {
            combined.push({ id: `bp-${t.id}`, type: 'Repayment', amount: t.amount, date: t.transaction_date, remarks: `Bill paid (Pocket / Repayment)`, isSpend: false });
         }
      });
    }

    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setUserHistory(combined.slice(0, 10)); 
  };

  const handleUserStatClick = (stat: UserStat) => {
    setSelectedUserStat(stat);
    setUserModalTab("details");
    setIsUserModalOpen(true);
    fetchUserHistory(stat.id);
  };

  const generatePaymentAmounts = () => {
    if (paymentMode === "once") {
      setGeneratedAmounts([Math.floor(Math.random() * 150 + 1850)]);
    } else {
      if (splitCount === 2) {
        const first = Math.floor(Math.random() * 200 + 1000);
        const second = Math.floor(Math.random() * 200 + 500);
        setGeneratedAmounts([first, second]);
      } else {
        const amounts = Array.from({ length: splitCount }, () => Math.floor(Math.random() * 199 + 1800));
        setGeneratedAmounts(amounts);
      }
    }
  };

  const markQrAsUsedToday = async () => {
    if (!selectedQr) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await supabase.from('qrs').update({ last_used_date: today }).eq('id', selectedQr.id);
    setIsViewModalOpen(false);
  };

  const percentage = totalLimit > 0 ? Math.max(0, Math.min(100, ((totalLimit - availableLimit) / totalLimit) * 100)) : 0;
  const radius = 65; 
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">

      {/* ================= ULTRA HIGH-FIDELITY GLOWING BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
        <motion.div animate={{ x: [0, 40, -40, 0], y: [0, -50, 50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute top-[-15%] left-[-15%] w-[80vw] h-[80vw] rounded-full bg-[#0ea5e9] opacity-[0.15] blur-[100px] mix-blend-screen" />
        <motion.div animate={{ x: [0, -30, 30, 0], y: [0, 40, -40, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute bottom-[20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-[#a855f7] opacity-[0.15] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.08, 0.15, 0.08] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-[40%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-[#38bdf8] opacity-10 blur-[90px] mix-blend-screen" />
      </div>

      {/* ================= THIN & PREMIUM HEADER ================= */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/60 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/settings">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_20px_rgba(168,85,247,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
                <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                  {userAvatar && !imgError ? (
                    <img 
                       src={userAvatar} 
                       alt="Profile" 
                       className="w-full h-full object-cover rounded-full" 
                       onError={() => setImgError(true)} 
                    />
                  ) : (
                    <span className="text-sm font-black text-white">{userName.charAt(0) || 'U'}</span>
                  )}
                </div>
              </div>
            </Link>
            <div>
              <motion.div 
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, ease: "linear", repeat: Infinity }}
                className="bg-[length:200%_200%] bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text"
              >
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">
                  Live Status • Active
                </p>
              </motion.div>
              <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                Hey, {userName.split(' ')[0]}
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

        {/* ================= FIXED LIMIT RING ================= */}
        <section className="relative p-6 bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 rounded-[36px] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-[#0ea5e9] to-transparent opacity-50 blur-[2px]" />

          <div className="relative flex justify-center items-center mt-2 mb-4">
            <svg className="w-52 h-52 transform -rotate-90 drop-shadow-[0_0_20px_rgba(14,165,233,0.3)]">
              <circle cx="104" cy="104" r={radius} stroke="currentColor" strokeWidth="14" fill="transparent" className="text-white/5" />
              <motion.circle
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 2, ease: "easeOut" }}
                cx="104"
                cy="104"
                r={radius}
                stroke="url(#gradient)"
                strokeWidth="14"
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Limit</span>
              <span className="text-2xl font-black text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                ₹{(totalLimit / 1000).toFixed(1)}k
              </span>
            </div>
          </div>

          <div className="text-center mt-1 mb-6">
             <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Available Now</span>
             <div className="text-4xl font-black tracking-tight bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#a855f7] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(14,165,233,0.5)]">
               ₹{(availableLimit / 1000).toFixed(1)}k
             </div>
          </div>

          <div className="flex w-full justify-between items-center pt-5 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                <ArrowRight className="w-4 h-4 text-emerald-400 -rotate-45" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Settled</p>
                <p className="text-sm font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">₹{(availableLimit / 1000).toFixed(1)}k</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Utilized</p>
                <p className="text-sm font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">₹{((totalLimit - availableLimit) / 1000).toFixed(1)}k</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shadow-inner">
                <ArrowRight className="w-4 h-4 text-rose-400 rotate-45" />
              </div>
            </div>
          </div>
        </section>

        {/* ================= DYNAMIC BILL COUNTDOWN ================= */}
        <section className="bg-gradient-to-r from-[#a855f7]/15 to-[#d946ef]/15 border border-[#a855f7]/30 rounded-[24px] p-4 flex items-center justify-between backdrop-blur-2xl shadow-[0_10px_30px_rgba(168,85,247,0.2)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#d946ef]/20 rounded-full blur-[30px] pointer-events-none" />
          <div className="flex items-center gap-3.5 relative z-10 pl-2">
            <div className="w-11 h-11 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 shadow-inner">
              <CalendarClock className="w-5 h-5 text-[#e879f9]" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-fuchsia-300/80 uppercase tracking-wider mb-0.5">Upcoming Bill Due</p>
              <p className="text-sm font-black text-white">{nextBillDate}</p>
            </div>
          </div>
          <div className="text-center relative z-10 pr-4">
            <div className="text-2xl font-black text-[#e879f9] drop-shadow-[0_0_15px_#d946ef] leading-none mb-1">
              {daysToBill}
            </div>
            <p className="text-[9px] font-bold text-fuchsia-300 uppercase tracking-widest">Days Left</p>
          </div>
        </section>

        {/* ================= CASH ON HAND & DUES GRID ================= */}
        <section>
          <div className="flex items-center gap-2 mb-4 px-1">
            <Banknote className="w-4 h-4 text-[#10b981]" />
            <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              Cash & Repayment Analytics
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {userStats.map((stat, i) => (
              <motion.div 
                key={stat.id} 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleUserStatClick(stat)}
                className="bg-white/[0.03] border border-white/10 rounded-[24px] p-5 backdrop-blur-xl relative overflow-hidden group hover:bg-white/[0.06] transition-all cursor-pointer shadow-inner"
              >
                <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-[30px] opacity-30 ${i===0 ? 'bg-[#0ea5e9]' : 'bg-[#a855f7]'}`} />

                <div className="flex items-center gap-2 mb-4 relative z-10">
                   <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden border ${i===0 ? 'border-[#0ea5e9]' : 'border-[#a855f7]'}`}>
                      {stat.avatar_url && !statImgError[stat.id] ? (
                         <img 
                            src={stat.avatar_url} 
                            alt="Profile" 
                            className="w-full h-full object-cover rounded-full" 
                            onError={() => setStatImgError(prev => ({...prev, [stat.id]: true}))} 
                         />
                      ) : (
                         <div className="w-full h-full bg-black flex items-center justify-center text-[10px] font-bold text-white">{stat.name.charAt(0)}</div>
                      )}
                   </div>
                   <h3 className="text-sm font-black text-white">{stat.name}</h3>
                </div>

                <div className="space-y-3 relative z-10">
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Holding Cash</p>
                    <p className={`text-lg font-black tracking-tight ${stat.cash > 0 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-slate-300'}`}>
                      ₹{stat.cash.toLocaleString()}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Personal Due</p>
                    <p className={`text-base font-black tracking-tight ${stat.due > 0 ? 'text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-slate-400'}`}>
                      ₹{stat.due.toLocaleString()}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ================= EXACT SMART QR SUGGESTIONS ================= */}
        <section className="pb-8">
          <div className="flex items-center gap-2 mb-4 px-1">
            <Sparkles className="w-4 h-4 text-[#0ea5e9]" />
            <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]">
              Dynamic Suggestion Engine
            </h2>
          </div>

          <div className="space-y-3">
            {suggestedQrs.length > 0 ? (
              suggestedQrs.map((qr, idx) => {
                const isDanger = firstName && qr.merchant_name.toLowerCase().includes(firstName);
                const isTop = idx === 0 && !isDanger;

                return (
                  <motion.div 
                    key={qr.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => { setSelectedQr(qr); setIsViewModalOpen(true); setGeneratedAmounts([]); }}
                    className={`relative p-3.5 rounded-[20px] backdrop-blur-lg flex items-center justify-between cursor-pointer transition-all ${
                      isDanger ? "bg-red-500/5 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : 
                      isTop ? "bg-gradient-to-r from-[#0ea5e9]/10 to-transparent border border-[#0ea5e9]/40 shadow-[0_0_20px_rgba(14,165,233,0.15)]" : 
                      "bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center overflow-hidden relative border ${
                        isDanger ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-black/40"
                      }`}>
                        {qr.qr_image_url ? (
                          <Image src={qr.qr_image_url} alt="QR" fill className="object-cover" />
                        ) : (
                          <QrCode className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-sm font-bold ${isDanger ? "text-red-400" : "text-white"}`}>{qr.merchant_name}</h3>
                          {isTop && (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] text-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#0ea5e9]">
                              <Sparkles className="w-2.5 h-2.5" /> Best
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                          <span className={qr.platform.includes('BharatPe') ? "text-amber-500/80" : "text-slate-400"}>{qr.platform.split('|')[0]}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <span className="text-slate-400">{qr.settlement_time || qr.platform.split('|')[1] || 'T+1'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </motion.div>
                )
              })
            ) : (
              <div className="text-center py-6 bg-white/[0.02] rounded-[24px] border border-white/10 border-dashed backdrop-blur-sm">
                <p className="text-xs font-bold text-slate-500">All caught up! No active suggestions.</p>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* ================= USER ANALYTICS MODAL ================= */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-6 relative border-b border-white/5">
            <div className="absolute top-0 left-0 w-40 h-40 bg-[#a855f7]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2 relative z-10">
                 <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border border-[#a855f7]">
                    {selectedUserStat?.avatar_url && !statImgError[selectedUserStat.id] ? (
                       <img 
                          src={selectedUserStat.avatar_url} 
                          alt="Profile" 
                          className="w-full h-full object-cover rounded-full" 
                          onError={() => setStatImgError(prev => ({...prev, [selectedUserStat.id]: true}))} 
                       />
                    ) : (
                       <div className="w-full h-full bg-black flex items-center justify-center text-sm font-bold text-white">{selectedUserStat?.name?.charAt(0)}</div>
                    )}
                 </div>
                 <div>
                    <DialogTitle className="text-xl font-space font-black text-white leading-tight">
                      {selectedUserStat?.name}'s Ledger
                    </DialogTitle>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detailed Analytics</p>
                 </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex bg-black/60 p-2 border-b border-white/5">
             <button onClick={() => setUserModalTab("details")} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "details" ? "bg-white/10 text-white" : "text-slate-500"}`}>Summary</button>
             <button onClick={() => setUserModalTab("history")} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "history" ? "bg-white/10 text-white" : "text-slate-500"}`}>Recent Activity</button>
          </div>

          <div className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
            {userModalTab === "details" ? (
               <div className="space-y-4">
                  <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 p-5 rounded-2xl">
                     <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Collected Cash</p>
                     <p className="text-3xl font-black text-emerald-400">₹{selectedUserStat?.cash.toLocaleString()}</p>
                     <p className="text-xs font-medium text-emerald-500/70 mt-2 flex items-center gap-1"><ArrowDownLeft className="w-3 h-3"/> Cash currently held</p>
                  </div>
                  <div className="bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/20 p-5 rounded-2xl">
                     <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Total Personal Due</p>
                     <p className="text-3xl font-black text-rose-400">₹{selectedUserStat?.due.toLocaleString()}</p>
                     <p className="text-xs font-medium text-rose-500/70 mt-2 flex items-center gap-1"><Receipt className="w-3 h-3"/> Remaining debt to clear</p>
                  </div>
               </div>
            ) : (
               <div className="space-y-3">
                  {userHistory.length > 0 ? (
                     userHistory.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-[16px]">
                           <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tx.isSpend ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                 {tx.isSpend ? <Receipt className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                              </div>
                              <div>
                                 <p className="text-xs font-bold text-white">{tx.remarks}</p>
                                 <p className="text-[10px] text-slate-500 font-medium">{new Date(tx.date).toLocaleDateString()}</p>
                              </div>
                           </div>
                           <p className={`text-sm font-black ${tx.isSpend ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {tx.isSpend ? '-' : '+'}₹{tx.amount}
                           </p>
                        </div>
                     ))
                  ) : (
                     <p className="text-center text-xs text-slate-500 py-10">No recent activity found.</p>
                  )}
               </div>
            )}
          </div>

          <div className="p-4 bg-black/60 border-t border-white/5 rounded-b-[40px]">
             <Button onClick={() => setIsUserModalOpen(false)} className="w-full h-12 rounded-2xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all font-bold border border-white/10">
                Close
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= PAYMENT MODAL ================= */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-6 pb-4 relative border-b border-white/5">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0ea5e9]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader className="mb-2">
              <DialogTitle className="text-2xl font-space font-black text-white leading-tight">
                {selectedQr?.merchant_name}
              </DialogTitle>
              <DialogDescription className="hidden">QR View</DialogDescription>
              <p className="text-sm text-[#0ea5e9] font-bold">{selectedQr?.upi_id}</p>
            </DialogHeader>

            {firstName && selectedQr?.merchant_name.toLowerCase().includes(firstName) && (
              <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl text-red-400 text-xs font-bold leading-relaxed shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                This QR matches your name. Paying here has high risk of rotation block. Avoid if possible!
              </div>
            )}
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6 custom-scrollbar">
            <div className="w-48 h-48 mx-auto bg-white rounded-[28px] p-2.5 shadow-[0_0_50px_rgba(255,255,255,0.15)] relative overflow-hidden border-4 border-white/10">
              {selectedQr?.qr_image_url ? (
                <Image src={selectedQr.qr_image_url} alt="QR" fill className="object-cover rounded-[20px]" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-slate-100 rounded-[20px] flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-slate-300" />
                </div>
              )}
            </div>

            <div className="space-y-4 bg-white/[0.02] p-5 rounded-[24px] border border-white/5 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-300">Payment Strategy</span>
                <div className="flex bg-black/60 p-1.5 rounded-xl border border-white/5">
                  <button onClick={() => { setPaymentMode("once"); setGeneratedAmounts([]); }} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${paymentMode === "once" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Once</button>
                  <button onClick={() => { setPaymentMode("multiple"); setGeneratedAmounts([]); }} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${paymentMode === "multiple" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Multiple</button>
                </div>
              </div>

              {paymentMode === "multiple" && (
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-xs font-bold text-slate-400">Number of swipes:</span>
                  <div className="relative">
                    <select value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))} className="appearance-none bg-white/5 border border-white/10 text-white text-xs font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:border-[#0ea5e9] shadow-inner">
                      <option value={2} className="bg-[#050505]">2 Times (Under 2k)</option>
                      <option value={3} className="bg-[#050505]">3 Times</option>
                      <option value={4} className="bg-[#050505]">4 Times</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <Button onClick={generatePaymentAmounts} className="w-full h-12 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-black transition-all font-black text-sm shadow-[0_0_15px_rgba(14,165,233,0.15)] mt-2">
                <Sparkles className="w-4 h-4 mr-2" /> Generate Links
              </Button>

              {generatedAmounts.length > 0 && (
                <div className="pt-3 space-y-2 border-t border-white/10">
                  {generatedAmounts.map((amt, i) => (
                    <a key={i} href={`upi://pay?pa=${selectedQr?.upi_id || ''}&pn=${encodeURIComponent(selectedQr?.merchant_name || '')}&am=${amt}&cu=INR`} className="flex items-center justify-between w-full p-4 bg-gradient-to-r from-[#10b981]/15 to-transparent border border-[#10b981]/30 rounded-xl hover:border-[#10b981]/60 transition-all group shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                      <span className="text-sm font-black text-emerald-400 group-hover:text-emerald-300">Pay ₹{amt}</span>
                      <ArrowRight className="w-5 h-5 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 bg-black/60 border-t border-white/5 rounded-b-[40px] backdrop-blur-xl">
            <Button onClick={markQrAsUsedToday} className="w-full h-14 rounded-2xl bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-all font-bold border border-white/10 shadow-inner">
              <CheckCircle2 className="w-5 h-5 mr-2 text-[#10b981]" /> Mark as Used Today
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}