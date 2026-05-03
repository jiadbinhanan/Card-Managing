"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { 
  Plus, 
  QrCode,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Upload,
  Edit3,
  LayoutGrid,
  Timer,
  ArrowRight,
  CreditCard,
  Link as LinkIcon,
  Download
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

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
}

interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
  isBharatPe: boolean;
}

interface QRTabProps {
  accessibleCards: CardData[];
  globalSelectedCardId: string;
  currentUser: Profile | null;
  firstName: string;
  isActive: boolean; // Added for triggering animations on tab switch
}

// Stagger & Card Animations
const containerVars: Variants = {
  hidden: { opacity: 0, display: "none", transition: { duration: 0 } },
  visible: { opacity: 1, display: "block", transition: { staggerChildren: 0.08 } }
};

const itemVars: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function QRTab({ accessibleCards, globalSelectedCardId, currentUser, firstName, isActive }: QRTabProps) {
  const [qrs, setQrs] = useState<QR[]>([]);
  const [recommendedQrs, setRecommendedQrs] = useState<QR[]>([]);
  const [dynamicQrs, setDynamicQrs] = useState<QR[]>([]);
  const [staticQrs, setStaticQrs] = useState<QR[]>([]);

  const [activeCooldowns, setActiveCooldowns] = useState<ActiveCooldown[]>([]);
  const [now, setNow] = useState(Date.now());

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QR | null>(null);
  const [isAddingStatic, setIsAddingStatic] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);

  const [newQrName, setNewQrName] = useState("");
  const [newUpiId, setNewUpiId] = useState("");
  const [newPlatform, setNewPlatform] = useState("PhonePe");
  const [newSettlementTime, setNewSettlementTime] = useState("T+1");
  const [newBaseLink, setNewBaseLink] = useState(""); 
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [paymentMode, setPaymentMode] = useState<"once" | "multiple">("once");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>("");

  useEffect(() => {
    fetchQRs();
    const channel = supabase.channel('qrs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => fetchQRs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchQRs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [firstName, currentUser]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchQRs = async () => {
    if (!currentUser) return;

    const { data: qrData } = await supabase.from('qrs').select('*');
    if (!qrData) return;

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

            let expiresAt = txTime + (24 * 60 * 60 * 1000); 

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
    setQrs(qrData as QR[]);
    categorizeQRs(qrData as QR[], cooldownList);
  };

  const categorizeQRs = (qrData: QR[], cooldownList: ActiveCooldown[]) => {
    const statics = qrData.filter(q => q.status === 'static');
    setStaticQrs(statics);

    const operational = qrData.filter(q => q.status !== 'static');

    const activeOperational = operational.filter(q => {
        if (q.status !== 'active') return false;

        const nameLower = q.merchant_name.toLowerCase();
        const firstWord = nameLower.split(/\s+/)[0];

        if (firstName && firstWord === firstName.toLowerCase()) return false;

        const isBharatPe = nameLower.includes('bharatpe') || q.platform.toLowerCase().includes('bharatpe');
        if (isBharatPe && q.last_used_date) {
            const daysSinceUsed = (Date.now() - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUsed < 5) return false;
        }

        if (cooldownList.some(c => c.qrId === q.id)) return false;

        return true;
    });

    activeOperational.sort((a, b) => {
        const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
        const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
        return timeA - timeB; 
    });

    const dynamicSorted = [...operational].sort((a, b) => {
        const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
        const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
        return timeA - timeB;
    });

    const recommended = activeOperational.slice(0, 4);
    setRecommendedQrs(recommended);
    setDynamicQrs(dynamicSorted);
  };

  const openAddQrModal = (isStatic = false) => {
    setEditingQr(null);
    setNewQrName("");
    setNewUpiId("");
    setNewPlatform("PhonePe");
    setNewSettlementTime("T+1");
    setNewBaseLink("");
    setFile(null);
    setIsAddingStatic(isStatic);
    setIsQrModalOpen(true);
  };

  const openEditQrModal = (qr: QR) => {
    setEditingQr(qr);
    setNewQrName(qr.merchant_name);
    setNewUpiId(qr.upi_id);
    setNewPlatform(qr.platform);
    setNewSettlementTime(qr.settlement_time || "T+1");
    setNewBaseLink(qr.base_payment_link || "");
    setIsAddingStatic(qr.status === 'static');
    setFile(null);
    setIsQrModalOpen(true);
  };

  const toggleQrStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'on_hold' : 'active';
    await supabase.from('qrs').update({ status: newStatus }).eq('id', id);
  };

  const handleSaveQR = async () => {
    if (!newQrName || (!newUpiId && !isAddingStatic)) {
      alert("Name and UPI ID are required.");
      return;
    }

    setUploading(true);
    try {
      let publicUrl = editingQr?.qr_image_url || "";

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${newQrName.replace(/\s+/g, '-')}-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('qr-vault').upload(`qrs/${fileName}`, file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('qr-vault').getPublicUrl(`qrs/${fileName}`);
        publicUrl = data.publicUrl;
      }

      const payload = {
        merchant_name: newQrName,
        upi_id: isAddingStatic ? `static_${Date.now()}` : newUpiId,
        platform: isAddingStatic ? "Static" : newPlatform,
        settlement_time: isAddingStatic ? "N/A" : newSettlementTime,
        qr_image_url: publicUrl,
        base_payment_link: newBaseLink || null, 
        status: isAddingStatic ? 'static' : (editingQr ? editingQr.status : 'active')
      };

      if (editingQr) {
        await supabase.from('qrs').update(payload).eq('id', editingQr.id);
      } else {
        await supabase.from('qrs').insert(payload);
      }
      setIsQrModalOpen(false);
      fetchQRs();
    } catch (error: any) {
      alert("Error saving QR: " + error.message);
    } finally {
      setUploading(false);
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

  const getPaymentLink = (qr: QR | null, amt: number) => {
     if (!qr) return "#";
     if (qr.base_payment_link) {
         const separator = qr.base_payment_link.includes('?') ? '&' : '?';
         return `${qr.base_payment_link}${separator}am=${amt}`;
     }
     return `upi://pay?pa=${qr.upi_id || ''}&pn=${encodeURIComponent(qr.merchant_name || '')}&am=${amt}&cu=INR`;
  };

  const markQrAsUsedToday = async () => {
    if (!selectedQr || !selectedPaymentCardId || !currentUser) {
        alert("Please select a card for the payment first!");
        return;
    }

    const nowISO = new Date().toISOString(); 
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const totalAmt = generatedAmounts.length > 0 ? generatedAmounts.reduce((a, b) => a + b, 0) : 1900;

    try {
        const { error: txInsertError } = await supabase.from('card_transactions').insert({
            card_id: selectedPaymentCardId,
            qr_id: selectedQr.id,
            amount: totalAmt,
            transaction_date: todayStr,
            type: 'withdrawal',
            status: 'pending_settlement',
            recorded_by: currentUser.id,
            remarks: 'Qr rotation withdraw'
        });
        if (txInsertError) throw txInsertError;

        const { error: qrUpdateError } = await supabase.from('qrs').update({ last_used_date: nowISO }).eq('id', selectedQr.id);
        if (qrUpdateError) throw qrUpdateError;

        setIsViewModalOpen(false);
        fetchQRs();
        window.dispatchEvent(new CustomEvent('switch-tab-to-pending'));
    } catch (error: any) {
        alert("Failed to record transaction: " + error.message);
    }
  };

  const downloadQrImage = async () => {
    if (!selectedQr?.qr_image_url) return;
    try {
      const response = await fetch(selectedQr.qr_image_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedQr.merchant_name.replace(/\s+/g, '_')}_QR.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed. Try again.");
    }
  };

  const getFormattedDate = (isoString: string | null) => {
    if (!isoString) return 'Not Used';
    return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const currentCooldowns = activeCooldowns.filter(c => c.expiresAt > now);

  return (
    <motion.div 
      variants={containerVars}
      initial="hidden"
      animate={isActive ? "visible" : "hidden"}
      className="space-y-6 pb-6"
    >
      {/* ================= 24H / MULTIPLE COOLING COUNTDOWN TIMERS ================= */}
      <motion.div variants={itemVars} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-inner relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#0ea5e9]/10 rounded-full blur-[40px] pointer-events-none" />
        <div className="flex items-center gap-3 mb-1">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${currentCooldowns.length > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
            <Timer className={`w-5 h-5 ${currentCooldowns.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              {currentCooldowns.length > 0 ? "Cooling Period Active" : "Ready for Rotation"}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1">
              {currentCooldowns.length > 0 ? "Personal timers for recently used QRs." : "24 hours cooling period is over. You can use a new QR now."}
            </p>
          </div>
        </div>

        {currentCooldowns.length > 0 && (
           <div className="space-y-2 mt-4 pt-3 border-t border-white/5 relative z-10">
              {currentCooldowns.map((c) => {
                 const timeLeft = Math.max(0, c.expiresAt - now);
                 const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
                 const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
                 const seconds = Math.floor((timeLeft / 1000) % 60);

                 const timeString = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;

                 return (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={c.qrId} className="flex justify-between items-center bg-black/40 p-2.5 rounded-xl border border-white/5 shadow-inner">
                       <span className="text-xs font-bold text-slate-200">{c.merchantName}</span>
                       <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{timeString} remaining</span>
                    </motion.div>
                 );
              })}
           </div>
        )}
      </motion.div>

      {/* ================= SECTION 1: RECOMMENDED TODAY ================= */}
      {recommendedQrs.length > 0 && (
        <section>
          <motion.h2 variants={itemVars} className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#34d399] uppercase tracking-wider flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#10b981]" /> Recommended
          </motion.h2>
          <div className="grid grid-cols-2 gap-3">
            {recommendedQrs.map((qr) => (
                <motion.div 
                    key={`rec-${qr.id}`} 
                    variants={itemVars}
                    onClick={() => { 
                      setSelectedQr(qr); setIsViewModalOpen(true); setGeneratedAmounts([]);
                      setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-col bg-gradient-to-br from-white/[0.05] to-transparent border border-[#10b981]/40 rounded-2xl overflow-hidden cursor-pointer shadow-inner backdrop-blur-md transition-all"
                >
                    <div className="h-24 w-full relative bg-black/40 flex flex-col items-center justify-center overflow-hidden">
                      {qr.qr_image_url ? (
                          <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover opacity-80" />
                      ) : (
                          <QrCode className="w-8 h-8 text-slate-600" />
                      )}
                      <span className="absolute top-1 right-1 text-[8px] font-black uppercase bg-[#10b981] text-black px-1.5 py-0.5 rounded shadow-sm">Best Pick</span>
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between border-t border-white/5 relative">
                      <h3 className="text-xs font-bold text-white truncate">{qr.merchant_name}</h3>
                      <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">{qr.platform} • {qr.settlement_time}</p>
                      <p className="text-[8px] font-bold text-emerald-500/80 mt-1.5 bg-emerald-500/10 inline-block px-1.5 py-0.5 rounded w-fit">Last Paid: {getFormattedDate(qr.last_used_date)}</p>
                    </div>
                </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ================= SECTION 2: DYNAMIC VAULT ================= */}
      <section>
        <motion.div variants={itemVars} className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] uppercase tracking-wider flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#0ea5e9]" /> Dynamic Vault
          </h2>
        </motion.div>
        <div className="space-y-3">
          {dynamicQrs.map((qr) => {
            const firstWord = qr.merchant_name.toLowerCase().split(/\s+/)[0];
            const isDanger = firstName && firstWord === firstName.toLowerCase();

            return (
              <motion.div 
                key={qr.id}
                variants={itemVars}
                onClick={() => { 
                  setSelectedQr(qr); setIsViewModalOpen(true); setGeneratedAmounts([]);
                  setSelectedPaymentCardId(globalSelectedCardId !== 'all' ? globalSelectedCardId : (accessibleCards[0]?.id || ""));
                }}
                className={`relative p-3 rounded-[20px] backdrop-blur-lg flex items-center justify-between cursor-pointer transition-all ${
                  isDanger ? "bg-red-500/5 border border-red-500/30" : "bg-white/[0.02] border border-white/5 hover:bg-white/[0.05]"
                } ${qr.status === 'on_hold' ? 'opacity-60 grayscale' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center overflow-hidden border ${isDanger ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-black/40"}`}>
                    {qr.qr_image_url ? (
                      <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover" />
                    ) : (
                      <QrCode className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${isDanger ? "text-red-400" : "text-white"}`}>{qr.merchant_name}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold mt-0.5">
                      <span className="text-slate-400">{qr.platform}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span className="text-[#0ea5e9]">Last: {getFormattedDate(qr.last_used_date)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEditQrModal(qr)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  <Switch checked={qr.status === 'active'} onCheckedChange={() => toggleQrStatus(qr.id, qr.status)} className="scale-75 origin-right data-[state=checked]:bg-[#0ea5e9]" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ================= SECTION 3: STATIC VAULT ================= */}
      <section className="pt-2 border-t border-white/5">
        <motion.div variants={itemVars} className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-slate-400" /> Static Vault
          </h2>
          <Button onClick={() => openAddQrModal(true)} size="sm" className="h-7 px-3 bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 text-[10px] font-bold rounded-lg shadow-inner">
            <Plus className="w-3 h-3 mr-1" /> Add Static
          </Button>
        </motion.div>

        {staticQrs.length === 0 ? (
          <motion.div variants={itemVars} className="text-center py-6 bg-white/[0.02] border border-white/5 rounded-2xl border-dashed">
             <p className="text-xs text-slate-500 font-bold">No static QR saved.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {staticQrs.map((qr) => (
              <motion.div variants={itemVars} whileHover={{ scale: 1.02 }} key={qr.id} onClick={() => { setSelectedQr(qr); setIsViewModalOpen(true); }} className="p-3 bg-white/[0.02] border border-white/10 rounded-[20px] backdrop-blur-md relative group cursor-pointer hover:bg-white/[0.05] transition-all">
                <button onClick={(e) => { e.stopPropagation(); openEditQrModal(qr); }} className="absolute top-2 right-2 p-2 bg-black/60 rounded-xl border border-white/10 z-10 hover:bg-white/20">
                  <Edit3 className="w-3.5 h-3.5 text-white" />
                </button>
                <div className="w-full aspect-square rounded-[12px] overflow-hidden bg-black/40 mb-2 relative border border-white/5 shadow-inner">
                  {qr.qr_image_url ? (
                    <img src={qr.qr_image_url} alt="QR" className="w-full h-full object-cover" />
                  ) : (
                    <QrCode className="w-6 h-6 text-slate-600 absolute inset-0 m-auto" />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-200 truncate">{qr.merchant_name}</h3>
                <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase bg-white/5 inline-block px-1.5 py-0.5 rounded">Static QR</p>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ================= FLOATING ACTION BUTTON ================= */}
      <motion.button
        variants={itemVars}
        onClick={() => openAddQrModal(false)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#10b981] to-[#0ea5e9] flex items-center justify-center shadow-[0_10px_40px_rgba(16,185,129,0.6)] border border-white/20 z-40"
      >
        <Plus className="w-7 h-7 text-white" />
      </motion.button>

      {/* ================= ADD/EDIT QR MODAL ================= */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="mb-4 relative z-10">
            <DialogTitle className="text-xl font-space font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">
              {editingQr ? "Edit QR Details" : (isAddingStatic ? "Add Static QR" : "Add Dynamic QR")}
            </DialogTitle>
            <DialogDescription className="hidden">QR Form</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 relative z-10">
             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Merchant Name</label>
                <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 focus-within:border-[#0ea5e9]">
                   <input type="text" value={newQrName} onChange={(e) => setNewQrName(e.target.value)} placeholder="e.g. JioMart Kiosk" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                </div>
             </div>

             {!isAddingStatic && (
               <>
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex justify-between">
                       <span>UPI ID</span>
                    </label>
                    <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 focus-within:border-[#0ea5e9]">
                       <input type="text" value={newUpiId} onChange={(e) => setNewUpiId(e.target.value)} placeholder="merchant@upi" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                    </div>
                 </div>

                 {/* Custom Payment Link Field */}
                 <div className="space-y-1.5 bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/20">
                    <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                       <LinkIcon className="w-3.5 h-3.5" /> Actual QR Link (Optional)
                    </label>
                    <p className="text-[9px] text-indigo-400/70 ml-1 mb-2">Paste original Paytm/Gpay link if normal UPI fails.</p>
                    <div className="relative flex items-center bg-black/40 border border-white/5 rounded-xl h-12 px-4 focus-within:border-indigo-500">
                       <input type="text" value={newBaseLink} onChange={(e) => setNewBaseLink(e.target.value)} placeholder="upi://pay?pa=..." className="bg-transparent border-none outline-none w-full text-xs font-medium text-white placeholder-slate-600" />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Platform</label>
                       <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none">
                          <option value="PhonePe" className="bg-black">PhonePe</option>
                          <option value="BharatPe" className="bg-black">BharatPe</option>
                          <option value="Paytm" className="bg-black">Paytm</option>
                          <option value="Google Pay" className="bg-black">Google Pay</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">Settlement</label>
                       <select value={newSettlementTime} onChange={(e) => setNewSettlementTime(e.target.value)} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#0ea5e9] appearance-none">
                          <option value="Instant" className="bg-black">Instant</option>
                          <option value="T+1" className="bg-black">T+1 Day</option>
                          <option value="T+2" className="bg-black">T+2 Days</option>
                       </select>
                    </div>
                 </div>
               </>
             )}

             <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Upload QR Photo</label>
                <div className="relative flex items-center bg-white/[0.02] border border-white/10 border-dashed rounded-2xl h-14 px-4 overflow-hidden hover:bg-white/[0.05] transition-colors cursor-pointer">
                  <Upload className="w-4 h-4 text-[#0ea5e9] mr-3" />
                  <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  <span className="text-xs font-bold text-slate-300 truncate">{file ? file.name : (editingQr?.qr_image_url ? "Change existing image..." : "Tap to select photo...")}</span>
                </div>
             </div>

             <Button onClick={handleSaveQR} disabled={uploading} className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(14,165,233,0.4)] border-0 mt-4">
               {uploading ? "Saving..." : "Save Details"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= VIEW / PAYMENT MODAL ================= */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] max-w-sm w-[92vw] p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <div className="p-5 pb-3 relative border-b border-white/5">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0ea5e9]/15 rounded-full blur-[50px] pointer-events-none" />
            <DialogHeader className="mb-2">
              <DialogTitle className="text-xl font-space font-black text-white leading-tight">
                {selectedQr?.merchant_name}
              </DialogTitle>
              <DialogDescription className="hidden">QR View</DialogDescription>
              {selectedQr?.status !== 'static' && <p className="text-[10px] text-[#0ea5e9] font-bold mt-1 truncate">{selectedQr?.upi_id}</p>}
            </DialogHeader>
          </div>

          <div className="p-5 max-h-[60vh] overflow-y-auto space-y-5 custom-scrollbar">
            <div className="flex flex-col items-center gap-2">
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-44 h-44 mx-auto bg-white rounded-[24px] p-2 shadow-[0_0_50px_rgba(255,255,255,0.15)] relative overflow-hidden border-4 border-white/10">
                {selectedQr?.qr_image_url ? (
                  <img src={selectedQr.qr_image_url} alt="QR" className="w-full h-full object-cover rounded-[16px]" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-slate-100 rounded-[16px] flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-slate-300" />
                  </div>
                )}
              </motion.div>
              {selectedQr?.qr_image_url && (
                <button
                  onClick={downloadQrImage}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download QR
                </button>
              )}
            </div>

            {selectedQr?.status !== 'static' && (
              <div className="space-y-4 bg-white/[0.02] p-4 rounded-[20px] border border-white/5 shadow-inner">
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
                  <span className="text-xs font-bold text-slate-300">Payment Strategy</span>
                  <div className="flex bg-black/60 p-1 rounded-lg border border-white/5">
                    <button onClick={() => { setPaymentMode("once"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "once" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Once</button>
                    <button onClick={() => { setPaymentMode("multiple"); setGeneratedAmounts([]); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${paymentMode === "multiple" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Multiple</button>
                  </div>
                </div>

                {paymentMode === "multiple" && (
                  <div className="flex items-center justify-between py-1 border-t border-white/5">
                    <span className="text-[10px] font-bold text-slate-400">Number of swipes:</span>
                    <div className="relative">
                      <select value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))} className="appearance-none bg-white/5 border border-white/10 text-white text-[10px] font-bold py-1.5 pl-2 pr-6 rounded-lg outline-none">
                        <option value={2} className="bg-[#050505]">2 Times</option>
                        <option value={3} className="bg-[#050505]">3 Times</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                <Button onClick={generatePaymentAmounts} className="w-full h-10 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-black transition-all font-black text-xs mt-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Links
                </Button>

                {generatedAmounts.length > 0 && (
                  <div className="pt-3 space-y-2 border-t border-white/10">
                    {generatedAmounts.map((amt, i) => (
                      <motion.a 
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                        key={i} 
                        href={getPaymentLink(selectedQr, amt)} 
                        className="flex items-center justify-between w-full p-3 bg-gradient-to-r from-[#10b981]/15 to-transparent border border-[#10b981]/30 rounded-xl hover:border-[#10b981]/60 transition-all group"
                      >
                        <span className="text-xs font-black text-emerald-400 group-hover:text-emerald-300">Pay ₹{amt}</span>
                        <ArrowRight className="w-4 h-4 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                      </motion.a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-black/60 border-t border-white/5 rounded-b-[40px] backdrop-blur-xl">
             {selectedQr?.status !== 'static' ? (
                <Button onClick={markQrAsUsedToday} className="w-full h-12 rounded-2xl bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981] hover:text-black transition-all font-bold border border-[#10b981]/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Used & Save Transaction
                </Button>
             ) : (
                <Button onClick={() => setIsViewModalOpen(false)} className="w-full h-12 rounded-2xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all font-bold border border-white/10">
                  Close
                </Button>
             )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}