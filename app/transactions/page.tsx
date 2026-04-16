"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  CreditCard, 
  Home, 
  PieChart, 
  Plus, 
  Wallet, 
  Store,
  User
} from "lucide-react";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerTrigger 
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

// Mock Data
const MOCK_TRANSACTIONS = [
  { id: 1, type: "withdrawal", amount: 2500, merchant: "Starbucks Reserve", user: "User A", date: "Today, 09:41 AM" },
  { id: 2, type: "payment", amount: 15000, merchant: "Credit Card Bill", user: "User B", date: "Yesterday, 14:20 PM" },
  { id: 3, type: "withdrawal", amount: 850, merchant: "Uber Rides", user: "User A", date: "12 Apr, 18:30 PM" },
  { id: 4, type: "withdrawal", amount: 4200, merchant: "Amazon India", user: "User B", date: "10 Apr, 11:15 AM" },
  { id: 5, type: "payment", amount: 5000, merchant: "Advance Settlement", user: "User A", date: "08 Apr, 09:00 AM" },
  { id: 6, type: "withdrawal", amount: 1200, merchant: "Zomato", user: "User A", date: "07 Apr, 20:45 PM" },
];

type FilterType = "all" | "withdrawals" | "payments";

export default function TransactionsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [txType, setTxType] = useState<"withdrawal" | "payment">("withdrawal");
  const [txUser, setTxUser] = useState<"User A" | "User B">("User A");
  const [amount, setAmount] = useState("");

  const filteredTransactions = MOCK_TRANSACTIONS.filter(tx => {
    if (filter === "all") return true;
    if (filter === "withdrawals") return tx.type === "withdrawal";
    if (filter === "payments") return tx.type === "payment";
    return true;
  });

  // Animation Variants
  const listVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-slate-50 font-sans pb-28 overflow-x-hidden">
      
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />
        <motion.div
          animate={{
            x: [0, -30, 30, 0],
            y: [0, 40, -40, 0],
            scale: [1, 1.2, 0.8, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] left-[-20%] w-[70vw] h-[70vw] rounded-full bg-[#f43f5e] opacity-10 blur-[120px] mix-blend-screen"
        />
        <motion.div
          animate={{
            x: [0, 40, -40, 0],
            y: [0, -30, 30, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#10b981] opacity-10 blur-[100px] mix-blend-screen"
        />
      </div>

      {/* Header & Filter Tabs */}
      <header className="relative z-10 px-6 pt-12 pb-4 sticky top-0 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold tracking-tight font-space bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] mb-6">
            Transactions
          </h1>
          
          {/* Glassmorphic Filter Tabs */}
          <div className="flex p-1 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-md relative">
            {["all", "withdrawals", "payments"].map((tab) => {
              const isActive = filter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab as FilterType)}
                  className={`flex-1 relative py-2 text-[11px] font-semibold uppercase tracking-wider rounded-xl transition-colors z-10 ${
                    isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-20">{tab}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Transaction List */}
      <main className="relative z-10 px-6 pt-6 max-w-md mx-auto">
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="visible"
          key={filter} // Re-trigger animation on filter change
          className="space-y-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredTransactions.map((tx) => {
              const isWithdrawal = tx.type === "withdrawal";
              return (
                <motion.div
                  key={tx.id}
                  variants={itemVariants}
                  layout
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-sm transition-colors hover:bg-white/[0.04] hover:border-white/10 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                      isWithdrawal 
                        ? "bg-[#f43f5e]/10 border-[#f43f5e]/20 text-[#f43f5e] shadow-[0_0_15px_rgba(244,63,94,0.15)]" 
                        : "bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    }`}>
                      {isWithdrawal ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-50 mb-0.5">{tx.merchant}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{tx.date}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-600" />
                        <span className="text-slate-300 font-medium">{tx.user}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-base font-bold tracking-tight ${
                    isWithdrawal ? "text-[#f43f5e]" : "text-[#10b981]"
                  }`}>
                    {isWithdrawal ? "-" : "+"}₹{tx.amount.toLocaleString('en-IN')}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {filteredTransactions.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-12 text-slate-500 text-sm"
            >
              No transactions found.
            </motion.div>
          )}
        </motion.div>
      </main>

      {/* Add Transaction Drawer & FAB */}
      <Drawer>
        <div className="fixed bottom-24 right-6 z-50 max-w-md mx-auto left-0 flex justify-end pointer-events-none">
          <DrawerTrigger asChild className="pointer-events-auto">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#a855f7] flex items-center justify-center text-white shadow-[0_0_30px_rgba(14,165,233,0.4)] border border-white/20"
            >
              <Plus className="w-6 h-6" />
            </motion.button>
          </DrawerTrigger>
        </div>

        <DrawerContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/10 text-slate-50 rounded-t-[32px]">
          <div className="max-w-md mx-auto w-full px-6 pb-8 pt-4">
            <DrawerHeader className="px-0 text-left mb-6">
              <DrawerTitle className="text-2xl font-space font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                New Transaction
              </DrawerTitle>
            </DrawerHeader>

            <div className="space-y-6">
              {/* Type Segmented Control */}
              <div className="flex p-1 bg-black/40 border border-white/10 rounded-2xl">
                {(["withdrawal", "payment"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTxType(type)}
                    className={`flex-1 relative py-3 text-xs font-semibold uppercase tracking-wider rounded-xl transition-colors z-10 ${
                      txType === type ? "text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {txType === type && (
                      <motion.div
                        layoutId="txType"
                        className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-20 flex items-center justify-center gap-2">
                      {type === "withdrawal" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                      {type}
                    </span>
                  </button>
                ))}
              </div>

              {/* Amount Input */}
              <div className="space-y-2 text-center py-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</label>
                <div className="flex items-center justify-center text-4xl font-bold font-space text-white">
                  <span className="text-slate-500 mr-1">₹</span>
                  <input 
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent border-none outline-none w-1/2 text-center placeholder:text-slate-700 focus:ring-0 p-0"
                    autoFocus
                  />
                </div>
              </div>

              {/* Merchant & User Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Merchant / QR</label>
                  <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                    <Store className="w-4 h-4 text-slate-500 mr-2" />
                    <input 
                      type="text" 
                      placeholder="Select..." 
                      className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Initiated By</label>
                  <div className="flex p-1 bg-black/40 border border-white/10 rounded-xl h-12">
                    {(["User A", "User B"] as const).map((user) => (
                      <button
                        key={user}
                        onClick={() => setTxUser(user)}
                        className={`flex-1 relative text-[10px] font-semibold rounded-lg transition-colors z-10 ${
                          txUser === user ? "text-white" : "text-slate-500"
                        }`}
                      >
                        {txUser === user && (
                          <motion.div
                            layoutId="txUser"
                            className="absolute inset-0 bg-white/10 rounded-lg"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <span className="relative z-20">{user.split(" ")[1]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-4">
                <Button 
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-bold text-base shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all border-0"
                >
                  Save Transaction
                </Button>
              </motion.div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <BottomNav />
    </div>
  );
}
