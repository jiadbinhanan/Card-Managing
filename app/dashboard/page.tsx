"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bell, CreditCard, QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface QR {
  id: string;
  merchant_name: string;
  platform: string;
  qr_image_url: string;
  last_used_date: string;
  is_recommended: boolean;
  status: string;
}

export default function Dashboard() {
  const [qrs, setQrs] = useState<QR[]>([]);
  const [selectedQr, setSelectedQr] = useState<QR | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchQRs = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch unused QRs (last_used_date is not today or is null)
    const { data, error } = await supabase
      .from('qrs')
      .select('*')
      .eq('status', 'active')
      .or(`last_used_date.neq.${today},last_used_date.is.null`);

    if (error || !data || data.length === 0) {
      console.error("Error fetching QRs or no data:", error);
      // Fallback to mock data if Supabase is not configured or empty
      setQrs([
        { id: '1', merchant_name: "Starbucks", platform: "GPay • Merchant Account", qr_image_url: "https://picsum.photos/seed/qr1/300/300", last_used_date: "", is_recommended: true, status: 'active' },
        { id: '2', merchant_name: "Uber Rides", platform: "PhonePe • Travel", qr_image_url: "https://picsum.photos/seed/qr2/300/300", last_used_date: "", is_recommended: false, status: 'active' }
      ]);
      return;
    }

    if (data) {
      // Since we fetched unused QRs, they are all recommended for today
      const processedData = data.map(qr => ({
        ...qr,
        is_recommended: true
      }));
      
      // Shuffle
      const shuffled = processedData.sort(() => 0.5 - Math.random());
      
      // Take top 3
      const suggested = shuffled.slice(0, 3);
      setQrs(suggested);
    }
  };

  useEffect(() => {
    fetchQRs();

    const channel = supabase.channel('qrs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qrs' },
        (payload) => {
          console.log('Change received!', payload);
          fetchQRs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkAsUsed = async () => {
    if (!selectedQr) return;
    
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
    const { error } = await supabase
      .from('qrs')
      .update({ last_used_date: today })
      .eq('id', selectedQr.id);

    if (error) {
      console.error("Error updating QR:", error);
      // Optimistic update for mock fallback
      setQrs(prev => prev.filter(q => q.id !== selectedQr.id));
    }
    
    setIsModalOpen(false);
    setSelectedQr(null);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 font-sans pb-28">
      {/* Header Section */}
      <header className="px-6 pt-12 pb-6 flex justify-between items-center sticky top-0 bg-[#09090b]/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Avatar className="h-12 w-12 border border-white/10 cursor-pointer hover:scale-105 transition-transform">
              <AvatarImage src="https://picsum.photos/seed/user/100/100" referrerPolicy="no-referrer" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">
              Hey, Jiad
            </h1>
            <p className="text-[11px] text-slate-400">Welcome back to your wallet.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
            <motion.div 
              animate={{ opacity: [0.4, 1, 0.4] }} 
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" 
            />
            <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">Live Status</span>
          </div>
          <div className="p-2.5 bg-zinc-900/80 rounded-full border border-white/10 backdrop-blur-sm">
            <Bell className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      </header>

      <main className="px-6 space-y-5 max-w-md mx-auto">
        {/* Main Limit Card */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-white/[0.03] to-[#0ea5e9]/5 backdrop-blur-[20px] border-white/10 rounded-[28px] shadow-none">
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-[11px] uppercase text-slate-400 mb-1 tracking-wider">Total Outstanding</h3>
                  <div className="text-[28px] font-extrabold mb-3 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    ₹1,00,000
                  </div>
                  <div className="text-[#0ea5e9] font-semibold text-sm">
                    Available: ₹80,000
                  </div>
                </div>
                
                {/* Radial Progress */}
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle 
                      cx="50" cy="50" r="36" 
                      stroke="rgba(255,255,255,0.05)" 
                      strokeWidth="8" 
                      fill="transparent" 
                    />
                    <motion.circle 
                      initial={{ strokeDashoffset: 226.08 }} // 2 * pi * 36 = 226.08
                      animate={{ strokeDashoffset: 226.08 - (226.08 * 0.55) }} // 55% used
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      cx="50" cy="50" r="36" 
                      stroke="#0ea5e9" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray="226.08"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_4px_#0ea5e9]"
                    />
                  </svg>
                  <div className="absolute text-xs font-bold text-white">55%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Stats Grid */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          {/* Countdown Timer */}
          <div className="col-span-2 flex items-center justify-between bg-gradient-to-r from-[#a855f7]/10 to-transparent border border-white/10 rounded-[20px] p-4 bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <CreditCard className="w-5 h-5 text-[#a855f7]" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase mb-1">Next Bill Payment</div>
                <div className="text-base font-semibold text-slate-50">
                  26th April <span className="text-slate-400 font-normal mx-1">•</span> <span className="text-[#a855f7] font-bold">11 Days left</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cash on Hand */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-[20px] p-4">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Cash: User A</div>
            <div className="text-base font-semibold text-slate-50">₹12,500</div>
          </div>
          <div className="bg-zinc-900/80 border border-white/10 rounded-[20px] p-4">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Cash: User B</div>
            <div className="text-base font-semibold text-slate-50">₹8,200</div>
          </div>
        </motion.section>

        {/* Smart QR Suggestion */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="text-sm font-semibold text-slate-400 mb-3">
            Suggested Today
          </div>
          <div className="flex flex-col gap-3">
            {qrs.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm bg-white/[0.02] rounded-[20px] border border-white/5">
                No QRs available for today.
              </div>
            ) : (
              qrs.map((merchant) => (
                <motion.div
                  key={merchant.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    setSelectedQr(merchant);
                    setIsModalOpen(true);
                  }}
                  className="cursor-pointer"
                >
                  <div className={`flex items-center gap-4 bg-white/[0.02] border rounded-[20px] p-3.5 transition-colors duration-300 ${merchant.is_recommended ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-white/10'}`}>
                    <div className="w-11 h-11 bg-zinc-900 rounded-xl flex items-center justify-center text-[#0ea5e9]">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-50 mb-0.5">{merchant.merchant_name}</div>
                      <div className="text-[11px] text-slate-400">{merchant.platform}</div>
                    </div>
                    {merchant.is_recommended && (
                      <div className="text-[10px] bg-[#0ea5e9]/10 text-[#0ea5e9] px-2 py-0.5 rounded-md font-semibold border border-[#0ea5e9]/20">
                        Recommended
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.section>
      </main>

      {/* QR Code Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 text-slate-50 rounded-[32px] max-w-sm w-[90vw] p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-space font-bold text-center bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {selectedQr?.merchant_name}
            </DialogTitle>
            <DialogDescription className="hidden">
              View and mark QR code as used for today.
            </DialogDescription>
            <p className="text-center text-xs text-slate-400">{selectedQr?.platform}</p>
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
            
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
              <Button 
                onClick={handleMarkAsUsed}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-bold text-base shadow-[0_0_20px_rgba(14,165,233,0.4)] transition-all border-0"
              >
                Mark as Used
              </Button>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
