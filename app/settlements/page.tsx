"use client";

import { useState, useEffect } from "react";
import { useCardStore } from "@/store/cardStore";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowDownLeft, 
  Plus, 
  Banknote,
  AlertCircle,
  CheckCircle2,
  QrCode,
  ChevronDown,
  Clock,
  ShieldCheck,
  User,
  CreditCard,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Upload,
  Edit3,
  LayoutGrid
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Image from "next/image";

// --- Interfaces ---
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

interface QR {
  id: string;
  merchant_name: string;
  platform: string;
  status: string; // 'active', 'on_hold', 'static'
  qr_image_url: string;
  upi_id: string;
  settlement_time: string;
  last_used_date: string | null;
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

export default function SettlementsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "history" | "vault">("pending");

  // Data States
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [settledTxs, setSettledTxs] = useState<Transaction[]>([]);

  // QR Categorization States
  const [recommendedQrs, setRecommendedQrs] = useState<QR[]>([]);
  const [dynamicQrs, setDynamicQrs] = useState<QR[]>([]);
  const [staticQrs, setStaticQrs] = useState<QR[]>([]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Global Selected Card Filter
  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();

  // Settlement Modal States
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleTx, setSettleTx] = useState<Transaction | null>(null);
  const [cashReceiverId, setCashReceiverId] = useState("");
  const [isSettling, setIsSettling] = useState(false);

  // Add/Edit QR Modal States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QR | null>(null);
  const [isAddingStatic, setIsAddingStatic] = useState(false);

  // QR Form States
  const [newQrName, setNewQrName] = useState("");
  const [newUpiId, setNewUpiId] = useState("");
  const [newPlatform, setNewPlatform] = useState("PhonePe");
  const [newSettlementTime, setNewSettlementTime] = useState("T+1");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // QR View / Payment Modal States
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>(""); // কোন কার্ড থেকে পে হচ্ছে

  useEffect(() => {
    fetchInitialData();

    const channel = supabase.channel('settlements_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchLedgerData(accessibleCards, firstName))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => fetchLedgerData(accessibleCards, firstName))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchLedgerData(accessibleCards, firstName))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

    const profs = profData || [];
    const cardsList = cData || [];
    const accessList = aData || [];

    setProfiles(profs);
    let currentFName = "";

    if (user) {
      const myProfile = profs.find(p => p.id === user.id);
      if (myProfile) {
         setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) });
         currentFName = myProfile.name.split(' ')[0].toLowerCase();
         setFirstName(currentFName);
         setCashReceiverId(myProfile.id);
      }

      const myCardIds = accessList.filter(a => a.user_id === user.id).map(a => a.card_id);
      const myCards = cardsList.filter(c => myCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);

      await fetchLedgerData(myCards, currentFName);
    }

    setIsLoading(false);
  };

  const fetchLedgerData = async (currentCards: CardData[], fName: string) => {
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
    const { data: qrData } = await supabase.from('qrs').select('*');

    if (txs) {
       setPendingTxs(txs.filter(t => t.status === 'pending_settlement') as any);
       setSettledTxs(txs.filter(t => t.status === 'settled').sort((a,b) => new Date(b.settled_date || b.transaction_date).getTime() - new Date(a.settled_date || a.transaction_date).getTime()) as any);
    }

    // --- QR CATEGORIZATION & ALGORITHM ---
    if (qrData) {
       const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

       // 1. Static QRs
       const statics = qrData.filter(q => q.status === 'static');

       // 2. Active & On-hold QRs
       let operational = qrData.filter(q => q.status !== 'static');

       // Sorting Algorithm
       operational.sort((a, b) => {
         let scoreA = 0; let scoreB = 0;
         const nameA = a.merchant_name.toLowerCase();
         const nameB = b.merchant_name.toLowerCase();

         // Name matching penalty
         if (fName && nameA.includes(fName)) scoreA += 10000;
         if (fName && nameB.includes(fName)) scoreB += 10000;

         // BharatPe penalty
         if (a.platform.includes('BharatPe')) scoreA += 1000;
         if (b.platform.includes('BharatPe')) scoreB += 1000;

         // Penalize if used today
         if (a.last_used_date === today) scoreA += 5000;
         if (b.last_used_date === today) scoreB += 5000;

         // Date sorting (older is better/lower score)
         const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
         const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;

         if (!a.last_used_date) scoreA -= 100;
         if (!b.last_used_date) scoreB -= 100;

         scoreA += timeA / 100000000000;
         scoreB += timeB / 100000000000;

         return scoreA - scoreB;
       });

       setStaticQrs(statics as any);

       // Split operational into Recommended (Top 4 active) and Vault (Rest)
       const activeOperational = operational.filter(q => q.status === 'active');
       const recommended = activeOperational.slice(0, 4);

       // Vault contains all operational (including on_hold) except the top 4 recommended
       const recommendedIds = recommended.map(r => r.id);
       const vault = operational.filter(q => !recommendedIds.includes(q.id));

       setRecommendedQrs(recommended as any);
       setDynamicQrs(vault as any);
    }

    const cashMap: Record<string, number> = {};
    coh?.forEach(c => { cashMap[c.user_id] = Number(c.current_balance); });
    setUserCashMap(cashMap);
  };

  // --- HANDLE SETTLEMENT ---
  const openSettleModal = (tx: Transaction) => {
     setSettleTx(tx);
     setCashReceiverId(currentUser?.id || "");
     setIsSettleModalOpen(true);
  };

  const handleConfirmSettlement = async () => {
     if (!settleTx || !cashReceiverId) return;
     setIsSettling(true);

     const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
     const receiverCashBalance = userCashMap[cashReceiverId] || 0;

     try {
        await supabase.from('card_transactions').update({
           status: 'settled',
           settled_date: today,
           settled_to_user: cashReceiverId
        }).eq('id', settleTx.id);

        await supabase.from('cash_on_hand').upsert({
           user_id: cashReceiverId,
           current_balance: receiverCashBalance + settleTx.amount
        });

        setIsSettleModalOpen(false);
        fetchLedgerData(accessibleCards, firstName);
     } catch (error: any) {
        alert("Error: " + error.message);
     } finally {
        setIsSettling(false);
     }
  };

  // --- HANDLE ADD / EDIT QR WITH FILE UPLOAD ---
  const openAddQrModal = (isStatic = false) => {
    setEditingQr(null);
    setNewQrName("");
    setNewUpiId("");
    setNewPlatform("PhonePe");
    setNewSettlementTime("T+1");
    setFile(null);
    setIsAddingStatic(isStatic);
    setIsQrModalOpen(true);
  };

  const openEditQrModal = (qr: QR) => {
    setEditingQr(qr);
    setNewQrName(qr.merchant_name);
    setNewUpiId(qr.upi_id);
    setNewPlatform(qr.platform);
    setNewSettlementTime(qr.settlement_time || "T+1");
    setIsAddingStatic(qr.status === 'static');
    setFile(null);
    setIsQrModalOpen(true);
  };

  const toggleQrStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'on_hold' : 'active';
    await supabase.from('qrs').update({ status: newStatus }).eq('id', id);
  };

  const handleSaveQR = async () => {
     if (!newQrName || (!newUpiId && !isAddingStatic)) {
        alert("Name and UPI ID are required.");
        return;
     }

     setUploading(true);
     try {
        let publicUrl = editingQr?.qr_image_url || "";

        // Handle Image Upload to Supabase Storage Bucket 'qr-vault'
        if (file) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${newQrName.replace(/\s+/g, '-')}-${Math.random()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('qr-vault').upload(`qrs/${fileName}`, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage.from('qr-vault').getPublicUrl(`qrs/${fileName}`);
          publicUrl = data.publicUrl;
        }

        const payload = {
           merchant_name: newQrName,
           upi_id: newUpiId || "static@upi",
           platform: newPlatform,
           settlement_time: newSettlementTime,
           qr_image_url: publicUrl,
           status: isAddingStatic ? 'static' : (editingQr ? editingQr.status : 'active')
        };

        if (editingQr) {
           await supabase.from('qrs').update(payload).eq('id', editingQr.id);
        } else {
           await supabase.from('qrs').insert(payload);
        }

        setIsQrModalOpen(false);
        fetchLedgerData(accessibleCards, firstName);
     } catch (error: any) {
        alert("Error saving QR: " + error.message);
     } finally {
        setUploading(false);
     }
  };

  // --- NEW UPDATED PAYMENT GENERATION LOGIC ---
  const generatePaymentAmounts = () => {
    if (paymentMode === "once") {
      // 90% chance for 1900-1999, 10% chance for 1850-1899
      const isHigh = Math.random() < 0.9;
      if (isHigh) {
         setGeneratedAmounts([Math.floor(Math.random() * 100 + 1900)]);
      } else {
         setGeneratedAmounts([Math.floor(Math.random() * 50 + 1850)]);
      }
    } else {
      if (splitCount === 2) {
        // Total should always be 1900+ (1900 to 1999)
        const targetTotal = Math.floor(Math.random() * 100 + 1900);
        const first = Math.floor(Math.random() * (targetTotal - 1000) + 500); // e.g. 500 to 1400
        const second = targetTotal - first;
        setGeneratedAmounts([first, second]);
      } else {
        // For 3 or 4 splits
        const amounts = Array.from({ length: splitCount }, () => Math.floor(Math.random() * 199 + 1800));
        setGeneratedAmounts(amounts);
      }
    }
  };

  // --- RECORD TRANSACTION AND MARK USED ---
  const markQrAsUsedToday = async () => {
    if (!selectedQr || !selectedPaymentCardId) {
        alert("Select a card first to record the transaction!");
        return;
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // Calculate total generated amount or set a default if none generated
    const totalAmt = generatedAmounts.length > 0 ? generatedAmounts.reduce((a, b) => a + b, 0) : 1900;

    try {
        // 1. Update QR last used date
        await supabase.from('qrs').update({ last_used_date: today }).eq('id', selectedQr.id);

        // 2. Insert into Pending Transactions Automatically (Great for tracking!)
        await supabase.from('card_transactions').insert({
            card_id: selectedPaymentCardId,
            qr_id: selectedQr.id,
            amount: totalAmt,
            transaction_date: today,
            type: 'withdrawal',
            status: 'pending_settlement',
            recorded_by: currentUser?.id
        });

        setIsViewModalOpen(false);
        fetchLedgerData(accessibleCards, firstName);
        // Switch to pending tab to show the new transaction
        setActiveTab("pending");
    } catch (error: any) {
        alert("Failed to record transaction: " + error.message);
    }
  };

  // Timeline Grouping for History
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

      {/* ================= CYBER GLOWING BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b9810a_1px,transparent_1px),linear-gradient(to_bottom,#10b9810a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <motion.div animate={{ x: [0, 50, -40, 0], y: [0, 60, -50, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} className="absolute top-[-10%] right-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#10b981] opacity-[0.12] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ x: [0, -50, 50, 0], y: [0, -60, 60, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} className="absolute bottom-[5%] left-[-25%] w-[100vw] h-[100vw] rounded-full bg-[#0ea5e9] opacity-[0.12] blur-[130px] mix-blend-screen" />
      </div>

      {/* ================= THIN HEADER ================= */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
           <Link href="/settings">
             <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#10b981] to-[#0ea5e9] p-0.5 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
               <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                 {currentUser?.avatar_url && !imgError ? (
                   <img 
                      src={currentUser.avatar_url} 
                      alt="Profile" 
                      className="w-full h-full object-cover rounded-full" 
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
               className="bg-[length:200%_200%] bg-gradient-to-r from-[#10b981] via-[#0ea5e9] to-[#10b981] bg-clip-text"
             >
               <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">
                 Fund Management
               </p>
             </motion.div>
             <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
               Settlements
             </h1>
           </div>
        </div>

        {/* Global Card Selector */}
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

        {/* ================= DYNAMIC TABS ================= */}
        <div className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 flex items-center justify-between backdrop-blur-xl shadow-inner">
           {[
             { id: "pending", label: "In Transit" },
             { id: "history", label: "Settled History" },
             { id: "vault", label: "QR Vault" }
           ].map((tab) => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex-1 relative py-2.5 text-xs font-bold rounded-xl transition-all ${
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
              {/* ================= PENDING TAB ================= */}
              {activeTab === "pending" && (
                 <motion.div initial="hidden" animate="visible" className="space-y-4">
                    <div className="p-5 rounded-[24px] bg-gradient-to-br from-amber-500/10 to-rose-500/5 border border-amber-500/20 backdrop-blur-md shadow-inner flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Total Pending</p>
                          <p className="text-2xl font-black text-amber-400">₹{totalPendingAmount.toLocaleString()}</p>
                       </div>
                       <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                          <Banknote className="w-6 h-6 text-amber-400" />
                       </div>
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
                                         <h3 className="text-sm font-bold text-white truncate">{tx.qrs?.merchant_name || 'Unknown QR'}</h3>
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
                                   <Button size="sm" className="h-7 text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Settled
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

              {/* ================= HISTORY TAB ================= */}
              {activeTab === "history" && (
                 <motion.div initial="hidden" animate="visible" className="space-y-6 pb-6">
                    <AnimatePresence mode="popLayout">
                      {Object.entries(groupedHistory).map(([date, items]) => (
                         <div key={date} className="space-y-3">
                            <div className="sticky top-20 z-20 flex items-center gap-3">
                               <span className="px-3 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                  Settled On {date}
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
                                       <h3 className="text-sm font-bold text-slate-100 truncate">{item.qrs?.merchant_name}</h3>
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
                                   <div className="flex items-center gap-1 text-[#0ea5e9]"><User className="w-3 h-3"/> Held By: {item.settled_to_profile?.name.split(' ')[0] || 'Unknown'}</div>
                                </div>
                              </motion.div>
                            ))}
                         </div>
                      ))}
                    </AnimatePresence>
                 </motion.div>
              )}

              {/* ================= VAULT TAB (SECTIONS UPDATED) ================= */}
              {activeTab === "vault" && (
                 <motion.div initial="hidden" animate="visible" className="space-y-6 pb-6">

                    {/* SECTION 1: Recommended For Today */}
                    {recommendedQrs.length > 0 && (
                      <section>
                        <h2 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#34d399] uppercase tracking-wider flex items-center gap-2 mb-3">
                          <Sparkles className="w-4 h-4 text-[#10b981]" /> Recommended Today
                        </h2>
                        <div className="grid grid-cols-2 gap-3">
                           {recommendedQrs.map((qr) => {
                              const isDanger = firstName && qr.merchant_name.toLowerCase().includes(firstName);
                              return (
                                 <motion.div 
                                    key={qr.id} 
                                    onClick={() => { 
                                      setSelectedQr(qr); 
                                      setIsViewModalOpen(true); 
                                      setGeneratedAmounts([]);
                                      // Set default card dynamically 
                                      setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`flex flex-col bg-gradient-to-br from-white/[0.05] to-transparent border rounded-2xl overflow-hidden cursor-pointer shadow-inner backdrop-blur-md transition-all ${
                                       isDanger ? "border-red-500/50" : "border-[#10b981]/40"
                                    }`}
                                 >
                                    <div className="h-24 w-full relative bg-black/40 flex flex-col items-center justify-center overflow-hidden">
                                       {qr.qr_image_url ? (
                                          <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover opacity-80" />
                                       ) : (
                                          <QrCode className="w-8 h-8 text-slate-600" />
                                       )}
                                       <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                                       <span className="absolute top-1 right-1 text-[8px] font-black uppercase bg-[#10b981] text-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#10b981]">Best Pick</span>
                                    </div>
                                    <div className="p-3 relative z-10 flex-1 flex flex-col justify-between border-t border-white/5">
                                       <h3 className={`text-xs font-bold truncate ${isDanger ? 'text-red-400' : 'text-white'}`}>{qr.merchant_name}</h3>
                                       <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">{qr.platform} • {qr.settlement_time}</p>
                                    </div>
                                 </motion.div>
                              );
                           })}
                        </div>
                      </section>
                    )}

                    {/* SECTION 2: Dynamic Vault */}
                    <section>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] uppercase tracking-wider flex items-center gap-2">
                          <QrCode className="w-4 h-4 text-[#0ea5e9]" /> Dynamic Vault
                        </h2>
                      </div>
                      <div className="space-y-3">
                        {dynamicQrs.map((qr) => {
                          const isDanger = firstName && qr.merchant_name.toLowerCase().includes(firstName);
                          return (
                            <motion.div key={qr.id}
                              onClick={() => { 
                                setSelectedQr(qr); 
                                setIsViewModalOpen(true); 
                                setGeneratedAmounts([]);
                                setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                              }}
                              className={`relative p-3 rounded-[20px] backdrop-blur-lg flex items-center justify-between cursor-pointer transition-all ${
                                isDanger ? "bg-red-500/5 border border-red-500/30" : "bg-white/[0.02] border border-white/5 hover:bg-white/[0.05]"
                              } ${qr.status === 'on_hold' ? 'opacity-60 grayscale' : ''}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center overflow-hidden relative border ${isDanger ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-black/40"}`}>
                                  {qr.qr_image_url ? (
                                    <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover" />
                                  ) : (
                                    <QrCode className="w-5 h-5 text-slate-500" />
                                  )}
                                </div>
                                <div>
                                  <h3 className={`text-sm font-bold ${isDanger ? "text-red-400" : "text-white"}`}>{qr.merchant_name}</h3>
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mt-0.5">
                                    <span className="text-slate-400">{qr.platform}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                                    <span className={qr.last_used_date ? "text-emerald-500/80" : "text-slate-400"}>
                                      {qr.last_used_date ? `Used ${new Date(qr.last_used_date).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}` : 'New'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => openEditQrModal(qr)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                                  <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                                <Switch checked={qr.status === 'active'} onCheckedChange={() => toggleQrStatus(qr.id, qr.status)} className="scale-75 origin-right data-[state=checked]:bg-[#0ea5e9]" />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </section>

                    {/* SECTION 3: Static Vault */}
                    {staticQrs.length > 0 && (
                      <section className="pt-2">
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-slate-400" /> Static Vault
                          </h2>
                          <Button onClick={() => openAddQrModal(true)} size="sm" className="h-7 px-3 bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 text-[10px] font-bold rounded-lg">
                            <Plus className="w-3 h-3 mr-1" /> Add Static
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {staticQrs.map((qr) => (
                            <div key={qr.id} className="p-3 bg-white/[0.02] border border-white/10 rounded-[20px] backdrop-blur-md relative group">
                              <button onClick={() => openEditQrModal(qr)} className="absolute top-2 right-2 p-2 bg-black/60 rounded-xl border border-white/10 z-10">
                                <Edit3 className="w-3.5 h-3.5 text-white" />
                              </button>
                              <div className="w-full aspect-square rounded-[12px] overflow-hidden bg-black/40 mb-2 relative border border-white/5 shadow-inner">
                                {qr.qr_image_url ? (
                                  <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover" />
                                ) : (
                                  <QrCode className="w-6 h-6 text-slate-600 absolute inset-0 m-auto" />
                                )}
                              </div>
                              <h3 className="text-xs font-bold text-slate-200 truncate">{qr.merchant_name}</h3>
                              <p className="text-[10px] font-medium text-slate-500 truncate">{qr.upi_id}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                 </motion.div>
              )}
           </>
        )}
      </main>

      {/* ================= FLOATING ACTION BUTTON ================= */}
      {activeTab === "vault" && (
         <motion.button
           onClick={() => openAddQrModal(false)}
           whileHover={{ scale: 1.05 }}
           whileTap={{ scale: 0.95 }}
           className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#10b981] to-[#0ea5e9] flex items-center justify-center shadow-[0_10px_40px_rgba(16,185,129,0.6)] border border-white/20 z-40"
         >
           <Plus className="w-7 h-7 text-white" />
         </motion.button>
      )}

      {/* ================= SETTLE MODAL ================= */}
      <Dialog open={isSettleModalOpen} onOpenChange={setIsSettleModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#10b981]/20 rounded-full blur-[50px] pointer-events-none" />
          <DialogHeader className="mb-6 relative z-10">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#10b981] to-[#34d399] bg-clip-text text-transparent">
              Process Settlement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 relative z-10">
             <div className="text-center p-5 bg-white/[0.02] border border-white/10 rounded-[24px] shadow-inner">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Received</p>
                <p className="text-4xl font-black text-white">₹{settleTx?.amount.toLocaleString()}</p>
             </div>
             <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1.5">
                   <User className="w-3.5 h-3.5 text-[#0ea5e9]" /> Who is keeping this cash?
                </label>
                <div className="relative">
                   <select value={cashReceiverId} onChange={(e) => setCashReceiverId(e.target.value)} className="w-full h-14 bg-white/[0.05] border border-[#0ea5e9]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none">
                      {profiles.map(p => (
                         <option key={p.id} value={p.id} className="bg-black">{p.name}</option>
                      ))}
                   </select>
                   <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0ea5e9] pointer-events-none" />
                </div>
             </div>
             <Button onClick={handleConfirmSettlement} disabled={isSettling} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#34d399] hover:opacity-90 text-black font-black text-lg border-0 mt-4">
               {isSettling ? "Processing..." : "Confirm Settlement"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= ADD/EDIT QR MODAL ================= */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="mb-4 relative z-10">
            <DialogTitle className="text-xl font-space font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">
              {editingQr ? "Edit QR Details" : (isAddingStatic ? "Add Static QR" : "Add Active QR")}
            </DialogTitle>
            <DialogDescription className="hidden">QR Add Edit Form</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 relative z-10">
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Merchant Name</label>
                <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 focus-within:border-[#0ea5e9]">
                   <input type="text" value={newQrName} onChange={(e) => setNewQrName(e.target.value)} placeholder="e.g. JioMart Kiosk" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">UPI ID {isAddingStatic && "(Optional)"}</label>
                <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 focus-within:border-[#0ea5e9]">
                   <input type="text" value={newUpiId} onChange={(e) => setNewUpiId(e.target.value)} placeholder="merchant@upi" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                </div>
             </div>

             {!isAddingStatic && (
               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                     <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Platform</label>
                     <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none">
                        <option value="PhonePe" className="bg-black">PhonePe</option>
                        <option value="BharatPe" className="bg-black">BharatPe</option>
                        <option value="Paytm" className="bg-black">Paytm</option>
                        <option value="Google Pay" className="bg-black">Google Pay</option>
                     </select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Settlement</label>
                     <select value={newSettlementTime} onChange={(e) => setNewSettlementTime(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none">
                        <option value="Instant" className="bg-black">Instant</option>
                        <option value="T+1" className="bg-black">T+1 Day</option>
                        <option value="T+2" className="bg-black">T+2 Days</option>
                     </select>
                  </div>
               </div>
             )}

             {/* QR Image Upload (Restored & Improved) */}
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Upload QR Photo</label>
                <div className="relative flex items-center bg-white/[0.02] border border-white/10 border-dashed rounded-2xl h-14 px-4 overflow-hidden hover:bg-white/[0.05] transition-colors cursor-pointer">
                  <Upload className="w-4 h-4 text-[#0ea5e9] mr-3" />
                  <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  <span className="text-xs font-bold text-slate-300 truncate">{file ? file.name : (editingQr?.qr_image_url ? "Change existing image..." : "Tap to select photo...")}</span>
                </div>
             </div>

             <Button onClick={handleSaveQR} disabled={uploading} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(14,165,233,0.4)] border-0 mt-4">
               {uploading ? "Saving & Uploading..." : "Save Details"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= ADVANCED QR PAYMENT MODAL ================= */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-5 pb-3 relative border-b border-white/5">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0ea5e9]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader className="mb-2">
              <DialogTitle className="text-xl font-space font-black text-white leading-tight">
                {selectedQr?.merchant_name}
              </DialogTitle>
              <DialogDescription className="hidden">QR View</DialogDescription>
              <p className="text-xs text-[#0ea5e9] font-bold">{selectedQr?.upi_id}</p>
            </DialogHeader>

            {firstName && selectedQr?.merchant_name.toLowerCase().includes(firstName) && (
              <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 p-2.5 rounded-xl text-red-400 text-[10px] font-bold shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                This QR matches your name. High risk of rotation block!
              </div>
            )}
          </div>

          <div className="p-5 max-h-[60vh] overflow-y-auto space-y-5 custom-scrollbar">

            {/* QR Image Display */}
            <div className="w-40 h-40 mx-auto bg-white rounded-[24px] p-2 shadow-[0_0_50px_rgba(255,255,255,0.15)] relative overflow-hidden border-4 border-white/10">
              {selectedQr?.qr_image_url ? (
                <img src={selectedQr.qr_image_url} alt="QR" className="w-full h-full object-cover rounded-[16px]" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-slate-100 rounded-[16px] flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-slate-300" />
                </div>
              )}
            </div>

            {selectedQr?.status !== 'static' && (
              <div className="space-y-4 bg-white/[0.02] p-4 rounded-[20px] border border-white/5 shadow-inner">

                {/* Card Selector for Payment Tracking */}
                <div className="space-y-1.5 pb-3 border-b border-white/5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5"><CreditCard className="w-3 h-3"/> Paying From Card</label>
                   <div className="relative">
                      <select 
                         value={selectedPaymentCardId}
                         onChange={(e) => setSelectedPaymentCardId(e.target.value)}
                         className="w-full h-10 bg-white/[0.05] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none appearance-none focus:border-[#0ea5e9]"
                      >
                         {accessibleCards.map(c => (
                            <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
                         ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                   </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300">Payment Strategy</span>
                  <div className="flex bg-black/60 p-1 rounded-lg border border-white/5">
                    <button onClick={() => { setPaymentMode("once"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "once" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Once</button>
                    <button onClick={() => { setPaymentMode("multiple"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "multiple" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Multiple</button>
                  </div>
                </div>

                {paymentMode === "multiple" && (
                  <div className="flex items-center justify-between py-1 border-t border-white/5">
                    <span className="text-[10px] font-bold text-slate-400">Number of swipes:</span>
                    <div className="relative">
                      <select value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))} className="appearance-none bg-white/5 border border-white/10 text-white text-[10px] font-bold py-1.5 pl-2 pr-6 rounded-lg outline-none">
                        <option value={2} className="bg-[#050505]">2 Times</option>
                        <option value={3} className="bg-[#050505]">3 Times</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                <Button onClick={generatePaymentAmounts} className="w-full h-10 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-black transition-all font-black text-xs mt-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Links
                </Button>

                {generatedAmounts.length > 0 && (
                  <div className="pt-3 space-y-2 border-t border-white/10">
                    {generatedAmounts.map((amt, i) => (
                      <a key={i} href={`upi://pay?pa=${selectedQr?.upi_id || ''}&pn=${encodeURIComponent(selectedQr?.merchant_name || '')}&am=${amt}&cu=INR`} className="flex items-center justify-between w-full p-3 bg-gradient-to-r from-[#10b981]/15 to-transparent border border-[#10b981]/30 rounded-xl hover:border-[#10b981]/60 transition-all group">
                        <span className="text-xs font-black text-emerald-400 group-hover:text-emerald-300">Pay ₹{amt}</span>
                        <ArrowRight className="w-4 h-4 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-black/60 border-t border-white/5 rounded-b-[40px] backdrop-blur-xl">
             {selectedQr?.status !== 'static' ? (
                <Button onClick={markQrAsUsedToday} className="w-full h-12 rounded-2xl bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981] hover:text-black transition-all font-bold border border-[#10b981]/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Used & Record Transaction
                </Button>
             ) : (
                <Button onClick={() => setIsViewModalOpen(false)} className="w-full h-12 rounded-2xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all font-bold border border-white/10">
                  Close Viewer
                </Button>
             )}
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}