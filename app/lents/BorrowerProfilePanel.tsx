"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  MoreVertical,
  Pencil,
  Trash2,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sendLentIssueAlert, sendLentRecoveryAlert } from "./WaAlert";
import TransactionTraceInline, { type TraceTarget } from "@/components/TransactionTraceInline";
// PDF export is dynamically imported in handleExportPdf

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
  // এই ৪টা শুধু card_lent_ledger row-এ থাকে — edit/delete-এর সময় কোন cash_on_hand_ledger /
  // card_transactions / spends / billing_cycles row রিভার্স করতে হবে সেটা বোঝার জন্য
  linked_cash_ledger_id?: string | null;
  linked_card_transaction_id?: string | null;
  linked_spend_id?: string | null;
  linked_billing_cycle_id?: string | null;
  ledgerSource?: "card" | "pocket"; // শুধু combined mode-এ ব্যবহৃত
}

type Mode = "card" | "pocket" | "combined";
type SourceChoice = "cash_on_hand" | "credit_card" | "pocket";

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
  const [mounted, setMounted] = useState(false);

  // --- Edit / Delete (3-dot menu) ---
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Borrower details edit (name/phone), directly from the panel ---
  const [borrowerEditOpen, setBorrowerEditOpen] = useState(false);
  const [editBorrowerName, setEditBorrowerName] = useState("");
  const [editBorrowerPhone, setEditBorrowerPhone] = useState("");
  const [isSavingBorrower, setIsSavingBorrower] = useState(false);

  // --- Inline Trace Flow State ---
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  // Portal-এ mount করার আগে document অবশ্যই ready থাকতে হবে (SSR-safe)
  useEffect(() => setMounted(true), []);

  // --- form fields (shared) ---
  const [amount, setAmount] = useState("");
  const [txDate, setTxDate] = useState(todayIST());
  const [remarks, setRemarks] = useState("");
  const [sourceType, setSourceType] = useState<SourceChoice>("cash_on_hand");
  const [selectedCardId, setSelectedCardId] = useState("");

  // combined mode-এ যেটা বেছে নেওয়া হয়েছে সেই অনুযায়ী insert routing হয়
  const isPocketWrite = mode === "pocket" || (mode === "combined" && sourceType === "pocket");
  const tableName = isPocketWrite ? "pocket_lent_ledger" : "card_lent_ledger";

  useEffect(() => {
    if (open && borrower) {
      fetchEntries();
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, borrower?.id]);

  // Tab আবার visible হলে (e.g. অন্য অ্যাপ থেকে ফিরে এলে) fresh ডেটা fetch —
  // realtime event miss হয়ে গেলেও ledger যেন stale না থাকে
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && open && borrower) {
        fetchEntries();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, borrower?.id]);

  useEffect(() => {
    if (!menuOpenId) return;
    const closeMenu = () => setMenuOpenId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpenId]);

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

    if (mode === "combined") {
      // Card অংশ সবার জন্য shared, Pocket অংশ শুধু নিজের — এই দুইটা মিলিয়েই
      // "current user-এর দৃষ্টিকোণ থেকে সম্পূর্ণ ছবি" তৈরি হয়
      const [{ data: cardRows }, { data: pocketRows }] = await Promise.all([
        supabase.from("card_lent_ledger").select("*").eq("borrower_id", borrower.id),
        currentUser
          ? supabase.from("pocket_lent_ledger").select("*").eq("borrower_id", borrower.id).eq("recorded_by", currentUser.id)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const merged: LedgerEntry[] = [
        ...((cardRows as any[]) || []).map((r) => ({ ...r, ledgerSource: "card" as const })),
        ...((pocketRows as any[]) || []).map((r) => ({ ...r, ledgerSource: "pocket" as const })),
      ].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at));
      setEntries(merged);
      setIsLoading(false);
      return;
    }

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

  // --- Cash balance update (mirrors original updateCashBalance) — এখন insert হওয়া
  // cash_on_hand_ledger row-এর id রিটার্ন করে, যাতে card_lent_ledger row-এ linked
  // হিসেবে সেভ করা যায় (edit/delete-এর সময় reverse করতে লাগবে)
  const updateCashBalance = async (userId: string, cardId: string, amt: number, type: "credit" | "debit", note: string, linkedCardTxId?: string | null): Promise<string | null> => {
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

    const { data: ledgerRow, error: ledgerErr } = await supabase.from("cash_on_hand_ledger").insert({
      user_id: userId,
      card_id: cardId,
      amount: amt,
      transaction_type: type,
      remarks: note,
      transaction_date: new Date().toISOString(),
    }).select("id").single();
    if (ledgerErr) throw ledgerErr;
    return ledgerRow?.id || null;
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

    if (!isPocketWrite) {
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
      // এই ৩টা id capture করা হচ্ছে যাতে পরে Edit/Delete করলে ঠিক এই row-গুলোই
      // reverse করা যায় (card_lent_ledger-এর linked_* কলামে সেভ হবে)
      let linkedCashLedgerId: string | null = null;
      let linkedCardTransactionId: string | null = null;
      let linkedSpendId: string | null = null;

      if (!isPocketWrite) {
        if (sourceType === "cash_on_hand") {
          linkedCashLedgerId = await updateCashBalance(currentUser.id, selectedCardId, amtNum, "debit", `Lent given to ${borrower.name}`);
        } else {
          const { data: txRow } = await supabase.from("card_transactions").insert({
            card_id: selectedCardId,
            amount: amtNum,
            type: "withdrawal",
            status: "pending_settlement",
            transaction_date: txDate,
            recorded_by: currentUser.id,
            remarks: `Lent given to ${borrower.name}`,
          }).select("id").single();
          linkedCardTransactionId = txRow?.id || null;

          const { data: spendRow } = await supabase.from("spends").insert({
            user_id: currentUser.id,
            amount: amtNum,
            spend_type: "personal",
            payment_method: "from_card_limit",
            spend_date: txDate,
            card_id: selectedCardId,
            remarks: `Lent to ${borrower.name} from card`,
            linked_card_transaction_id: txRow?.id || null,
          }).select("id").single();
          linkedSpendId = spendRow?.id || null;
        }
      }

      const { error: insertErr } = await supabase.from(tableName).insert({
        borrower_id: borrower.id,
        entry_type: "given",
        amount: amtNum,
        transaction_date: txDate,
        ...(!isPocketWrite ? {
          source_type: sourceType,
          card_id: selectedCardId,
          linked_cash_ledger_id: linkedCashLedgerId,
          linked_card_transaction_id: linkedCardTransactionId,
          linked_spend_id: linkedSpendId,
        } : {}),
        remarks: remarks || null,
        recorded_by: currentUser.id,
      });
      if (insertErr) throw insertErr;

      resetForm();
      await fetchEntries();
      onDataChanged();

      if (!isPocketWrite) {
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
    // নোট: bidirectional feature-এর কারণে amount netDue-এর চেয়ে বেশি হলেও এখন সমস্যা
    // নেই — তার মানে দাঁড়ায় "তুমি এখন ওর কাছে owe করো" (দিক উল্টে গেছে)
    if (!isPocketWrite && !selectedCardId) {
      alert("একটা কার্ড সিলেক্ট করুন।");
      return;
    }

    setIsSaving(true);
    try {
      let linkedCashLedgerId: string | null = null;
      let linkedCardTransactionId: string | null = null;
      let linkedSpendId: string | null = null;
      let linkedBillingCycleId: string | null = null;

      if (!isPocketWrite) {
        if (sourceType === "cash_on_hand") {
          linkedCashLedgerId = await updateCashBalance(currentUser.id, selectedCardId, amtNum, "credit", `Collected lent from ${borrower.name}`);
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
          linkedBillingCycleId = activeCycleId;

          const { data: txRow } = await supabase.from("card_transactions").insert({
            card_id: selectedCardId,
            amount: amtNum,
            transaction_date: txDate,
            type: "bill_payment",
            status: "settled",
            recorded_by: currentUser.id,
            payment_method: "lent_recovery",
            remarks: `Collected lent from ${borrower.name}`,
            billing_cycle_id: activeCycleId,
          }).select("id").single();
          linkedCardTransactionId = txRow?.id || null;

          const { data: spendRow } = await supabase.from("spends").insert({
            user_id: currentUser.id,
            amount: -amtNum,
            spend_type: "personal",
            payment_method: "lent_recovery",
            spend_date: txDate,
            card_id: selectedCardId,
            remarks: `Lent recovery from ${borrower.name}`,
            linked_card_transaction_id: txRow?.id || null,
          }).select("id").single();
          linkedSpendId = spendRow?.id || null;
        }
      }

      const { error: insertErr } = await supabase.from(tableName).insert({
        borrower_id: borrower.id,
        entry_type: "collected",
        amount: amtNum,
        transaction_date: txDate,
        ...(!isPocketWrite ? {
          source_type: sourceType,
          card_id: selectedCardId,
          linked_cash_ledger_id: linkedCashLedgerId,
          linked_card_transaction_id: linkedCardTransactionId,
          linked_spend_id: linkedSpendId,
          linked_billing_cycle_id: linkedBillingCycleId,
          billing_cycle_delta_amount: linkedBillingCycleId ? amtNum : null,
        } : {}),
        remarks: remarks || null,
        recorded_by: currentUser.id,
      });
      if (insertErr) throw insertErr;

      resetForm();
      await fetchEntries();
      onDataChanged();

      if (!isPocketWrite) {
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

  // --- Edit / Delete (creator-only) ---
  const handleStartEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setEditAmount(String(entry.amount));
    setEditDate(entry.transaction_date);
    setEditRemarks(entry.remarks || "");
  };

  const handleSaveEditEntry = async () => {
    if (!editingEntry) return;
    const amtNum = Number(editAmount);
    if (isNaN(amtNum) || amtNum <= 0 || !editDate) {
      alert("সঠিক পরিমাণ ও তারিখ দিন।");
      return;
    }
    const isPocketEntry = mode === "pocket" || editingEntry.ledgerSource === "pocket";
    setIsSavingEdit(true);
    try {
      if (isPocketEntry) {
        const { error } = await supabase
          .from("pocket_lent_ledger")
          .update({ amount: amtNum, transaction_date: editDate, remarks: editRemarks || null })
          .eq("id", editingEntry.id);
        if (error) throw error;
      } else {
        // Atomic RPC — amount/date/remarks change শুধু, cash/card/billing_cycle সব
        // এর ভিতরেই delta অনুযায়ী adjust হয়ে যাবে (source/card বদলানো যাবে না)
        const { error } = await supabase.rpc("edit_card_lent_entry", {
          p_entry_id: editingEntry.id,
          p_new_amount: amtNum,
          p_new_date: editDate,
          p_new_remarks: editRemarks || null,
        });
        if (error) throw error;
      }
      setEditingEntry(null);
      await fetchEntries();
      onDataChanged();
    } catch (err: any) {
      alert("Edit Error: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const isPocketEntry = mode === "pocket" || deleteTarget.ledgerSource === "pocket";
    setIsDeleting(true);
    try {
      if (isPocketEntry) {
        const { error } = await supabase.from("pocket_lent_ledger").delete().eq("id", deleteTarget.id);
        if (error) throw error;
      } else {
        // Atomic RPC — cash_on_hand / card_transactions / spends / billing_cycles
        // সব একসাথে reverse হবে, নাহলে কিছুই হবে না (transaction-wrapped)
        const { error } = await supabase.rpc("delete_card_lent_entry", { p_entry_id: deleteTarget.id });
        if (error) throw error;
      }
      setDeleteTarget(null);
      await fetchEntries();
      onDataChanged();
    } catch (err: any) {
      alert("Delete Error: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveBorrowerDetails = async () => {
    if (!borrower || !editBorrowerName.trim()) return;
    setIsSavingBorrower(true);
    try {
      const { error } = await supabase
        .from("borrowers")
        .update({ name: editBorrowerName.trim(), phone: editBorrowerPhone.trim() || null })
        .eq("id", borrower.id);
      if (error) throw error;
      setBorrowerEditOpen(false);
      onDataChanged(); // parent-এর borrower list refresh হবে (নাম বদলে গেলে ওখানেও দেখাতে হবে)
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSavingBorrower(false);
    }
  };

  const handleExportPdf = async () => {
    if (!borrower) return;
    setIsExporting(true);
    try {
      const { exportLedgerPdf } = await import("./pdfExport");
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

  if (!borrower || !mounted) return null;

  return createPortal(
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
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-black text-white truncate">{borrower.name}</h2>
                    <button
                      onClick={() => { setEditBorrowerName(borrower.name); setEditBorrowerPhone(borrower.phone || ""); setBorrowerEditOpen(true); }}
                      title="Borrower Details Edit"
                      className="p-1 rounded-full hover:bg-white/10 text-slate-500 hover:text-white transition-colors shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
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
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {netDue > 0 ? "Owes You" : netDue < 0 ? "You Owe" : "Net Due"}
                  </p>
                  <p className={`text-xl font-black ${netDue > 0 ? "text-[#ef4444]" : netDue < 0 ? "text-emerald-400" : "text-emerald-400"}`}>
                    ₹{Math.abs(netDue).toLocaleString("en-IN")}
                  </p>
                  {netDue === 0 && totalGiven > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Settled ✓</p>}
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Given / Got</p>
                  <p className="text-sm font-bold text-white">₹{totalGiven.toLocaleString("en-IN")} <span className="text-slate-500">/</span> ₹{totalCollected.toLocaleString("en-IN")}</p>
                </div>
              </div>
              {(mode === "card" || mode === "combined") && (givenByCash > 0 || givenByCard > 0) && (
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
                      {(mode === "card" || mode === "combined") && (
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
                            {mode === "combined" && (
                              <button
                                onClick={() => setSourceType("pocket")}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border ${sourceType === "pocket" ? "bg-emerald-400/15 border-emerald-400 text-emerald-400" : "border-white/10 text-slate-400"}`}
                              >
                                Pocket
                              </button>
                            )}
                          </div>
                          {sourceType === "pocket" && (
                            <p className="text-[10px] text-slate-500 ml-1">ব্যক্তিগত পকেট থেকে — কোনো card/cash touch হবে না, শুধু তুমিই দেখতে পাবে</p>
                          )}
                          {sourceType !== "pocket" && (
                            <>
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
                          if (activeForm === "give" && !isPocketWrite && selectedCardId && !isNoAmount) {
                            if (sourceType === "cash_on_hand") {
                              const avail = currentUser ? (cardCashMap[currentUser.id]?.[selectedCardId] || 0) : 0;
                              if (amtNum > avail) { isInsufficient = true; insufficientLabel = "Insufficient Cash Balance"; }
                            } else if (sourceType === "credit_card") {
                              const avail = cardAvailableMap[selectedCardId] || 0;
                              if (amtNum > avail) { isInsufficient = true; insufficientLabel = "Insufficient Card Limit"; }
                            }
                          }
                          // "You Got" amount netDue-কে ছাড়িয়ে গেলেও এখন সমস্যা নেই — bidirectional
                          // ফিচারে সেটা মানে "দিক উল্টে গেছে, তুমি এখন তার কাছে owe করো"
                          const isDisabled = isSaving || isNoAmount || !txDate || isInsufficient || (!isPocketWrite && !selectedCardId);
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
                        const isOwner = !!currentUser && e.recorded_by === currentUser.id;
                        const isMenuOpen = menuOpenId === e.id;
                        return (
                          <div
                            key={e.id}
                            onClick={() => setExpandedId(isExpanded ? null : e.id)}
                            className={`relative rounded-2xl border cursor-pointer transition-colors overflow-visible ${
                              isGiven ? "bg-[#ef4444]/[0.04] border-[#ef4444]/10" : "bg-emerald-400/[0.04] border-emerald-400/10"
                            }`}
                          >
                            {isOwner && (
                              <div className="absolute top-1.5 right-1.5 z-20">
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); setMenuOpenId(isMenuOpen ? null : e.id); }}
                                  className="p-1 rounded-full hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                                <AnimatePresence>
                                  {isMenuOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      onClick={(ev) => ev.stopPropagation()}
                                      className="absolute right-0 top-7 bg-[#0d0d0d] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[110px]"
                                    >
                                      <button
                                        onClick={() => { setMenuOpenId(null); handleStartEdit(e); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"
                                      >
                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                      </button>
                                      <button
                                        onClick={() => { setMenuOpenId(null); setDeleteTarget(e); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#ef4444] hover:bg-[#ef4444]/10"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start px-3 pt-2.5 pr-7">
                              <div className="min-w-0">
                                {mode === "card" && (
                                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {e.source_type === "credit_card" ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                    {e.source_type === "credit_card" ? "Card" : "Cash on Hand"} · {getCardLabel(e.card_id)}
                                  </p>
                                )}
                                {mode === "combined" && (
                                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {e.ledgerSource === "pocket" ? (
                                      <>👛 Pocket</>
                                    ) : (
                                      <>
                                        {e.source_type === "credit_card" ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                        💳 {e.source_type === "credit_card" ? "Card" : "Cash on Hand"} · {getCardLabel(e.card_id)}
                                      </>
                                    )}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <UserCircle2 className="w-3 h-3" />
                                  {getRecorderName(e.recorded_by)} রেকর্ড করেছে
                                </p>
                              </div>
                              <span className="w-20 text-right text-sm font-black text-[#ef4444]">
                                {isGiven ? `₹${Number(e.amount).toLocaleString("en-IN")}` : ""}
                              </span>
                              <span className="w-20 text-right text-sm font-black text-emerald-400">
                                {!isGiven ? `₹${Number(e.amount).toLocaleString("en-IN")}` : ""}
                              </span>
                            </div>
                            {/* বাঁদিকে শেষ লাইন (balance badge / remarks) আর ডানদিকে date & time — একই লাইনে,
                                items-end দিয়ে যেন বাঁদিকের block যতই লম্বা হোক ডানদিকেরটা তার নিচের কিনারায় বসে */}
                            <div className="flex items-end justify-between gap-2 px-3 pb-2 pt-1">
                              <div className="min-w-0">
                                <span className="inline-block text-[10px] font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full">
                                  Bal. ₹{Math.abs(e.balanceAfter).toLocaleString("en-IN")}
                                </span>
                                {e.remarks && <p className="text-[11px] text-slate-400 mt-1.5 truncate">{e.remarks}</p>}
                              </div>
                              <p className="shrink-0 text-[11px] text-slate-300 font-semibold whitespace-nowrap">
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
                                    {(!e.ledgerSource || e.ledgerSource !== "pocket") && mode !== "pocket" && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            setActiveTraceId(activeTraceId === e.id ? null : e.id);
                                          }}
                                          className={`w-full mt-2 py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                                            activeTraceId === e.id
                                              ? "bg-sky-500/25 text-sky-300 border-sky-400"
                                              : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30"
                                          }`}
                                        >
                                          <Layers className="w-3.5 h-3.5" />
                                          {activeTraceId === e.id ? "ট্রেস ফ্লো বন্ধ করুন" : "টাকার উৎস ও লিঙ্কড রেকর্ড দেখুন (Trace Flow)"}
                                        </button>

                                        {activeTraceId === e.id && (
                                          <TransactionTraceInline
                                            target={{
                                              id: e.id,
                                              sourceType: "lent",
                                              title: `Lent with ${borrower.name}`,
                                              amount: Number(e.amount),
                                              date: e.transaction_date,
                                              remarks: e.remarks || "",
                                            }}
                                            onClose={() => setActiveTraceId(null)}
                                          />
                                        )}
                                      </>
                                    )}
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

          {/* Borrower Details Edit Modal */}
          <AnimatePresence>
            {borrowerEditOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !isSavingBorrower && setBorrowerEditOpen(false)}
                  className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="fixed inset-x-6 top-24 z-[81] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-black text-white">Borrower Details Edit</h3>
                    <button onClick={() => !isSavingBorrower && setBorrowerEditOpen(false)} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                  <input
                    type="text" placeholder="নাম" value={editBorrowerName} onChange={(e) => setEditBorrowerName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                  />
                  <input
                    type="text" placeholder="ফোন নম্বর (optional)" value={editBorrowerPhone} onChange={(e) => setEditBorrowerPhone(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setBorrowerEditOpen(false)}
                      disabled={isSavingBorrower}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBorrowerDetails}
                      disabled={isSavingBorrower || !editBorrowerName.trim()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black bg-[#f59e0b] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSavingBorrower && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Edit Entry Modal */}
          <AnimatePresence>
            {editingEntry && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !isSavingEdit && setEditingEntry(null)}
                  className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="fixed inset-x-6 top-24 z-[81] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-black text-white">
                      Edit — {editingEntry.entry_type === "given" ? "You Gave" : "You Got"}
                    </h3>
                    <button onClick={() => !isSavingEdit && setEditingEntry(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                  <p className="text-[10px] text-slate-500 -mt-2">
                    Source পরিবর্তন করা যাবে না — শুধু amount, date ও remarks এডিট করা যাবে।
                  </p>
                  <input
                    type="number" placeholder="Amount" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                  />
                  <input
                    type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                  />
                  <input
                    type="text" placeholder="Remarks (optional)" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#f59e0b]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditingEntry(null)}
                      disabled={isSavingEdit}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEditEntry}
                      disabled={isSavingEdit}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black bg-[#f59e0b] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSavingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isSavingEdit ? "Saving..." : "Save"}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteTarget && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !isDeleting && setDeleteTarget(null)}
                  className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="fixed inset-x-6 top-32 z-[81] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-[#ef4444]">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="text-sm font-black">এন্ট্রি ডিলিট করবে?</h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    {mode === "pocket" || deleteTarget.ledgerSource === "pocket"
                      ? "এই entry মুছে ফেলা হবে।"
                      : "এই entry মুছলে card cash/limit ও ফিরে যাবে, নিশ্চিত?"}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setDeleteTarget(null)}
                      disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#ef4444] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

        </>
      )}
    </AnimatePresence>,
    document.body
  );
}