"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QrCode, Sparkles, ArrowRight, CheckCircle2, AlertTriangle, ChevronDown, CreditCard } from "lucide-react";
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

export default function DashboardQRs({ firstName, currentUser, accessibleCards, globalSelectedCardId }: QrsProps) {
  const [suggestedQrs, setSuggestedQrs] = useState<QR[]>([]);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>("");

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchQRs();
    const channel = supabase.channel('qrs_dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => fetchQRs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [firstName]);

  async function fetchQRs() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: qrData } = await supabase.from('qrs').select('*').eq('status', 'active');

    if (qrData) {
      let usable = qrData.filter(q => q.last_used_date !== today);

      usable.sort((a, b) => {
        let scoreA = 0; let scoreB = 0;
        const nameA = a.merchant_name.toLowerCase();
        const nameB = b.merchant_name.toLowerCase();

        if (firstName && nameA.includes(firstName)) scoreA += 10000;
        if (firstName && nameB.includes(firstName)) scoreB += 10000;
        if (a.platform.includes('BharatPe')) scoreA += 1000;
        if (b.platform.includes('BharatPe')) scoreB += 1000;

        const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
        const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;

        if (!a.last_used_date) scoreA -= 100;
        if (!b.last_used_date) scoreB -= 100;

        scoreA += timeA / 100000000000;
        scoreB += timeB / 100000000000;

        return scoreA - scoreB;
      });

      setSuggestedQrs(usable.slice(0, 3)); 
    }
  };

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

  return (
    <section className="pb-8">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Sparkles className="w-4 h-4 text-[#0ea5e9]" />
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]">
          Dynamic Suggestion Engine
        </h2>
      </div>

      <div className="space-y-3">
        {suggestedQrs.length > 0 ? (
          suggestedQrs.map((qr, idx) => {
            const isDanger = firstName && qr.merchant_name.toLowerCase().includes(firstName);
            const isTop = idx === 0 && !isDanger;

            return (
              <motion.div 
                key={qr.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => { 
                    setSelectedQr(qr); 
                    setIsViewModalOpen(true); 
                    setGeneratedAmounts([]); 
                    setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                }}
                className={`relative p-3.5 rounded-[20px] backdrop-blur-lg flex items-center justify-between cursor-pointer transition-all ${
                  isDanger ? "bg-red-500/5 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : 
                  isTop ? "bg-gradient-to-r from-[#0ea5e9]/10 to-transparent border border-[#0ea5e9]/40 shadow-[0_0_20px_rgba(14,165,233,0.15)]" : 
                  "bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center overflow-hidden relative border ${
                    isDanger ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-black/40"
                  }`}>
                    {qr.qr_image_url ? (
                      <Image src={qr.qr_image_url} alt="QR" fill className="object-cover" />
                    ) : (
                      <QrCode className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm font-bold ${isDanger ? "text-red-400" : "text-white"}`}>{qr.merchant_name}</h3>
                      {isTop && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] text-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#0ea5e9]">
                          <Sparkles className="w-2.5 h-2.5" /> Best
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <span className={qr.platform.includes('BharatPe') ? "text-amber-500/80" : "text-slate-400"}>{qr.platform.split('|')[0]}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span className="text-slate-400">{qr.settlement_time || qr.platform.split('|')[1] || 'T+1'}</span>
                    </div>
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </motion.div>
            )
          })
        ) : (
          <div className="text-center py-6 bg-white/[0.02] rounded-[24px] border border-white/10 border-dashed backdrop-blur-sm">
            <p className="text-xs font-bold text-slate-500">All caught up! No active suggestions.</p>
          </div>
        )}
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
              <p className="text-sm text-[#0ea5e9] font-bold">{selectedQr?.upi_id}</p>
            </DialogHeader>

            {firstName && selectedQr?.merchant_name.toLowerCase().includes(firstName) && (
              <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl text-red-400 text-xs font-bold leading-relaxed shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                This QR matches your name. Paying here has high risk of rotation block. Avoid if possible!
              </div>
            )}
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
                    <a key={i} href={`upi://pay?pa=${selectedQr?.upi_id || ''}&pn=${encodeURIComponent(selectedQr?.merchant_name || '')}&am=${amt}&cu=INR`} className="flex items-center justify-between w-full p-4 bg-gradient-to-r from-[#10b981]/15 to-transparent border border-[#10b981]/30 rounded-xl hover:border-[#10b981]/60 transition-all group shadow-[0_0_10px_rgba(16,185,129,0.1)]">
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
    </section>
  );
}