"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Banknote, ArrowDownLeft, Receipt, X, ChevronRight,
  Send, Loader2, CheckCircle2, CalendarDays, TrendingUp, TrendingDown
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  currentUserId?: string;
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
  type: "spend" | "repayment";
  amount: number;
  date: string;
  remarks: string;
}

interface TransferTarget {
  userId: string;
  userName: string;
  cards: { cardId: string; cardName: string; cardLast4: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function groupByMonth<T>(data: T[], dateField: keyof T): Record<string, T[]> {
  return data.reduce((acc, item) => {
    const raw = item[dateField] as unknown as string;
    const key = new Date(raw).toLocaleString("en-US", { month: "long", year: "numeric" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/** selectedCard থেকে card family (primary + সব children) এর id list বের করে */
function getFamilyCardIds(selCardId: string, cards: CardData[]): string[] {
  if (selCardId === "all" || !selCardId) return [];
  const sel = cards.find(c => c.id === selCardId);
  if (!sel) return [];
  const primaryId = sel.is_primary ? sel.id : sel.parent_card_id!;
  return cards
    .filter(c => c.id === primaryId || c.parent_card_id === primaryId)
    .map(c => c.id);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardAnalytics({
  userStats,
  selectedCardId,
  accessibleCards,
  currentUserId,
}: AnalyticsProps) {

  // ── modal state ──────────────────────────────────────────────────────────
  const [selectedUserStat, setSelectedUserStat] = useState<UserStat | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<"summary" | "cash_ledger" | "due_ledger">("summary");
  const [statImgError, setStatImgError] = useState<Record<string, boolean>>({});
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // ── ledger data ──────────────────────────────────────────────────────────
  const [cashLedger, setCashLedger] = useState<CashTransaction[]>([]);
  const [dueLedger, setDueLedger] = useState<DueTransaction[]>([]);
  const [totalUserCash, setTotalUserCash] = useState<number>(0);
  const [totalUserDue, setTotalUserDue] = useState<number>(0);

  // ── date range filter ────────────────────────────────────────────────────
  const today = new Date();
  const [startDate, setStartDate] = useState(toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toDateInput(today));

  // ── home-card family cash map (for the two home cards) ───────────────────
  const [familyCashMap, setFamilyCashMap] = useState<Record<string, number>>({});
  const [familyDueMap, setFamilyDueMap] = useState<Record<string, number>>({});

  // ── transfer state ───────────────────────────────────────────────────────
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargets, setTransferTargets] = useState<TransferTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<TransferTarget | null>(null);
  const [selectedReceiverCardId, setSelectedReceiverCardId] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRemarks, setTransferRemarks] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [senderCardId, setSenderCardId] = useState("");
  const [senderBalance, setSenderBalance] = useState(0);

  // ── data fetchers ────────────────────────────────────────────────────────

  /**
   * Summary এর "Total Cash In Hand":
   * cash_on_hand টেবিল থেকে ওই user এর selected card family এর সব row sum করে।
   * selectedCardId='all' হলে user এর সব cash_on_hand row।
   */
  async function fetchFamilyCash(userId: string): Promise<number> {
    const familyIds = getFamilyCardIds(selectedCardId, accessibleCards);
    let q = supabase
      .from("cash_on_hand")
      .select("current_balance")
      .eq("user_id", userId);
    if (familyIds.length > 0) q = q.in("card_id", familyIds);
    const { data } = await q;
    if (!data) return 0;
    return data.reduce((s, r) => s + Number(r.current_balance || 0), 0);
  }

  /**
   * Summary এর "Total Personal Due":
   * spends টেবিল থেকে ওই user এর selected card family এর সব spends।
   * spend_type='personal' → positive (due বাড়ায়)
   * spend_type='repayment' → negative (due কমায়)
   * net = total due
   * তারিখ ফিল্টার নেই — সব time এর net due।
   */
  async function fetchFamilyDue(userId: string): Promise<number> {
    const familyIds = getFamilyCardIds(selectedCardId, accessibleCards);
    let q = supabase
      .from("spends")
      .select("amount, spend_type")
      .eq("user_id", userId);
    if (familyIds.length > 0) q = q.in("card_id", familyIds);
    const { data } = await q;
    if (!data) return 0;
    return data.reduce((sum, s) => sum + Number(s.amount), 0);
  }

  /**
   * Cash In/Out tab: cash_on_hand_ledger থেকে date range + card family filter।
   * Original logic একদম ঠিক আছে — এতে হাত দেওয়া হয়নি।
   */
  const fetchCashLedger = useCallback(async (userId: string, start: string, end: string) => {
    const familyIds = getFamilyCardIds(selectedCardId, accessibleCards);
    let q = supabase
      .from("cash_on_hand_ledger")
      .select("*")
      .eq("user_id", userId)
      .gte("transaction_date", start + "T00:00:00.000Z")
      .lte("transaction_date", end + "T23:59:59.999Z")
      .order("transaction_date", { ascending: false });
    if (familyIds.length > 0) q = q.in("card_id", familyIds);
    const { data } = await q;
    setCashLedger((data || []) as CashTransaction[]);
  }, [selectedCardId, accessibleCards]);

  /**
   * Personal Due tab: spends টেবিল থেকে date range + card family filter।
   * spend_type='personal' → "spend" entry
   * spend_type='repayment' → "repayment" entry
   * card_transactions এর কোনো data এখানে নেই।
   */
  const fetchDueLedger = useCallback(async (userId: string, start: string, end: string) => {
    const familyIds = getFamilyCardIds(selectedCardId, accessibleCards);
    let q = supabase
      .from("spends")
      .select("id, amount, spend_date, remarks, spend_type")
      .eq("user_id", userId)
      .gte("spend_date", start)
      .lte("spend_date", end)
      .order("spend_date", { ascending: false });
    if (familyIds.length > 0) q = q.in("card_id", familyIds);
    const { data } = await q;
    const due: DueTransaction[] = (data || []).map(s => {
      // DB তে negative amount = repayment (green/+), positive = spend (red/-)
      const isRepayment = Number(s.amount) < 0;
      return {
        id: `s-${s.id}`,
        type: isRepayment ? "repayment" : "spend",
        amount: Math.abs(Number(s.amount)),
        date: s.spend_date,
        remarks: s.remarks || (isRepayment ? "Repayment" : "Personal Spend"),
      };
    });
    setDueLedger(due);
  }, [selectedCardId, accessibleCards]);

  // ── effects ──────────────────────────────────────────────────────────────

  // modal খুললে বা card selection বদলালে সব data fetch
  useEffect(() => {
    if (!selectedUserStat) return;
    const uid = selectedUserStat.id;
    fetchFamilyCash(uid).then(setTotalUserCash);
    fetchFamilyDue(uid).then(setTotalUserDue);
    fetchCashLedger(uid, startDate, endDate);
    fetchDueLedger(uid, startDate, endDate);
  }, [selectedUserStat, selectedCardId, accessibleCards]);

  // date range বদলালে ledger গুলো re-fetch
  useEffect(() => {
    if (!selectedUserStat) return;
    const uid = selectedUserStat.id;
    fetchCashLedger(uid, startDate, endDate);
    fetchDueLedger(uid, startDate, endDate);
  }, [startDate, endDate]);

  // home cards এর জন্য card-family cash total ও due total
  useEffect(() => {
    if (userStats.length === 0) return;
    const familyIds = getFamilyCardIds(selectedCardId, accessibleCards);
    Promise.all(
      userStats.map(async u => {
        // cash
        let cq = supabase.from("cash_on_hand").select("current_balance").eq("user_id", u.id);
        if (familyIds.length > 0) cq = cq.in("card_id", familyIds);
        const { data: cData } = await cq;
        const cashTotal = (cData || []).reduce((s, r) => s + Number(r.current_balance || 0), 0);

        // due — spends টেবিল থেকে, amount এর sign দিয়ে net due
        let dq = supabase.from("spends").select("amount").eq("user_id", u.id);
        if (familyIds.length > 0) dq = dq.in("card_id", familyIds);
        const { data: dData } = await dq;
        const dueTotal = (dData || []).reduce((s, r) => s + Number(r.amount), 0);

        return { id: u.id, cashTotal, dueTotal };
      })
    ).then(results => {
      const cashMap: Record<string, number> = {};
      const dueMap: Record<string, number> = {};
      results.forEach(r => { cashMap[r.id] = r.cashTotal; dueMap[r.id] = r.dueTotal; });
      setFamilyCashMap(cashMap);
      setFamilyDueMap(dueMap);
    });
  }, [userStats, selectedCardId, accessibleCards]);

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleUserStatClick = (stat: UserStat) => {
    setSelectedUserStat(stat);
    setUserModalTab("summary");
    setExpandedTxId(null);
    setIsUserModalOpen(true);
  };

  const toggleExpand = (id: string) => setExpandedTxId(prev => prev === id ? null : id);

  function applyPreset(preset: "this_month" | "last_month" | "last_30" | "last_90" | "all") {
    const t = new Date();
    if (preset === "this_month") {
      setStartDate(toDateInput(new Date(t.getFullYear(), t.getMonth(), 1)));
      setEndDate(toDateInput(t));
    } else if (preset === "last_month") {
      setStartDate(toDateInput(new Date(t.getFullYear(), t.getMonth() - 1, 1)));
      setEndDate(toDateInput(new Date(t.getFullYear(), t.getMonth(), 0)));
    } else if (preset === "last_30") {
      const s = new Date(t); s.setDate(t.getDate() - 30);
      setStartDate(toDateInput(s)); setEndDate(toDateInput(t));
    } else if (preset === "last_90") {
      const s = new Date(t); s.setDate(t.getDate() - 90);
      setStartDate(toDateInput(s)); setEndDate(toDateInput(t));
    } else {
      setStartDate("2024-01-01"); setEndDate(toDateInput(t));
    }
  }

  // ── transfer ─────────────────────────────────────────────────────────────

  async function openTransfer() {
    setTransferSuccess(false); setTransferError("");
    setTransferAmount(""); setTransferRemarks(""); setSelectedTarget(null);
    setSenderCardId(""); setSenderBalance(0);

    // logged-in user id — prop থেকে অথবা auth থেকে
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const senderId = currentUserId || authUser?.id;
    if (!senderId) { setTransferError("লগইন করা নেই।"); return; }

    // sender এর সর্বোচ্চ balance card
    const { data: senderCoh } = await supabase
      .from("cash_on_hand").select("card_id, current_balance")
      .eq("user_id", senderId).order("current_balance", { ascending: false }).limit(1);
    if (senderCoh?.[0]) {
      setSenderCardId(senderCoh[0].card_id);
      setSenderBalance(Number(senderCoh[0].current_balance));
    }

    // অন্য users ও তাদের cash_on_hand cards
    const { data: profiles } = await supabase
      .from("profiles").select("id, name").neq("id", senderId);
    const targets: TransferTarget[] = [];
    for (const p of (profiles || []) as { id: string; name: string }[]) {
      const { data: cohRows } = await supabase
        .from("cash_on_hand")
        .select("card_id, cards(card_name, last_4_digits)")
        .eq("user_id", p.id);
      if (cohRows && cohRows.length > 0) {
        targets.push({
          userId: p.id,
          userName: p.name,
          cards: cohRows.map((row: any) => ({
            cardId: row.card_id,
            cardName: row.cards?.card_name || "Card",
            cardLast4: row.cards?.last_4_digits || "****",
          })),
        });
      }
    }
    // reset receiver card selection
    setSelectedReceiverCardId("");
    setTransferTargets(targets);
    setTransferOpen(true);
  }

  async function executeTransfer() {
    if (!selectedTarget || !senderCardId || !selectedReceiverCardId) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const senderId = currentUserId || authUser?.id;
    if (!senderId) { setTransferError("লগইন করা নেই।"); return; }
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) { setTransferError("Valid amount দিন।"); return; }
    if (amount > senderBalance) { setTransferError("Balance এর বেশি transfer করা যাবে না।"); return; }
    setTransferLoading(true); setTransferError("");
    try {
      const now = new Date().toISOString();
      const note = transferRemarks.trim() || `Transfer to ${selectedTarget.userName}`;
      const senderName = userStats.find(u => u.id === senderId)?.name || "You";

      // sender debit
      const { data: sRow } = await supabase.from("cash_on_hand").select("current_balance")
        .eq("user_id", senderId).eq("card_id", senderCardId).single();
      await supabase.from("cash_on_hand")
        .update({ current_balance: Number(sRow?.current_balance || 0) - amount, updated_at: now })
        .eq("user_id", senderId).eq("card_id", senderCardId);

      // receiver credit
      const { data: rRow } = await supabase.from("cash_on_hand").select("current_balance")
        .eq("user_id", selectedTarget.userId).eq("card_id", selectedReceiverCardId).single();
      await supabase.from("cash_on_hand")
        .update({ current_balance: Number(rRow?.current_balance || 0) + amount, updated_at: now })
        .eq("user_id", selectedTarget.userId).eq("card_id", selectedReceiverCardId);

      // ledger entries
      await supabase.from("cash_on_hand_ledger").insert({
        user_id: senderId, card_id: senderCardId,
        amount, transaction_type: "debit", transaction_date: now,
        remarks: `Transfer to ${selectedTarget.userName} — ${note}`,
      });
      await supabase.from("cash_on_hand_ledger").insert({
        user_id: selectedTarget.userId, card_id: selectedReceiverCardId,
        amount, transaction_type: "credit", transaction_date: now,
        remarks: `Received from ${senderName} — ${note}`,
      });

      setSenderBalance(p => p - amount);
      setTransferSuccess(true);
      // re-fetch if sender is the open modal user
      if (selectedUserStat?.id === senderId) {
        fetchFamilyCash(senderId).then(setTotalUserCash);
        fetchCashLedger(senderId, startDate, endDate);
      }
    } catch {
      setTransferError("Transfer failed। আবার চেষ্টা করুন।");
    } finally {
      setTransferLoading(false);
    }
  }

  // ── derived values ────────────────────────────────────────────────────────

  const groupedCashLedger = groupByMonth(cashLedger, "transaction_date");
  const groupedDueLedger = groupByMonth(dueLedger, "date");

  const cashTotal = {
    credit: cashLedger.filter(t => t.transaction_type === "credit").reduce((s, t) => s + Number(t.amount), 0),
    debit: cashLedger.filter(t => t.transaction_type === "debit").reduce((s, t) => s + Number(t.amount), 0),
  };
  const dueTotal = {
    spend: dueLedger.filter(t => t.type === "spend").reduce((s, t) => s + t.amount, 0),
    repayment: dueLedger.filter(t => t.type === "repayment").reduce((s, t) => s + t.amount, 0),
  };

  const isLoading = userStats.length === 0;
  const displayStats = isLoading
    ? [{ id: "ghost1", name: "Loading", cash: 0, due: 0 }, { id: "ghost2", name: "Loading", cash: 0, due: 0 }]
    : userStats;

  // ── date range filter UI (shared for cash & due tabs) ────────────────────
  const DateRangeFilter = () => (
    <div className="px-4 pb-3 pt-2 space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {([
          { label: "এই মাস", p: "this_month" },
          { label: "আগের মাস", p: "last_month" },
          { label: "30D", p: "last_30" },
          { label: "90D", p: "last_90" },
          { label: "All", p: "all" },
        ] as const).map(({ label, p }) => (
          <button key={p} onClick={() => applyPreset(p)}
            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white transition-all">
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <CalendarDays className="w-3 h-3 text-slate-500 flex-shrink-0" />
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-white/20 flex-1 [color-scheme:dark]" />
        <span className="text-slate-600 text-xs">→</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-white/20 flex-1 [color-scheme:dark]" />
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <motion.section
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
      className="mb-8 relative z-10"
    >
      {/* Section title */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <Banknote className="w-4 h-4 text-[#10b981]" />
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
          Cash & Repayment Analytics
        </h2>
      </div>

      {/* Home cards — ২টা user card */}
      <div className="grid grid-cols-2 gap-4">
        {displayStats.map((stat, i) => (
          <motion.div
            key={stat.id}
            whileHover={!isLoading ? { scale: 1.02 } : {}}
            whileTap={!isLoading ? { scale: 0.98 } : {}}
            onClick={() => !isLoading && handleUserStatClick(stat as UserStat)}
            className={`bg-white/[0.03] border border-white/10 rounded-[24px] p-5 backdrop-blur-xl relative overflow-hidden flex flex-col shadow-inner ${isLoading ? "animate-pulse" : "group hover:bg-white/[0.06] transition-all cursor-pointer"}`}
          >
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-[30px] opacity-30 ${i === 0 ? "bg-[#0ea5e9]" : "bg-[#a855f7]"}`} />
            <div className="flex items-center gap-2 mb-4 relative z-10">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden border ${i === 0 ? "border-[#0ea5e9]" : "border-[#a855f7]"}`}>
                {isLoading ? (
                  <div className="w-full h-full bg-slate-700/50" />
                ) : stat.avatar_url && !statImgError[stat.id] ? (
                  <img src={stat.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full"
                    onError={() => setStatImgError(p => ({ ...p, [stat.id]: true }))} />
                ) : (
                  <div className="w-full h-full bg-black flex items-center justify-center text-[10px] font-bold text-white">
                    {stat.name.charAt(0)}
                  </div>
                )}
              </div>
              {isLoading
                ? <div className="h-4 w-16 bg-slate-700/50 rounded" />
                : <h3 className="text-sm font-black text-white truncate max-w-[80px]">{stat.name}</h3>
              }
            </div>
            <div className="space-y-3 relative z-10 mt-auto">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Holding Cash</p>
                {isLoading
                  ? <div className="h-6 w-20 bg-slate-700/50 rounded mt-1" />
                  : <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                    className={`text-lg font-black tracking-tight ${(familyCashMap[stat.id] ?? stat.cash) > 0 ? "text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "text-slate-300"}`}>
                    {/* card family total — selectedCard এর family অনুযায়ী */}
                    ₹{(familyCashMap[stat.id] ?? stat.cash).toLocaleString()}
                  </motion.p>
                }
              </div>
              <div className="pt-3 border-t border-white/10">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Personal Due</p>
                {isLoading
                  ? <div className="h-5 w-16 bg-slate-700/50 rounded mt-1" />
                  : <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className={`text-base font-black tracking-tight ${(familyDueMap[stat.id] ?? stat.due) > 0 ? "text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]" : "text-slate-400"}`}>
                    ₹{(familyDueMap[stat.id] ?? stat.due).toLocaleString()}
                  </motion.p>
                }
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════ Detail Modal ═══════════════ */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="bg-[#030014]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-lg w-[95vw] p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] [&>button]:hidden outline-none">

          <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-[#0ea5e9] opacity-[0.1] blur-[80px] mix-blend-screen pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#a855f7] opacity-[0.1] blur-[80px] mix-blend-screen pointer-events-none" />

          {/* Modal header */}
          <div className="p-6 relative border-b border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent">
            <DialogHeader>
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-black">
                    {selectedUserStat?.avatar_url && !statImgError[selectedUserStat.id]
                      ? <img src={selectedUserStat.avatar_url} alt="Profile" className="w-full h-full object-cover rounded-full" />
                      : <span className="text-sm font-bold text-white">{selectedUserStat?.name?.charAt(0)}</span>
                    }
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent leading-tight">
                      {selectedUserStat?.name}&apos;s Ledger
                    </DialogTitle>
                    <p className="text-[10px] text-[#a855f7] font-bold uppercase tracking-wider mt-0.5">Advanced Analytics</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsUserModalOpen(false)}
                  className="rounded-full bg-white/5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 border border-white/5 focus:outline-none">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </DialogHeader>
          </div>

          {/* Tabs */}
          <div className="flex flex-col bg-white/[0.02] border-b border-white/5 relative z-10">
            <div className="flex p-2 gap-2 overflow-x-auto custom-scrollbar">
              <button onClick={() => setUserModalTab("summary")}
                className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "summary" ? "bg-white/10 text-white border border-white/20 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>
                Summary
              </button>
              <button onClick={() => setUserModalTab("cash_ledger")}
                className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "cash_ledger" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>
                Cash In/Out
              </button>
              <button onClick={() => setUserModalTab("due_ledger")}
                className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-xl transition-all ${userModalTab === "due_ledger" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-inner" : "bg-transparent text-slate-400 hover:bg-white/5"}`}>
                Personal Due
              </button>
            </div>

            {/* Date range filter — cash & due tab এ দেখায় */}
            {userModalTab !== "summary" && <DateRangeFilter />}
          </div>

          {/* Tab content */}
          <div className="p-4 sm:p-6 h-[55vh] overflow-y-auto custom-scrollbar relative z-10">
            <AnimatePresence mode="wait">

              {/* ── Summary tab ── */}
              {userModalTab === "summary" && (
                <motion.div key="summary" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="space-y-4">

                  {/* Cash card — cash_on_hand টেবিল, card family total */}
                  <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden backdrop-blur-md">
                    <Banknote className="absolute -bottom-4 -right-4 w-24 h-24 text-emerald-500/20 rotate-12 pointer-events-none" />
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Cash In Hand</p>
                    <p className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                      ₹{totalUserCash.toLocaleString()}
                    </p>
                    <p className="text-xs font-medium text-emerald-500/70 mt-2 flex items-center gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      {selectedCardId === "all" ? "All cards aggregated balance" : "Card family aggregated balance"}
                    </p>
                    {/* Transfer button — শুধু logged-in user এর নিজের modal এ */}
                    {currentUserId && selectedUserStat?.id === currentUserId && (
                      <button onClick={openTransfer}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all">
                        <Send className="w-3.5 h-3.5" /> Transfer Cash
                      </button>
                    )}
                  </div>

                  {/* Due card — spends টেবিল, card family net due */}
                  <div className="bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(244,63,94,0.1)] relative overflow-hidden backdrop-blur-md">
                    <Receipt className="absolute -bottom-4 -right-4 w-24 h-24 text-rose-500/20 -rotate-12 pointer-events-none" />
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Total Personal Due</p>
                    <p className="text-4xl font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.4)]">
                      ₹{totalUserDue.toLocaleString()}
                    </p>
                    <p className="text-xs font-medium text-rose-500/70 mt-2 flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5" /> Total remaining debt to clear
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── Cash In/Out tab — cash_on_hand_ledger থেকে (original logic অপরিবর্তিত) ── */}
              {userModalTab === "cash_ledger" && (
                <motion.div key="cash_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>

                  {/* Filtered total summary row */}
                  <div className="flex gap-3 mb-5">
                    <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">In</p>
                        <p className="text-sm font-black text-emerald-400">₹{cashTotal.credit.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-rose-500 font-bold uppercase tracking-widest">Out</p>
                        <p className="text-sm font-black text-rose-400">₹{cashTotal.debit.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className={`flex-1 border rounded-2xl p-3 flex items-center gap-2 ${cashTotal.credit - cashTotal.debit >= 0 ? "bg-sky-500/10 border-sky-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
                      <Banknote className={`w-4 h-4 flex-shrink-0 ${cashTotal.credit - cashTotal.debit >= 0 ? "text-sky-400" : "text-amber-400"}`} />
                      <div>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${cashTotal.credit - cashTotal.debit >= 0 ? "text-sky-500" : "text-amber-500"}`}>Net</p>
                        <p className={`text-sm font-black ${cashTotal.credit - cashTotal.debit >= 0 ? "text-sky-400" : "text-amber-400"}`}>
                          {cashTotal.credit - cashTotal.debit >= 0 ? "+" : "-"}₹{Math.abs(cashTotal.credit - cashTotal.debit).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {Object.keys(groupedCashLedger).length > 0
                    ? Object.entries(groupedCashLedger).map(([month, txs]) => (
                      <div key={month} className="mb-6">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">{month}</h4>
                        <div className="space-y-2">
                          {txs.map((tx: CashTransaction) => (
                            <motion.div layout key={tx.id} onClick={() => toggleExpand(tx.id)}
                              className="bg-white/[0.03] border border-white/5 rounded-[20px] hover:bg-white/[0.06] transition-colors cursor-pointer overflow-hidden backdrop-blur-sm">
                              <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.transaction_type === "credit" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]"}`}>
                                    {tx.transaction_type === "credit" ? <ArrowDownLeft className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                                  </div>
                                  <div className="w-[160px] sm:w-[200px]">
                                    <p className="text-sm font-bold text-white truncate">{tx.remarks || "Cash Transaction"}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                      {new Date(tx.transaction_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} •{" "}
                                      {new Date(tx.transaction_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className={`text-base font-black ${tx.transaction_type === "credit" ? "text-emerald-400" : "text-rose-400"}`}>
                                    {tx.transaction_type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString()}
                                  </p>
                                  <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${expandedTxId === tx.id ? "rotate-90" : ""}`} />
                                </div>
                              </div>
                              <AnimatePresence>
                                {expandedTxId === tx.id && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-1 border-t border-white/5">
                                    <div className="bg-black/40 rounded-xl p-3 space-y-2 text-xs">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500 font-medium">Type:</span>
                                        <span className={tx.transaction_type === "credit" ? "text-emerald-400 font-bold uppercase" : "text-rose-400 font-bold uppercase"}>{tx.transaction_type}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500 font-medium">Amount:</span>
                                        <span className="text-white font-bold">₹{Number(tx.amount).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between items-start">
                                        <span className="text-slate-500 font-medium">Remarks:</span>
                                        <span className="text-slate-300 text-right max-w-[200px]">{tx.remarks || "N/A"}</span>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))
                    : (
                      <div className="text-center py-10 bg-white/[0.02] border border-white/5 rounded-3xl mt-4">
                        <Banknote className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-xs font-bold text-slate-500">No cash transactions in this period.</p>
                      </div>
                    )}
                </motion.div>
              )}

              {/* ── Personal Due tab — শুধু spends টেবিল থেকে ── */}
              {userModalTab === "due_ledger" && (
                <motion.div key="due_ledger" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>

                  {/* Filtered total summary row */}
                  <div className="flex gap-3 mb-5">
                    <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-rose-500 font-bold uppercase tracking-widest">Due Added</p>
                        <p className="text-sm font-black text-rose-400">₹{dueTotal.spend.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Repaid</p>
                        <p className="text-sm font-black text-emerald-400">₹{dueTotal.repayment.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className={`flex-1 border rounded-2xl p-3 flex items-center gap-2 ${dueTotal.spend - dueTotal.repayment > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                      <Receipt className={`w-4 h-4 flex-shrink-0 ${dueTotal.spend - dueTotal.repayment > 0 ? "text-amber-400" : "text-emerald-400"}`} />
                      <div>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${dueTotal.spend - dueTotal.repayment > 0 ? "text-amber-500" : "text-emerald-500"}`}>Net</p>
                        <p className={`text-sm font-black ${dueTotal.spend - dueTotal.repayment > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                          ₹{Math.abs(dueTotal.spend - dueTotal.repayment).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {Object.keys(groupedDueLedger).length > 0
                    ? Object.entries(groupedDueLedger).map(([month, txs]) => (
                      <div key={month} className="mb-6">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">{month}</h4>
                        <div className="space-y-2">
                          {txs.map((tx: DueTransaction) => (
                            <motion.div layout key={tx.id} onClick={() => toggleExpand(tx.id)}
                              className="bg-white/[0.03] border border-white/5 rounded-[20px] hover:bg-white/[0.06] transition-colors cursor-pointer overflow-hidden backdrop-blur-sm">
                              <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tx.type === "spend" ? "bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"}`}>
                                    {tx.type === "spend" ? <Receipt className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                  </div>
                                  <div className="w-[160px] sm:w-[200px]">
                                    <p className="text-sm font-bold text-white truncate">{tx.remarks || "Due Transaction"}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                      {new Date(tx.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className={`text-base font-black ${tx.type === "spend" ? "text-rose-400" : "text-emerald-400"}`}>
                                    {tx.type === "spend" ? "+" : "-"}₹{tx.amount.toLocaleString()}
                                  </p>
                                  <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${expandedTxId === tx.id ? "rotate-90" : ""}`} />
                                </div>
                              </div>
                              <AnimatePresence>
                                {expandedTxId === tx.id && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-1 border-t border-white/5">
                                    <div className="bg-black/40 rounded-xl p-3 space-y-2 text-xs">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500 font-medium">Type:</span>
                                        <span className={tx.type === "spend" ? "text-rose-400 font-bold uppercase" : "text-emerald-400 font-bold uppercase"}>
                                          {tx.type === "spend" ? "Added to Due" : "Repaid/Recovered"}
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
                    ))
                    : (
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

      {/* ═══════════════ Transfer Modal ═══════════════ */}
      <Dialog open={transferOpen} onOpenChange={o => { setTransferOpen(o); if (!o) { setTransferSuccess(false); setTransferError(""); } }}>
        <DialogContent className="bg-[#030014]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[32px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] [&>button]:hidden outline-none">
          <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-emerald-500 opacity-[0.08] blur-[60px] pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-sky-500 opacity-[0.08] blur-[60px] pointer-events-none" />

          <div className="p-5 border-b border-white/5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Send className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Transfer Cash</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">অন্য user এ পাঠান</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setTransferOpen(false)}
              className="rounded-full bg-white/5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 border border-white/5">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-5 space-y-4 relative z-10">
            {transferSuccess ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-white font-black text-lg">Transfer Successful!</p>
                <p className="text-slate-400 text-xs text-center">
                  ₹{Number(transferAmount).toLocaleString()} sent to {selectedTarget?.userName}<br />
                  Remaining balance: ₹{senderBalance.toLocaleString()}
                </p>
                <button onClick={() => { setTransferSuccess(false); setTransferAmount(""); setTransferRemarks(""); setSelectedTarget(null); }}
                  className="mt-2 px-5 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-bold hover:bg-white/15 transition-all">
                  আরেকটা করুন
                </button>
              </motion.div>
            ) : (
              <>
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                  <p className="text-xs text-slate-400 font-bold">আপনার available balance</p>
                  <p className="text-emerald-400 font-black text-sm">₹{senderBalance.toLocaleString()}</p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">কাকে পাঠাবেন?</p>
                  {transferTargets.length === 0
                    ? <p className="text-xs text-slate-500 text-center py-4">কোনো recipient পাওয়া যায়নি</p>
                    : (
                      <div className="space-y-2">
                        {/* User selection */}
                        <div className="flex gap-2 flex-wrap">
                          {transferTargets.map((t) => (
                            <button key={t.userId}
                              onClick={() => { setSelectedTarget(t); setSelectedReceiverCardId(t.cards[0]?.cardId || ""); }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm font-black ${selectedTarget?.userId === t.userId ? "bg-emerald-500/15 border-emerald-500/40 text-white" : "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05]"}`}>
                              {selectedTarget?.userId === t.userId && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                              {t.userName}
                            </button>
                          ))}
                        </div>
                        {/* Card dropdown — selected user এর cards */}
                        {selectedTarget && (
                          <select
                            value={selectedReceiverCardId}
                            onChange={e => setSelectedReceiverCardId(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-300 outline-none focus:border-emerald-500/40 [color-scheme:dark]">
                            {selectedTarget.cards.map(c => (
                              <option key={c.cardId} value={c.cardId} className="bg-[#030014]">
                                {c.cardName} •••• {c.cardLast4}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  }
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">পরিমাণ (₹)</p>
                  <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white font-black text-xl outline-none focus:border-emerald-500/50 focus:bg-white/[0.06] transition-all placeholder:text-slate-700" />
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">মন্তব্য (optional)</p>
                  <input type="text" value={transferRemarks} onChange={e => setTransferRemarks(e.target.value)}
                    placeholder="কারণ লিখুন..."
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all placeholder:text-slate-700" />
                </div>

                {transferError && (
                  <p className="text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">{transferError}</p>
                )}

                <button onClick={executeTransfer}
                  disabled={transferLoading || !selectedTarget || !transferAmount}
                  className="w-full py-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-sm hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {transferLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    : <><Send className="w-4 h-4" /> Transfer করুন</>
                  }
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </motion.section>
  );
}