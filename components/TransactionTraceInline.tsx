"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  ArrowRight, 
  CreditCard, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  User, 
  QrCode, 
  Receipt, 
  ExternalLink,
  Layers,
  Banknote,
  Loader2,
  AlertCircle,
  ArrowLeftRight,
  ChevronRight,
  HandCoins
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface TraceTarget {
  id: string;
  sourceType: "card_transaction" | "cash_ledger" | "spend" | "lent" | "pocket_advance";
  title?: string;
  amount?: number;
  date?: string;
  remarks?: string;
  extra?: any;
}

interface TransactionTraceInlineProps {
  target: TraceTarget;
  onClose: () => void;
  className?: string;
}

export default function TransactionTraceInline({
  target,
  onClose,
  className = "",
}: TransactionTraceInlineProps) {
  const [loading, setLoading] = useState(true);
  const [traceData, setTraceData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchTraceRelations(target);
        if (isMounted) {
          setTraceData(data);
        }
      } catch (err) {
        console.error("Error loading trace data:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [target.id, target.sourceType]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, scale: 0.98 }}
      animate={{ opacity: 1, height: "auto", scale: 1 }}
      exit={{ opacity: 0, height: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full overflow-hidden my-2.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full bg-[#09071c]/95 border border-sky-500/30 rounded-2xl p-3.5 sm:p-4 text-slate-100 shadow-xl relative">
        {/* Subtle Ambient Accent (No blur over page, local to card only) */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-black tracking-wide text-white">
                  ট্রেস ফ্লো (দ্বিমুখী ডেটা লিঙ্ক)
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase">
                  Live DB Link
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                টাকার উৎস, মাধ্যম ও গন্তব্যের ডাটাবেস রেকর্ড
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-colors border border-white/5"
          >
            <X className="w-3.5 h-3.5" />
            <span>বন্ধ করুন</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="pt-3 relative z-10">
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>লিংকড ডাটাবেস তথ্য লোড হচ্ছে...</span>
            </div>
          ) : !traceData ? (
            <div className="py-5 text-center text-slate-400 text-xs">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 text-slate-500" />
              <span>কোনো সরাসরি ডাটাবেস লিঙ্ক পাওয়া যায়নি।</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 1. Visual Mini Journey Breadcrumbs */}
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-[10px] sm:text-[11px] flex-wrap gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-slate-400">উৎস:</span>
                  <span className="font-bold text-slate-100 truncate max-w-[130px] sm:max-w-[180px]">
                    {getJourneyOrigin(traceData)}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-slate-600 shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-slate-400">মাধ্যম:</span>
                  <span className="font-bold text-amber-300 truncate max-w-[130px] sm:max-w-[180px]">
                    {getJourneyAction(traceData)}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-slate-600 shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  <span className="text-slate-400">গন্তব্য:</span>
                  <span className="font-bold text-sky-300 truncate max-w-[130px] sm:max-w-[180px]">
                    {getJourneyDestination(traceData)}
                  </span>
                </div>
              </div>

              {/* 2. Detailed Linked Table Specifications */}
              {renderLinkedColumnsSpec(traceData)}

              {/* 3. Database Keys Verified */}
              <div className="pt-1 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                <span>🔗 Primary ID: {target.id.slice(0, 8)}...{target.id.slice(-4)}</span>
                {traceData.foreignId && (
                  <span className="text-sky-400/80">Linked FK: {traceData.foreignId.slice(0, 8)}...</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Query Resolver ─────────────────────────────────────────────────────────

async function fetchTraceRelations(t: TraceTarget): Promise<any> {
  if (t.sourceType === "cash_ledger") {
    // 1. Fetch cash ledger row
    const { data: cl } = await supabase
      .from("cash_on_hand_ledger")
      .select(`
        *,
        cards (id, card_name, last_4_digits),
        profiles:user_id (id, name, avatar_url)
      `)
      .eq("id", t.id)
      .maybeSingle();

    if (!cl) return null;

    let cardTx = null;
    let foreignId = cl.linked_card_transaction_id;

    if (cl.linked_card_transaction_id) {
      const { data: ct } = await supabase
        .from("card_transactions")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          qrs (id, merchant_name, platform),
          recorded_profile:recorded_by (id, name, avatar_url),
          settled_profile:settled_to_user (id, name, avatar_url)
        `)
        .eq("id", cl.linked_card_transaction_id)
        .maybeSingle();
      cardTx = ct;
    } else if (cl.transaction_type === "credit") {
      // Fallback search in card_transactions
      const { data: fallbackCt } = await supabase
        .from("card_transactions")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          qrs (id, merchant_name, platform),
          recorded_profile:recorded_by (id, name, avatar_url),
          settled_profile:settled_to_user (id, name, avatar_url)
        `)
        .eq("type", "withdrawal")
        .eq("status", "settled")
        .eq("settled_to_user", cl.user_id)
        .eq("amount", cl.amount)
        .order("transaction_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackCt) {
        cardTx = fallbackCt;
        foreignId = fallbackCt.id;
      }
    } else if (cl.transaction_type === "debit") {
      // Fallback search in card_transactions for bill payment
      const { data: fallbackBill } = await supabase
        .from("card_transactions")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          qrs (id, merchant_name, platform),
          recorded_profile:recorded_by (id, name, avatar_url)
        `)
        .eq("type", "bill_payment")
        .eq("amount", cl.amount)
        .order("transaction_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackBill) {
        cardTx = fallbackBill;
        foreignId = fallbackBill.id;
      }
    }

    // Check if linked to lent
    const { data: lentRow } = await supabase
      .from("card_lent_ledger")
      .select(`*, borrowers (id, name, phone)`)
      .eq("linked_cash_ledger_id", cl.id)
      .maybeSingle();

    return {
      sourceType: "cash_ledger",
      cashLedger: cl,
      cardTx,
      lent: lentRow,
      foreignId: foreignId || (lentRow?.id || null),
    };
  }

  if (t.sourceType === "card_transaction") {
    // 1. Fetch card transaction with all relations
    const { data: ct } = await supabase
      .from("card_transactions")
      .select(`
        *,
        cards (id, card_name, last_4_digits),
        qrs (id, merchant_name, platform),
        recorded_profile:recorded_by (id, name, avatar_url),
        settled_profile:settled_to_user (id, name, avatar_url)
      `)
      .eq("id", t.id)
      .maybeSingle();

    if (!ct) return null;

    // Look up linked cash ledger entries
    let cashRows: any[] = [];
    const { data: directCash } = await supabase
      .from("cash_on_hand_ledger")
      .select(`
        *,
        cards (id, card_name, last_4_digits),
        profiles:user_id (id, name, avatar_url)
      `)
      .eq("linked_card_transaction_id", ct.id);

    if (directCash && directCash.length > 0) {
      cashRows = directCash;
    } else if (ct.type === "withdrawal" && ct.status === "settled" && ct.settled_to_user) {
      // Fallback lookup in cash_on_hand_ledger
      const { data: fallbackCash } = await supabase
        .from("cash_on_hand_ledger")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          profiles:user_id (id, name, avatar_url)
        `)
        .eq("user_id", ct.settled_to_user)
        .eq("amount", ct.amount)
        .eq("transaction_type", "credit")
        .limit(1);
      if (fallbackCash) cashRows = fallbackCash;
    }

    // Look up linked pocket advance (if bill payment from pocket)
    const { data: pocketAdv } = await supabase
      .from("pocket_advances_ledger")
      .select(`*, profiles:user_id (id, name)`)
      .eq("linked_card_transaction_id", ct.id)
      .maybeSingle();

    // Look up linked lent
    const { data: lentRow } = await supabase
      .from("card_lent_ledger")
      .select(`*, borrowers (id, name, phone)`)
      .eq("linked_card_transaction_id", ct.id)
      .maybeSingle();

    // Look up linked spend
    const { data: spendRow } = await supabase
      .from("spends")
      .select(`*, profiles:user_id (id, name)`)
      .eq("linked_card_transaction_id", ct.id)
      .maybeSingle();

    return {
      sourceType: "card_transaction",
      cardTx: ct,
      cashLedgers: cashRows,
      pocketAdv,
      lent: lentRow,
      spend: spendRow,
      foreignId: cashRows[0]?.id || pocketAdv?.id || lentRow?.id || spendRow?.id || null,
    };
  }

  if (t.sourceType === "spend") {
    const { data: sp } = await supabase
      .from("spends")
      .select(`
        *,
        cards (id, card_name, last_4_digits),
        profiles:user_id (id, name, avatar_url)
      `)
      .eq("id", t.id)
      .maybeSingle();

    if (!sp) return null;

    let cardTx = null;
    let cashLedger = null;

    if (sp.linked_card_transaction_id) {
      const { data: ct } = await supabase
        .from("card_transactions")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          qrs (id, merchant_name, platform),
          recorded_profile:recorded_by (id, name, avatar_url)
        `)
        .eq("id", sp.linked_card_transaction_id)
        .maybeSingle();
      cardTx = ct;
    } else if (sp.card_id && (sp.payment_method === "from_card_limit" || sp.payment_method === "credit_card")) {
      const { data: fallbackCt } = await supabase
        .from("card_transactions")
        .select(`
          *,
          cards (id, card_name, last_4_digits),
          qrs (id, merchant_name, platform),
          recorded_profile:recorded_by (id, name, avatar_url)
        `)
        .eq("card_id", sp.card_id)
        .eq("amount", Math.abs(sp.amount))
        .limit(1)
        .maybeSingle();
      cardTx = fallbackCt;
    }

    if (sp.linked_cash_ledger_id) {
      const { data: cl } = await supabase
        .from("cash_on_hand_ledger")
        .select(`*, cards (id, card_name, last_4_digits), profiles:user_id (name)`)
        .eq("id", sp.linked_cash_ledger_id)
        .maybeSingle();
      cashLedger = cl;
    } else if (sp.payment_method === "from_cash" || sp.payment_method === "cash_on_hand") {
      const { data: fallbackCl } = await supabase
        .from("cash_on_hand_ledger")
        .select(`*, cards (id, card_name, last_4_digits), profiles:user_id (name)`)
        .eq("user_id", sp.user_id)
        .eq("amount", Math.abs(sp.amount))
        .eq("transaction_type", "debit")
        .limit(1)
        .maybeSingle();
      cashLedger = fallbackCl;
    }

    return {
      sourceType: "spend",
      spend: sp,
      cardTx,
      cashLedger,
      foreignId: cardTx?.id || cashLedger?.id || null,
    };
  }

  if (t.sourceType === "lent") {
    let lent: any = null;
    const { data: cLent } = await supabase
      .from("card_lent_ledger")
      .select(`
        *,
        borrowers (id, name, phone),
        cards (id, card_name, last_4_digits),
        recorded_profile:recorded_by (id, name, avatar_url)
      `)
      .eq("id", t.id)
      .maybeSingle();

    lent = cLent;

    if (!lent) {
      const { data: pLent } = await supabase
        .from("pocket_lent_ledger")
        .select(`
          *,
          borrowers (id, name, phone),
          recorded_profile:recorded_by (id, name, avatar_url)
        `)
        .eq("id", t.id)
        .maybeSingle();
      lent = pLent;
    }

    if (!lent) return null;

    let cardTx = null;
    let cashLedger = null;
    let spendRow = null;

    if (lent.linked_card_transaction_id) {
      const { data: ct } = await supabase
        .from("card_transactions")
        .select(`*, cards(card_name, last_4_digits), recorded_profile:recorded_by(name)`)
        .eq("id", lent.linked_card_transaction_id)
        .maybeSingle();
      cardTx = ct;
    }
    if (lent.linked_cash_ledger_id) {
      const { data: cl } = await supabase
        .from("cash_on_hand_ledger")
        .select(`*, cards(card_name, last_4_digits), profiles:user_id(name)`)
        .eq("id", lent.linked_cash_ledger_id)
        .maybeSingle();
      cashLedger = cl;
    }
    if (lent.linked_spend_id) {
      const { data: sp } = await supabase
        .from("spends")
        .select(`*, profiles:user_id(name)`)
        .eq("id", lent.linked_spend_id)
        .maybeSingle();
      spendRow = sp;
    }

    return {
      sourceType: "lent",
      lent,
      cardTx,
      cashLedger,
      spend: spendRow,
      foreignId: cardTx?.id || cashLedger?.id || spendRow?.id || null,
    };
  }

  if (t.sourceType === "pocket_advance") {
    const { data: pa } = await supabase
      .from("pocket_advances_ledger")
      .select(`
        *,
        cards (id, card_name, last_4_digits),
        profiles:user_id (id, name, avatar_url)
      `)
      .eq("id", t.id)
      .maybeSingle();

    if (!pa) return null;

    let cardTx = null;
    let cashLedger = null;

    if (pa.linked_card_transaction_id) {
      const { data: ct } = await supabase
        .from("card_transactions")
        .select(`*, cards(card_name, last_4_digits), recorded_profile:recorded_by(name)`)
        .eq("id", pa.linked_card_transaction_id)
        .maybeSingle();
      cardTx = ct;
    } else if (pa.entry_type === "advance") {
      const { data: fallbackBill } = await supabase
        .from("card_transactions")
        .select(`*, cards(card_name, last_4_digits), recorded_profile:recorded_by(name)`)
        .eq("type", "bill_payment")
        .eq("card_id", pa.card_id)
        .order("transaction_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      cardTx = fallbackBill;
    }

    if (pa.entry_type === "reclaim") {
      const { data: cl } = await supabase
        .from("cash_on_hand_ledger")
        .select(`*, cards(card_name, last_4_digits), profiles:user_id(name)`)
        .eq("user_id", pa.user_id)
        .eq("card_id", pa.card_id)
        .eq("transaction_type", "debit")
        .order("transaction_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      cashLedger = cl;
    }

    return {
      sourceType: "pocket_advance",
      pocketAdv: pa,
      cardTx,
      cashLedger,
      foreignId: cardTx?.id || cashLedger?.id || null,
    };
  }

  return null;
}

// ─── Journey Breadcrumb Helpers ─────────────────────────────────────────────

function getJourneyOrigin(data: any): string {
  if (data.sourceType === "cash_ledger") {
    if (data.cardTx) return `${data.cardTx.cards?.card_name || "Card"} (**${data.cardTx.cards?.last_4_digits || "0000"})`;
    if (data.lent) return `ধার ফেরত: ${data.lent.borrowers?.name || "Borrower"}`;
    return data.cashLedger.transaction_type === "credit" ? "ক্যাশ জমা" : `ক্যাশ ব্যালেন্স (${data.cashLedger.profiles?.name || "User"})`;
  }
  if (data.sourceType === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      return `${data.cardTx.cards?.card_name || "Card"} (**${data.cardTx.cards?.last_4_digits || "0000"})`;
    }
    return data.cardTx.payment_method === "own_pocket" ? "ব্যক্তিগত পকেট (Pocket)" : "ক্যাশ অন হ্যান্ড";
  }
  if (data.sourceType === "spend") {
    return data.spend.payment_method === "credit_card" || data.spend.payment_method === "from_card_limit"
      ? `${data.spend.cards?.card_name || "Card"} (**${data.spend.cards?.last_4_digits || "0000"})`
      : "ক্যাশ অন হ্যান্ড";
  }
  if (data.sourceType === "lent") {
    return data.lent.source_type === "credit_card"
      ? `${data.lent.cards?.card_name || "Card"} (**${data.lent.cards?.last_4_digits || "0000"})`
      : "ক্যাশ অন হ্যান্ড";
  }
  if (data.sourceType === "pocket_advance") {
    return data.pocketAdv.profiles?.name ? `${data.pocketAdv.profiles.name}-এর পকেট` : "পকেট ব্যালেন্স";
  }
  return "উৎস";
}

function getJourneyAction(data: any): string {
  if (data.sourceType === "cash_ledger") {
    if (data.cardTx) {
      const qr = data.cardTx.qrs?.merchant_name;
      return qr ? `QR: ${qr}` : "রোটেশন উইথড্রয়াল";
    }
    return data.cashLedger.transaction_type === "credit" ? "সরাসরি ক্রেডিট" : "ডেবিট";
  }
  if (data.sourceType === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      const qr = data.cardTx.qrs?.merchant_name;
      return qr ? `QR: ${qr}` : "মার্চেন্ট উইথড্রয়াল";
    }
    return "কার্ড বিল পেমেন্ট";
  }
  if (data.sourceType === "spend") {
    return data.spend.spend_type === "repayment" ? "ডেট পরিশোধ" : "ব্যক্তিগত খরচ";
  }
  if (data.sourceType === "lent") {
    return data.lent.entry_type === "given" ? "ধার প্রদান" : "ধার আদায়";
  }
  if (data.sourceType === "pocket_advance") {
    return data.pocketAdv.entry_type === "advance" ? "কার্ডে অগ্রিম বিল" : "ক্যাশ থেকে রিক্লেম";
  }
  return "লেনদেন";
}

function getJourneyDestination(data: any): string {
  if (data.sourceType === "cash_ledger") {
    return `ক্যাশ অন হ্যান্ড: ${data.cashLedger.profiles?.name || "User"}`;
  }
  if (data.sourceType === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      const receiver = data.cardTx.settled_profile?.name || (data.cashLedgers?.[0]?.profiles?.name);
      return receiver ? `ক্যাশ: ${receiver}` : "QR সেটলমেন্ট পেন্ডিং";
    }
    return `${data.cardTx.cards?.card_name || "Card"} বিল ক্লিয়ার`;
  }
  if (data.sourceType === "spend") {
    return "ব্যক্তিগত স্পেন্স ওয়ালেট";
  }
  if (data.sourceType === "lent") {
    return `${data.lent.borrowers?.name || "Borrower"}`;
  }
  if (data.sourceType === "pocket_advance") {
    return `${data.pocketAdv.cards?.card_name || "Card"} বিল`;
  }
  return "গন্তব্য";
}

// ─── Render Linked Database Columns Spec Sheet ──────────────────────────────

function renderLinkedColumnsSpec(data: any) {
  // Case 1: From Cash Ledger -> Display Linked Card Transaction Columns
  if (data.sourceType === "cash_ledger") {
    const cl = data.cashLedger;
    const ct = data.cardTx;

    return (
      <div className="space-y-2.5">
        {/* If Linked Card Transaction Exists */}
        {ct ? (
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> রোটেশনের মূল কার্ড ট্রানজ্যাকশন (Linked Card Tx)
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ct.status === "settled" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                {ct.status === "settled" ? "Settled ✓" : "Pending Settlement"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <span className="text-slate-500 text-[10px] block">কার্ড (Card):</span>
                <span className="font-bold text-slate-100">
                  {ct.cards?.card_name || "Card"} (**{ct.cards?.last_4_digits || "0000"})
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">উইথড্রয়াল পরিমাণ (Amount):</span>
                <span className="font-bold text-emerald-400">
                  ₹{Number(ct.amount).toLocaleString("en-IN")}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">মার্চেন্ট QR:</span>
                <span className="font-bold text-sky-300">
                  {ct.qrs?.merchant_name || "N/A"} {ct.qrs?.platform ? `(${ct.qrs.platform})` : ""}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">উইথড্রয়াল তারিখ (Tx Date):</span>
                <span className="font-medium text-slate-300">
                  {ct.transaction_date || "-"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">রেকর্ড করেছেন (Recorded By):</span>
                <span className="font-medium text-slate-300">
                  {ct.recorded_profile?.name || "User"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">সেটলমেন্ট প্রাপক (Settled To):</span>
                <span className="font-bold text-amber-300">
                  {ct.settled_profile?.name || cl.profiles?.name || "User"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">সেটলমেন্ট তারিখ (Settled Date):</span>
                <span className="font-medium text-slate-300">
                  {ct.settled_date || cl.transaction_date?.slice(0, 10) || "-"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">লেনদেনের ধরণ (Type):</span>
                <span className="font-medium text-slate-300">
                  {ct.type === "withdrawal" ? "রোটেশন উইথড্রয়াল" : "বিল পেমেন্ট"}
                </span>
              </div>

              {ct.remarks && (
                <div className="col-span-2 bg-white/[0.03] p-1.5 rounded-lg border border-white/5">
                  <span className="text-slate-500 text-[9px] block">কার্ড ট্রানজ্যাকশন রিমার্কস:</span>
                  <span className="text-slate-300 text-[11px] font-normal leading-tight">
                    &quot;{ct.remarks}&quot;
                  </span>
                </div>
              )}

              <div className="col-span-2 text-[9px] text-slate-500 font-mono">
                Card Tx ID: {ct.id}
              </div>
            </div>
          </div>
        ) : data.lent ? (
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
              🤝 সংশ্লিষ্ট ঋণ / ধার রেকর্ড (Linked Lent Entry)
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 text-[10px] block">ঋণগ্রহীতা:</span>
                <span className="font-bold text-slate-200">{data.lent.borrowers?.name || "Borrower"}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">ধরণ:</span>
                <span className="font-bold text-amber-400">{data.lent.entry_type === "given" ? "ধার দেওয়া" : "ধার ফেরত"}</span>
              </div>
              <div className="col-span-2 text-[9px] text-slate-500 font-mono">Lent ID: {data.lent.id}</div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-400 space-y-1">
            <span className="text-slate-300 font-bold block">সরাসরি ক্যাশ অন হ্যান্ড লেনদেন</span>
            <p className="text-[10px]">
              এই এন্ট্রিটি সরাসরি ক্যাশ অন হ্যান্ড ব্যালেন্সে রেজিস্টার করা হয়েছে (যেমন P2P ক্যাশ ট্রান্সফার বা পূর্ববর্তী হিস্টোরিক্যাল রেকর্ড)।
            </p>
          </div>
        )}

        {/* Current Cash Ledger Own Row Details */}
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>ক্যাশ অন হ্যান্ড হোল্ডার: <strong className="text-slate-200">{cl.profiles?.name || "User"}</strong></span>
            <span>অ্যাসোসিয়েটেড কার্ড: <strong className="text-slate-200">{cl.cards?.card_name || "Card"}</strong></span>
          </div>
          {cl.remarks && (
            <div className="text-slate-400">
              রিমার্কস: <span className="text-slate-300 font-normal">&quot;{cl.remarks}&quot;</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Case 2: From Card Transaction -> Display Reverse Settlement & Cash Destination Columns
  if (data.sourceType === "card_transaction") {
    const ct = data.cardTx;
    const cashList = data.cashLedgers || [];

    return (
      <div className="space-y-2.5">
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" /> সেটলমেন্ট ও ক্যাশ অন হ্যান্ড গন্তব্য (Settled Destination)
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ct.status === "settled" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
              {ct.status === "settled" ? "Settled ✓" : "Pending Settlement"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <span className="text-slate-500 text-[10px] block">কার কাছে গেছে (Settled To):</span>
              <span className="font-bold text-amber-300">
                {ct.settled_profile?.name || cashList[0]?.profiles?.name || (ct.status === "settled" ? "User" : "QR ট্রানজিটে রয়েছে")}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] block">কোন কিউরে গেছে (QR Merchant):</span>
              <span className="font-bold text-sky-300">
                {ct.qrs?.merchant_name || "Manual / Direct"} {ct.qrs?.platform ? `(${ct.qrs.platform})` : ""}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] block">সেটলমেন্টের তারিখ:</span>
              <span className="font-bold text-slate-200">
                {ct.settled_date || (ct.status === "settled" ? "Settled" : "অপেক্ষমান")}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] block">উইথড্রয়াল তারিখ:</span>
              <span className="font-medium text-slate-300">
                {ct.transaction_date || "-"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] block">রেকর্ড করেছেন:</span>
              <span className="font-medium text-slate-300">
                {ct.recorded_profile?.name || "User"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] block">কার্ডের বিবরণ:</span>
              <span className="font-medium text-slate-300">
                {ct.cards?.card_name || "Card"} (**{ct.cards?.last_4_digits || "0000"})
              </span>
            </div>

            {/* Linked Cash On Hand Ledger Rows */}
            {cashList.length > 0 && (
              <div className="col-span-2 mt-2 pt-2 border-t border-white/5 space-y-1.5">
                <span className="text-[10px] font-bold text-emerald-400 block">
                  💵 ক্যাশ অন হ্যান্ড লেজারে ক্রেডিট রেকর্ড (Linked Cash Rows):
                </span>
                {cashList.map((cl: any) => (
                  <div key={cl.id} className="bg-white/[0.03] p-2 rounded-lg border border-white/5 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">
                        {cl.profiles?.name || "User"} এর ক্যাশ অ্যাকাউন্টে জমা
                      </span>
                      <span className="font-black text-emerald-400">+₹{Number(cl.amount).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>{cl.transaction_date ? new Date(cl.transaction_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-"}</span>
                      <span className="font-mono text-[9px] text-slate-500">Ledger ID: {cl.id.slice(0, 8)}...</span>
                    </div>
                    {cl.remarks && (
                      <p className="text-[10px] text-slate-300 italic">&quot;{cl.remarks}&quot;</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bill Payment Source Details if applicable */}
            {ct.type === "bill_payment" && (
              <div className="col-span-2 mt-2 pt-2 border-t border-white/5 space-y-1.5">
                <span className="text-[10px] font-bold text-sky-400 block">
                  💳 বিল পরিশোধের উৎস: {ct.payment_method === "own_pocket" ? "ব্যক্তিগত পকেট (Advance)" : "ক্যাশ অন হ্যান্ড"}
                </span>
                {data.pocketAdv && (
                  <div className="bg-white/[0.03] p-2 rounded-lg border border-white/5 text-[11px]">
                    <span className="text-amber-300 font-bold">{data.pocketAdv.profiles?.name} এর পকেট অগ্রিম</span>: ₹{Number(data.pocketAdv.amount).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Case 3: From Spend -> Display Linked Card Tx or Cash Ledger
  if (data.sourceType === "spend") {
    const sp = data.spend;
    const ct = data.cardTx;
    const cl = data.cashLedger;

    return (
      <div className="space-y-2.5">
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block pb-1 border-b border-white/5">
            🛍️ খরচের উৎস ও সংশ্লিষ্ট রেকর্ড (Spend Financing Source)
          </span>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <span className="text-slate-500 text-[10px] block">পেমেন্ট মেথড:</span>
              <span className="font-bold text-slate-200 uppercase">
                {sp.payment_method === "from_card_limit" || sp.payment_method === "credit_card" ? "Credit Card Limit" : "Cash on Hand"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">খরচের ধরন:</span>
              <span className="font-bold text-purple-300 uppercase">{sp.spend_type}</span>
            </div>

            {ct && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1 mt-1">
                <span className="text-[10px] font-bold text-sky-400 block">💳 লিংকড কার্ড লেনদেন:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{ct.cards?.card_name} (**{ct.cards?.last_4_digits})</span>
                  <span className="font-bold">₹{Number(ct.amount).toLocaleString("en-IN")}</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Card Tx ID: {ct.id}</div>
              </div>
            )}

            {cl && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1 mt-1">
                <span className="text-[10px] font-bold text-emerald-400 block">💵 লিংকড ক্যাশ লেজার ডেবিট:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{cl.profiles?.name} এর ক্যাশ</span>
                  <span className="font-bold text-rose-400">-₹{Number(cl.amount).toLocaleString("en-IN")}</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Cash Ledger ID: {cl.id}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Case 4: From Lent -> Display Borrower & Funding Sources
  if (data.sourceType === "lent") {
    const lent = data.lent;
    const ct = data.cardTx;
    const cl = data.cashLedger;
    const sp = data.spend;

    return (
      <div className="space-y-2.5">
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block pb-1 border-b border-white/5">
            🤝 ঋণগ্রহীতা ও অর্থের উৎস (Lent Journey Spec)
          </span>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <span className="text-slate-500 text-[10px] block">ঋণগ্রহীতা (Borrower):</span>
              <span className="font-bold text-slate-100">{lent.borrowers?.name || "Friend"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">ধরণ (Entry Type):</span>
              <span className="font-bold text-amber-400 uppercase">{lent.entry_type === "given" ? "ধার দেওয়া (Given)" : "ধার আদায় (Collected)"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">অর্থের উৎস (Source):</span>
              <span className="font-medium text-slate-300">{lent.source_type === "credit_card" ? "Credit Card" : "Cash on Hand"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">রেকর্ড করেছেন:</span>
              <span className="font-medium text-slate-300">{lent.recorded_profile?.name || "User"}</span>
            </div>

            {ct && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-sky-400 block">💳 লিংকড কার্ড লেনদেন:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{ct.cards?.card_name} (**{ct.cards?.last_4_digits})</span>
                  <span className="font-bold">₹{Number(ct.amount).toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}

            {cl && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 block">💵 লিংকড ক্যাশ লেজার:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{cl.profiles?.name}</span>
                  <span className="font-bold">₹{Number(cl.amount).toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}

            {sp && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-purple-400 block">🛍️ লিংকড স্পেন্ডস অ্যাকাউন্ট:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{sp.remarks || "Personal Spend Entry"}</span>
                  <span className="font-bold">₹{Number(sp.amount).toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Case 5: From Pocket Advance -> Display Bill Payment or Cash Reclaim
  if (data.sourceType === "pocket_advance") {
    const pa = data.pocketAdv;
    const ct = data.cardTx;
    const cl = data.cashLedger;

    return (
      <div className="space-y-2.5">
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block pb-1 border-b border-white/5">
            👛 পকেট অগ্রিমের বিবরণ ও লিংকড সেটলমেন্ট (Pocket Journey)
          </span>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <span className="text-slate-500 text-[10px] block">পকেট হোল্ডার:</span>
              <span className="font-bold text-slate-100">{pa.profiles?.name || "User"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">এন্ট্রি ধরণ:</span>
              <span className="font-bold text-amber-400 uppercase">{pa.entry_type === "advance" ? "পকেট অগ্রিম বিল" : "ক্যাশ রিক্লেম"}</span>
            </div>

            {ct && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-sky-400 block">💳 পরিশোধিত কার্ড বিল (Bill Payment):</span>
                <div className="flex justify-between text-slate-300">
                  <span>{ct.cards?.card_name} (**{ct.cards?.last_4_digits})</span>
                  <span className="font-bold">₹{Number(ct.amount).toLocaleString("en-IN")}</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Card Tx ID: {ct.id}</div>
              </div>
            )}

            {cl && (
              <div className="col-span-2 bg-white/[0.03] p-2 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 block">💵 রিক্লেম হওয়া ক্যাশ লেজার এন্ট্রি:</span>
                <div className="flex justify-between text-slate-300">
                  <span>{cl.profiles?.name} এর ক্যাশ</span>
                  <span className="font-bold">₹{Number(cl.amount).toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
