"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { 
  CheckCircle2, 
  Clock, 
  Plus, 
  QrCode, 
  Sparkles, 
  Store, 
  Wallet,
  Upload,
  Edit3
} from "lucide-react";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
} from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

interface QR {
  id: string;
  merchant_name: string;
  upi_id: string;
  platform: string;
  qr_image_url: string;
  last_used_date: string;
  is_recommended: boolean;
  status: string;
}

// Mock Data for Settlements (since we haven't integrated transactions table yet)
const PENDING_SETTLEMENTS = [
  { id: 1, merchant: "Starbucks Reserve", amount: 2500, time: "Today, 09:41 AM", status: "pending" },
  { id: 2, merchant: "Uber Rides", amount: 850, time: "Today, 11:20 AM", status: "pending" },
];

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState(PENDING_SETTLEMENTS);
  const [qrs, setQrs] = useState<QR[]>([]);
  
  // Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [editingQr, setEditingQr] = useState<QR | null>(null);
  
  // Form States
  const [newQrName, setNewQrName] = useState("");
  const [newQrUpi, setNewQrUpi] = useState("");
  const [newQrPlatform, setNewQrPlatform] = useState("GPay");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchQRs();

    const channel = supabase.channel('qrs_vault_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qrs' },
        (payload) => {
          console.log('QR Change received!', payload);
          fetchQRs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchQRs = async () => {
    const { data, error } = await supabase
      .from('qrs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching QRs:", error);
    } else if (data) {
      // আজকের তারিখ বের করা (IST Timezone অনুযায়ী YYYY-MM-DD ফরম্যাটে)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      
      // ডাইনামিক্যালি Recommended ক্যালকুলেট করা এবং সর্ট করা
      const processedData = data.map(qr => ({
        ...qr,
        is_recommended: qr.status === 'active' && qr.last_used_date !== today
      })).sort((a, b) => {
        // Recommended গুলোকে লিস্টের ওপরে পাঠানো
        if (a.is_recommended && !b.is_recommended) return -1;
        if (!a.is_recommended && b.is_recommended) return 1;
        return 0;
      });

      setQrs(processedData);
    }
  };

  const markAsSettled = (id: number) => {
    setSettlements(prev => prev.filter(s => s.id !== id));
  };

  const toggleQrStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'on_hold' : 'active';
    setQrs(prev => prev.map(qr => qr.id === id ? { ...qr, status: newStatus } : qr));
    
    await supabase
      .from('qrs')
      .update({ status: newStatus })
      .eq('id', id);
  };

  const openAddDrawer = () => {
    setEditingQr(null);
    setNewQrName("");
    setNewQrUpi("");
    setNewQrPlatform("GPay");
    setFile(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (qr: QR) => {
    setEditingQr(qr);
    setNewQrName(qr.merchant_name);
    setNewQrUpi(qr.upi_id);
    setNewQrPlatform(qr.platform || "GPay");
    setFile(null);
    setIsDrawerOpen(true);
  };

  const handleSaveQR = async () => {
    if (!newQrName || !newQrUpi) {
      alert("Merchant Name and UPI ID are required.");
      return;
    }

    setUploading(true);
    try {
      let publicUrl = editingQr?.qr_image_url || "";

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${newQrName.replace(/\s+/g, '-')}-${Math.random()}.${fileExt}`;
        const filePath = `qrs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('qr-vault')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('qr-vault')
          .getPublicUrl(filePath);

        publicUrl = data.publicUrl;
      }

      if (editingQr) {
        const { error } = await supabase.from('qrs').update({
          merchant_name: newQrName,
          upi_id: newQrUpi,
          platform: newQrPlatform,
          qr_image_url: publicUrl,
        }).eq('id', editingQr.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('qrs').insert({
          merchant_name: newQrName,
          upi_id: newQrUpi,
          platform: newQrPlatform,
          qr_image_url: publicUrl,
          status: 'active',
          is_recommended: false
        });
        if (error) throw error;
      }

      setIsDrawerOpen(false);
      fetchQRs(); // Refresh list
    } catch (error: any) {
      console.error("Error saving QR:", error.message);
      alert("Error saving QR: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Animation Variants
  const listVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-slate-50 font-sans pb-28 overflow-x-hidden">
      
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />
        <motion.div
          animate={{
            x: [0, 30, -30, 0],
            y: [0, -40, 40, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-[#0ea5e9] opacity-10 blur-[100px] mix-blend-screen"
        />
        <motion.div
          animate={{
            x: [0, -40, 40, 0],
            y: [0, 30, -30, 0],
            scale: [1, 0.9, 1.2, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-[#a855f7] opacity-10 blur-[120px] mix-blend-screen"
        />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 pt-12 pb-4 sticky top-0 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight font-space bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Settlements
          </h1>
          <div className="p-2.5 bg-zinc-900/80 rounded-full border border-white/10 backdrop-blur-sm">
            <Wallet className="w-5 h-5 text-[#0ea5e9]" />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 pt-6 max-w-md mx-auto space-y-8">
        
        {/* Pending Settlements List (T+1 Tracker) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#a855f7]" /> Pending (T+1)
            </h2>
            <span className="text-xs font-medium bg-[#a855f7]/10 text-[#a855f7] px-2 py-0.5 rounded-md border border-[#a855f7]/20">
              {settlements.length} Items
            </span>
          </div>

          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <AnimatePresence mode="popLayout">
              {settlements.map((item) => (
                <motion.div
                  key={item.id}
                  variants={itemVariants}
                  layout
                  className="p-4 bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-sm flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-50 mb-0.5">{item.merchant}</h3>
                      <p className="text-[11px] text-slate-400">{item.time}</p>
                    </div>
                    <div className="text-base font-bold text-white">
                      ₹{item.amount.toLocaleString('en-IN')}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      <motion.div 
                        animate={{ opacity: [0.4, 1, 0.4] }} 
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                      />
                      <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wider">Waiting</span>
                    </div>
                    
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => markAsSettled(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 hover:bg-[#10b981]/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Settled
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {settlements.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-8 text-slate-500 text-sm bg-white/[0.01] rounded-[24px] border border-white/5"
              >
                All caught up! No pending settlements.
              </motion.div>
            )}
          </motion.div>
        </section>

        {/* QR Vault (Management) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#0ea5e9]" /> QR Vault
            </h2>
            
            {/* Add New QR Button */}
            <motion.button
              onClick={openAddDrawer}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1 text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9] px-2 py-1 rounded-md border border-[#0ea5e9]/20 hover:bg-[#0ea5e9]/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add New
            </motion.button>
          </div>

          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {qrs.map((qr) => (
              <motion.div
                key={qr.id}
                variants={itemVariants}
                onClick={() => { setSelectedQr(qr); setIsViewModalOpen(true); }}
                className={`p-4 bg-white/[0.02] border rounded-[24px] backdrop-blur-sm flex items-center justify-between transition-colors cursor-pointer ${
                  qr.is_recommended ? "border-[#0ea5e9]/30 shadow-[0_0_15px_rgba(14,165,233,0.05)]" : "border-white/5"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border overflow-hidden relative ${
                    qr.status === 'active' 
                      ? "bg-zinc-800 border-white/10 text-white" 
                      : "bg-zinc-900 border-white/5 text-slate-600"
                  }`}>
                    {qr.qr_image_url ? (
                      <Image src={qr.qr_image_url} alt="QR" fill className="object-cover opacity-80" referrerPolicy="no-referrer" />
                    ) : (
                      <QrCode className="w-5 h-5 relative z-10" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className={`text-sm font-semibold ${qr.status === 'active' ? "text-slate-50" : "text-slate-500"}`}>
                        {qr.merchant_name}
                      </h3>
                      {qr.is_recommended && qr.status === 'active' && (
                        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-[#0ea5e9]/10 text-[#0ea5e9] px-1.5 py-0.5 rounded border border-[#0ea5e9]/20">
                          <Sparkles className="w-2.5 h-2.5" /> Rec
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className={qr.status === 'active' ? "text-slate-300" : ""}>{qr.upi_id}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-600" />
                      <span>{qr.last_used_date ? `Used ${qr.last_used_date}` : 'Never used'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => openEditDrawer(qr)}
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <Switch 
                      checked={qr.status === 'active'} 
                      onCheckedChange={() => toggleQrStatus(qr.id, qr.status)}
                      className="data-[state=checked]:bg-[#0ea5e9]"
                    />
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider ${
                    qr.status === 'active' ? "text-[#0ea5e9]" : "text-slate-600"
                  }`}>
                    {qr.status === 'active' ? "Active" : "On Hold"}
                  </span>
                </div>
              </motion.div>
            ))}
            
            {qrs.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm bg-white/[0.01] rounded-[24px] border border-white/5">
                No QRs found in the vault.
              </div>
            )}
          </motion.div>
        </section>

      </main>

      {/* Add/Edit QR Drawer */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/10 text-slate-50 rounded-t-[32px]">
          <div className="max-w-md mx-auto w-full px-6 pb-8 pt-4">
            <DrawerHeader className="px-0 text-left mb-6">
              <DrawerTitle className="text-2xl font-space font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                {editingQr ? "Edit Merchant QR" : "Add Merchant QR"}
              </DrawerTitle>
            </DrawerHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Merchant Name</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                  <Store className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="text" 
                    value={newQrName}
                    onChange={(e) => setNewQrName(e.target.value)}
                    placeholder="e.g. Starbucks" 
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">UPI ID</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3">
                  <QrCode className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="text" 
                    value={newQrUpi}
                    onChange={(e) => setNewQrUpi(e.target.value)}
                    placeholder="merchant@upi" 
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-slate-600 focus:ring-0 p-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">Platform</label>
                <div className="flex p-1 bg-black/40 border border-white/10 rounded-xl h-12">
                  {(["GPay", "PhonePe", "Paytm"] as const).map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setNewQrPlatform(platform)}
                      className={`flex-1 relative text-[10px] font-semibold rounded-lg transition-colors z-10 ${
                        newQrPlatform === platform ? "text-white" : "text-slate-500"
                      }`}
                    >
                      {newQrPlatform === platform && (
                        <motion.div
                          layoutId="qrPlatform"
                          className="absolute inset-0 bg-white/10 rounded-lg"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-20">{platform}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">QR Image</label>
                <div className="relative flex items-center bg-black/40 border border-white/10 rounded-xl h-12 px-3 overflow-hidden">
                  <Upload className="w-4 h-4 text-slate-500 mr-2" />
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="bg-transparent border-none outline-none w-full text-sm text-slate-400 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#0ea5e9]/10 file:text-[#0ea5e9] hover:file:bg-[#0ea5e9]/20"
                  />
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-4">
                <Button 
                  onClick={handleSaveQR}
                  disabled={uploading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-bold text-base shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all border-0 disabled:opacity-50"
                >
                  {uploading ? "Saving..." : "Save QR Code"}
                </Button>
              </motion.div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* View QR Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 text-slate-50 rounded-[32px] max-w-sm w-[90vw] p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-space font-bold text-center bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {selectedQr?.merchant_name}
            </DialogTitle>
            <DialogDescription className="hidden">
              View and mark QR code as used for today.
            </DialogDescription>
            <p className="text-center text-xs text-slate-400">{selectedQr?.upi_id} • {selectedQr?.platform}</p>
          </DialogHeader>
          
          <div className="flex flex-col items-center gap-6">
            <div className="w-48 h-48 bg-white rounded-2xl p-2 shadow-[0_0_30px_rgba(255,255,255,0.1)] relative overflow-hidden">
              {selectedQr?.qr_image_url ? (
                <Image 
                  src={selectedQr.qr_image_url} 
                  alt="QR Code" 
                  fill 
                  className="object-cover rounded-xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-slate-200 rounded-xl flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-slate-400" />
                </div>
              )}
            </div>

            {/* Mark as Used Button */}
            {selectedQr?.is_recommended ? (
              <Button 
                onClick={async () => {
                  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                  const { error } = await supabase
                    .from('qrs')
                    .update({ last_used_date: today })
                    .eq('id', selectedQr.id);
                  
                  if (!error) {
                    setIsViewModalOpen(false);
                  }
                }}
                className="w-full h-12 rounded-xl bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20 hover:bg-[#0ea5e9]/20 transition-all font-bold shadow-[0_0_15px_rgba(14,165,233,0.1)]"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Mark as Used Today
              </Button>
            ) : (
              <div className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-4 py-2 rounded-lg border border-amber-500/20">
                Already used today!
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
