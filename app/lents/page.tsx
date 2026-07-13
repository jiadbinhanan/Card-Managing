"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  User,
  ChevronDown,
  Loader2,
  X,
  FileDown,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import BorrowerProfilePanel, { Borrower, Profile, CardData } from "./BorrowerProfilePanel";
import LentsFromPocket from "./LentsFromPocket";
import { exportBorrowerListPdf } from "./pdfExport";

// ─── Smoke Reveal: per-character ────────
function SmokeText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(12px)", y: 8 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ delay: i * 0.045, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

interface CardAccess {
  card_id: string;
  user_id: string;
  role: string;
}

interface BorrowerSummary extends Borrower {
  netDue: number;
  totalGiven: number;
}

export default function LentsPage() {
  const [activeTab, setActiveTab] = useState<"card" | "pocket">("card");
  // পকেট ট্যাব প্রথমবার দেখা হলে true হয়ে যাবে, তারপর কখনো unmount হবে না —
  // শুধু CSS দিয়ে show/hide হবে, তাই বারবার ট্যাব সুইচ করলেও ডেটা আবার fetch হবে না
  const [pocketVisited, setPocketVisited] = useState(false);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allCardAccess, setAllCardAccess] = useState<CardAccess[]>([]);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);

  const [cardCashMap, setCardCashMap] = useState<Record<string, Record<string, number>>>({});
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});

  const [borrowers, setBorrowers] = useState<BorrowerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // --- Card Vault Selector: LOCAL state — page mount হলেই সবসময় "All" থেকে শুরু হয় ---
  // (এই পেজ ছেড়ে অন্য পেজে গিয়ে ফিরে এলে component পুনরায় mount হয়, তাই এই state
  //  স্বয়ংক্রিয়ভাবে ['all']-এ reset হয়ে যায় — অন্য কোনো পেজের card selection-কে প্রভাবিত করে না)
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(["all"]);
  const [cardDropdownOpen, setCardDropdownOpen] = useState(false);
  const cardDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isSavingBorrower, setIsSavingBorrower] = useState(false);
  const [isExportingList, setIsExportingList] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardDropdownRef.current && !cardDropdownRef.current.contains(e.target as Node)) {
        setCardDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchInitialData();
    const channel = supabase
      .channel("lents_ledger_changes_v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "card_lent_ledger" }, () => fetchBorrowerSummaries(allCards))
      .on("postgres_changes", { event: "*", schema: "public", table: "borrowers" }, () => fetchBorrowerSummaries(allCards))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_on_hand" }, () => fetchBalanceMaps(allCards))
      .on("postgres_changes", { event: "*", schema: "public", table: "card_transactions" }, () => fetchBalanceMaps(allCards))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardIds]);

  const cleanUrl = (url?: string | null) => {
    if (!url) return "";
    return url.trim().replace(/^['"]|['"]$/g, "");
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profData } = await supabase.from("profiles").select("id, name, avatar_url, phone");
    const { data: cData } = await supabase.from("cards").select("*");
    const { data: aData } = await supabase.from("card_access").select("*");

    const profs = profData || [];
    const cardsList = cData || [];
    const accessList = aData || [];

    setAllProfiles(profs);
    setAllCards(cardsList);
    setAllCardAccess(accessList);

    if (user) {
      const myProfile = profs.find((p) => p.id === user.id);
      if (myProfile) setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) });

      const myCardIds = accessList.filter((a) => a.user_id === user.id).map((a) => a.card_id);
      const myCards = cardsList
        .filter((c) => myCardIds.includes(c.id))
        .sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));
      setAccessibleCards(myCards);
    }

    await fetchBalanceMaps(cardsList);
    await fetchBorrowerSummaries(cardsList);
    setIsLoading(false);
  };

  // --- Cash / Card available balance maps (calculation অপরিবর্তিত) ---
  const fetchBalanceMaps = async (currentCards: CardData[]) => {
    const { data: coh } = await supabase.from("cash_on_hand").select("user_id, card_id, current_balance");
    const userCardCashMap: Record<string, Record<string, number>> = {};
    coh?.forEach((c) => {
      if (c.user_id && c.card_id) {
        if (!userCardCashMap[c.user_id]) userCardCashMap[c.user_id] = {};
        userCardCashMap[c.user_id][c.card_id] = Number(c.current_balance);
      }
    });
    setCardCashMap(userCardCashMap as any);

    const { data: txs } = await supabase.from("card_transactions").select("amount, type, payment_method, card_id, status, qr_id, settled_to_user, remarks");
    const { data: spends } = await supabase.from("spends").select("amount, payment_method, user_id, card_id");

    const availableMap: Record<string, number> = {};
    currentCards.filter((c) => c.is_primary).forEach((primaryCard) => {
      const familyCardIds = currentCards.filter((c) => c.id === primaryCard.id || c.parent_card_id === primaryCard.id).map((c) => c.id);
      const withdrawals = txs?.filter((t) => {
        if (t.type !== "withdrawal") return false;
        if (!t.card_id || !familyCardIds.includes(t.card_id)) return false;
        const isRotation = t.qr_id || t.settled_to_user || (t.remarks || "").toLowerCase().includes("rotation");
        if (isRotation) return true;
        return t.status === "pending_settlement";
      }).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const billPayments = txs?.filter((t) => t.type === "bill_payment" && t.card_id && familyCardIds.includes(t.card_id)).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const ccSpends = spends?.filter((s) => s.payment_method === "credit_card" && s.card_id && familyCardIds.includes(s.card_id)).reduce((sum, s) => sum + Number(s.amount), 0) || 0;
      const available = Number(primaryCard.total_limit) - withdrawals - ccSpends + billPayments;
      familyCardIds.forEach((id) => { availableMap[id] = available; });
    });
    setCardAvailableMap(availableMap);
  };

  // --- Borrower list: card_lent_ledger থেকে group করে per-borrower summary ---
  const fetchBorrowerSummaries = async (currentCards: CardData[]) => {
    let targetCardIds: string[] = [];
    const isAllSelected = selectedCardIds.includes("all") || selectedCardIds.length === 0;
    if (!isAllSelected) {
      selectedCardIds.forEach((selId) => {
        const selected = currentCards.find((c) => c.id === selId);
        if (selected) {
          const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
          const familyIds = currentCards.filter((c) => c.id === primaryId || c.parent_card_id === primaryId).map((c) => c.id);
          familyIds.forEach((id) => { if (!targetCardIds.includes(id)) targetCardIds.push(id); });
        }
      });
    }

    const { data: borrowerRows } = await supabase.from("borrowers").select("*").order("name");

    let ledgerQuery = supabase.from("card_lent_ledger").select("borrower_id, entry_type, amount, card_id");
    if (!isAllSelected && targetCardIds.length > 0) {
      ledgerQuery = ledgerQuery.in("card_id", targetCardIds);
    }
    const { data: ledgerRows } = await ledgerQuery;

    const summaries: BorrowerSummary[] = (borrowerRows || [])
      .map((b) => {
        const rows = (ledgerRows || []).filter((r) => r.borrower_id === b.id);
        const totalGiven = rows.filter((r) => r.entry_type === "given").reduce((s, r) => s + Number(r.amount), 0);
        const totalCollected = rows.filter((r) => r.entry_type === "collected").reduce((s, r) => s + Number(r.amount), 0);
        return { ...b, totalGiven, netDue: totalGiven - totalCollected };
      })
      .filter((b) => (ledgerRows || []).some((r) => r.borrower_id === b.id));

    setBorrowers(summaries);
  };

  const refreshAll = async () => {
    await fetchBalanceMaps(allCards);
    await fetchBorrowerSummaries(allCards);
  };

  const getUserCashForCard = (userId: string, cardId: string): number => {
    const userMap = cardCashMap[userId] || {};
    if (!cardId) return Object.values(userMap).reduce((s, v) => s + v, 0);
    const card = allCards.find((c) => c.id === cardId);
    const primaryId = card?.is_primary ? card.id : card?.parent_card_id;
    const familyIds = allCards.filter((c) => c.id === primaryId || c.parent_card_id === primaryId).map((c) => c.id);
    return familyIds.reduce((s, cid) => s + (userMap[cid] || 0), 0);
  };

  const totalReceivable = borrowers.reduce((acc, b) => acc + Math.max(0, b.netDue), 0);

  const handleCreateBorrower = async () => {
    if (!newName.trim() || !currentUser) {
      alert("নাম দিন।");
      return;
    }
    setIsSavingBorrower(true);
    try {
      const { data, error } = await supabase
        .from("borrowers")
        .insert({ name: newName.trim(), phone: newPhone.trim() || null, created_by: currentUser.id })
        .select()
        .single();
      if (error) throw error;

      setIsAddOpen(false);
      setNewName("");
      setNewPhone("");
      await fetchBorrowerSummaries(allCards);

      setSelectedBorrower(data as Borrower);
      setPanelOpen(true);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSavingBorrower(false);
    }
  };

  const openBorrower = (b: Borrower) => {
    setSelectedBorrower(b);
    setPanelOpen(true);
  };

  const handleExportListPdf = async () => {
    setIsExportingList(true);
    try {
      await exportBorrowerListPdf({
        mode: "card",
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
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#f59e0b]/30">
      {/* Background */}
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

      {/* Header — শুধু top padding ২/৭ অংশ কমানো হয়েছে (pt-8 → ~pt-6), বাকি সবকিছু আগের সাইজেই।
          z-30 রাখা হয়েছে যাতে card-selector dropdown সবসময় উপরে থাকে (আগের bug fix, অক্ষত)। */}
      <header className="relative z-30 px-5 pt-[23px] pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#f59e0b] to-[#ef4444] p-0.5 shadow-[0_0_20px_rgba(245,158,11,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
              <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                {currentUser?.avatar_url && !imgError ? (
                  <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" onError={() => setImgError(true)} />
                ) : (
                  <span className="text-sm font-black text-white">{currentUser?.name?.charAt(0) || "U"}</span>
                )}
              </div>
            </div>
          </Link>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-slate-400">Credit Extensions</p>
            <h1 className="text-xl font-black tracking-tight leading-none"><SmokeText text="Micro-Lending" /></h1>
          </div>
        </div>

        {activeTab === "card" && (
          <div className="relative" ref={cardDropdownRef}>
            <button
              onClick={() => setCardDropdownOpen((p) => !p)}
              className="flex items-center gap-1.5 bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-2.5 rounded-xl outline-none focus:border-[#f59e0b] shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-md min-w-[110px] max-w-[140px]"
            >
              <span className="truncate flex-1 text-left">
                {selectedCardIds.includes("all") || selectedCardIds.length === 0
                  ? "All Vault Cards"
                  : selectedCardIds.length === 1
                    ? (accessibleCards.find((c) => c.id === selectedCardIds[0])?.card_name || "Selected")
                    : `${selectedCardIds.length} Cards`}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${cardDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {cardDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-full mt-1.5 z-50 bg-[#0d0d0d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden min-w-[160px]"
                >
                  <button
                    onClick={() => { setSelectedCardIds(["all"]); setCardDropdownOpen(false); fetchBorrowerSummaries(allCards); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold transition-colors ${
                      selectedCardIds.includes("all") ? "bg-[#f59e0b]/15 text-[#f59e0b]" : "text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${selectedCardIds.includes("all") ? "bg-[#f59e0b] border-[#f59e0b]" : "border-white/20"}`}>
                      {selectedCardIds.includes("all") && <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                    </div>
                    All Vault Cards
                  </button>
                  <div className="h-px bg-white/5 mx-2" />
                  {accessibleCards.map((c) => {
                    const isChecked = selectedCardIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          let newIds: string[];
                          if (selectedCardIds.includes("all")) newIds = [c.id];
                          else if (isChecked) {
                            newIds = selectedCardIds.filter((id) => id !== c.id);
                            if (newIds.length === 0) newIds = ["all"];
                          } else newIds = [...selectedCardIds, c.id];
                          setSelectedCardIds(newIds);
                          fetchBorrowerSummaries(allCards);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold transition-colors ${
                          isChecked && !selectedCardIds.includes("all") ? "bg-[#f59e0b]/10 text-[#fbbf24]" : "text-slate-300 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${isChecked && !selectedCardIds.includes("all") ? "bg-[#f59e0b] border-[#f59e0b]" : "border-white/20"}`}>
                          {isChecked && !selectedCardIds.includes("all") && <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                        </div>
                        <span className="truncate">{c.card_name} (**{c.last_4_digits})</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </header>

      <main className="relative z-10 px-4 pt-6 max-w-md mx-auto space-y-6">
        {/* Tab Switcher */}
        <div className="flex p-1 bg-white/[0.03] border border-white/10 rounded-2xl">
          <button
            onClick={() => setActiveTab("card")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
              activeTab === "card" ? "bg-[#f59e0b] text-black" : "text-slate-400"
            }`}
          >
            Card & Cash
          </button>
          <button
            onClick={() => { setActiveTab("pocket"); setPocketVisited(true); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
              activeTab === "pocket" ? "bg-emerald-400 text-black" : "text-slate-400"
            }`}
          >
            Personal Pocket
          </button>
        </div>

        {/* Personal Pocket: একবার visit হলেই mount হয়ে থাকে, শুধু CSS দিয়ে hide/show হয় —
            তাই ট্যাব সুইচ করলে বারবার নতুন করে ডেটা লোড হয় না */}
        {pocketVisited && (
          <div className={activeTab === "pocket" ? "" : "hidden"}>
            <LentsFromPocket />
          </div>
        )}

        <div className={activeTab === "card" ? "space-y-6" : "hidden"}>
            {/* Summary */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative p-6 rounded-[32px] overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent opacity-50 blur-[2px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/10 to-[#ef4444]/5 z-0" />
              <div className="relative z-10 flex flex-col items-center text-center mt-2">
                <motion.span
                  initial={{ opacity: 0, letterSpacing: "0.4em" }}
                  animate={{ opacity: 1, letterSpacing: "0.2em" }}
                  transition={{ duration: 0.7, delay: 0.2 }}
                  className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1"
                >
                  Total Due (Remaining)
                </motion.span>
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="text-4xl font-black font-space tracking-tight bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#ef4444] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                >
                  ₹{totalReceivable.toLocaleString("en-IN")}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 shadow-inner"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>Track friends who owe you money</span>
                </motion.div>
              </div>
            </motion.section>

            {/* Add Borrower */}
            <button
              onClick={() => setIsAddOpen(true)}
              className="w-full py-3.5 rounded-2xl border border-dashed border-white/15 text-slate-300 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/[0.03] transition-colors"
            >
              <Plus className="w-4 h-4" /> নতুন Borrower যোগ করো
            </button>

            {/* Borrower List */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] uppercase tracking-wider">
                  Full Lending Ledger
                </h2>
                {borrowers.length > 0 && (
                  <button
                    onClick={handleExportListPdf}
                    disabled={isExportingList}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {isExportingList ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                    Export PDF
                  </button>
                )}
              </div>
              {isLoading ? (
                <div className="space-y-3 pb-6">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="p-4 bg-white/[0.03] border border-white/5 rounded-[24px] flex items-center justify-between animate-pulse"
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 shrink-0 rounded-[14px] bg-white/10" />
                        <div className="space-y-2">
                          <div className="h-3.5 w-24 rounded bg-white/10" />
                          <div className="h-2.5 w-32 rounded bg-white/5" />
                        </div>
                      </div>
                      <div className="h-4 w-16 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : borrowers.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">এখনো কোনো lending entry নেই</p>
              ) : (
                <div className="space-y-3 pb-6">
                  <AnimatePresence>
                    {borrowers.map((b) => (
                      <motion.div
                        key={b.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => openBorrower(b)}
                        className="p-4 bg-white/[0.03] border border-white/5 rounded-[24px] flex items-center justify-between cursor-pointer hover:bg-white/[0.05] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 shrink-0 rounded-[14px] bg-[#f59e0b]/10 border border-white/5 flex items-center justify-center">
                            <User className="w-5 h-5 text-[#f59e0b]" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-100 truncate">{b.name}</h3>
                            <p className="text-[10px] text-slate-400">Total Given: ₹{b.totalGiven.toLocaleString("en-IN")}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {b.netDue > 0 ? (
                            <span className="text-base font-black text-white">₹{b.netDue.toLocaleString("en-IN")}</span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">
                              Settled
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
        </div>
      </main>

      {/* Add Borrower Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-6 top-1/3 z-50 max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-white">নতুন Borrower</h3>
                <button onClick={() => setIsAddOpen(false)} className="text-slate-400"><X className="w-4 h-4" /></button>
              </div>
              <input
                type="text" placeholder="নাম"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b] mb-3"
              />
              <input
                type="text" placeholder="ফোন নম্বর (optional)"
                value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b] mb-4"
              />
              <button
                disabled={isSavingBorrower}
                onClick={handleCreateBorrower}
                className="w-full py-3 rounded-xl text-sm font-black text-black bg-[#f59e0b] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSavingBorrower && <Loader2 className="w-4 h-4 animate-spin" />} Add & Open Profile
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BorrowerProfilePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        borrower={selectedBorrower}
        mode="card"
        currentUser={currentUser}
        allProfiles={allProfiles}
        accessibleCards={accessibleCards}
        cardCashMap={cardCashMap}
        cardAvailableMap={cardAvailableMap}
        getUserCashForCard={getUserCashForCard}
        onDataChanged={refreshAll}
      />

      <BottomNav />
    </div>
  );
}