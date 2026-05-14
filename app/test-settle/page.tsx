"use client";

import { useState, useEffect } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { 
  ArrowDownLeft, 
  CheckCircle2,
  ChevronDown,
  Clock,
  ShieldCheck,
  User,
  CreditCard,
  Plus,
  ShieldAlert
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppAlert } from "@/lib/whatsapp";
import Link from "next/link";
import QRTab from "./qr";

interface Transaction {
  id: string;
  type: 'withdrawal' | 'bill_payment';
  amount: number;
  transaction_date: string;
  status: 'pending_settlement' | 'settled';
  settled_date?: string;
  recorded_by: string; 
  qr_id?: string;
  settled_to_user?: string; 
  card_id?: string;
  remarks?: string;
  qrs?: { merchant_name: string };
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
  settled_to_profile?: { name: string };
}

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string; // Added phone
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  parent_card_id?: string;
  total_limit?: number;
}

interface QRData {
  id: string;
  merchant_name: string;
}

const listContainerVars: Variants = {
  hidden: { opacity: 0, display: "none", transition: { duration: 0 } },
  visible: { opacity: 1, display: "block", transition: { staggerChildren: 0.08 } }
};

const listItemVars: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function TestSettlementsPage() {
  const [activeTab, setActiveTab] = useState<"vault" | "pending" | "history">("vault");

  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [settledTxs, setSettledTxs] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});

  const [activeQrs, setActiveQrs] = useState<QRData[]>([]);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleTx, setSettleTx] = useState<Transaction | null>(null);
  const [cashReceiverId, setCashReceiverId] = useState("");
  const [settleTargetCardId, setSettleTargetCardId] = useState(""); 
  const [isSettling, setIsSettling] = useState(false);
  const [settlementType, setSettlementType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState<number | "">("");

  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualCardId, setManualCardId] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [manualQrId, setManualQrId] = useState(""); 

  useEffect(() => {
    fetchInitialData();
    const handleSwitchTab = () => setActiveTab("pending");
    window.addEventListener('switch-tab-to-pending', handleSwitchTab);

    return () => { 
        window.removeEventListener('switch-tab-to-pending', handleSwitchTab);
    };
  }, [globalSelectedCardId, firstName]);

  const cleanUrl = (url?: string | null) => {
     if (!url) return "";
     return url.trim().replace(/^['"]|['"]$/g, '');
  };

  const sanitizeText = (str: any) => {
    if (!str) return "-";
    return String(str)
      .replace(/[\u202F\u00A0]/g, ' ') 
      .replace(/[\r\n\t]+/g, ' ')      
      .trim() || "-";                  
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Fetched phone for alerts
    const { data: profData } = await supabase.from('profiles').select('id, name, avatar_url, phone');
    const { data: cData } = await supabase.from('cards').select('*');
    const { data: aData } = await supabase.from('card_access').select('*');
    const { data: qData } = await supabase.from('qrs').select('id, merchant_name').eq('status', 'active');

    const profs = profData || [];
    const cardsList = cData || [];
    const accessList = aData || [];
    setActiveQrs(qData || []);

    setProfiles(profs);

    if (user) {
      const myProfile = profs.find(p => p.id === user.id);
      if (myProfile) {
         setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) });
         setFirstName(myProfile.name.split(' ')[0].toLowerCase());
         setCashReceiverId(myProfile.id);
      }

      const myCardIds = accessList.filter(a => a.user_id === user.id).map(a => a.card_id);
      const myCards = cardsList.filter(c => myCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);
      if (myCards.length > 0) setManualCardId(myCards[0].id);

      await fetchLedgerData(myCards);
    }

    setIsLoading(false);
  };

  const fetchLedgerData = async (currentCards: CardData[]) => {
    let targetCardIds: string[] = [];
    if (globalSelectedCardId !== 'all') {
      const selected = currentCards.find(c => c.id === globalSelectedCardId);
      if (selected) {
         const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
         targetCardIds = currentCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId).map(c => c.id);
      }
    }

    let txQuery = supabase.from('card_transactions')
        .select(`*, qrs (merchant_name), profiles:recorded_by (name, avatar_url), cards(card_name, last_4_digits), settled_to_profile:settled_to_user(name)`)
        .eq('type', 'withdrawal')
        .not('remarks', 'ilike', 'Lent given to%')
        .order('transaction_date', { ascending: false });

    if (globalSelectedCardId !== 'all' && targetCardIds.length > 0) {
       txQuery = txQuery.in('card_id', targetCardIds);
    }

    const { data: txs } = await txQuery;
    const { data: coh } = await supabase.from('cash_on_hand').select('*');

    if (txs) {
       setPendingTxs(txs.filter(t => t.status === 'pending_settlement') as any);
       setSettledTxs(txs.filter(t => t.status === 'settled').sort((a,b) => new Date(b.settled_date || b.transaction_date).getTime() - new Date(a.settled_date || a.transaction_date).getTime()) as any);
    }

    const cashMap: Record<string, number> = {};
    coh?.forEach(c => { cashMap[c.user_id] = (cashMap[c.user_id] || 0) + Number(c.current_balance); });
    setUserCashMap(cashMap);

    const { data: allTxs } = await supabase.from('card_transactions')
      .select('amount, type, payment_method, card_id, status, qr_id, settled_to_user, remarks');
    const { data: allSpends } = await supabase.from('spends').select('amount, payment_method, user_id, card_id');

    const availableMap: Record<string, number> = {};

    currentCards.filter(c => c.is_primary).forEach(primaryCard => {
       const familyCardIds = currentCards.filter(c => c.id === primaryCard.id || c.parent_card_id === primaryCard.id).map(c => c.id);

       const withdrawals = allTxs?.filter(t => {
         if (t.type !== 'withdrawal') return false;
         if (!t.card_id || !familyCardIds.includes(t.card_id)) return false;
         const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
         if (isRotation) return true;
         return t.status === 'pending_settlement';
       }).reduce((sum, t) => sum + Number(t.amount), 0) || 0;

       const billPayments = allTxs?.filter(t => t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id)).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
       const ccSpends = allSpends?.filter(s => s.payment_method === 'credit_card' && s.card_id && familyCardIds.includes(s.card_id)).reduce((sum, s) => sum + Number(s.amount), 0) || 0;

       const available = Number(primaryCard.total_limit) - withdrawals - ccSpends + billPayments;

       familyCardIds.forEach(id => {
           availableMap[id] = available;
       });
    });
    setCardAvailableMap(availableMap);
  };

  const openSettleModal = (tx: Transaction) => {
     setSettleTx(tx);
     setCashReceiverId(currentUser?.id || "");
     const defaultCard = globalSelectedCardId !== 'all' ? globalSelectedCardId : (tx.card_id || accessibleCards[0]?.id || "");
     setSettleTargetCardId(defaultCard);
     setSettlementType("full");
     setPartialAmount("");
     setIsSettleModalOpen(true);
  };

  // ==========================================
  // 1. TEST MODE: CONFIRM SETTLEMENT ALERT
  // ==========================================
  const handleConfirmSettlement = async () => {
     if (!settleTx || !cashReceiverId || !settleTargetCardId || !currentUser) return;
     setIsSettling(true);

     try {
        const isPartial = settlementType === "partial" && Number(partialAmount) > 0 && Number(partialAmount) < settleTx.amount;
        const amtToSettle = isPartial ? Number(partialAmount) : settleTx.amount;

        const targetCard = accessibleCards.find(c => c.id === settleTargetCardId);
        const receiverProfile = profiles.find(p => p.id === cashReceiverId);

        // Mock current cash balance calculation
        const { data: existingCashRow } = await supabase.from('cash_on_hand').select('current_balance').eq('user_id', cashReceiverId).eq('card_id', settleTargetCardId).maybeSingle();
        const newBalance = Number(existingCashRow?.current_balance || 0) + amtToSettle;

        const nowTime = new Date();
        const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

        // Broadcast alert
        for (const profile of profiles) {
           const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');
           if (cleanPhone.length >= 10) {
              const rawVars = {
                greeting_user: profile.name,
                entry_user: currentUser.name,
                time: timeStr,
                card_name: targetCard?.card_name || 'Card',
                last_4: targetCard?.last_4_digits || '0000',
                qr_name: settleTx.qrs?.merchant_name || 'Manual Rotation Entry',
                amount: String(amtToSettle),
                receiver_name: receiverProfile?.name || 'User',
                total_cash: String(newBalance)
              };

              const safeVars: Record<string, string> = {};
              for (const [k, v] of Object.entries(rawVars)) { safeVars[k] = sanitizeText(v); }

              console.log(`Sending rotation_settlement_alert to ${profile.name}`, safeVars);
              await sendWhatsAppAlert(cleanPhone, "rotation_settlement_alert", safeVars);
           }
        }

        alert("✅ [TEST MODE] Settlement Alert Sent Successfully!\nNo data was saved to Database.");
        setIsSettleModalOpen(false);
     } catch (error: any) {
        alert("Test Error: " + error.message);
     } finally {
        setIsSettling(false);
     }
  };

  // ==========================================
  // 2. TEST MODE: MANUAL ENTRY ALERT
  // ==========================================
  const handleManualEntry = async () => {
     if (!manualAmount || !manualCardId || !currentUser) {
         alert("Amount and Card are required!");
         return;
     }

     setIsSettling(true);
     try {
         const nowTime = new Date();
         const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

         const manualCard = accessibleCards.find(c => c.id === manualCardId);
         const qrInfo = manualQrId ? activeQrs.find(q => q.id === manualQrId) : null;

         const currentBal = (cardAvailableMap[manualCardId] || 0) - Number(manualAmount);

         // Broadcast alert
         for (const profile of profiles) {
           const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');
           if (cleanPhone.length >= 10) {
              const rawVars = {
                greeting_user: profile.name,
                entry_user: currentUser.name,
                time: timeStr,
                mode: qrInfo ? "QR" : "Manual",
                provider: qrInfo ? qrInfo.merchant_name : "Entry",
                amount: manualAmount,
                card_name: manualCard?.card_name || 'Card',
                last_4: manualCard?.last_4_digits || '0000',
                current_balance: String(currentBal)
              };

              const safeVars: Record<string, string> = {};
              for (const [k, v] of Object.entries(rawVars)) { safeVars[k] = sanitizeText(v); }

              console.log(`Sending rotation_withdraw_alert to ${profile.name}`, safeVars);
              await sendWhatsAppAlert(cleanPhone, "rotation_withdraw_alert", safeVars);
           }
         }

         alert("✅ [TEST MODE] Manual Rotation Alert Sent Successfully!\nNo data was saved to Database.");
         setIsManualEntryOpen(false);
         setManualAmount(""); setManualRemarks(""); setManualQrId(""); 
     } catch(e: any) {
         alert("Test Error: " + e.message);
     } finally {
         setIsSettling(false);
     }
  };

  const groupedHistory = settledTxs.reduce((acc, item) => {
     const dateObj = new Date(item.settled_date || item.transaction_date);
     const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
     if (!acc[dateStr]) acc[dateStr] = [];
     acc[dateStr].push(item);
     return acc;
  }, {} as Record<string, Transaction[]>);

  const totalPendingAmount = pendingTxs.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#10b981]/30">

      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b9810a_1px,transparent_1px),linear-gradient(to_bottom,#10b9810a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <motion.div animate={{ x: [0, 50, -40, 0], y: [0, 60, -50, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} className="absolute top-[-10%] right-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#10b981] opacity-[0.12] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ x: [0, -50, 50, 0], y: [0, -60, 60, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} className="absolute bottom-[5%] left-[-25%] w-[100vw] h-[100vw] rounded-full bg-[#0ea5e9] opacity-[0.12] blur-[130px] mix-blend-screen" />
      </div>

      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
           <Link href="/settings">
             <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#10b981] to-[#0ea5e9] p-0.5 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer overflow-hidden">
               <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                 {currentUser?.avatar_url && !imgError ? (
                   <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" onError={() => setImgError(true)} />
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
             <motion.h1 
               initial={{ filter: "blur(10px)", opacity: 0, y: -5 }} 
               animate={{ filter: "blur(0px)", opacity: 1, y: 0 }} 
               transition={{ duration: 0.8, ease: "easeOut" }}
               className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none"
             >
               Test QR & Settle
             </motion.h1>
           </div>
        </div>

        <div className="relative">
          <select 
             value={globalSelectedCardId}
             onChange={(e) => setGlobalSelectedCardId(e.target.value)}
             className="appearance-none bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-7 rounded-xl outline-none focus:border-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.15)] backdrop-blur-md"
          >
             <option value="all" className="bg-[#050505]">All Vault Cards</option>
             {accessibleCards.map(c => (
                <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
             ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </header>

      <main className="relative z-10 px-4 pt-5 max-w-md mx-auto space-y-5">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/50 rounded-2xl p-4 flex items-start gap-3 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        >
          <ShieldAlert className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-emerald-400 font-black text-sm uppercase tracking-widest mb-1">TEST ENVIRONMENT</h2>
            <p className="text-emerald-100/70 text-[11px] leading-relaxed font-medium">
              No transactions will be saved to the database. This page is only for testing WhatsApp Alerts.
            </p>
          </div>
        </motion.div>

        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 flex items-center justify-between backdrop-blur-xl shadow-inner">
           {[
             { id: "vault", label: "QR Vault" },
             { id: "pending", label: "In Transit" },
             { id: "history", label: "History" }
           ].map((tab) => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex-1 relative py-2.5 text-[11px] font-bold rounded-xl transition-all ${
                 activeTab === tab.id ? "text-white" : "text-slate-500 hover:text-slate-300"
               }`}
             >
               {activeTab === tab.id && (
                 <motion.div
                   layoutId="settleTabBg"
                   className="absolute inset-0 bg-[#10b981]/20 border border-[#10b981]/40 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                   transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                 />
               )}
               <span className="relative z-10">{tab.label}</span>
             </button>
           ))}
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10b981]"></div>
          </div>
        ) : (
           <>
              <QRTab 
                  accessibleCards={accessibleCards}
                  globalSelectedCardId={globalSelectedCardId}
                  currentUser={currentUser}
                  firstName={firstName}
                  isActive={activeTab === "vault"}
                  allProfiles={profiles}
                  cardAvailableMap={cardAvailableMap}
              />

              <motion.div 
                 variants={listContainerVars}
                 initial="hidden"
                 animate={activeTab === "pending" ? "visible" : "hidden"}
                 className="space-y-4"
              >
                 <motion.div variants={listItemVars} className="flex gap-3">
                     <div className="flex-1 p-4 rounded-[24px] bg-gradient-to-br from-amber-500/10 to-rose-500/5 border border-amber-500/20 backdrop-blur-md shadow-inner flex justify-between items-center">
                         <div>
                             <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Total Due</p>
                             <p className="text-2xl font-black text-amber-400">₹{totalPendingAmount.toLocaleString()}</p>
                         </div>
                     </div>

                     <button onClick={() => setIsManualEntryOpen(true)} className="relative group w-[80px] bg-white/[0.03] border border-white/10 hover:border-[#10b981]/50 hover:bg-white/[0.05] rounded-[24px] flex flex-col items-center justify-center gap-1.5 transition-all overflow-hidden shadow-inner">
                        <div className="absolute inset-0 bg-[#10b981]/0 group-hover:bg-[#10b981]/10 transition-colors duration-500 blur-xl" />
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#10b981] to-[#0ea5e9] p-[1px] shadow-[0_0_15px_rgba(16,185,129,0.4)] group-hover:shadow-[0_0_25px_rgba(16,185,129,0.6)] transition-all">
                          <div className="w-full h-full bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                             <Plus className="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-300 group-hover:text-white relative z-10">Test Entry</span>
                     </button>
                 </motion.div>

                 <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                       {pendingTxs.map(tx => (
                          <motion.div
                             key={tx.id}
                             layout
                             variants={listItemVars}
                             exit={{ opacity: 0, scale: 0.9 }}
                             onClick={() => openSettleModal(tx)}
                             className="group relative p-4 rounded-[20px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] hover:border-amber-500/30 transition-all cursor-pointer overflow-hidden shadow-inner"
                          >
                             <div className="absolute -inset-4 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-2xl bg-amber-500/20" />

                             <div className="flex justify-between items-start relative z-10 mb-3">
                                <div className="flex items-center gap-3 w-[70%]">
                                   <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                      <Clock className="w-5 h-5 text-amber-400" />
                                   </div>
                                   <div className="truncate">
                                      <h3 className="text-sm font-bold text-white truncate">{tx.qrs?.merchant_name || tx.remarks || 'Manual Rotation Entry'}</h3>
                                      <p className="text-[10px] text-slate-400 font-medium">Rotated on {new Date(tx.transaction_date).toLocaleDateString('en-GB')}</p>
                                   </div>
                                </div>
                                <div className="text-right shrink-0">
                                   <p className="text-base font-black text-amber-400">₹{tx.amount.toLocaleString()}</p>
                                </div>
                             </div>

                             <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                   <CreditCard className="w-3.5 h-3.5" />
                                   {tx.cards ? `${tx.cards.card_name} (**${tx.cards.last_4_digits})` : 'Card not linked'}
                                </div>
                                <Button size="sm" className="h-7 px-2.5 text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg">
                                   <CheckCircle2 className="w-3 h-3 mr-1" /> Test Settle
                                </Button>
                             </div>
                          </motion.div>
                       ))}
                    </AnimatePresence>
                 </div>
              </motion.div>

              <motion.div variants={listContainerVars} initial="hidden" animate={activeTab === "history" ? "visible" : "hidden"} className="space-y-6 pb-6">
                 {/* Only for UI consistency, removed loops to keep code short since history has no alerts */}
                  <motion.div variants={listItemVars} className="text-center py-12 bg-white/[0.02] rounded-[24px] border border-white/5 border-dashed shadow-inner">
                     <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                     <p className="text-xs font-bold text-slate-400">History Tab logic is active but simplified for testing.</p>
                  </motion.div>
              </motion.div>
           </>
        )}
      </main>

      <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-black text-white">Test Manual Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
             <div className="space-y-1.5 relative">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1.5">Select QR (Optional)</label>
                <select value={manualQrId} onChange={(e) => setManualQrId(e.target.value)} className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-xs font-bold text-white outline-none appearance-none focus:border-[#10b981]">
                   <option value="" className="bg-[#050505] text-slate-500">None (Manual Entry)</option>
                   {activeQrs.map(q => <option key={q.id} value={q.id} className="bg-[#050505]">{q.merchant_name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-[38px] w-4 h-4 text-slate-500 pointer-events-none" />
             </div>

             <div className="space-y-1.5 relative">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Select Card</label>
                <select value={manualCardId} onChange={(e) => setManualCardId(e.target.value)} className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-xs font-bold text-white outline-none appearance-none focus:border-[#10b981]">
                   {accessibleCards.map(c => {
                      const avail = cardAvailableMap[c.id] || 0;
                      return <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits}) - Avail: ₹{avail.toLocaleString()}</option>
                   })}
                </select>
                <ChevronDown className="absolute right-3 top-[38px] w-4 h-4 text-slate-500 pointer-events-none" />
             </div>

             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Amount</label>
                <input type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0.00" className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981]" />
             </div>

             <Button onClick={handleManualEntry} disabled={isSettling} className="w-full h-14 rounded-2xl bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black text-lg border-0 mt-4 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
               {isSettling ? "Simulating..." : "Simulate Alert (No Save)"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettleModalOpen} onOpenChange={setIsSettleModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#10b981]/20 rounded-full blur-[50px] pointer-events-none" />
          <DialogHeader className="mb-4 relative z-10">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#34d399] bg-clip-text text-transparent">
              Test Settlement
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Total Due: ₹{settleTx?.amount.toLocaleString()}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 relative z-10">
             <div className="flex bg-black/60 p-1 rounded-xl border border-white/5">
               <button onClick={() => setSettlementType("full")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settlementType === "full" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>Full Settle</button>
               <button onClick={() => setSettlementType("partial")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settlementType === "partial" ? "bg-[#10b981]/20 text-[#10b981]" : "text-slate-500 hover:text-slate-300"}`}>Partial Settle</button>
             </div>

             {settlementType === "full" ? (
                 <div className="text-center p-5 bg-white/[0.02] border border-white/10 rounded-[24px] shadow-inner">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Amount</p>
                    <p className="text-4xl font-black text-white">₹{settleTx?.amount.toLocaleString()}</p>
                 </div>
             ) : (
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-emerald-400 uppercase">Enter Partial Amount</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                       <input 
                          type="number" 
                          value={partialAmount} 
                          onChange={(e) => setPartialAmount(Number(e.target.value))} 
                          placeholder="0.00" 
                          className="w-full h-14 bg-white/[0.03] border border-emerald-500/30 rounded-2xl pl-8 pr-4 text-xl font-bold text-white outline-none focus:border-emerald-500" 
                       />
                    </div>
                 </div>
             )}

             <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1.5">
                   <CreditCard className="w-3.5 h-3.5 text-[#10b981]" /> Card to Settle Into
                </label>
                <div className="relative">
                   <select value={settleTargetCardId} onChange={(e) => setSettleTargetCardId(e.target.value)} className="w-full h-14 bg-white/[0.05] border border-[#10b981]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none appearance-none focus:border-[#10b981]">
                      {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>)}
                   </select>
                   <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] pointer-events-none" />
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1.5">
                   <User className="w-3.5 h-3.5 text-[#0ea5e9]" /> Who is keeping this cash?
                </label>
                <div className="relative">
                   <select value={cashReceiverId} onChange={(e) => setCashReceiverId(e.target.value)} className="w-full h-14 bg-white/[0.05] border border-[#0ea5e9]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none appearance-none focus:border-[#0ea5e9]">
                      {profiles.map(p => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
                   </select>
                   <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0ea5e9] pointer-events-none" />
                </div>
             </div>

             <Button 
                onClick={handleConfirmSettlement} 
                disabled={isSettling || (settlementType === 'partial' && (!partialAmount || Number(partialAmount) >= (settleTx?.amount || 0)))} 
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#34d399] hover:opacity-90 text-black font-black text-lg border-0 mt-4 disabled:opacity-50"
             >
               {isSettling ? "Processing..." : "Simulate Alert (No Save)"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}