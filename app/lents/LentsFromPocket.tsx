"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, Plus, Wallet, Loader2, FileDown, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import BorrowerProfilePanel, { Borrower, Profile } from "./BorrowerProfilePanel";
import BorrowerPicker from "./BorrowerPicker";
// PDF export is dynamically imported in handleExportListPdf

interface BorrowerSummary extends Borrower {
  netDue: number;
  totalGiven: number;
  lastActivity: string;
}

interface LentsFromPocketProps {
  // page.tsx থেকে আসে — প্রতিবার Pocket ট্যাব active হলে বাড়ে, এটাই key হিসেবে
  // ব্যবহার করে summary/list কার্ডগুলো প্রতি ট্যাব-সুইচে আবার animate করে
  animKey?: number;
}

export default function LentsFromPocket({ animKey = 0 }: LentsFromPocketProps) {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isExportingList, setIsExportingList] = useState(false);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("pocket_ledger_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pocket_lent_ledger" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "borrowers" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profData } = await supabase.from("profiles").select("id, name, avatar_url, phone");
    setAllProfiles(profData || []);
    let myId: string | null = null;
    if (user) {
      myId = user.id;
      const myProfile = (profData || []).find((p) => p.id === user.id);
      if (myProfile) setCurrentUser(myProfile as Profile);
    }
    if (!myId) { setIsLoading(false); return; }

    const { data: borrowerRows } = await supabase.from("borrowers").select("*").order("name");
    // এটা সম্পূর্ণ ব্যক্তিগত — শুধু নিজের রেকর্ড করা এন্ট্রিই দেখা যাবে, পরিবারের অন্য কেউ না
    const { data: ledgerRows } = await supabase
      .from("pocket_lent_ledger")
      .select("borrower_id, entry_type, amount, updated_at")
      .eq("recorded_by", myId);

    const summaries: BorrowerSummary[] = (borrowerRows || []).map((b) => {
      const rows = (ledgerRows || []).filter((r) => r.borrower_id === b.id);
      const totalGiven = rows.filter((r) => r.entry_type === "given").reduce((s, r) => s + Number(r.amount), 0);
      const totalCollected = rows.filter((r) => r.entry_type === "collected").reduce((s, r) => s + Number(r.amount), 0);
      const lastActivity = rows.reduce((latest, r: any) => (r.updated_at > latest ? r.updated_at : latest), "");
      return { ...b, totalGiven, netDue: totalGiven - totalCollected, lastActivity };
    })
    // শুধু যাদের নিজের রেকর্ড করা এন্ট্রি অন্তত একটা আছে
    .filter((b) => (ledgerRows || []).some((r) => r.borrower_id === b.id))
    // সদ্য এন্ট্রি/এডিট হওয়া borrower সবার আগে
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

    setBorrowers(summaries);
    setIsLoading(false);
  };

  const totalPocketDue = borrowers.reduce((s, b) => s + Math.max(0, b.netDue), 0);

  const openBorrower = (b: Borrower) => {
    setSelectedBorrower(b);
    setPanelOpen(true);
  };

  const handlePickExisting = (b: Borrower) => {
    setIsPickerOpen(false);
    openBorrower(b);
  };

  const handleCreateNewBorrower = async (name: string, phone: string) => {
    if (!currentUser) {
      alert("Profile লোড হয়নি, একটু পরে চেষ্টা করো।");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("borrowers")
        .insert({ name, phone: phone || null, created_by: currentUser.id })
        .select()
        .single();
      if (error) throw error;

      setIsPickerOpen(false);
      await fetchAll();

      // নতুন borrower তৈরি হওয়ার সাথে সাথেই তার profile panel খুলে যাবে
      openBorrower(data as Borrower);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleExportListPdf = async () => {
    setIsExportingList(true);
    try {
      const { exportBorrowerListPdf } = await import("./pdfExport");
      await exportBorrowerListPdf({
        mode: "pocket",
        borrowers: borrowers.map((b) => ({
          name: b.name,
          phone: b.phone,
          totalGiven: b.totalGiven,
          totalCollected: b.totalGiven - b.netDue,
          netDue: b.netDue,
        })),
      });
    } catch (err: any) {
      alert("PDF Export Error: " + err.message);
    } finally {
      setIsExportingList(false);
    }
  };

  return (
    <div className="relative">
      {/* Summary — Card/Combined ট্যাবের মতোই glow-bar + staggered entrance, নিজস্ব emerald/teal রং */}
      <motion.section
        key={`pocket-summary-${animKey}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative p-6 rounded-[32px] overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-6"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-50 blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-400/5 z-0" />
        <div className="relative z-10 flex flex-col items-center text-center mt-2">
          <motion.span
            initial={{ opacity: 0, letterSpacing: "0.4em" }}
            animate={{ opacity: 1, letterSpacing: "0.2em" }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1"
          >
            Personal Pocket — Total Due
          </motion.span>
          <motion.div
            initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]"
          >
            ₹{totalPocketDue.toLocaleString("en-IN")}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 shadow-inner"
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span>কার্ড বা কার্ড-নগদ থেকে সম্পূর্ণ আলাদা — ব্যক্তিগত টাকার হিসাব</span>
          </motion.div>
        </div>
      </motion.section>

      {/* Borrower যোগ/বেছে নাও */}
      <button
        onClick={() => setIsPickerOpen(true)}
        className="w-full mb-5 py-3.5 rounded-2xl border border-dashed border-white/15 text-slate-300 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/[0.03] transition-colors"
      >
        <Plus className="w-4 h-4" /> Borrower যোগ/বেছে নাও
      </button>

      {/* Borrower List */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 bg-white/[0.03] border border-white/5 rounded-[22px] flex items-center justify-between animate-pulse"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 shrink-0 rounded-[14px] bg-white/10" />
                <div className="space-y-2">
                  <div className="h-3.5 w-24 rounded bg-white/10" />
                  <div className="h-2.5 w-28 rounded bg-white/5" />
                </div>
              </div>
              <div className="h-4 w-14 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : borrowers.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-10">এখনো কোনো personal lending entry নেই</p>
      ) : (
        <div key={`pocket-list-${animKey}`} className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={handleExportListPdf}
              disabled={isExportingList}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 mb-1"
            >
              {isExportingList ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              Export PDF
            </button>
          </div>
          <AnimatePresence>
            {borrowers.map((b, i) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => openBorrower(b)}
                className="p-4 bg-white/[0.03] border border-white/5 rounded-[22px] flex items-center justify-between cursor-pointer hover:bg-white/[0.05] transition-colors [content-visibility:auto] [contain-intrinsic-size:0_76px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 shrink-0 rounded-[14px] bg-emerald-500/10 border border-white/5 flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-100 truncate">{b.name}</h3>
                    <p className="text-[10px] text-slate-400">Total Given: ₹{b.totalGiven.toLocaleString("en-IN")}</p>
                    {b.netDue < 0 && (
                      <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full border border-emerald-400/20">
                        আমি নিয়েছি
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {/* যাকে দিয়েছি (netDue>0) → red, যার থেকে নিয়েছি (netDue<0) → green */}
                  {b.netDue > 0 ? (
                    <span className="text-base font-black text-[#ef4444]">₹{b.netDue.toLocaleString("en-IN")}</span>
                  ) : b.netDue < 0 ? (
                    <span className="text-base font-black text-emerald-400">₹{Math.abs(b.netDue).toLocaleString("en-IN")}</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-400 px-2 py-1 rounded-full border border-white/10">
                      Settled
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <BorrowerPicker
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectExisting={handlePickExisting}
        onCreateNew={handleCreateNewBorrower}
        accent="emerald"
      />

      <BorrowerProfilePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        borrower={selectedBorrower}
        mode="pocket"
        currentUser={currentUser}
        allProfiles={allProfiles}
        accessibleCards={[]}
        cardCashMap={{}}
        cardAvailableMap={{}}
        getUserCashForCard={() => 0}
        onDataChanged={fetchAll}
      />
    </div>
  );
}