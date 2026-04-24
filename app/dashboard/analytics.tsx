"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Banknote, ArrowDownLeft, Receipt, ChevronDown, Filter, X, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

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

interface AnalyticsProps {
  userStats: UserStat[];
  selectedCardId: string;
  accessibleCards: CardData[];
}

interface CashTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  transaction_date: string;
  remarks: string;
}

interface DueTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  remarks: string;
}

export default function DashboardAnalytics({ userStats, selectedCardId, accessibleCards }: AnalyticsProps) {
  const [selectedUserStat, setSelectedUserStat] = useState<UserStat | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<"summary" | "cash_ledger" | "due_ledger">("summary");
  const [dateFilter, setDateFilter] = useState<"all" | "this_month" | "last_month">("all");
  const [statImgError, setStatImgError] = useState<Record<string, boolean>>({});

  const [cashLedger, setCashLedger] = useState<CashTransaction[]>([]);
  const [dueLedger, setDueLedger] = useState<DueTransaction[]>([]);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const [totalUserCash, setTotalUserCash] = useState<number>(0);

  // Grouping helper function
  const groupByMonth = <T,>(data: T[], dateField: keyof T) => {
    return data.reduce((acc, item) => {
      const dateVal = item[dateField] as unknown as string;
      const date = new Date(dateVal);
      const monthYear = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  async function fetchLedgers(userId: string, filter: string) {
    let startDate = new Date(0).toISOString();
    let endDate = new Date().toISOString();
    const now = new Date();

    if (filter === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (filter === 'last_month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString(); 
    }

    // --- Determine active cards based on header selection ---
    let activeCardIds: string[] = [];
    if (selectedCardId !== 'all') {
      const selected = accessibleCards.find(c => c.id === selectedCardId);
      if (selected) {
         const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
         const familyCards = accessibleCards.filter(c => c.id === primaryId || c.parent_card_id === primaryId);
         activeCardIds = familyCards.map(c => c.id);
      }
    }

    // 1. Cash Ledger Fetch (with card filter)
    let cLedgerQuery = supabase.from('cash_on_hand_ledger')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (activeCardIds.length > 0) {
      cLedgerQuery = cLedgerQuery.in('card_id', activeCardIds);
    }

    const { data: cLedger } = await cLedgerQuery;
    if (cLedger) setCashLedger(cLedger as CashTransaction[]);

    // 2. Dynamic Total Cash Logic Based on Selection
    let userCohQuery = supabase.from('cash_on_hand').select('current_balance').eq('user_id', userId);

    if (activeCardIds.length > 0) {
       userCohQuery = userCohQuery.in('card_id', activeCardIds);
    }

    const { data: userCoh } = await userCohQuery;

    if(userCoh) {
       const sum = userCoh.reduce((acc, curr) => acc + Number(curr.current_balance || 0), 0);
       setTotalUserCash(sum);
    } else {
       setTotalUserCash(0);
    }

    // 3. Due Ledger Fetch: Spends (with card filter)
    let spendsQuery = supabase.from('spends')
      .select('id, amount, spend_date, remarks')
      .eq('user_id', userId)
      .gte('spend_date', startDate)
      .lte('spend_date', endDate);

    if (activeCardIds.length > 0) {
      spendsQuery = spendsQuery.in('card_id', activeCardIds);
    }
    const { data: spends } = await spendsQuery;

    // 4. Due Ledger Fetch: Repayments (with card filter)
    let txsQuery = supabase.from('card_transactions')
      .select('id, amount, transaction_date, remarks')
      .eq('recorded_by', userId)
      .eq('type', 'bill_payment')
      .eq('payment_method', 'own_pocket')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (activeCardIds.length > 0) {
      txsQuery = txsQuery.in('card_id', activeCardIds);
    }
    const { data: txsData } = await txsQuery;

    // Combine due ledgers
    const combinedDue: DueTransaction[] = [];
    if (spends) spends.forEach(s => combinedDue.push({ id: `s-${s.id}`, type: 'spend', amount: s.amount, date: s.spend_date, remarks: s.remarks || 'Personal Spend' }));
    if (txsData) txsData.forEach(t => combinedDue.push({ id: `t-${t.id}`, type: 'repayment', amount: t.amount, date: t.transaction_date, remarks: t.remarks || 'Bill Paid (Repayment)' }));

    combinedDue.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setDueLedger(combinedDue);
  }

  useEffect(() => {
    if (selectedUserStat) {
      fetchLedgers(selectedUserStat.id, dateFilter);
    }
  }, [selectedUserStat, dateFilter, selectedCardId, accessibleCards]);

  const handleUserStatClick = (stat: UserStat) => {
    setSelectedUserStat(stat);
    setUserModalTab("summary");
    setDateFilter("all");
    setExpandedTxId(null);
    setIsUserModalOpen(true);
  };

  const toggleExpand = (id: string) => {
     setExpandedTxId(prev => prev === id ? null : id);
  };

  const groupedCashLedger = groupByMonth(cashLedger, 'transaction_date');
  const groupedDueLedger = groupByMonth(dueLedger, 'date');

  const isLoading = userStats.length === 0;
  const displayStats = isLoading ? [
      { id: 'ghost1', name: 'Loading', cash: 0, due: 0 },
      { id: 'ghost2', name: 'Loading', cash: 0, due: 0 }
  ] : userStats;

  return (
    <motion.section 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.3 }} 
      className="mb-8 relative z-10"
    >
      <div className="flex items-center gap-2 mb-4 px-1">
        <Banknote className="w-4 h-4 text-[#10b981]" />
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
          Cash & Repayment Analytics
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {displayStats.map((stat, i) => (
          <motion.div 
            key={stat.id} 
            whileHover={!isLoading ? { scale: 1.02 } : {}}
            whileTap={!isLoading ? { scale: 0.98 } : {}}
            onClick={() => !isLoading && handleUserStatClick(stat as UserStat)}
            className={`bg-white/[0.03] border border-white/10 rounded-[24px] p-5 backdrop-blur-xl relative overflow-hidden flex flex-col shadow-inner ${isLoading ? 'animate-pulse' : 'group hover:bg-white/[0.06] transition-all cursor-pointer'}`}
          >
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-[30px] opacity-30 ${i===0 ? 'bg-[#0ea5e9]' : 'bg-[#a855f7]'}`} />

            <div className="flex items-center gap-2 mb-4 relative z-10">
               <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden border ${i===0 ? 'border-[#0ea5e9]' : 'border-[#a855f7]'}`}>
                  {isLoading ? (
                     <div className="w-full h-full bg-slate-700/50" />
                  ) : stat.avatar_url && !statImgError[stat.id] ? (
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
               {isLoading ? (
                  <div className="h-4 w-16 bg-slate-700/50 rounded" />
               ) : (
                  <h3 className="text-sm font-black text-white truncate max-w-[80px]">{stat.name}</h3>
               )}
            </div>

            <div className="space-y-3 relative z-10 mt-auto">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Holding Cash</p>
                {isLoading ? (
                   <div className="h-6 w-20 bg-slate-700/50 rounded mt-1" />
                ) : (
                   <motion.p 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                      className={`text-lg font-black tracking-tight ${stat.cash > 0 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-slate-300'}`}
                   >
                     ₹{stat.cash.toLocaleString()}
                   </motion.p>
                )}
              </div>
              <div className="pt-3 border-t border-white/10">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Personal Due</p>
                {isLoading ? (
                   <div className="h-5 w-16 bg-slate-700/50 rounded mt-1" />
                ) : (
                   <motion.p 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                      className={`text-base font-black tracking-tight ${stat.due > 0 ? 'text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-slate-400'}`}
                   >
                     ₹{stat.due.toLocaleString()}
                   </motion.p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="bg-[#030014]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-lg w-[95vw] p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] [&>button]:hidden outline-none">

          <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-[#0ea5e9] opacity-[0.1] blur-[80px] mix-blend-screen pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#a855f7] opacity-[0.1] blur-[80px] mix-blend-screen pointer-events-none" />

          <div className="p-6 relative border-b border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent">
            <DialogHeader>
              <div className="flex items-center justify-between relative z-10">
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-black">
                       {selectedUserStat?.avatar_url && !statImgError[selectedUserStat.id] ? (
                          <img src={selectedUserStat.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" />
                       ) : (
                          <span className="text-sm font-bold text-white">{selectedUserStat?.name?.charAt(0)}</span>
                       )}
                    </div>
                    <div>
                       <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent leading-tight">
                         {selectedUserStat?.name}&apos;s Ledger
                       </DialogTitle>
                       <p className="text-[10px] text-[#a855f7] font-bold uppercase tracking-wider mt-0.5">Advanced Analytics</p>
                    </div>
                 </div>

                 <Button variant="ghost" size="icon" onClick={() => setIsUserModalOpen(false)} className="rounded-full bg-white/5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 border border-white/5 focus:outline-none">
                    <X className="w-5 h-5" />
                 </Button>
              </div>
            </DialogHeader>
          </div>

          <div className="flex flex-col bg-white/[0.02] border-b border-white/5 relative z-10">
             <div className="flex p-2 gap-2 overflow-x-auto custom-scrollbar">
                <button onClick={() => setUserModalTab("summary")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "summary" ? "bg-white/10 text-white border border-white/20 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>Summary</button>
                <button onClick={() => setUserModalTab("cash_ledger")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "cash_ledger" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>Cash In/Out</button>
                <button onClick={() => setUserModalTab("due_ledger")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "due_ledger" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>Personal Due</button>
             </div>

             {userModalTab !== 'summary' && (
                <div className="px-4 pb-3 pt-1 flex items-center justify-end">
                   <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-sm">
                      <Filter className="w-3 h-3 text-slate-400" />
                      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} className="bg-transparent text-[10px] font-bold text-slate-300 outline-none cursor-pointer appearance-none pr-4">
                         <option value="all" className="bg-[#050505]">All Time</option>
                         <option value="this_month" className="bg-[#050505]">This Month</option>
                         <option value="last_month" className="bg-[#050505]">Last Month</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 -ml-3 pointer-events-none" />
                   </div>
                </div>
             )}
          </div>

          <div className="p-4 sm:p-6 h-[55vh] overflow-y-auto custom-scrollbar relative z-10">
            <AnimatePresence mode="wait">
               {userModalTab === "summary" && (
                  <motion.div key="summary" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{duration: 0.2}} className="space-y-4">
                     <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden backdrop-blur-md">
                        <Banknote className="absolute -bottom-4 -right-4 w-24 h-24 text-emerald-500/20 rotate-12 pointer-events-none" />
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Cash In Hand</p>

                        <p className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">₹{totalUserCash.toLocaleString()}</p>
                        <p className="text-xs font-medium text-emerald-500/70 mt-2 flex items-center gap-1.5">
                           <ArrowDownLeft className="w-3.5 h-3.5"/> 
                           {selectedCardId === 'all' ? 'All cards aggregated balance' : 'Selected card context balance'}
                        </p>
                     </div>
                     <div className="bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(244,63,94,0.1)] relative overflow-hidden backdrop-blur-md">
                        <Receipt className="absolute -bottom-4 -right-4 w-24 h-24 text-rose-500/20 -rotate-12 pointer-events-none" />
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Total Personal Due</p>
                        <p className="text-4xl font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.4)]">₹{selectedUserStat?.due.toLocaleString()}</p>
                        <p className="text-xs font-medium text-rose-500/70 mt-2 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5"/> Total remaining debt to clear</p>
                     </div>
                  </motion.div>
               )}

               {userModalTab === "cash_ledger" && (
                  <motion.div key="cash_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{duration: 0.2}}>
                     {Object.keys(groupedCashLedger).length > 0 ? Object.entries(groupedCashLedger).map(([month, txs]) => (
                        <div key={month} className="mb-6">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">{month}</h4>
                           <div className="space-y-2">
                              {txs.map((tx: CashTransaction) => (
                                 <motion.div 
                                    layout
                                    key={tx.id} 
                                    onClick={() => toggleExpand(tx.id)}
                                    className="bg-white/[0.03] border border-white/5 rounded-[20px] hover:bg-white/[0.06] transition-colors cursor-pointer overflow-hidden backdrop-blur-sm"
                                 >
                                    <div className="flex items-center justify-between p-4">
                                       <div className="flex items-center gap-3">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.transaction_type === 'credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]'}`}>
                                             {tx.transaction_type === 'credit' ? <ArrowDownLeft className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                                          </div>
                                          <div className="w-[160px] sm:w-[200px]">
                                             <p className="text-sm font-bold text-white truncate">{tx.remarks || 'Cash Transaction'}</p>
                                             <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{new Date(tx.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • {new Date(tx.transaction_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                          <p className={`text-base font-black ${tx.transaction_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                             {tx.transaction_type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                                          </p>
                                          <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${expandedTxId === tx.id ? 'rotate-90' : ''}`} />
                                       </div>
                                    </div>

                                    <AnimatePresence>
                                       {expandedTxId === tx.id && (
                                          <motion.div 
                                             initial={{ height: 0, opacity: 0 }}
                                             animate={{ height: "auto", opacity: 1 }}
                                             exit={{ height: 0, opacity: 0 }}
                                             className="px-4 pb-4 pt-1 border-t border-white/5"
                                          >
                                             <div className="bg-black/40 rounded-xl p-3 space-y-2 text-xs">
                                                <div className="flex justify-between">
                                                   <span className="text-slate-500 font-medium">Type:</span>
                                                   <span className={tx.transaction_type === 'credit' ? 'text-emerald-400 font-bold uppercase' : 'text-rose-400 font-bold uppercase'}>{tx.transaction_type}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                   <span className="text-slate-500 font-medium">Amount:</span>
                                                   <span className="text-white font-bold">₹{tx.amount.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-start">
                                                   <span className="text-slate-500 font-medium">Remarks:</span>
                                                   <span className="text-slate-300 text-right max-w-[200px]">{tx.remarks || 'N/A'}</span>
                                                </div>
                                             </div>
                                          </motion.div>
                                       )}
                                    </AnimatePresence>
                                 </motion.div>
                              ))}
                           </div>
                        </div>
                     )) : (
                        <div className="text-center py-10 bg-white/[0.02] border border-white/5 rounded-3xl mt-4">
                           <Banknote className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                           <p className="text-xs font-bold text-slate-500">No cash transactions in this period.</p>
                        </div>
                     )}
                  </motion.div>
               )}

               {userModalTab === "due_ledger" && (
                  <motion.div key="due_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{duration: 0.2}}>
                     {Object.keys(groupedDueLedger).length > 0 ? Object.entries(groupedDueLedger).map(([month, txs]) => (
                        <div key={month} className="mb-6">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">{month}</h4>
                           <div className="space-y-2">
                              {txs.map((tx: DueTransaction) => (
                                 <motion.div 
                                    layout
                                    key={tx.id} 
                                    onClick={() => toggleExpand(tx.id)}
                                    className="bg-white/[0.03] border border-white/5 rounded-[20px] hover:bg-white/[0.06] transition-colors cursor-pointer overflow-hidden backdrop-blur-sm"
                                 >
                                    <div className="flex items-center justify-between p-4">
                                       <div className="flex items-center gap-3">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.type === 'spend' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'}`}>
                                             {tx.type === 'spend' ? <Receipt className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                          </div>
                                          <div className="w-[160px] sm:w-[200px]">
                                             <p className="text-sm font-bold text-white truncate">{tx.remarks}</p>
                                             <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                          <p className={`text-base font-black ${tx.type === 'spend' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                             {tx.type === 'spend' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                                          </p>
                                          <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${expandedTxId === tx.id ? 'rotate-90' : ''}`} />
                                       </div>
                                    </div>

                                    <AnimatePresence>
                                       {expandedTxId === tx.id && (
                                          <motion.div 
                                             initial={{ height: 0, opacity: 0 }}
                                             animate={{ height: "auto", opacity: 1 }}
                                             exit={{ height: 0, opacity: 0 }}
                                             className="px-4 pb-4 pt-1 border-t border-white/5"
                                          >
                                             <div className="bg-black/40 rounded-xl p-3 space-y-2 text-xs">
                                                <div className="flex justify-between">
                                                   <span className="text-slate-500 font-medium">Record Type:</span>
                                                   <span className={tx.type === 'spend' ? 'text-rose-400 font-bold uppercase' : 'text-emerald-400 font-bold uppercase'}>
                                                      {tx.type === 'spend' ? 'Added Due' : 'Paid Back'}
                                                   </span>
                                                </div>
                                                <div className="flex justify-between">
                                                   <span className="text-slate-500 font-medium">Amount:</span>
                                                   <span className="text-white font-bold">₹{tx.amount.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-start">
                                                   <span className="text-slate-500 font-medium">Details:</span>
                                                   <span className="text-slate-300 text-right max-w-[200px]">{tx.remarks}</span>
                                                </div>
                                             </div>
                                          </motion.div>
                                       )}
                                    </AnimatePresence>
                                 </motion.div>
                              ))}
                           </div>
                        </div>
                     )) : (
                        <div className="text-center py-10 bg-white/[0.02] border border-white/5 rounded-3xl mt-4">
                           <Receipt className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                           <p className="text-xs font-bold text-slate-500">No due records found in this period.</p>
                        </div>
                     )}
                  </motion.div>
               )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}