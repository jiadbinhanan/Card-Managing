"use client";

import { motion, AnimatePresence, type Variants } from "motion/react";
import {
  ArrowDownLeft, CreditCard, Wallet, Banknote, Receipt, QrCode, ChevronDown,
  Edit3, Zap, CalendarClock, ShieldCheck, CalendarDays, AlertTriangle, X, Plus,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// ── Types (page.tsx-এর সাথে শেয়ার্ড শেপ) ──
export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string;
  bill_gen_day?: number;
  bill_due_day?: number;
}

export interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

export interface QR {
  id: string;
  merchant_name: string;
  status: string;
}

export interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string; // raw input string, digits only
}

interface RecordEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;

  txType: "rotate" | "spend" | "bill";
  setTxType: (t: "rotate" | "spend" | "bill") => void;

  amount: string;
  setAmount: (v: string) => void;
  amtNum: number;

  txDate: string;
  setTxDate: (v: string) => void;

  selectedUserId: string;
  setSelectedUserId: (v: string) => void;
  profiles: Profile[];

  // Rotate / Spend card selection
  entryCardId: string;
  setEntryCardId: (v: string) => void;
  entryUserCards: CardData[];

  // Bill card selection
  billCardId: string;
  setBillCardId: (v: string) => void;
  billPrimaryCards: CardData[];
  cardDueMap: Record<string, number>;
  cardDueDateMap: Record<string, string>;

  currentFamilyLimit: number;
  currentActorCardCash: number;
  userFamilySpendMap: Record<string, Record<string, number>>;
  selectedEntryCardObj?: CardData;
  entryPrimaryId?: string;

  // Rotate
  selectedQrId: string;
  setSelectedQrId: (v: string) => void;
  qrs: QR[];

  // Spend
  spendMethod: "credit_card" | "cash_on_hand";
  setSpendMethod: (v: "credit_card" | "cash_on_hand") => void;
  cardSplitAmt: number;
  spendCashSplitAmt: number;
  isSpendSplitting: boolean;

  // Bill — fund source
  billMethod: "cash_on_hand" | "own_pocket";
  setBillMethod: (v: "cash_on_hand" | "own_pocket") => void;
  isDebtRepayment: boolean;
  setIsDebtRepayment: (v: boolean) => void;

  // ── নতুন: multi-source cash allocation (শুধু বিল পে-তে) ──
  allCards: CardData[];
  currentUserCashByCard: Record<string, number>; // currentUser-এর সব কার্ডের cash_on_hand balance
  cashSources: CashSourceRow[];
  setCashSources: (rows: CashSourceRow[]) => void;
  cashAllocatedTotal: number;      // sum of valid source amounts
  pocketSplitAmt: number;          // amtNum - cashAllocatedTotal (min 0) — auto Own Pocket remainder
  allocationValid: boolean;        // প্রতিটা row balance-এর মধ্যে + sum <= amtNum
  canSave: boolean;                // সবকিছু মিলিয়ে Save বাটন enable/disable

  remarks: string;
  setRemarks: (v: string) => void;
}

const expandVars: Variants = {
  hidden: { height: 0, opacity: 0, marginTop: 0 },
  visible: { height: "auto", opacity: 1, marginTop: 12, transition: { type: "spring", stiffness: 280, damping: 28 } },
  exit: { height: 0, opacity: 0, marginTop: 0, transition: { duration: 0.2, ease: "easeInOut" } },
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function RecordEntryModal(props: RecordEntryModalProps) {
  const {
    isOpen, onClose, onSave,
    txType, setTxType,
    amount, setAmount, amtNum,
    txDate, setTxDate,
    selectedUserId, setSelectedUserId, profiles,
    entryCardId, setEntryCardId, entryUserCards,
    billCardId, setBillCardId, billPrimaryCards, cardDueMap, cardDueDateMap,
    currentFamilyLimit, currentActorCardCash, userFamilySpendMap, selectedEntryCardObj, entryPrimaryId,
    selectedQrId, setSelectedQrId, qrs,
    spendMethod, setSpendMethod, cardSplitAmt, spendCashSplitAmt, isSpendSplitting,
    billMethod, setBillMethod, isDebtRepayment, setIsDebtRepayment,
    allCards, currentUserCashByCard, cashSources, setCashSources,
    cashAllocatedTotal, pocketSplitAmt, allocationValid, canSave,
    remarks, setRemarks,
  } = props;

  const cardsWithCash = allCards.filter((c) => (currentUserCashByCard[c.id] || 0) > 0);

  const addSource = () => {
    const used = new Set(cashSources.map((s) => s.cardId));
    const next = cardsWithCash.find((c) => !used.has(c.id));
    setCashSources([...cashSources, { uid: uid(), cardId: next?.id || "", amount: "" }]);
  };

  const updateSource = (idx: number, patch: Partial<CashSourceRow>) => {
    const next = cashSources.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setCashSources(next);
  };

  const removeSource = (idx: number) => {
    setCashSources(cashSources.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)]">
        <div className="max-h-[85vh] overflow-y-auto custom-scrollbar p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">
              Record Entry
            </DialogTitle>
            <DialogDescription className="hidden">Record new transaction</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Type Segmented Control */}
            <div className="flex p-1.5 bg-white/[0.03] border border-white/10 rounded-2xl shadow-inner">
              {[
                { id: "bill", label: "Pay Bill", icon: CreditCard, color: "#10b981" },
                { id: "rotate", label: "Rotate Limit", icon: ArrowDownLeft, color: "#0ea5e9" },
                { id: "spend", label: "Add Spend", icon: Receipt, color: "#a855f7" },
              ].map((type) => {
                const Icon = type.icon;
                const isActive = txType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setTxType(type.id as any)}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 relative rounded-xl transition-all ${isActive ? "text-white" : "text-slate-500"}`}
                  >
                    {isActive && (
                      <motion.div layoutId="txTypeBg" className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-md" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
                    )}
                    <Icon className="w-4 h-4 mb-1 relative z-10" style={{ color: isActive ? type.color : undefined }} />
                    <span className="text-[10px] font-bold relative z-10">{type.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Amount */}
            <div className="bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 rounded-[32px] p-5 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] pointer-events-none opacity-20 ${txType === "bill" ? "bg-[#10b981]" : txType === "rotate" ? "bg-[#0ea5e9]" : "bg-[#a855f7]"}`} />
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 relative z-10">Amount (₹)</label>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="w-full bg-transparent text-center text-5xl font-black text-white placeholder:text-white/10 outline-none relative z-10"
              />
            </div>

            {/* Date & User */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-9 pr-2 outline-none focus:border-[#0ea5e9] transition-all appearance-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                  {txType === "rotate" ? "Initiated By" : txType === "bill" ? "Paid By" : "Spent By"}
                </label>
                <div className="relative">
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold text-white pl-3 pr-8 outline-none focus:border-[#0ea5e9] transition-all appearance-none">
                    {profiles.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.name.split(" ")[0]}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Card Selection */}
            {txType === "bill" ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#10b981] uppercase ml-1 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Primary Card (Bill Card)
                </label>
                <div className="relative">
                  <select
                    value={billCardId}
                    onChange={(e) => setBillCardId(e.target.value)}
                    className="w-full h-14 bg-gradient-to-r from-white/[0.05] to-transparent border border-[#10b981]/30 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#10b981] appearance-none shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                  >
                    <option value="" disabled className="bg-black">Select Primary Card...</option>
                    {billPrimaryCards.map((c) => (
                      <option key={c.id} value={c.id} className="bg-black">{c.card_name} (**{c.last_4_digits})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {billCardId && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex justify-between items-center px-4 py-3 mt-3 bg-gradient-to-r from-rose-500/20 to-pink-500/10 border border-rose-500/40 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-0.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Total Due</span>
                      <span className="text-lg font-black text-rose-400 drop-shadow-md">₹{(cardDueMap[billCardId] || 0).toLocaleString()}</span>
                    </div>
                    <div className="h-8 w-px bg-rose-500/30 mx-3"></div>
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] font-black text-rose-500 uppercase flex items-center justify-end gap-1 tracking-widest mb-0.5"><CalendarClock className="w-3.5 h-3.5" /> Due Date</span>
                      <span className="text-sm font-black text-rose-300 drop-shadow-md">{cardDueDateMap[billCardId] || "Not Available"}</span>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#0ea5e9] uppercase ml-1 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Attach Card
                </label>
                <div className="relative">
                  <select value={entryCardId} onChange={(e) => setEntryCardId(e.target.value)} className="w-full h-14 bg-gradient-to-r from-white/[0.05] to-transparent border border-white/10 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none shadow-[0_0_15px_rgba(14,165,233,0.1)]">
                    <option value="" disabled className="bg-black">Select a Card...</option>
                    {entryUserCards.map((c) => (
                      <option key={c.id} value={c.id} className="bg-black">{c.is_primary ? "" : "↳ "}{c.card_name} (**{c.last_4_digits})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {txType === "spend" && selectedUserId && entryCardId && entryPrimaryId && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between px-4 py-3 mt-3 bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/40 rounded-2xl shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Personal Spend <span className="text-[8px] text-amber-500/60 lowercase tracking-normal">(Family Level)</span>
                    </span>
                    <span className="text-sm font-black text-amber-400 drop-shadow-md">
                      ₹{(userFamilySpendMap[selectedUserId]?.[entryPrimaryId] || 0).toLocaleString()}
                    </span>
                  </motion.div>
                )}
              </div>
            )}

            {/* Conditional fields */}
            <AnimatePresence mode="wait">
              {/* BILL */}
              {txType === "bill" && (
                <motion.div key="bill" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="space-y-5">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                    <div>
                      <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Clear Personal Debt?</div>
                      <div className="text-[9px] text-emerald-500/70 mt-0.5">Toggle ON to reduce your &quot;Total Personal Due&quot;</div>
                    </div>
                    <Switch checked={isDebtRepayment} onCheckedChange={setIsDebtRepayment} className="data-[state=checked]:bg-[#10b981]" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Fund Source</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setBillMethod("cash_on_hand")}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                          billMethod === "cash_on_hand"
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                            : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">Cash on Hand</span></div>
                        <span className="text-[9px] font-black opacity-70">Pick source(s) below</span>
                      </button>
                      <button
                        onClick={() => setBillMethod("own_pocket")}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                          billMethod === "own_pocket"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                            : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs font-bold">Own Pocket</span></div>
                        {billMethod === "cash_on_hand" && pocketSplitAmt > 0 ? (
                          <span className="text-sm font-black text-white">₹{pocketSplitAmt.toLocaleString()}</span>
                        ) : (
                          <span className="text-[9px] font-black opacity-70">Personal Funds</span>
                        )}
                      </button>
                    </div>

                    {/* ── Multi-source cash allocation (নতুন, intelligent) ── */}
                    {billMethod === "cash_on_hand" && (
                      <motion.div variants={expandVars} initial="hidden" animate="visible" exit="exit" className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                        <div className={`flex justify-between items-center px-3 py-2 rounded-xl text-[11px] font-black ${
                          allocationValid ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                        }`}>
                          <span className="uppercase tracking-wider">Allocated</span>
                          <span>₹{cashAllocatedTotal.toLocaleString()} / ₹{amtNum.toLocaleString()}</span>
                        </div>

                        {cashSources.map((src, idx) => {
                          const bal = currentUserCashByCard[src.cardId] || 0;
                          const over = Number(src.amount || 0) > bal;
                          const cardObj = allCards.find((c) => c.id === src.cardId);
                          return (
                            <div key={src.uid} className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <select
                                  value={src.cardId}
                                  onChange={(e) => updateSource(idx, { cardId: e.target.value })}
                                  className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-3 pr-7 outline-none focus:border-amber-500 appearance-none"
                                >
                                  <option value="" className="bg-black">Select card...</option>
                                  {cardsWithCash
                                    .filter((c) => c.id === src.cardId || !cashSources.some((s) => s.cardId === c.id))
                                    .map((c) => (
                                      <option key={c.id} value={c.id} className="bg-black">
                                        {c.card_name} (**{c.last_4_digits}) — ₹{(currentUserCashByCard[c.id] || 0).toLocaleString()}
                                      </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                              </div>
                              <input
                                type="text" inputMode="numeric" value={src.amount}
                                onChange={(e) => updateSource(idx, { amount: e.target.value.replace(/[^0-9]/g, "") })}
                                placeholder="0"
                                className={`w-24 h-11 bg-white/[0.03] border rounded-xl text-center text-xs font-bold text-white outline-none ${over ? "border-rose-500" : "border-white/10 focus:border-amber-500"}`}
                              />
                              <button
                                type="button"
                                onClick={() => updateSource(idx, { amount: String(bal) })}
                                className="h-11 px-2 text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg shrink-0"
                              >
                                MAX
                              </button>
                              {cashSources.length > 1 && (
                                <button type="button" onClick={() => removeSource(idx)} className="h-11 w-9 flex items-center justify-center text-slate-500 hover:text-rose-400 shrink-0">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={addSource}
                          disabled={cashSources.length >= cardsWithCash.length}
                          className="w-full h-10 flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-400 bg-white/[0.02] border border-dashed border-amber-500/30 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Another Source
                        </button>

                        {pocketSplitAmt > 0 && (
                          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 text-emerald-400">
                            <Zap className="w-3 h-3 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">₹{pocketSplitAmt.toLocaleString()} remaining → Own Pocket</span>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ROTATE */}
              {txType === "rotate" && (
                <motion.div key="rotate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="space-y-5">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0ea5e9]/10 to-[#38bdf8]/5 border border-[#0ea5e9]/30 shadow-[0_0_15px_rgba(14,165,233,0.1)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#0ea5e9]" />
                      <span className="text-[10px] font-black text-[#0ea5e9] uppercase tracking-widest">Card Available</span>
                    </div>
                    <span className="text-base font-black text-white">₹{currentFamilyLimit.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Destination QR</label>
                    <div className="relative">
                      <select value={selectedQrId} onChange={(e) => setSelectedQrId(e.target.value)} className="w-full appearance-none bg-white/[0.03] border border-white/10 text-white text-sm font-bold h-14 pl-12 pr-10 rounded-2xl outline-none focus:border-[#0ea5e9] shadow-inner">
                        <option value="" className="bg-[#050505]">Select QR Code</option>
                        {qrs.map((qr) => <option key={qr.id} value={qr.id} className="bg-[#050505]">{qr.merchant_name}</option>)}
                      </select>
                      <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SPEND */}
              {txType === "spend" && (
                <motion.div key="spend" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 flex justify-between">
                      Payment Source <span className="text-[9px] lowercase text-indigo-400">(Auto-splits if amt exceeds)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setSpendMethod("credit_card")} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${spendMethod === "credit_card" || isSpendSplitting ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                        <div className="flex items-center gap-1.5 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs font-bold">Direct Card</span></div>
                        {isSpendSplitting ? <span className="text-sm font-black text-white">₹{cardSplitAmt.toLocaleString()}</span> : <span className="text-[9px] font-black opacity-70">Avail: ₹{(currentFamilyLimit / 1000).toFixed(1)}k</span>}
                      </button>
                      <button onClick={() => setSpendMethod("cash_on_hand")} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${spendMethod === "cash_on_hand" || isSpendSplitting ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"}`}>
                        <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4" /><span className="text-xs font-bold">Cash on Hand</span></div>
                        {isSpendSplitting ? <span className="text-sm font-black text-white">₹{spendCashSplitAmt.toLocaleString()}</span> : <span className="text-[9px] font-black opacity-70">Bal: ₹{currentActorCardCash.toLocaleString()}</span>}
                      </button>
                    </div>
                    {isSpendSplitting && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 mt-2 text-indigo-400">
                        <Zap className="w-3 h-3 animate-pulse" /> <span className="text-[10px] font-black uppercase tracking-widest">Auto-Split Activated</span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Remarks */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Remarks (Optional)</label>
              <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#0ea5e9] transition-all shadow-inner">
                <Edit3 className="w-4 h-4 text-slate-500 mr-3" />
                <input type="text" autoComplete="off" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a note..." className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 font-bold" />
              </div>
            </div>

            {/* Save */}
            <div className="pt-4">
              <Button
                onClick={onSave}
                disabled={!canSave}
                className={`w-full h-14 rounded-2xl text-white font-black text-lg transition-all border-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  txType === "bill" ? "bg-gradient-to-r from-[#10b981] to-[#34d399] shadow-[0_0_30px_rgba(16,185,129,0.3)]" :
                  txType === "rotate" ? "bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] shadow-[0_0_30px_rgba(14,165,233,0.3)]" :
                  "bg-gradient-to-r from-[#a855f7] to-[#d946ef] shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                }`}
              >
                {txType === "bill" ? "Record Payment" : txType === "rotate" ? "Record Rotation" : "Record Spend"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}