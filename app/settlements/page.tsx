"use client";

import { useState, useEffect } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowDownLeft, 
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  ShieldCheck,
  User,
  CreditCard,
  Plus
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
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
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  parent_card_id?: string;
}

interface QRData {
  id: string;
  merchant_name: string;
}

export default function SettlementsPage() {
  const [activeTab, setActiveTab] = useState<"vault" | "pending" | "history">("vault");

  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [settledTxs, setSettledTxs] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});

  const [activeQrs, setActiveQrs] = useState<QRData[]>([]);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleTx, setSettleTx] = useState<Transaction | null>(null);
  const [cashReceiverId, setCashReceiverId] = useState("");
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

    const channel = supabase.channel('settlements_ledger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchLedgerData(accessibleCards))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLedgerData(accessibleCards))
      .subscribe();

    return () => { 
        supabase.removeChannel(channel); 
        window.removeEventListener('switch-tab-to-pending', handleSwitchTab);
    };
  }, [globalSelectedCardId, firstName]);

  const cleanUrl = (url?: string | null) => {
     if (!url) return "";
     return url.trim().replace(/^['"]|['"]$/g, '');
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profData } = await supabase.from('profiles').select('id, name, avatar_url');
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
    coh?.forEach(c => { cashMap[c.user_id] = Number(c.current_balance); });
    setUserCashMap(cashMap);
  };

  const openSettleModal = (tx: Transaction) => {
     setSettleTx(tx);
     setCashReceiverId(currentUser?.id || "");
     setSettlementType("full");
     setPartialAmount("");
     setIsSettleModalOpen(true);
  };

  const handleConfirmSettlement = async () => {
     if (!settleTx || !cashReceiverId) return;
     setIsSettling(true);

     const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
     const receiverCashBalance = userCashMap[cashReceiverId] || 0;
     const isPartial = settlementType === "partial" && Number(partialAmount) > 0 && Number(partialAmount) < settleTx.amount;
     const amtToSettle = isPartial ? Number(partialAmount) : settleTx.amount;

     try {
        if (isPartial) {
            const newPendingBalance = settleTx.amount - amtToSettle;
            await supabase.from('card_transactions').update({
                amount: newPendingBalance
            }).eq('id', settleTx.id);

            await supabase.from('card_transactions').insert({
                card_id: settleTx.card_id,
                qr_id: settleTx.qr_id, 
                amount: amtToSettle,
                transaction_date: settleTx.transaction_date, 
                type: 'withdrawal',
                status: 'settled',
                settled_date: today,
                settled_to_user: cashReceiverId,
                recorded_by: currentUser?.id,
                remarks: `Partial Settlement (Total was ₹${settleTx.amount})`
            });
        } else {
            await supabase.from('card_transactions').update({
                status: 'settled',
                settled_date: today,
                settled_to_user: cashReceiverId
            }).eq('id', settleTx.id);
        }

        await supabase.from('cash_on_hand').upsert({
           user_id: cashReceiverId,
           current_balance: receiverCashBalance + amtToSettle
        });

        await supabase.from('cash_on_hand_ledger').insert({
           user_id: cashReceiverId,
           amount: amtToSettle,
           transaction_type: 'credit',
           remarks: `Settlement received from ${settleTx.qrs?.merchant_name || 'Manual Entry'}`,
           transaction_date: new Date().toISOString()
        });

        setIsSettleModalOpen(false);
        fetchLedgerData(accessibleCards);
     } catch (error: any) {
        alert("Error during settlement: " + error.message);
     } finally {
        setIsSettling(false);
     }
  };

  const handleManualEntry = async () => {
     if (!manualAmount || !manualCardId) {
         alert("Amount and Card are required!");
         return;
     }

     setIsSettling(true);
     const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

     try {
         // ১. ট্রানজ্যাকশন এন্ট্রি
         await supabase.from('card_transactions').insert({
            card_id: manualCardId,
            qr_id: manualQrId || null, 
            amount: Number(manualAmount),
            transaction_date: today,
            type: 'withdrawal',
            status: 'pending_settlement',
            recorded_by: currentUser?.id,
            remarks: manualRemarks || "Manual Entry"
         });

         // ২. QR সিলেক্ট করা থাকলে qrs টেবিলে last_used_date আপডেট করা
         if (manualQrId) {
             await supabase.from('qrs').update({
                 last_used_date: new Date().toISOString()
             }).eq('id', manualQrId);
         }

         setIsManualEntryOpen(false);
         setManualAmount("");
         setManualRemarks("");
         setManualQrId(""); 
         fetchLedgerData(accessibleCards);
     } catch(e: any) {
         alert("Failed to add entry: " + e.message);
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
             <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none">
               QR & Settlements
             </h1>
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

        <div className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 flex items-center justify-between backdrop-blur-xl shadow-inner">
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
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10b981]"></div>
          </div>
        ) : (
           <>
              {activeTab === "vault" && (
                  <QRTab 
                     accessibleCards={accessibleCards}
                     globalSelectedCardId={globalSelectedCardId}
                     currentUser={currentUser}
                     firstName={firstName}
                  />
              )}

              {activeTab === "pending" && (
                 <motion.div initial="hidden" animate="visible" className="space-y-4">
                    <div className="flex gap-3">
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
                           <span className="text-[10px] font-bold text-slate-300 group-hover:text-white relative z-10">New Entry</span>
                        </button>
                    </div>

                    <div className="space-y-3">
                       <AnimatePresence mode="popLayout">
                          {pendingTxs.map(tx => (
                             <motion.div
                                key={tx.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
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
                                         <h3 className="text-sm font-bold text-white truncate">{tx.qrs?.merchant_name || tx.remarks || 'Manual Entry'}</h3>
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
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Settle
                                   </Button>
                                </div>
                             </motion.div>
                          ))}
                       </AnimatePresence>
                       {pendingTxs.length === 0 && (
                          <div className="text-center py-10 bg-white/[0.02] rounded-[24px] border border-white/5 border-dashed">
                             <ShieldCheck className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
                             <p className="text-xs font-bold text-slate-400">All funds have been successfully settled.</p>
                          </div>
                       )}
                    </div>
                 </motion.div>
              )}

              {activeTab === "history" && (
                 <motion.div initial="hidden" animate="visible" className="space-y-6 pb-6">
                    {Object.keys(groupedHistory).length === 0 ? (
                       <div className="text-center py-12 bg-white/[0.02] rounded-[24px] border border-white/5 border-dashed shadow-inner">
                          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                          <p className="text-xs font-bold text-slate-400">No settled history found.</p>
                       </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {Object.entries(groupedHistory).map(([date, items]) => (
                           <div key={date} className="space-y-3">
                              <div className="sticky top-20 z-20 flex items-center gap-3">
                                 <span className="px-3 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                    {date}
                                 </span>
                                 <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                              </div>

                              {items.map((item) => (
                                <motion.div
                                  key={item.id}
                                  layout
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="group p-4 bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-xl flex flex-col shadow-inner ml-2 border-l-2 border-l-[#10b981]/50 hover:bg-white/[0.04] transition-all"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                     <div className="flex items-center gap-3 w-[70%]">
                                       <div className="w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center border border-emerald-500/20 bg-emerald-500/10">
                                         <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                                       </div>
                                       <div className="truncate">
                                         <h3 className="text-sm font-bold text-slate-100 truncate">{item.qrs?.merchant_name || item.remarks || 'Manual Entry'}</h3>
                                         <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                            Rotated: {new Date(item.transaction_date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short'})}
                                         </p>
                                       </div>
                                     </div>
                                     <div className="text-right shrink-0">
                                       <span className="text-sm font-black text-emerald-400">+₹{item.amount.toLocaleString()}</span>
                                     </div>
                                  </div>
                                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                     <div className="flex items-center gap-1"><CreditCard className="w-3 h-3"/> {item.cards?.card_name || 'Card'}</div>
                                     <div className="flex items-center gap-1 text-[#0ea5e9]"><User className="w-3 h-3"/> By: {item.settled_to_profile?.name.split(' ')[0] || 'Unknown'}</div>
                                  </div>
                                </motion.div>
                              ))}
                           </div>
                        ))}
                      </AnimatePresence>
                    )}
                 </motion.div>
              )}
           </>
        )}
      </main>

      <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-black text-white">New Manual Entry</DialogTitle>
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
                   {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-[38px] w-4 h-4 text-slate-500 pointer-events-none" />
             </div>

             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Amount</label>
                <input type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0.00" className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981]" />
             </div>

             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Remarks {manualQrId && "(Optional)"}</label>
                <input type="text" value={manualRemarks} onChange={(e) => setManualRemarks(e.target.value)} placeholder="e.g. Petrol Pump / Friend" className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981]" />
             </div>
             <Button onClick={handleManualEntry} disabled={isSettling} className="w-full h-14 rounded-2xl bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black text-lg border-0 mt-4 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
               {isSettling ? "Saving..." : "Add Entry"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettleModalOpen} onOpenChange={setIsSettleModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#10b981]/20 rounded-full blur-[50px] pointer-events-none" />
          <DialogHeader className="mb-4 relative z-10">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#34d399] bg-clip-text text-transparent">
              Settlement Process
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
                    {Number(partialAmount) > 0 && Number(partialAmount) < (settleTx?.amount || 0) && (
                       <p className="text-[10px] text-slate-400 font-medium text-right mt-1">Remaining balance will be: ₹{(settleTx!.amount - Number(partialAmount)).toLocaleString()}</p>
                    )}
                 </div>
             )}

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
               {isSettling ? "Processing..." : "Confirm"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}