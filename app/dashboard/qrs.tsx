"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { QrCode, Sparkles, ArrowRight, CheckCircle2, ChevronDown, CreditCard, Timer, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

interface QR {
  id: string;
  merchant_name: string;
  platform: string;
  settlement_time: string;
  qr_image_url: string;
  last_used_date: string | null;
  status: string;
  upi_id: string;
  base_payment_link?: string | null; // Added custom link support
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
}

interface QrsProps {
  firstName: string;
  currentUser: any;
  accessibleCards: CardData[];
  globalSelectedCardId: string;
}

interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
  isBharatPe: boolean;
}

// Stagger Animation Variants
const containerVars: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVars: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function DashboardQRs({ firstName, currentUser, accessibleCards, globalSelectedCardId }: QrsProps) {
  const [suggestedQrs, setSuggestedQrs] = useState<QR[]>([]);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [activeCooldowns, setActiveCooldowns] = useState<ActiveCooldown[]>([]);
  const [now, setNow] = useState(Date.now());

  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>("");

  useEffect(() => {
    fetchQRs();
    const channel = supabase.channel('qrs_dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => fetchQRs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchQRs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [firstName, currentUser]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchQRs() {
    if (!currentUser) return;

    // Fetch all active QRs
    const { data: qrData } = await supabase.from('qrs').select('*').eq('status', 'active');
    if (!qrData) return;

    // Fetch personal transaction history for the last 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const { data: recentTxs } = await supabase
      .from('card_transactions')
      .select('qr_id, created_at')
      .eq('recorded_by', currentUser.id)
      .not('qr_id', 'is', null)
      .gte('created_at', fiveDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    const cooldownList: ActiveCooldown[] = [];
    const processedQrIds = new Set<string>();

    if (recentTxs) {
        recentTxs.forEach(tx => {
            if (!tx.qr_id || processedQrIds.has(tx.qr_id)) return;

            const qrInfo = qrData.find(q => q.id === tx.qr_id);
            if (!qrInfo) return;

            const isBharatPe = qrInfo.platform.toLowerCase().includes('bharatpe') || qrInfo.merchant_name.toLowerCase().includes('bharatpe');
            const txTime = new Date(tx.created_at).getTime();

            let expiresAt = txTime + (24 * 60 * 60 * 1000); // 24 hours cooling for all

            if (expiresAt > Date.now()) {
                cooldownList.push({
                    qrId: tx.qr_id,
                    merchantName: qrInfo.merchant_name,
                    expiresAt,
                    isBharatPe
                });
            }

            processedQrIds.add(tx.qr_id);
        });
    }

    setActiveCooldowns(cooldownList);

    // Filter logic identical to settlements/qr.tsx
    const activeOperational = qrData.filter(q => {
        const nameLower = q.merchant_name.toLowerCase();
        const firstWord = nameLower.split(/\s+/)[0];

        // Block if first word matches first name
        if (firstName && firstWord === firstName.toLowerCase()) return false;

        // Block BharatPe if used within 5 days
        const isBharatPe = nameLower.includes('bharatpe') || q.platform.toLowerCase().includes('bharatpe');
        if (isBharatPe && q.last_used_date) {
            const daysSinceUsed = (Date.now() - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUsed < 5) return false;
        }

        // Standard 24h cooldown block
        if (cooldownList.some(c => c.qrId === q.id)) return false;

        return true;
    });

    // Sort by oldest last_used_date first
    activeOperational.sort((a, b) => {
        const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
        const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
        return timeA - timeB; 
    });

    setSuggestedQrs(activeOperational.slice(0, 3)); // Pick top 3 for Dashboard
  }

  const generatePaymentAmounts = () => {
    if (paymentMode === "once") {
      const isHigh = Math.random() < 0.9;
      if (isHigh) setGeneratedAmounts([Math.floor(Math.random() * 100 + 1900)]);
      else setGeneratedAmounts([Math.floor(Math.random() * 50 + 1850)]);
    } else {
      if (splitCount === 2) {
        const targetTotal = Math.floor(Math.random() * 100 + 1900);
        const first = Math.floor(Math.random() * (targetTotal - 1000) + 500); 
        const second = targetTotal - first;
        setGeneratedAmounts([first, second]);
      } else {
        const amounts = Array.from({ length: splitCount }, () => Math.floor(Math.random() * 199 + 1800));
        setGeneratedAmounts(amounts);
      }
    }
  };

  const getPaymentLink = (qr: QR | null, amt: number) => {
    if (!qr) return "#";
    if (qr.base_payment_link) {
        const separator = qr.base_payment_link.includes('?') ? '&' : '?';
        return `${qr.base_payment_link}${separator}am=${amt}`;
    }
    return `upi://pay?pa=${qr.upi_id || ''}&pn=${encodeURIComponent(qr.merchant_name || '')}&am=${amt}&cu=INR`;
  };

  const markQrAsUsedToday = async () => {
    if (!selectedQr || !selectedPaymentCardId) {
        alert("Please select a card for the payment first!");
        return;
    }
    const nowISO = new Date().toISOString(); 
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const totalAmt = generatedAmounts.length > 0 ? generatedAmounts.reduce((a, b) => a + b, 0) : 1900;

    try {
        await supabase.from('qrs').update({ last_used_date: nowISO }).eq('id', selectedQr.id);
        await supabase.from('card_transactions').insert({
            card_id: selectedPaymentCardId,
            qr_id: selectedQr.id,
            amount: totalAmt,
            transaction_date: todayStr,
            type: 'withdrawal',
            status: 'pending_settlement',
            recorded_by: currentUser?.id
        });
        setIsViewModalOpen(false);
        fetchQRs();
    } catch (error: any) {
        alert("Failed to record transaction: " + error.message);
    }
  };

  const getFormattedDate = (isoString: string | null) => {
    if (!isoString) return 'Never Used';
    return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const currentCooldowns = activeCooldowns.filter(c => c.expiresAt > now);

  return (
    <motion.section 
       variants={containerVars}
       initial="hidden" 
       animate="visible" 
       className="pb-8 space-y-5"
    >

      {/* ================= STYLISH COMPACT COOLING CARD (Different Design) ================= */}
      {currentCooldowns.length > 0 && (
        <motion.div variants={itemVars} className="relative bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-inner">
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-[#0ea5e9] to-[#38bdf8] shadow-[0_0_15px_#0ea5e9]" />

          <div className="p-3.5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <Timer className="w-4 h-4 text-[#0ea5e9] animate-pulse" />
               <h3 className="text-xs font-black text-white uppercase tracking-wider">Active Cooling</h3>
            </div>
            <span className="text-[10px] font-bold text-[#0ea5e9] bg-[#0ea5e9]/10 px-2 py-0.5 rounded-full">{currentCooldowns.length} QR Rotating</span>
          </div>

          <div className="p-2 space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
            {currentCooldowns.map((c) => {
               const timeLeft = Math.max(0, c.expiresAt - now);
               const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
               const minutes = Math.floor((timeLeft / 1000 / 60) % 60);

               const timeString = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m left`;

               return (
                  <div key={c.qrId} className="flex justify-between items-center bg-black/30 p-2 rounded-xl border border-white/5">
                     <span className="text-[11px] font-bold text-slate-300 truncate w-2/3 flex items-center gap-1.5">
                       <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                       {c.merchantName}
                     </span>
                     <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">{timeString}</span>
                  </div>
               );
            })}
          </div>
        </motion.div>
      )}

      {/* ================= RECOMMENDATION ENGINE HEADER ================= */}
      <motion.div variants={itemVars} className="flex items-center gap-2 px-1">
        <Sparkles className="w-4 h-4 text-[#10b981]" />
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
          Smart Suggestions
        </h2>
      </motion.div>

      {/* ================= RECOMMENDATIONS LIST VIEW ================= */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {suggestedQrs.length > 0 ? (
            suggestedQrs.map((qr, idx) => {
              const isTop = idx === 0;

              return (
                <motion.div 
                  key={qr.id}
                  layout
                  variants={itemVars}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => { 
                      setSelectedQr(qr); 
                      setIsViewModalOpen(true); 
                      setGeneratedAmounts([]); 
                      setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                  }}
                  className={`relative p-3.5 rounded-[20px] backdrop-blur-lg flex items-center justify-between cursor-pointer transition-all ${
                    isTop ? "bg-gradient-to-r from-[#10b981]/10 to-transparent border border-[#10b981]/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : 
                    "bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-4 w-[85%]">
                    <div className="w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center overflow-hidden relative border border-white/10 bg-black/40 shadow-inner">
                      {qr.qr_image_url ? (
                        <Image src={qr.qr_image_url} alt="QR" fill className="object-cover" />
                      ) : (
                        <QrCode className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-white truncate">{qr.merchant_name}</h3>
                        {isTop && (
                          <span className="shrink-0 flex items-center gap-1 text-[8px] font-black uppercase bg-gradient-to-r from-[#10b981] to-[#34d399] text-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#10b981]">
                            <Sparkles className="w-2.5 h-2.5" /> Best
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <span className="text-slate-400">{qr.platform.split('|')[0]}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span className="text-[#0ea5e9]">Last: {getFormattedDate(qr.last_used_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 shrink-0 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-colors">
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </motion.div>
              )
            })
          ) : (
            <motion.div variants={itemVars} className="text-center py-8 bg-white/[0.02] rounded-[24px] border border-white/10 border-dashed backdrop-blur-sm">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">All caught up! No active suggestions.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ================= PAYMENT MODAL ================= */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-6 pb-4 relative border-b border-white/5">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0ea5e9]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader className="mb-2">
              <DialogTitle className="text-2xl font-space font-black text-white leading-tight">
                {selectedQr?.merchant_name}
              </DialogTitle>
              <DialogDescription className="hidden">QR View</DialogDescription>
              {selectedQr?.base_payment_link ? (
                 <p className="text-[10px] text-indigo-400 font-bold mt-1 flex items-center gap-1"><LinkIcon className="w-3 h-3"/> Custom Payment Link Attached</p>
              ) : (
                 <p className="text-xs text-[#0ea5e9] font-bold mt-1 truncate">{selectedQr?.upi_id}</p>
              )}
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6 custom-scrollbar">
            <div className="w-48 h-48 mx-auto bg-white rounded-[28px] p-2.5 shadow-[0_0_50px_rgba(255,255,255,0.15)] relative overflow-hidden border-4 border-white/10">
              {selectedQr?.qr_image_url ? (
                <img src={selectedQr.qr_image_url} alt="QR" className="w-full h-full object-cover rounded-[20px]" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-slate-100 rounded-[20px] flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-slate-300" />
                </div>
              )}
            </div>

            <div className="space-y-4 bg-white/[0.02] p-5 rounded-[24px] border border-white/5 shadow-inner">
              <div className="space-y-1.5 pb-3 border-b border-white/5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5"><CreditCard className="w-3 h-3"/> Paying From Card</label>
                 <div className="relative">
                    <select value={selectedPaymentCardId} onChange={(e) => setSelectedPaymentCardId(e.target.value)} className="w-full h-10 bg-white/[0.05] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none appearance-none focus:border-[#0ea5e9]">
                       {accessibleCards.map(c => (
                          <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>
                       ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                 </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-300">Payment Strategy</span>
                <div className="flex bg-black/60 p-1.5 rounded-xl border border-white/5">
                  <button onClick={() => { setPaymentMode("once"); setGeneratedAmounts([]); }} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${paymentMode === "once" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Once</button>
                  <button onClick={() => { setPaymentMode("multiple"); setGeneratedAmounts([]); }} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${paymentMode === "multiple" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Multiple</button>
                </div>
              </div>

              {paymentMode === "multiple" && (
                <div className="flex items-center justify-between py-2 border-t border-white/5">
                  <span className="text-xs font-bold text-slate-400">Number of swipes:</span>
                  <div className="relative">
                    <select value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))} className="appearance-none bg-white/5 border border-white/10 text-white text-xs font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:border-[#0ea5e9] shadow-inner">
                      <option value={2} className="bg-[#050505]">2 Times</option>
                      <option value={3} className="bg-[#050505]">3 Times</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <Button onClick={generatePaymentAmounts} className="w-full h-12 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-black transition-all font-black text-sm shadow-[0_0_15px_rgba(14,165,233,0.15)] mt-2">
                <Sparkles className="w-4 h-4 mr-2" /> Generate Links
              </Button>

              {generatedAmounts.length > 0 && (
                <div className="pt-3 space-y-2 border-t border-white/10">
                  {generatedAmounts.map((amt, i) => (
                    <a key={i} href={getPaymentLink(selectedQr, amt)} className="flex items-center justify-between w-full p-4 bg-gradient-to-r from-[#10b981]/15 to-transparent border border-[#10b981]/30 rounded-xl hover:border-[#10b981]/60 transition-all group shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                      <span className="text-sm font-black text-emerald-400 group-hover:text-emerald-300">Pay ₹{amt}</span>
                      <ArrowRight className="w-5 h-5 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 bg-black/60 border-t border-white/5 rounded-b-[40px] backdrop-blur-xl">
            <Button onClick={markQrAsUsedToday} className="w-full h-14 rounded-2xl bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 hover:bg-[#10b981] hover:text-black transition-all font-bold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <CheckCircle2 className="w-5 h-5 mr-2" /> Mark Used & Save Transaction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}