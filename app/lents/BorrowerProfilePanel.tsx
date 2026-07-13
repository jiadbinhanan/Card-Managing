"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  User,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CreditCard,
  Calendar,
  Loader2,
  FileDown,
  UserCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sendLentIssueAlert, sendLentRecoveryAlert } from "./WaAlert";
import { exportLedgerPdf } from "./pdfExport";

// --- Shared Interfaces ---
export interface Borrower {
  id: string;
  name: string;
  phone?: string | null;
}

export interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  total_limit: number;
  parent_card_id?: string;
}

export interface LedgerEntry {
  id: string;
  borrower_id: string;
  entry_type: "given" | "collected";
  amount: number;
  transaction_date: string;
  source_type?: "cash_on_hand" | "credit_card" | null;
  card_id?: string | null;
  remarks?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

type Mode = "card" | "pocket";

interface BorrowerProfilePanelProps {
  open: boolean;
  onClose: () => void;
  borrower: Borrower | null;
  mode: Mode;
  currentUser: Profile | null;
  allProfiles: Profile[];
  accessibleCards: CardData[];
  cardCashMap: Record<string, Record<string, number>>;
  cardAvailableMap: Record<string, number>;
  getUserCashForCard: (userId: string, cardId: string) => number;
  onDataChanged: () => void;
}

const todayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function BorrowerProfilePanel({
  open,
  onClose,
  borrower,
  mode,
  currentUser,
  allProfiles,
  accessibleCards,
  cardCashMap,
  cardAvailableMap,
  getUserCashForCard,
  onDataChanged,
}: BorrowerProfilePanelProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeForm, setActiveForm] = useState<null | "give" | "collect">(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportPanelOpen, setExportPanelOpen] = useState(false);

  // --- form fields (shared) ---
  const [amount, setAmount] = useState("");
  const [txDate, setTxDate] = useState(todayIST());
  const [remarks, setRemarks] = useState("");
  const [sourceType, setSourceType] = useState<"cash_on_hand" | "credit_card">("cash_on_hand");
  const [selectedCardId, setSelectedCardId] = useState("");

  const tableName = mode === "card" ? "card_lent_ledger" : "pocket_lent_ledger";

  useEffect(() => {
    if (open && borrower) {
      fetchEntries();
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, borrower?.id]);

  const resetForm = () => {
    setActiveForm(null);
    setAmount("");
    setTxDate(todayIST());
    setRemarks("");
    setSourceType("cash_on_hand");
    setSelectedCardId(accessibleCards[0]?.id || "");
  };

  const fetchEntries = async () => {
    if (!borrower) return;
    setIsLoading(true);
    let query = supabase
      .from(tableName)
      .select("*")
      .eq("borrower_id", borrower.id);
    // পকেট সিস্টেম সম্পূর্ণ ব্যক্তিগত — শুধু নিজের এন্ট্রিই দেখা যাবে
    if (mode === "pocket" && currentUser) {
      query = query.eq("recorded_by", currentUser.id);
    }
    const { data } = await query
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    setEntries((data as any) || []);
    setIsLoading(false);
  };

  // --- Summary ---
  const totalGiven = entries.filter(e => e.entry_type === "given").reduce((s, e) => s + Number(e.amount), 0);
  const totalCollected = entries.filter(e => e.entry_type === "collected").reduce((s, e) => s + Number(e.amount), 0);
  const netDue = totalGiven - totalCollected;

  const givenByCash = entries.filter(e => e.entry_type === "given" && e.source_type === "cash_on_hand").reduce((s, e) => s + Number(e.amount), 0);
  const givenByCard = entries.filter(e => e.entry_type === "given" && e.source_type === "credit_card").reduce((s, e) => s + Number(e.amount), 0);

  const getCardName = (cardId?: string | null) =>
    accessibleCards.find(c => c.id === cardId)?.card_name || "Card";

  const getCardLabel = (cardId?: string | null) => {
    const c = accessibleCards.find(c => c.id === cardId);
    return c ? `${c.card_name} (**${c.last_4_digits})` : "Card";
  };

  const getRecorderName = (userId?: string | null) =>
    allProfiles.find(p => p.id === userId)?.name || "Unknown";

  // --- খাতাবুক-স্টাইল timeline: chronological ascending ক্রমে running balance বসিয়ে
  // তারপর date অনুযায়ী group করে নতুন-থেকে-পুরনো সাজানো হচ্ছে ---
  const chronological = [...entries].sort((a, b) => {
    const d = a.transaction_date.localeCompare(b.transaction_date);
    if (d !== 0) return d;
    return a.created_at.localeCompare(b.created_at);
  });
  let running = 0;
  const withBalance = chronological.map((e) => {
    running += e.entry_type === "given" ? Number(e.amount) : -Number(e.amount);
    return { ...e, balanceAfter: running };
  });
  const displayOrder = [...withBalance].reverse(); // নতুন এন্ট্রি উপরে

  const dateGroups: { date: string; rows: typeof displayOrder }[] = [];
  displayOrder.forEach((row) => {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === row.transaction_date) last.rows.push(row);
    else dateGroups.push({ date: row.transaction_date, rows: [row] });
  });

  const formatDateLabel = (dateStr: string, isFirst: boolean) => {
    const d = new Date(dateStr);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
    if (!isFirst) return label;
    const diffDays = Math.round((Date.now() - d.getTime()) / 86400000);
    if (diffDays === 0) return `${label} • আজ`;
    if (diffDays === 1) return `${label} • গতকাল`;
    if (diffDays > 1) return `${label} • ${diffDays} দিন আগে`;
    return label;
  };

  // --- Cash balance update (mirrors original updateCashBalance) ---
  const updateCashBalance = async (userId: string, cardId: string, amt: number, type: "credit" | "debit", note: string) => {
    const { data: coh } = await supabase.from("cash_on_hand").select("*").eq("user_id", userId).eq("card_id", cardId).maybeSingle();
    const currentBalance = coh ? Number(coh.current_balance) : 0;
    const newBalance = type === "credit" ? currentBalance + amt : currentBalance - amt;

    const { data: updatedRows, error: cashUpdateError } = await supabase
      .from("cash_on_hand")
      .update({ current_balance: newBalance })
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .select("user_id");
    if (cashUpdateError) throw cashUpdateError;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertErr } = await supabase.from("cash_on_hand").insert({ user_id: userId, card_id: cardId, current_balance: newBalance });
      if (insertErr) throw insertErr;
    }

    const { error: ledgerErr } = await supabase.from("cash_on_hand_ledger").insert({
      user_id: userId,
      card_id: cardId,
      amount: amt,
      transaction_type: type,
      remarks: note,
      transaction_date: new Date().toISOString(),
    });
    if (ledgerErr) throw ledgerErr;
  };

  // Fresh available-limit recompute for a card (used for accurate alert numbers)
  const getFreshCardAvailable = async (cardId: string) => {
    const { data: cardInfo } = await supabase.from("cards").select("total_limit, is_primary, parent_card_id").eq("id", cardId).maybeSingle();
    if (!cardInfo) return 0;
    const { data: txs } = await supabase.from("card_transactions").select("amount, type, status, qr_id, settled_to_user, remarks, card_id").eq("card_id", cardId);
    const { data: spends } = await supabase.from("spends").select("amount, payment_method, card_id").eq("card_id", cardId);
    const withdrawals = (txs || []).filter(t => {
      if (t.type !== "withdrawal") return false;
      const isRotation = t.qr_id || t.settled_to_user || (t.remarks || "").toLowerCase().includes("rotation");
      return isRotation || t.status === "pending_settlement";
    }).reduce((s, t) => s + Number(t.amount), 0);
    const billPay = (txs || []).filter(t => t.type === "bill_payment").reduce((s, t) => s + Number(t.amount), 0);
    const ccSpends = (spends || []).filter(s => s.payment_method === "credit_card").reduce((s, sp) => s + Number(sp.amount), 0);
    return Number(cardInfo.total_limit) - withdrawals - ccSpends + billPay;
  };

  // --- SAVE: You Gave ---
  const handleSaveGiven = async () => {
    if (!currentUser || !borrower) return;
    const amtNum = Number(amount);
    if (isNaN(amtNum) || amtNum <= 0 || !txDate) {
      alert("সঠিক পরিমাণ ও তারিখ দিন।");
      return;
    }

    if (mode === "card") {
      if (sourceType === "cash_on_hand") {
        const avail = getUserCashForCard(currentUser.id, selectedCardId);
        if (amtNum > avail) {
          alert(`Insufficient Cash! এই কার্ডে মাত্র ₹${avail.toLocaleString()} আছে।`);
          return;
        }
      } else if (sourceType === "credit_card") {
        const avail = cardAvailableMap[selectedCardId] || 0;
        if (amtNum > avail) {
          alert(`Insufficient Limit! এই কার্ডে মাত্র ₹${avail.toLocaleString()} available.`);
          return;
        }
      }
      if (!selectedCardId) {
        alert("একটা কার্ড সিলেক্ট করুন।");
        return;
      }
    }

    setIsSaving(true);
    try {
      if (mode === "card") {
        if (sourceType === "cash_on_hand") {
          await updateCashBalance(currentUser.id, selectedCardId, amtNum, "debit", `Lent given to ${borrower.name}`);
        } else {
          await supabase.from("card_transactions").insert({
            card_id: selectedCardId,
            amount: amtNum,
            type: "withdrawal",
            status: "pending_settlement",
            transaction_date: txDate,
            recorded_by: currentUser.id,
            remarks: `Lent given to ${borrower.name}`,
          });
          await supabase.from("spends").insert({
            user_id: currentUser.id,
            amount: amtNum,
            spend_type: "personal",
            payment_method: "from_card_limit",
            spend_date: txDate,
            card_id: selectedCardId,
            remarks: `Lent to ${borrower.name} from card`,
          });
        }
      }

      const { error: insertErr } = await supabase.from(tableName).insert({
        borrower_id: borrower.id,
        entry_type: "given",
        amount: amtNum,
        transaction_date: txDate,
        ...(mode === "card" ? { source_type: sourceType, card_id: selectedCardId } : {}),
        remarks: remarks || null,
        recorded_by: currentUser.id,
      });
      if (insertErr) throw insertErr;

      resetForm();
      await fetchEntries();
      onDataChanged();

      if (mode === "card") {
        const sourceName = sourceType === "credit_card" ? getCardName(selectedCardId) : "Cash on Hand";
        let freshRemainingBalance = 0;
        if (sourceType === "cash_on_hand") {
          const { data: freshCoh } = await supabase.from("cash_on_hand").select("current_balance").eq("user_id", currentUser.id).eq("card_id", selectedCardId).maybeSingle();
          freshRemainingBalance = freshCoh ? Number(freshCoh.current_balance) : 0;
        } else {
          freshRemainingBalance = await getFreshCardAvailable(selectedCardId);
        }

        const { data: freshLedger } = await supabase.from("card_lent_ledger").select("amount, entry_type");
        const freshTotalDue = (freshLedger || []).reduce((acc, r: any) => acc + (r.entry_type === "given" ? Number(r.amount) : -Number(r.amount)), 0);

        await sendLentIssueAlert(
          allProfiles,
          currentUser.name,
          borrower.name,
          amtNum,
          sourceName,
          freshRemainingBalance,
          freshTotalDue,
          "-",
          remarks
        );
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- SAVE: You Got ---
  const handleSaveCollected = async () => {
    if (!currentUser || !borrower) return;
    const amtNum = Number(amount);
    if (isNaN(amtNum) || amtNum <= 0 || !txDate) {
      alert("সঠিক পরিমাণ ও তারিখ দিন।");
      return;
    }
    if (amtNum > netDue) {
      alert(`এই borrower-এর বর্তমান বাকি (₹${netDue.toLocaleString()}) থেকে বেশি collect করা যাবে না।`);
      return;
    }
    if (mode === "card" && !selectedCardId) {
      alert("একটা কার্ড সিলেক্ট করুন।");
      return;
    }

    setIsSaving(true);
    try {
      if (mode === "card") {
        if (sourceType === "cash_on_hand") {
          await updateCashBalance(currentUser.id, selectedCardId, amtNum, "credit", `Collected lent from ${borrower.name}`);
        } else {
          let activeCycleId = null;
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

          const { data: cycles } = await supabase.from("billing_cycles").select("*").eq("card_id", selectedCardId).gte("billing_month", startOfMonth).lte("billing_month", endOfMonth);
          if (cycles && cycles.length > 0) {
            const cycle = cycles[0];
            const generatedAmt = Number(cycle.generated_amount);
            const paidAmt = Number(cycle.paid_amount);
            if (paidAmt < generatedAmt) {
              const newPaidAmt = paidAmt + amtNum;
              let cycleStatus = cycle.status;
              if (newPaidAmt >= generatedAmt) cycleStatus = "paid";
              else if (newPaidAmt > 0) cycleStatus = "partially_paid";
              await supabase.from("billing_cycles").update({ paid_amount: newPaidAmt, status: cycleStatus }).eq("id", cycle.id);
              activeCycleId = cycle.id;
            }
          }

          await supabase.from("card_transactions").insert({
            card_id: selectedCardId,
            amount: amtNum,
            transaction_date: txDate,
            type: "bill_payment",
            status: "settled",
            recorded_by: currentUser.id,
            payment_method: "lent_recovery",
            remarks: `Collected lent from ${borrower.name}`,
            billing_cycle_id: activeCycleId,
          });

          await supabase.from("spends").insert({
            user_id: currentUser.id,
            amount: -amtNum,
            spend_type: "personal",
            payment_method: "lent_recovery",
            spend_date: txDate,
            card_id: selectedCardId,
            remarks: `Lent recovery from ${borrower.name}`,
          });
        }
      }

      const { error: insertErr } = await supabase.from(tableName).insert({
        borrower_id: borrower.id,
        entry_type: "collected",
        amount: amtNum,
        transaction_date: txDate,
        ...(mode === "card" ? { source_type: sourceType, card_id: selectedCardId } : {}),
        remarks: remarks || null,
        recorded_by: currentUser.id,
      });
      if (insertErr) throw insertErr;

      resetForm();
      await fetchEntries();
      onDataChanged();

      if (mode === "card") {
        const receivedOn = sourceType === "credit_card" ? getCardName(selectedCardId) : "Cash on hand";
        let freshCurrentBal = 0;
        if (sourceType === "cash_on_hand") {
          const { data: freshCoh } = await supabase.from("cash_on_hand").select("current_balance").eq("user_id", currentUser.id).eq("card_id", selectedCardId).maybeSingle();
          freshCurrentBal = freshCoh ? Number(freshCoh.current_balance) : 0;
        } else {
          freshCurrentBal = await getFreshCardAvailable(selectedCardId);
        }
        const remainingDueAfter = netDue - amtNum;

        await sendLentRecoveryAlert(
          allProfiles,
          currentUser.name,
          borrower.name,
          amtNum >= netDue ? "সম্পূর্ণ" : "আংশিক",
          amtNum,
          String(totalGiven),
          receivedOn,
          freshCurrentBal,
          remainingDueAfter,
          remarks
        );
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!borrower) return;
    setIsExporting(true);
    try {
      await exportLedgerPdf({
        borrower,
        entries: withBalance,
        mode,
        dateFrom: exportFrom || null,
        dateTo: exportTo || null,
        getCardLabel,
        getRecorderName,
      });
      setExportPanelOpen(false);
    } catch (err: any) {
      alert("PDF Export Error: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!borrower) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#030014] border-l border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
          >
            {/* Background — মূল পেজের মতোই grid + glow, যাতে ডিজাইন consistent থাকে */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#f59e0b0a_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b0a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
              <div className="absolute top-[-15%] right-[-30%] w-[80vw] h-[80vw] rounded-full bg-[#f59e0b] opacity-[0.08] blur-[120px] mix-blend-screen" />
              <div className="absolute bottom-[10%] left-[-30%] w-[70vw] h-[70vw] rounded-full bg-[#ef4444] opacity-[0.08] blur-[100px] mix-blend-screen" />
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-[14px] bg-[#f59e0b]/10 border border-white/5 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#f59e0b]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-white truncate">{borrower.name}</h2>
                  {borrower.phone && <p className="text-[11px] text-slate-400 truncate">{borrower.phone}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setExportPanelOpen((p) => !p)}
                  title="Export Ledger PDF"
                  className={`p-2 rounded-full transition-colors ${exportPanelOpen ? "bg-[#f59e0b]/15 text-[#f59e0b]" : "hover:bg-white/5 text-slate-400 hover:text-white"}`}
                >
                  <FileDown className="w-5 h-5" />
                </button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PDF Export — date filter */}
            <AnimatePresence>
              {exportPanelOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="relative z-10 overflow-hidden border-b border-white/5 bg-white/[0.02] shrink-0"
                >
                  <div className="p-4 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">From (optional)</label>
                      <input
                        type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-[#f59e0b] mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">To (optional)</label>
                      <input
                        type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-[#f59e0b] mt-1"
                      />
                    </div>
                    <button
                      disabled={isExporting}
                      onClick={handleExportPdf}
                      className="h-[38px] px-4 rounded-lg bg-[#f59e0b] text-black text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                      PDF
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Summary */}
            <div className="relative z-10 px-5 py-4 border-b border-white/5 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net Due</p>
                  <p className={`text-xl font-black ${netDue > 0 ? "text-[#f59e0b]" : "text-emerald-400"}`}>
                    ₹{Math.abs(netDue).toLocaleString("en-IN")}
                  </p>
                  {netDue <= 0 && totalGiven > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Settled ✓</p>}
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Given / Got</p>
                  <p className="text-sm font-bold text-white">₹{totalGiven.toLocaleString("en-IN")} <span className="text-slate-500">/</span> ₹{totalCollected.toLocaleString("en-IN")}</p>
                </div>
              </div>
              {mode === "card" && (givenByCash > 0 || givenByCard > 0) && (
                <div className="flex gap-3 mt-2 text-[10px] font-medium text-slate-400">
                  <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> Cash: ₹{givenByCash.toLocaleString("en-IN")}</span>
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Card: ₹{givenByCard.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>

            {/* Action Buttons — ইচ্ছাকৃতভাবে উপরে বসানো হয়েছে (নিচে নয়), কারণ পেজের নিচে
                সবসময় একটা floating BottomNav ডক থাকে যেটা bottom-এ রাখা বাটনকে ঢেকে দিচ্ছিল */}
            <div className="relative z-10 shrink-0 border-b border-white/5">
              {!activeForm ? (
                <div className="flex gap-2 p-4">
                  <button
                    onClick={() => { resetForm(); setActiveForm("give"); }}
                    className="flex-1 py-3 rounded-2xl text-sm font-black text-white bg-[#ef4444]/15 border border-[#ef4444]/30 hover:bg-[#ef4444]/25 transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle className="w-4 h-4 text-[#ef4444]" /> You Gave
                  </button>
                  <button
                    onClick={() => { resetForm(); setActiveForm("collect"); }}
                    className="flex-1 py-3 rounded-2xl text-sm font-black text-white bg-emerald-400/15 border border-emerald-400/30 hover:bg-emerald-400/25 transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowDownCircle className="w-4 h-4 text-emerald-400" /> You Got
                  </button>
                </div>
              ) : (
                <AnimatePresence>
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-white/[0.02] overflow-hidden"
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-black uppercase tracking-wider ${activeForm === "give" ? "text-[#ef4444]" : "text-emerald-400"}`}>
                          {activeForm === "give" ? "You Gave" : "You Got"}
                        </span>
                        <button onClick={() => setActiveForm(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                      </div>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                      />
                      <input
                        type="date"
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                      />
                      {mode === "card" && (
                        <>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSourceType("cash_on_hand")}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold border ${sourceType === "cash_on_hand" ? "bg-[#f59e0b]/15 border-[#f59e0b] text-[#f59e0b]" : "border-white/10 text-slate-400"}`}
                            >
                              Cash on Hand
                            </button>
                            <button
                              onClick={() => setSourceType("credit_card")}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold border ${sourceType === "credit_card" ? "bg-[#f59e0b]/15 border-[#f59e0b] text-[#f59e0b]" : "border-white/10 text-slate-400"}`}
                            >
                              Credit Card
                            </button>
                          </div>
                          <div className="relative">
                            <select
                              value={selectedCardId}
                              onChange={(e) => setSelectedCardId(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                            >
                              <option value="" disabled className="bg-[#0d0d0d] text-slate-500">Select a card...</option>
                              {accessibleCards.map((c) => {
                                // আগের কোডের মতোই — dropdown-এর ভেতরেই প্রতিটা কার্ডের Available/Cash দেখানো হচ্ছে
                                const cashBal = currentUser ? (cardCashMap[currentUser.id]?.[c.id] || 0) : 0;
                                const avail = cardAvailableMap[c.id] || 0;
                                return (
                                  <option key={c.id} value={c.id} className="bg-[#0d0d0d]">
                                    {activeForm === "give"
                                      ? sourceType === "cash_on_hand"
                                        ? `${c.card_name} (**${c.last_4_digits}) — Cash: ₹${cashBal.toLocaleString("en-IN")}`
                                        : `${c.card_name} (**${c.last_4_digits}) — Avail: ₹${avail.toLocaleString("en-IN")}`
                                      : sourceType === "cash_on_hand"
                                        ? `${c.card_name} (**${c.last_4_digits}) — Cash: ₹${cashBal.toLocaleString("en-IN")}`
                                        : `${c.card_name} (**${c.last_4_digits})`}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          {/* সিলেক্ট করা কার্ডের বর্তমান Available/Cash — আগের কোডের actorCash/avail badge-এর মতোই */}
                          {selectedCardId && (
                            <p className="text-[10px] font-bold text-slate-400 ml-1">
                              {sourceType === "cash_on_hand"
                                ? `এই কার্ডে বর্তমান Cash: ₹${(currentUser ? (cardCashMap[currentUser.id]?.[selectedCardId] || 0) : 0).toLocaleString("en-IN")}`
                                : activeForm === "give"
                                  ? `এই কার্ডে বর্তমান Available Limit: ₹${(cardAvailableMap[selectedCardId] || 0).toLocaleString("en-IN")}`
                                  : ""}
                            </p>
                          )}
                        </>
                      )}
                      <input
                        type="text"
                        placeholder="Remarks (optional)"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveForm(null)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                        >
                          Cancel
                        </button>
                        {(() => {
                          const amtNum = Number(amount);
                          const isNoAmount = isNaN(amtNum) || amtNum <= 0;
                          let isInsufficient = false;
                          let insufficientLabel = "";
                          if (activeForm === "give" && mode === "card" && selectedCardId && !isNoAmount) {
                            if (sourceType === "cash_on_hand") {
                              const avail = currentUser ? (cardCashMap[currentUser.id]?.[selectedCardId] || 0) : 0;
                              if (amtNum > avail) { isInsufficient = true; insufficientLabel = "Insufficient Cash Balance"; }
                            } else {
                              const avail = cardAvailableMap[selectedCardId] || 0;
                              if (amtNum > avail) { isInsufficient = true; insufficientLabel = "Insufficient Card Limit"; }
                            }
                          }
                          if (activeForm === "collect" && !isNoAmount && amtNum > netDue) {
                            isInsufficient = true; insufficientLabel = "বাকির চেয়ে বেশি";
                          }
                          const isDisabled = isSaving || isNoAmount || !txDate || isInsufficient || (mode === "card" && !selectedCardId);
                          return (
                            <button
                              disabled={isDisabled}
                              onClick={activeForm === "give" ? handleSaveGiven : handleSaveCollected}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 ${
                                activeForm === "give" ? "bg-[#ef4444]" : "bg-emerald-400"
                              } disabled:opacity-50`}
                            >
                              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                              {isSaving ? "Saving..." : isInsufficient ? insufficientLabel : "Save"}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Entries header row — খাতাবুকের মতো */}
            <div className="relative z-10 grid grid-cols-[1fr_auto_auto] gap-2 px-5 pt-3 pb-2 shrink-0">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Entries</span>
              <span className="text-[10px] font-black text-[#ef4444] uppercase tracking-wider w-20 text-right">You Gave</span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider w-20 text-right">You Got</span>
            </div>

            {/* Timeline — date-grouped, running balance, click করে expand.
                pb-32 রাখা হয়েছে যাতে site-এর নিচের floating dock শেষ entry-টাকে (বা তার
                expanded অংশকে) কখনো ঢেকে না ফেলে */}
            <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-32 space-y-4">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-2.5 w-16 mx-auto rounded bg-white/5 animate-pulse mb-2" />
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 animate-pulse"
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
                        <div className="space-y-1.5">
                          <div className="h-2.5 w-28 rounded bg-white/10" />
                          <div className="h-2.5 w-20 rounded bg-white/5" />
                          <div className="h-4 w-16 rounded-full bg-white/10" />
                        </div>
                        <div className="h-4 w-14 rounded bg-white/10" />
                        <div className="h-4 w-14 rounded bg-white/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">এখনো কোনো এন্ট্রি নেই</p>
              ) : (
                dateGroups.map((group, gi) => (
                  <div key={group.date}>
                    <p className="text-center text-[10px] font-bold text-slate-500 mb-2">
                      {formatDateLabel(group.date, gi === 0)}
                    </p>
                    <div className="space-y-2">
                      {group.rows.map((e) => {
                        const isExpanded = expandedId === e.id;
                        const isGiven = e.entry_type === "given";
                        return (
                          <div
                            key={e.id}
                            onClick={() => setExpandedId(isExpanded ? null : e.id)}
                            className={`rounded-2xl border cursor-pointer transition-colors overflow-hidden ${
                              isGiven ? "bg-[#ef4444]/[0.04] border-[#ef4444]/10" : "bg-emerald-400/[0.04] border-emerald-400/10"
                            }`}
                          >
                            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start px-3 pt-2.5">
                              <div className="min-w-0">
                                {mode === "card" && (
                                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {e.source_type === "credit_card" ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                    {e.source_type === "credit_card" ? "Card" : "Cash on Hand"} · {getCardLabel(e.card_id)}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <UserCircle2 className="w-3 h-3" />
                                  {getRecorderName(e.recorded_by)} রেকর্ড করেছে
                                </p>
                                <span className="inline-block mt-1 text-[10px] font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full">
                                  Bal. ₹{Math.abs(e.balanceAfter).toLocaleString("en-IN")}
                                </span>
                                {e.remarks && <p className="text-[11px] text-slate-400 mt-1.5 truncate">{e.remarks}</p>}
                              </div>
                              <span className="w-20 text-right text-sm font-black text-[#ef4444]">
                                {isGiven ? `₹${Number(e.amount).toLocaleString("en-IN")}` : ""}
                              </span>
                              <span className="w-20 text-right text-sm font-black text-emerald-400">
                                {!isGiven ? `₹${Number(e.amount).toLocaleString("en-IN")}` : ""}
                              </span>
                            </div>
                            {/* তারিখ ও সময় — নিচে ডানদিকে (একই সাইজ, শুধু position পরিবর্তিত) */}
                            <div className="flex justify-end px-3 pb-2 pt-1">
                              <p className="text-[11px] text-slate-300 font-semibold">
                                {new Date(e.transaction_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                {" • "}
                                {new Date(e.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                              </p>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden border-t border-white/5"
                                >
                                  <div className="px-3 py-2.5 space-y-1 text-[11px] text-slate-400">
                                    <p className="flex items-center gap-1.5">
                                      <Calendar className="w-3 h-3" />
                                      পুরো তারিখ: {new Date(e.transaction_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                                    </p>
                                    {e.remarks && <p className="text-slate-300">"{e.remarks}"</p>}
                                    {!e.remarks && <p className="italic text-slate-600">কোনো remarks যোগ করা হয়নি</p>}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}