"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { 
  Plus, 
  QrCode,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  ArrowRight,
  CreditCard,
  Link as LinkIcon
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppAlert } from "@/lib/whatsapp";

interface QR {
  id: string;
  merchant_name: string;
  platform: string;
  status: string; 
  qr_image_url: string;
  upi_id: string;
  settlement_time: string;
  last_used_date: string | null;
  base_payment_link?: string | null; 
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
}

interface Profile {
  id: string;
  name: string;
  phone?: string;
}

interface QRTabProps {
  accessibleCards: CardData[];
  globalSelectedCardId: string;
  currentUser: Profile | null;
  firstName: string;
  isActive: boolean;
  allProfiles: Profile[];
  cardAvailableMap: Record<string, number>;
}

const containerVars: Variants = {
  hidden: { opacity: 0, display: "none", transition: { duration: 0 } },
  visible: { opacity: 1, display: "block", transition: { staggerChildren: 0.08 } }
};

const itemVars: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function QRTab({ accessibleCards, globalSelectedCardId, currentUser, firstName, isActive, allProfiles, cardAvailableMap }: QRTabProps) {
  const [qrs, setQrs] = useState<QR[]>([]);
  const [recommendedQrs, setRecommendedQrs] = useState<QR[]>([]);
  const [dynamicQrs, setDynamicQrs] = useState<QR[]>([]);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);

  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>("");

  useEffect(() => {
    fetchQRs();
  }, [firstName, currentUser]);

  const fetchQRs = async () => {
    if (!currentUser) return;
    const { data: qrData } = await supabase.from('qrs').select('*');
    if (!qrData) return;

    setQrs(qrData as QR[]);
    const operational = qrData.filter(q => q.status !== 'static');
    setRecommendedQrs(operational.slice(0, 4) as QR[]);
    setDynamicQrs(operational as QR[]);
  };

  const sanitizeText = (str: any) => {
    if (!str) return "-";
    return String(str).replace(/[\u202F\u00A0]/g, ' ').replace(/[\r\n\t]+/g, ' ').trim() || "-";                  
  };

  const generatePaymentAmounts = () => {
    if (paymentMode === "once") {
      setGeneratedAmounts([Math.floor(Math.random() * 100 + 1900)]);
    } else {
      if (splitCount === 2) {
        const targetTotal = Math.floor(Math.random() * 100 + 1900);
        const first = Math.floor(Math.random() * (targetTotal - 1000) + 500); 
        const second = targetTotal - first;
        setGeneratedAmounts([first, second]);
      } else {
         setGeneratedAmounts(Array.from({ length: splitCount }, () => Math.floor(Math.random() * 199 + 1800)));
      }
    }
  };

  // ==========================================
  // TEST MODE: MARK USED & ALERT
  // ==========================================
  const markQrAsUsedToday = async () => {
    if (!selectedQr || !selectedPaymentCardId || !currentUser) {
        alert("Please select a card for the payment first!");
        return;
    }

    try {
        const totalAmt = generatedAmounts.length > 0 ? generatedAmounts.reduce((a, b) => a + b, 0) : 1900;
        const paymentCard = accessibleCards.find(c => c.id === selectedPaymentCardId);

        const nowTime = new Date();
        const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

        const currentBal = (cardAvailableMap[selectedPaymentCardId] || 0) - totalAmt;

        // Broadcast alert
        for (const profile of allProfiles) {
           const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');
           if (cleanPhone.length >= 10) {
              const rawVars = {
                greeting_user: profile.name,
                entry_user: currentUser.name,
                time: timeStr,
                mode: "QR",
                provider: selectedQr.merchant_name,
                amount: String(totalAmt),
                card_name: paymentCard?.card_name || 'Card',
                last_4: paymentCard?.last_4_digits || '0000',
                current_balance: String(currentBal)
              };

              const safeVars: Record<string, string> = {};
              for (const [k, v] of Object.entries(rawVars)) { safeVars[k] = sanitizeText(v); }

              console.log(`Sending rotation_withdraw_alert to ${profile.name}`, safeVars);
              await sendWhatsAppAlert(cleanPhone, "rotation_withdraw_alert", safeVars);
           }
        }

        alert("✅ [TEST MODE] QR Rotation Alert Sent!\nRedirecting to Transit Tab...");

        // This instantly triggers the switch to pending tab in parent
        setIsViewModalOpen(false);
        window.dispatchEvent(new CustomEvent('switch-tab-to-pending'));

    } catch (error: any) {
        alert("Test Failed: " + error.message);
    }
  };

  return (
    <motion.div variants={containerVars} initial="hidden" animate={isActive ? "visible" : "hidden"} className="space-y-6 pb-6">

      {/* Recommended Vault logic simplified for UI */}
      {recommendedQrs.length > 0 && (
        <section>
          <motion.h2 variants={itemVars} className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#34d399] uppercase tracking-wider flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#10b981]" /> Recommended
          </motion.h2>
          <div className="grid grid-cols-2 gap-3">
            {recommendedQrs.map((qr) => (
                <motion.div 
                    key={`rec-${qr.id}`} variants={itemVars}
                    onClick={() => { setSelectedQr(qr); setIsViewModalOpen(true); setGeneratedAmounts([]); setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || "")); }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex flex-col bg-gradient-to-br from-white/[0.05] to-transparent border border-[#10b981]/40 rounded-2xl overflow-hidden cursor-pointer shadow-inner backdrop-blur-md transition-all"
                >
                    <div className="p-3 flex-1 flex flex-col justify-between border-t border-white/5 relative">
                      <h3 className="text-xs font-bold text-white truncate">{qr.merchant_name}</h3>
                      <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">{qr.platform} • {qr.settlement_time}</p>
                    </div>
                </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-5 pb-3 relative border-b border-white/5">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0ea5e9]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader className="mb-2">
              <DialogTitle className="text-xl font-space font-black text-white leading-tight">
                {selectedQr?.merchant_name}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-5 max-h-[60vh] overflow-y-auto space-y-5 custom-scrollbar">
            <div className="space-y-4 bg-white/[0.02] p-4 rounded-[20px] border border-white/5 shadow-inner">
                <div className="space-y-1.5 pb-3 border-b border-white/5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5"><CreditCard className="w-3 h-3"/> Paying From Card</label>
                   <div className="relative">
                      <select value={selectedPaymentCardId} onChange={(e) => setSelectedPaymentCardId(e.target.value)} className="w-full h-10 bg-white/[0.05] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none appearance-none focus:border-[#0ea5e9]">
                         {accessibleCards.map(c => <option key={c.id} value={c.id} className="bg-[#050505]">{c.card_name} (**{c.last_4_digits})</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                   </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300">Payment Strategy</span>
                  <div className="flex bg-black/60 p-1 rounded-lg border border-white/5">
                    <button onClick={() => { setPaymentMode("once"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "once" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Once</button>
                    <button onClick={() => { setPaymentMode("multiple"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "multiple" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Multiple</button>
                  </div>
                </div>

                <Button onClick={generatePaymentAmounts} className="w-full h-10 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-black transition-all font-black text-xs mt-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Amount
                </Button>

                {generatedAmounts.length > 0 && (
                  <div className="pt-3 space-y-3 border-t border-white/10">
                    <div className="space-y-2">
                      {generatedAmounts.map((amt, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between w-full p-3 bg-gradient-to-r from-[#0ea5e9]/10 to-transparent border border-[#0ea5e9]/20 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{generatedAmounts.length > 1 ? `Swipe ${i + 1}` : "Amount"}</span>
                          <span className="text-lg font-black text-white tracking-tight">₹{amt.toLocaleString('en-IN')}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          </div>

          <div className="p-4 bg-black/60 border-t border-white/5 rounded-b-[40px] backdrop-blur-xl">
            <Button onClick={markQrAsUsedToday} className="w-full h-12 rounded-2xl bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981] hover:text-black transition-all font-bold border border-[#10b981]/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Simulate Alert & Redirect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}