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
  AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface TraceTarget {
  id: string;
  sourceType: "card_transaction" | "cash_ledger" | "spend" | "lent" | "pocket_advance";
  title?: string;
  amount?: number;
  date?: string;
  remarks?: string;
}

interface TransactionTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: TraceTarget | null;
}

export default function TransactionTraceModal({
  isOpen,
  onClose,
  target,
}: TransactionTraceModalProps) {
  const [loading, setLoading] = useState(false);
  const [traceData, setTraceData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && target) {
      loadTraceData(target);
    } else {
      setTraceData(null);
    }
  }, [isOpen, target?.id, target?.sourceType]);

  async function loadTraceData(t: TraceTarget) {
    setLoading(true);
    try {
      if (t.sourceType === "card_transaction") {
        // 1. Fetch main card transaction
        const { data: ct } = await supabase
          .from("card_transactions")
          .select(`
            *,
            cards (id, card_name, last_4_digits),
            qrs (id, merchant_name, platform),
            profiles:recorded_by (id, name, avatar_url),
            settled_profile:settled_to_user (id, name)
          `)
          .eq("id", t.id)
          .maybeSingle();

        if (ct) {
          // Look up linked cash ledger if settled or bill payment
          const { data: cashRows } = await supabase
            .from("cash_on_hand_ledger")
            .select(`*, profiles:user_id (name)`)
            .eq("linked_card_transaction_id", ct.id);

          // Look up if linked to lent
          const { data: lentRow } = await supabase
            .from("card_lent_ledger")
            .select(`*, borrowers (name)`)
            .eq("linked_card_transaction_id", ct.id)
            .maybeSingle();

          // Look up if linked to pocket advances
          const { data: pocketAdv } = await supabase
            .from("pocket_advances_ledger")
            .select(`*, profiles:user_id (name)`)
            .eq("linked_card_transaction_id", ct.id)
            .maybeSingle();

          // Look up if linked to spend
          const { data: spendRow } = await supabase
            .from("spends")
            .select(`*, profiles:user_id (name)`)
            .eq("linked_card_transaction_id", ct.id)
            .maybeSingle();

          setTraceData({
            type: "card_transaction",
            cardTx: ct,
            cashLedgers: cashRows || [],
            lent: lentRow,
            pocketAdv,
            spend: spendRow,
          });
        }
      } else if (t.sourceType === "cash_ledger") {
        // Fetch cash ledger row
        const { data: cl } = await supabase
          .from("cash_on_hand_ledger")
          .select(`
            *,
            cards (id, card_name, last_4_digits),
            profiles:user_id (id, name)
          `)
          .eq("id", t.id)
          .maybeSingle();

        if (cl) {
          let cardTx = null;
          if (cl.linked_card_transaction_id) {
            const { data: ct } = await supabase
              .from("card_transactions")
              .select(`
                *,
                cards (card_name, last_4_digits),
                qrs (merchant_name),
                profiles:recorded_by (name),
                settled_profile:settled_to_user (name)
              `)
              .eq("id", cl.linked_card_transaction_id)
              .maybeSingle();
            cardTx = ct;
          }

          // Check if lent is linked
          const { data: lentRow } = await supabase
            .from("card_lent_ledger")
            .select(`*, borrowers (name)`)
            .eq("linked_cash_ledger_id", cl.id)
            .maybeSingle();

          setTraceData({
            type: "cash_ledger",
            cashLedger: cl,
            cardTx,
            lent: lentRow,
          });
        }
      } else if (t.sourceType === "spend") {
        const { data: sp } = await supabase
          .from("spends")
          .select(`
            *,
            cards (id, card_name, last_4_digits),
            profiles:user_id (id, name)
          `)
          .eq("id", t.id)
          .maybeSingle();

        if (sp) {
          let cardTx = null;
          if (sp.linked_card_transaction_id) {
            const { data: ct } = await supabase
              .from("card_transactions")
              .select(`*, cards(card_name, last_4_digits)`)
              .eq("id", sp.linked_card_transaction_id)
              .maybeSingle();
            cardTx = ct;
          }
          setTraceData({
            type: "spend",
            spend: sp,
            cardTx,
          });
        }
      } else if (t.sourceType === "pocket_advance") {
        const { data: pa } = await supabase
          .from("pocket_advances_ledger")
          .select(`
            *,
            cards (id, card_name, last_4_digits),
            profiles:user_id (id, name)
          `)
          .eq("id", t.id)
          .maybeSingle();

        if (pa) {
          let cardTx = null;
          if (pa.linked_card_transaction_id) {
            const { data: ct } = await supabase
              .from("card_transactions")
              .select(`*, cards(card_name, last_4_digits)`)
              .eq("id", pa.linked_card_transaction_id)
              .maybeSingle();
            cardTx = ct;
          }
          setTraceData({
            type: "pocket_advance",
            pocketAdv: pa,
            cardTx,
          });
        }
      } else if (t.sourceType === "lent") {
        const { data: lent } = await supabase
          .from("card_lent_ledger")
          .select(`
            *,
            borrowers (name, phone),
            cards (card_name, last_4_digits),
            profiles:recorded_by (name)
          `)
          .eq("id", t.id)
          .maybeSingle();

        if (lent) {
          let cashLedger = null;
          let cardTx = null;
          let spendRow = null;

          if (lent.linked_cash_ledger_id) {
            const { data: cl } = await supabase
              .from("cash_on_hand_ledger")
              .select(`*`)
              .eq("id", lent.linked_cash_ledger_id)
              .maybeSingle();
            cashLedger = cl;
          }
          if (lent.linked_card_transaction_id) {
            const { data: ct } = await supabase
              .from("card_transactions")
              .select(`*`)
              .eq("id", lent.linked_card_transaction_id)
              .maybeSingle();
            cardTx = ct;
          }
          if (lent.linked_spend_id) {
            const { data: sp } = await supabase
              .from("spends")
              .select(`*`)
              .eq("id", lent.linked_spend_id)
              .maybeSingle();
            spendRow = sp;
          }

          setTraceData({
            type: "lent",
            lent,
            cashLedger,
            cardTx,
            spend: spendRow,
          });
        }
      }
    } catch (err) {
      console.error("Error loading trace data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-lg bg-[#070514]/95 border border-sky-500/30 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0ea5e9]/20 to-[#a855f7]/20 border border-[#0ea5e9]/30 flex items-center justify-center text-[#0ea5e9]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">
                  Transaction Journey & Origin
                </span>
                <h3 className="text-base font-black text-white">
                  টাকা কোথায় গেল / কোথা থেকে এলো
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-[#0ea5e9]" />
                <p className="text-xs font-bold">রিলেশনাল জার্নি লোড হচ্ছে...</p>
              </div>
            ) : !traceData ? (
              <div className="text-center py-12 text-slate-500">
                <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold">কোনো লিংক করা ডেটা পাওয়া যায়নি।</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Visual Journey Steps Flowchart */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0ea5e9]" /> ফান্ড ট্রান্সফার ফ্লো
                  </p>

                  {/* Flow Steps rendering */}
                  <div className="space-y-3 relative pl-3 border-l-2 border-white/10">
                    {/* STEP 1: ORIGIN */}
                    <div className="relative pl-5">
                      <div className="absolute -left-[19px] top-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black" />
                      <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                        ১. উৎস (Origin / Source)
                      </span>
                      <p className="text-sm font-black text-white mt-0.5">
                        {renderOriginText(traceData)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {renderOriginDetails(traceData)}
                      </p>
                    </div>

                    {/* STEP 2: TRANSIT / ACTION */}
                    <div className="relative pl-5 pt-2">
                      <div className="absolute -left-[19px] top-3 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-black" />
                      <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">
                        ২. মাধ্যম ও কার্যক্রম (Action / Method)
                      </span>
                      <p className="text-sm font-black text-white mt-0.5">
                        {renderActionText(traceData)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {renderActionDetails(traceData)}
                      </p>
                    </div>

                    {/* STEP 3: DESTINATION */}
                    <div className="relative pl-5 pt-2">
                      <div className="absolute -left-[19px] top-3 w-3.5 h-3.5 rounded-full bg-[#0ea5e9] border-2 border-black" />
                      <span className="text-[9px] font-black uppercase text-[#0ea5e9] tracking-wider">
                        ৩. গন্তব্য (Destination / Settlement)
                      </span>
                      <p className="text-sm font-black text-white mt-0.5">
                        {renderDestinationText(traceData)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {renderDestinationDetails(traceData)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Card */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      টাকার পরিমাণ (Amount)
                    </span>
                    <span className="text-xl font-black text-white">
                      ₹{getTraceAmount(traceData).toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      তারিখ (Date)
                    </span>
                    <span className="text-sm font-black text-white">
                      {getTraceDate(traceData)}
                    </span>
                  </div>
                </div>

                {/* Remarks & Notes */}
                {getTraceRemarks(traceData) && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      নোট / রিমার্কস (Remarks)
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">
                      &quot;{getTraceRemarks(traceData)}&quot;
                    </p>
                  </div>
                )}

                {/* Relational DB Links details */}
                <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2 text-[10px] text-slate-400">
                  <span className="font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    🔗 ডাটাবেস ইন্টার-কানেকশন (Verified Relations)
                  </span>
                  {renderDatabaseLinks(traceData)}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black transition-colors"
            >
              বন্ধ করুন
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Flowchart Helper Functions ─────────────────────────────────────────────

function renderOriginText(data: any): string {
  if (data.type === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      return `ক্রেডিট কার্ড: ${data.cardTx.cards?.card_name || "Card"} (**${data.cardTx.cards?.last_4_digits || "0000"})`;
    } else {
      // Bill payment
      if (data.cardTx.payment_method === "own_pocket") return "ব্যক্তিগত পকেট (Own Pocket)";
      if (data.cardTx.payment_method === "cash_on_hand") return "ক্যাশ অন হ্যান্ড (Cash on Hand)";
      return data.cardTx.payment_method || "Direct";
    }
  }
  if (data.type === "cash_ledger") {
    if (data.cashLedger.transaction_type === "credit") {
      if (data.cardTx) return `কার্ড রোটেশন: ${data.cardTx.cards?.card_name || "Card"}`;
      if (data.lent) return `ধার ফেরত: ${data.lent.borrowers?.name || "Borrower"}`;
      return "ক্যাশ ক্রেডিট ইনকামিং";
    } else {
      return `ক্যাশ অন হ্যান্ড ব্যালেন্স (${data.cashLedger.profiles?.name || "User"})`;
    }
  }
  if (data.type === "pocket_advance") {
    return `ব্যবহারকারীর ব্যক্তিগত পকেট: ${data.pocketAdv.profiles?.name || "User"}`;
  }
  if (data.type === "spend") {
    return data.spend.payment_method === "credit_card" ? `ক্রেডিট কার্ড: ${data.spend.cards?.card_name || "Card"}` : "ক্যাশ অন হ্যান্ড";
  }
  if (data.type === "lent") {
    return data.lent.source_type === "credit_card" ? `ক্রেডিট কার্ড: ${data.lent.cards?.card_name || "Card"}` : "ক্যাশ অন হ্যান্ড";
  }
  return "অজ্ঞাত উৎস";
}

function renderOriginDetails(data: any): string {
  if (data.type === "card_transaction") {
    if (data.cardTx.qr_id && data.cardTx.qrs) {
      return `মার্চেন্ট QR: ${data.cardTx.qrs.merchant_name} (${data.cardTx.qrs.platform || "UPI"})`;
    }
    return `উইথড্রয়াল রেকর্ড করেছেন: ${data.cardTx.profiles?.name || "User"}`;
  }
  if (data.type === "cash_ledger") {
    return `কার্ড রেফারেন্স: ${data.cashLedger.cards?.card_name || "Card"}`;
  }
  return "";
}

function renderActionText(data: any): string {
  if (data.type === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      return data.cardTx.status === "settled" ? "রোটেশন উইথড্রয়াল (Settled ✓)" : "রোটেশন উইথড্রয়াল (In Transit / Pending)";
    }
    return "কার্ডের বিল পরিশোধ (Bill Payment)";
  }
  if (data.type === "cash_ledger") {
    return data.cashLedger.transaction_type === "credit" ? "ক্যাশ জমা (Credit Deposit)" : "ক্যাশ খরচ বা বিল পে (Debit)";
  }
  if (data.type === "pocket_advance") {
    return data.pocketAdv.entry_type === "advance" ? "পকেট থেকে কার্ড বিলে অগ্রিম প্রদান" : "পকেটে টাকা রিকভারি/ফেরত";
  }
  if (data.type === "spend") {
    return data.spend.spend_type === "repayment" ? "স্পেন্স ডেট পরিশোধ (Debt Repayment)" : "ব্যক্তিগত খরচ (Personal Spend)";
  }
  if (data.type === "lent") {
    return data.lent.entry_type === "given" ? "ধার দেওয়া হয়েছে (Given to Friend)" : "ধার আদায় হয়েছে (Collected Back)";
  }
  return "লেনদেন সম্পন্ন";
}

function renderActionDetails(data: any): string {
  if (data.type === "card_transaction") {
    if (data.cardTx.type === "withdrawal" && data.cardTx.settled_date) {
      return `সেটলমেন্টের তারিখ: ${data.cardTx.settled_date}`;
    }
  }
  return "";
}

function renderDestinationText(data: any): string {
  if (data.type === "card_transaction") {
    if (data.cardTx.type === "withdrawal") {
      if (data.cardTx.status === "settled") {
        return `ক্যাশ অন হ্যান্ড: ${data.cardTx.settled_profile?.name || "User"}-এর কাছে জমা`;
      }
      return "QR সেটলমেন্টের অপেক্ষায় (In Transit)";
    } else {
      // Bill payment
      return `কার্ডের লিমিট রিস্টোর: ${data.cardTx.cards?.card_name || "Card"} বিল ক্লিয়ার`;
    }
  }
  if (data.type === "cash_ledger") {
    if (data.cashLedger.transaction_type === "credit") {
      return `ক্যাশ অন হ্যান্ড ওয়ালেটে বৃদ্ধি (+₹${data.cashLedger.amount})`;
    } else {
      if (data.cardTx) return `কার্ড বিল পরিশোধ: ${data.cardTx.cards?.card_name || "Card"}`;
      return "ক্যাশ অন হ্যান্ড থেকে ডেবিট";
    }
  }
  if (data.type === "pocket_advance") {
    return `কার্ডের বকেয়া বিল পরিশোধ: ${data.pocketAdv.cards?.card_name || "Card"}`;
  }
  if (data.type === "lent") {
    return `গ্রহীতা: ${data.lent.borrowers?.name || "Friend"}`;
  }
  return "হিসাব সম্পন্ন";
}

function renderDestinationDetails(data: any): string {
  if (data.type === "card_transaction" && data.cashLedgers?.length > 0) {
    return `ক্যাশ লেজারে ${data.cashLedgers.length}টি এন্ট্রির সাথে লিংকড রয়েছে`;
  }
  return "";
}

function getTraceAmount(data: any): number {
  if (data.cardTx) return Number(data.cardTx.amount);
  if (data.cashLedger) return Number(data.cashLedger.amount);
  if (data.pocketAdv) return Number(data.pocketAdv.amount);
  if (data.spend) return Math.abs(Number(data.spend.amount));
  if (data.lent) return Number(data.lent.amount);
  return 0;
}

function getTraceDate(data: any): string {
  const d = data.cardTx?.transaction_date || 
            data.cashLedger?.transaction_date || 
            data.pocketAdv?.transaction_date || 
            data.spend?.spend_date || 
            data.lent?.transaction_date;
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getTraceRemarks(data: any): string {
  return data.cardTx?.remarks || 
         data.cashLedger?.remarks || 
         data.pocketAdv?.remarks || 
         data.spend?.remarks || 
         data.lent?.remarks || "";
}

function renderDatabaseLinks(data: any) {
  const links: { label: string; id: string; table: string }[] = [];

  if (data.cardTx) links.push({ label: "Card Transaction", id: data.cardTx.id, table: "card_transactions" });
  if (data.cashLedgers?.length > 0) {
    data.cashLedgers.forEach((cl: any) => links.push({ label: "Cash On Hand Ledger", id: cl.id, table: "cash_on_hand_ledger" }));
  }
  if (data.cashLedger) links.push({ label: "Cash Ledger Entry", id: data.cashLedger.id, table: "cash_on_hand_ledger" });
  if (data.pocketAdv) links.push({ label: "Pocket Advance Ledger", id: data.pocketAdv.id, table: "pocket_advances_ledger" });
  if (data.spend) links.push({ label: "Spend / Debt Entry", id: data.spend.id, table: "spends" });
  if (data.lent) links.push({ label: "Lent Ledger Entry", id: data.lent.id, table: "card_lent_ledger" });

  if (links.length === 0) return <p className="italic text-slate-500">কোনো সরাসরি Foreign Key পাওয়া যায়নি।</p>;

  return (
    <div className="space-y-1">
      {links.map((link, i) => (
        <div key={i} className="flex items-center justify-between font-mono bg-white/[0.03] px-2 py-1 rounded">
          <span className="text-slate-300 font-sans">{link.label}</span>
          <span className="text-[#0ea5e9] truncate max-w-[180px]">{link.id.slice(0, 8)}...{link.id.slice(-4)}</span>
        </div>
      ))}
    </div>
  );
}
