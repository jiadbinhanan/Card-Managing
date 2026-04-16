"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { 
  AlertCircle, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  User, 
  Users,
  IndianRupee
} from "lucide-react";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerTrigger 
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

// Mock Data
const MOCK_LOANS = [
  { id: 1, name: "Rahul Sharma", amount: 15000, dueDate: "25 Apr 2026", status: "unpaid", isApproaching: true },
  { id: 2, name: "Amit Kumar", amount: 5000, dueDate: "20 Apr 2026", status: "paid", isApproaching: false },
  { id: 3, name: "Priya Singh", amount: 8500, dueDate: "25 Apr 2026", status: "unpaid", isApproaching: true },
];

export default function LoansPage() {
  const [loans, setLoans] = useState(MOCK_LOANS);
  const [newBorrower, setNewBorrower] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("25 Apr 2026");

  const totalReceivable = loans.filter(l => l.status === "unpaid").reduce((acc, curr) => acc + curr.amount, 0);

  // Animation Variants
  const listVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
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
          className="absolute top-[10%] left-[-20%] w-[70vw] h-[70vw] rounded-full bg-[#f59e0b] opacity-10 blur-[120px] mix-blend-screen"
        />
        <motion.div
          animate={{
            x: [0, 40, -40, 0],
            y: [0, -30, 30, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#ef4444] opacity-10 blur-[100px] mix-blend-screen"
        />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 pt-12 pb-4 sticky top-0 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight font-space bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Micro-Lending
          </h1>
          <div className="p-2.5 bg-zinc-900/80 rounded-full border border-white/10 backdrop-blur-sm">
            <Users className="w-5 h-5 text-[#f59e0b]" />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 pt-6 max-w-md mx-auto space-y-8">
        
        {/* Active Loans Summary */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative p-6 rounded-[32px] overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/10 to-[#ef4444]/5 z-0" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Receivable</span>
            <div className="text-4xl font-bold font-space text-white tracking-tight flex items-center justify-center">
              <span className="text-slate-500 mr-1 text-3xl">₹</span>
              {totalReceivable.toLocaleString('en-IN')}
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
              <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Due by 25th of this month</span>
            </div>
          </div>
        </motion.section>

        {/* Borrowers List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0ea5e9]" /> Borrowers
            </h2>
          </div>

          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <AnimatePresence mode="popLayout">
              {loans.map((loan) => (
                <motion.div
                  key={loan.id}
                  variants={itemVariants}
                  layout
                  className={`p-4 bg-white/[0.02] border rounded-[24px] backdrop-blur-sm flex flex-col gap-3 transition-colors ${
                    loan.isApproaching && loan.status === "unpaid" 
                      ? "border-[#ef4444]/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]" 
                      : "border-white/5"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-50 mb-0.5">{loan.name}</h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Calendar className="w-3 h-3" />
                          <span className={loan.isApproaching && loan.status === "unpaid" ? "text-[#ef4444] font-medium" : ""}>
                            Due: {loan.dueDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-white mb-1">
                        ₹{loan.amount.toLocaleString('en-IN')}
                      </div>
                      {loan.status === "unpaid" ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#ef4444]/10 text-[#ef4444] px-2 py-0.5 rounded border border-[#ef4444]/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                          Unpaid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#10b981]/10 text-[#10b981] px-2 py-0.5 rounded border border-[#10b981]/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </section>

      </main>

      {/* Add Loan Drawer & FAB */}
      <Drawer>
        <div className="fixed bottom-24 right-6 z-50 max-w-md mx-auto left-0 flex justify-end pointer-events-none">
          <DrawerTrigger asChild className="pointer-events-auto">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#ef4444] flex items-center justify-center text-white shadow-[0_0_30px_rgba(245,158,11,0.4)] border border-white/20"
            >
              <Plus className="w-6 h-6" />
            </motion.button>
          </DrawerTrigger>
        </div>

        <DrawerContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/10 text-slate-50 rounded-t-[32px]">
          <div className="max-w-md mx-auto w-full px-6 pb-8 pt-4">
            <DrawerHeader className="px-0 text-left mb-6">
              <DrawerTitle className="text-2xl font-space font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Record New Loan
              </DrawerTitle>
            </DrawerHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Borrower Name</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                  <User className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="text" 
                    value={newBorrower}
                    onChange={(e) => setNewBorrower(e.target.value)}
                    placeholder="e.g. Rahul Sharma" 
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Amount</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                  <IndianRupee className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="number" 
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0.00" 
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Due Date</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                  <Calendar className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="text" 
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    placeholder="25 Apr 2026" 
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                  />
                </div>
                <p className="text-[10px] text-slate-500 ml-1">Default is set to the 25th of the current billing cycle.</p>
              </div>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-4">
                <Button 
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] hover:opacity-90 text-white font-bold text-base shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all border-0"
                >
                  Save Loan Record
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
