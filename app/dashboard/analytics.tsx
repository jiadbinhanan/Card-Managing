"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Banknote, ArrowDownLeft, Receipt, ChevronDown, Filter, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  avatar_url?: string;
}

interface AnalyticsProps {
  userStats: UserStat[];
}

export default function DashboardAnalytics({ userStats }: AnalyticsProps) {
  const [selectedUserStat, setSelectedUserStat] = useState<UserStat | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<"summary" | "cash_ledger" | "due_ledger">("summary");
  const [dateFilter, setDateFilter] = useState<"all" | "this_month" | "last_month">("all");
  const [statImgError, setStatImgError] = useState<Record<string, boolean>>({});

  const [cashLedger, setCashLedger] = useState<any[]>([]);
  const [dueLedger, setDueLedger] = useState<any[]>([]);



  async function fetchLedgers(userId: string, filter: string) {
    let startDate = new Date(0).toISOString();
    let endDate = new Date().toISOString();
    const now = new Date();

    if (filter === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (filter === 'last_month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString(); // last day of last month
    }

    // Cash Ledger Fetch
    const { data: cLedger } = await supabase.from('cash_on_hand_ledger')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (cLedger) setCashLedger(cLedger);

    // Due Ledger Fetch (Spends & Repayments)
    const { data: spends } = await supabase.from('spends')
      .select('id, amount, spend_date, remarks')
      .eq('user_id', userId)
      .gte('spend_date', startDate)
      .lte('spend_date', endDate);

    const { data: txs } = await supabase.from('card_transactions')
      .select('id, amount, transaction_date, remarks')
      .eq('recorded_by', userId)
      .eq('type', 'bill_payment')
      .eq('payment_method', 'own_pocket')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    const combinedDue: any[] = [];
    if (spends) spends.forEach(s => combinedDue.push({ id: `s-${s.id}`, type: 'spend', amount: s.amount, date: s.spend_date, remarks: s.remarks || 'Personal Spend' }));
    if (txs) txs.forEach(t => combinedDue.push({ id: `t-${t.id}`, type: 'repayment', amount: t.amount, date: t.transaction_date, remarks: t.remarks || 'Bill Paid (Repayment)' }));

    combinedDue.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setDueLedger(combinedDue);
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (selectedUserStat) {
      fetchLedgers(selectedUserStat.id, dateFilter);
    }
  }, [selectedUserStat, dateFilter]);

  const handleUserStatClick = (stat: UserStat) => {
    setSelectedUserStat(stat);
    setUserModalTab("summary");
    setDateFilter("all");
    setIsUserModalOpen(true);
  };

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mb-8">
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

      {/* ================= LARGE USER ANALYTICS MODAL ================= */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-lg w-[95vw] p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]">
          <div className="p-6 relative border-b border-white/5">
            <div className="absolute top-0 left-0 w-40 h-40 bg-[#a855f7]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader>
              <div className="flex items-center justify-between relative z-10">
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                       {selectedUserStat?.avatar_url && !statImgError[selectedUserStat.id] ? (
                          <img src={selectedUserStat.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" />
                       ) : (
                          <div className="w-full h-full bg-black flex items-center justify-center text-sm font-bold text-white">{selectedUserStat?.name?.charAt(0)}</div>
                       )}
                    </div>
                    <div>
                       <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent leading-tight">
                         {selectedUserStat?.name}&apos;s Ledger
                       </DialogTitle>
                       <p className="text-[10px] text-[#a855f7] font-bold uppercase tracking-wider mt-0.5">Advanced Analytics</p>
                    </div>
                 </div>
                 <Button variant="ghost" size="icon" onClick={() => setIsUserModalOpen(false)} className="rounded-full bg-white/5 text-white hover:bg-rose-500/20 hover:text-rose-400">
                    <X className="w-5 h-5" />
                 </Button>
              </div>
            </DialogHeader>
          </div>

          <div className="flex flex-col bg-black/40 border-b border-white/5">
             <div className="flex p-2 gap-2 overflow-x-auto custom-scrollbar">
                <button onClick={() => setUserModalTab("summary")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "summary" ? "bg-[#a855f7]/20 text-[#e879f9] border border-[#a855f7]/40 shadow-inner" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>Summary</button>
                <button onClick={() => setUserModalTab("cash_ledger")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "cash_ledger" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>Cash In/Out</button>
                <button onClick={() => setUserModalTab("due_ledger")} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "due_ledger" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-inner" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>Personal Due</button>
             </div>
             
             {userModalTab !== 'summary' && (
                <div className="px-4 pb-3 pt-1 flex items-center justify-end">
                   <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                      <Filter className="w-3 h-3 text-slate-400" />
                      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} className="bg-transparent text-[10px] font-bold text-slate-300 outline-none cursor-pointer appearance-none pr-4">
                         <option value="all" className="bg-black">All Time</option>
                         <option value="this_month" className="bg-black">This Month</option>
                         <option value="last_month" className="bg-black">Last Month</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 -ml-3 pointer-events-none" />
                   </div>
                </div>
             )}
          </div>

          <div className="p-6 h-[55vh] overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
               {userModalTab === "summary" && (
                  <motion.div key="summary" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                     <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden">
                        <Banknote className="absolute -bottom-4 -right-4 w-24 h-24 text-emerald-500/10 rotate-12 pointer-events-none" />
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Collected Cash</p>
                        <p className="text-4xl font-black text-emerald-400">₹{selectedUserStat?.cash.toLocaleString()}</p>
                        <p className="text-xs font-medium text-emerald-500/70 mt-2 flex items-center gap-1.5"><ArrowDownLeft className="w-3.5 h-3.5"/> Actual cash holding in hand</p>
                     </div>
                     <div className="bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(244,63,94,0.1)] relative overflow-hidden">
                        <Receipt className="absolute -bottom-4 -right-4 w-24 h-24 text-rose-500/10 -rotate-12 pointer-events-none" />
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Total Personal Due</p>
                        <p className="text-4xl font-black text-rose-400">₹{selectedUserStat?.due.toLocaleString()}</p>
                        <p className="text-xs font-medium text-rose-500/70 mt-2 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5"/> Total remaining debt to clear</p>
                     </div>
                  </motion.div>
               )}

               {userModalTab === "cash_ledger" && (
                  <motion.div key="cash_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                     {cashLedger.length > 0 ? cashLedger.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-[20px] hover:bg-white/[0.04] transition-colors">
                           <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.transaction_type === 'credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                 {tx.transaction_type === 'credit' ? <ArrowDownLeft className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                              </div>
                              <div className="w-[180px]">
                                 <p className="text-sm font-bold text-white truncate">{tx.remarks}</p>
                                 <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{new Date(tx.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              </div>
                           </div>
                           <p className={`text-base font-black ${tx.transaction_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tx.transaction_type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                           </p>
                        </div>
                     )) : (
                        <div className="text-center py-10">
                           <Banknote className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                           <p className="text-xs font-bold text-slate-500">No cash transactions in this period.</p>
                        </div>
                     )}
                  </motion.div>
               )}

               {userModalTab === "due_ledger" && (
                  <motion.div key="due_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                     {dueLedger.length > 0 ? dueLedger.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-[20px] hover:bg-white/[0.04] transition-colors">
                           <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.type === 'spend' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                                 {tx.type === 'spend' ? <Receipt className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                              </div>
                              <div className="w-[180px]">
                                 <p className="text-sm font-bold text-white truncate">{tx.remarks}</p>
                                 <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              </div>
                           </div>
                           <p className={`text-base font-black ${tx.type === 'spend' ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {tx.type === 'spend' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                           </p>
                        </div>
                     )) : (
                        <div className="text-center py-10">
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