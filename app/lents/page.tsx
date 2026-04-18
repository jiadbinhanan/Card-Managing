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
  Wallet,
  CreditCard,
  Banknote,
  Edit3,
  ChevronDown,
  CalendarDays,
  ShieldCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// --- Interfaces ---
interface LentRecord {
  id: string;
  borrower_name: string;
  amount: number;
  lent_date: string;
  due_date: string;
  status: string;
  given_by: string;
  funding_source: string;
  remarks: string;
  created_at: string;
  card_id?: string;
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
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]); // Header dropdown cards

  const [userCashMap, setUserCashMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [imgError, setImgError] = useState(false);

  // Global Header State
  const { globalSelectedCardId, setGlobalSelectedCardId } = useCardStore();

  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form States
  const [borrowerName, setBorrowerName] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState<"cash_on_hand" | "credit_card">("cash_on_hand");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [givenByUserId, setGivenByUserId] = useState("");
  const [lentDate, setLentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();

    const channel = supabase.channel('lents_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'short_term_lents' }, () => fetchLentsData(allCards))
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
     if (now > target) {
       target = new Date(now.getFullYear(), now.getMonth() + 1, 26);
     }
     return target.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Global Data Fetch
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
         setGivenByUserId(myProfile.id);
      }

      // Cards accessible to Logged In User for Header Filter
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

    // If a specific card is selected, show only lents funded by that card family
    if (globalSelectedCardId !== 'all' && targetCardIds.length > 0) {
       lentsQuery = lentsQuery.in('card_id', targetCardIds);
    }

    const { data: lData } = await lentsQuery;
    if (lData) setLents(lData as any);

    // Fetch Cash for all users
    const { data: coh } = await supabase.from('cash_on_hand').select('*');
    const cashMap: Record<string, number> = {};
    coh?.forEach(c => { cashMap[c.user_id] = Number(c.current_balance); });
    setUserCashMap(cashMap);
  };

  // --- MODAL DYNAMIC CARD LIST ---
  const entryUserAccessibleCardIds = allCardAccess.filter(a => a.user_id === givenByUserId).map(a => a.card_id);
  const entryUserCards = allCards.filter(c => entryUserAccessibleCardIds.includes(c.id)).sort((a,b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  const handleSaveLent = async () => {
    const amtNum = Number(amount);
    if (!borrowerName || isNaN(amtNum) || amtNum <= 0 || !dueDate || !lentDate) {
      alert("Please fill all details correctly.");
      return;
    }

    const actorCash = userCashMap[givenByUserId] || 0;

    if (fundSource === 'cash_on_hand' && amtNum > actorCash) {
       alert(`The selected user only has ₹${actorCash} in collected cash.`);
       return;
    }

    if (fundSource === 'credit_card' && !selectedCardId) {
       alert("Please select a card to swipe from.");
       return;
    }

    setIsSaving(true);

    try {
      // 1. Record the Lent
      const { error: lentError } = await supabase.from('short_term_lents').insert({
        borrower_name: borrowerName,
        amount: amtNum,
        lent_date: lentDate,
        due_date: dueDate,
        status: 'unpaid',
        given_by: givenByUserId,
        funding_source: fundSource,
        remarks: remarks,
        card_id: fundSource === 'credit_card' ? selectedCardId : null
      });

      if (lentError) throw lentError;

      // 2. Process Deductions & Spends
      if (fundSource === 'cash_on_hand') {
         await supabase.from('cash_on_hand').upsert({ user_id: givenByUserId, current_balance: actorCash - amtNum });
      } else if (fundSource === 'credit_card') {
         await supabase.from('spends').insert({
            user_id: givenByUserId,
            amount: amtNum,
            spend_type: 'personal', 
            payment_method: 'credit_card',
            remarks: `Lent to ${borrowerName}${remarks ? ` - ${remarks}` : ''}`,
            spend_date: lentDate, // Match the lent date
            card_id: selectedCardId
         });
      }

      setIsModalOpen(false);
      fetchLentsData(allCards);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const markAsPaid = async (id: string) => {
     try {
        await supabase.from('short_term_lents').update({ status: 'paid' }).eq('id', id);
        fetchLentsData(allCards);
     } catch (error: any) {
        alert("Error updating status: " + error.message);
     }
  };

  const openEntryModal = () => {
    setBorrowerName("");
    setAmount("");
    setRemarks("");
    setFundSource("cash_on_hand");
    setGivenByUserId(currentUser?.id || "");
    setLentDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    setDueDate(getDefaultDueDate());

    // Auto-select card if a specific one is chosen in global filter
    if (globalSelectedCardId !== 'all') {
       setSelectedCardId(globalSelectedCardId);
    } else {
       setSelectedCardId(entryUserCards.length > 0 ? entryUserCards[0].id : "");
    }

    setIsModalOpen(true);
  };

  const totalReceivable = lents.filter(l => l.status === "unpaid").reduce((acc, curr) => acc + Number(curr.amount), 0);

  const toggleExpand = (id: string) => {
     setExpandedId(expandedId === id ? null : id);
  };

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

      {/* ================= HEADER (WITH AVATAR & CARD SELECTOR) ================= */}
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
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Receivable</span>
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
                  const isUnpaid = loan.status === "unpaid";
                  const daysToDue = Math.ceil((new Date(loan.due_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  const isUrgent = isUnpaid && daysToDue <= 3;
                  const displayDate = loan.lent_date || loan.created_at.split('T')[0]; // Fallback to created_at if lent_date is missing

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
                      } ${!isUnpaid ? "opacity-60 grayscale-[30%] hover:grayscale-0 hover:opacity-100" : ""}`}
                    >
                      {/* Top Compact View */}
                      <div className="flex justify-between items-center relative z-10 w-full">
                        <div className="flex items-center gap-3 w-[65%]">
                          <div className={`w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center border border-white/5 shadow-inner ${isUnpaid ? 'bg-[#f59e0b]/10' : 'bg-emerald-500/10'}`}>
                            <User className={`w-5 h-5 ${isUnpaid ? 'text-[#f59e0b]' : 'text-emerald-400'}`} />
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
                            ₹{loan.amount.toLocaleString('en-IN')}
                            <ChevronDown className={`w-3.5 h-3.5 opacity-50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                          {isUnpaid ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#ef4444]/10 text-[#ef4444] px-1.5 py-0.5 rounded border border-[#ef4444]/20">
                              Unpaid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#10b981]/10 text-[#10b981] px-1.5 py-0.5 rounded border border-[#10b981]/20">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                           </span>
                          )}
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
                               <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs mb-4">
                                  <div>
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Funded From</p>
                                     <p className="font-bold text-slate-200 flex items-center gap-1">
                                        {loan.funding_source === 'credit_card' ? <><CreditCard className="w-3.5 h-3.5 text-indigo-400"/> Card Swipe</> : <><Banknote className="w-3.5 h-3.5 text-amber-400"/> Held Cash</>}
                                     </p>
                                  </div>
                                  <div>
                                     <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Given By</p>
                                     <p className="font-bold text-slate-200">{loan.profiles?.name.split(' ')[0] || 'Unknown'}</p>
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

                               {isUnpaid && (
                                  <Button 
                                    onClick={(e) => { e.stopPropagation(); markAsPaid(loan.id); }}
                                    className="w-full h-10 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all"
                                  >
                                     <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Settled & Paid
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

      {/* ================= ADD LENT FAB & MODAL ================= */}
      <motion.button
        onClick={openEntryModal}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#f59e0b] to-[#ef4444] flex items-center justify-center text-white shadow-[0_10px_40px_rgba(245,158,11,0.6)] border border-white/20 z-40"
      >
        <Plus className="w-7 h-7" />
      </motion.button>

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

              {/* Date & Given By Row */}
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
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Given By User</label>
                   <div className="relative">
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <select 
                         value={givenByUserId} 
                         onChange={(e) => setGivenByUserId(e.target.value)}
                         className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold text-white pl-3 pr-8 outline-none focus:border-[#f59e0b] transition-all appearance-none"
                      >
                         {allProfiles.map(p => (
                            <option key={p.id} value={p.id} className="bg-black">{p.name.split(' ')[0]}</option>
                         ))}
                      </select>
                   </div>
                </div>
              </div>

              {/* Funding Source */}
              <div className="space-y-1.5">
                 <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">
                    Funding Source <span className="text-[9px] lowercase text-[#f59e0b]">(How did you pay them?)</span>
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
                     <span className="text-[9px] font-black opacity-70">Bal: ₹{(userCashMap[givenByUserId] || 0).toLocaleString()}</span>
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
                     <span className="text-[9px] font-black opacity-70">Creates a Spend Entry</span>
                   </button>
                 </div>
              </div>

              {/* If Card Swipe, Select Card (Filtered by selected User) */}
              <AnimatePresence>
                 {fundSource === 'credit_card' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                       <label className="text-[11px] font-bold text-indigo-400 uppercase ml-1 flex items-center gap-1.5">
                         <CreditCard className="w-3.5 h-3.5" /> Attach Card
                       </label>
                       <div className="relative">
                          <select 
                             value={selectedCardId} 
                             onChange={(e) => setSelectedCardId(e.target.value)}
                             className="w-full h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-indigo-400 appearance-none shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                          >
                             <option value="" disabled className="bg-black text-slate-500">Select a Card to swipe...</option>
                             {entryUserCards.map(c => (
                                <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>
                             ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>

              {/* Due Date & Remarks */}
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Remarks</label>
                   <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-xl h-12 px-3 focus-within:border-[#f59e0b] transition-colors">
                      <Edit3 className="w-3.5 h-3.5 text-slate-500 mr-2" />
                      <input 
                         type="text" 
                         value={remarks} 
                         onChange={(e) => setRemarks(e.target.value)} 
                         placeholder="Optional details"
                         className="bg-transparent border-none outline-none w-full text-[11px] font-bold text-white placeholder:text-slate-600"
                      />
                   </div>
                </div>
              </div>

              <div className="pt-4">
                <Button 
                  onClick={handleSaveLent}
                  disabled={isSaving}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(245,158,11,0.4)] border-0 disabled:opacity-50 transition-all"
                >
                  {isSaving ? "Saving Record..." : "Confirm Lending"}
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