"use client";

import { useState } from "react";
import { motion, Variants } from "motion/react";
import { 
  Bell, 
  CreditCard, 
  Edit3, 
  LogOut, 
  Moon, 
  Phone, 
  User,
  Settings as SettingsIcon
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";

export default function SettingsPage() {
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
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
            Settings & Profile
          </h1>
          <div className="p-2.5 bg-zinc-900/80 rounded-full border border-white/10 backdrop-blur-sm">
            <SettingsIcon className="w-5 h-5 text-slate-300" />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 pt-6 max-w-md mx-auto space-y-8">
        
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Card Management Section */}
          <motion.section variants={itemVariants} className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#0ea5e9]" /> Card Management
            </h2>

            {/* Primary Card */}
            <div className="relative p-5 rounded-[24px] overflow-hidden border border-[#0ea5e9]/30 bg-white/[0.02] backdrop-blur-xl shadow-[0_0_20px_rgba(14,165,233,0.1)]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0ea5e9]/10 to-transparent z-0" />
              <div className="relative z-10 flex justify-between items-start mb-6">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0ea5e9] mb-1">Primary Card</div>
                  <h3 className="text-lg font-semibold text-white">SBI BPCL Rupay</h3>
                </div>
                <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center border border-white/20">
                  <div className="w-4 h-4 rounded-full bg-red-500/80 mix-blend-screen -mr-1" />
                  <div className="w-4 h-4 rounded-full bg-yellow-500/80 mix-blend-screen" />
                </div>
              </div>
              <div className="relative z-10 flex justify-between items-end">
                <div className="text-xl font-space tracking-widest text-slate-300">
                  **** **** **** 1234
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Total Limit</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">₹1,80,000</span>
                    <button className="p-1 bg-white/5 hover:bg-white/10 rounded-md transition-colors">
                      <Edit3 className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub Card */}
            <div className="relative p-5 rounded-[24px] overflow-hidden border border-[#a855f7]/30 bg-white/[0.02] backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.1)]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#a855f7]/10 to-transparent z-0" />
              <div className="relative z-10 flex justify-between items-start mb-6">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#a855f7] mb-1">Sub Card</div>
                  <h3 className="text-lg font-semibold text-white">SBI BPCL (Sub)</h3>
                </div>
                <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center border border-white/20">
                  <div className="w-4 h-4 rounded-full bg-red-500/80 mix-blend-screen -mr-1" />
                  <div className="w-4 h-4 rounded-full bg-yellow-500/80 mix-blend-screen" />
                </div>
              </div>
              <div className="relative z-10 flex justify-between items-end">
                <div className="text-xl font-space tracking-widest text-slate-300">
                  **** **** **** 5678
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Total Limit</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Shared</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Profile Section */}
          <motion.section variants={itemVariants} className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-slate-300" /> Profile
            </h2>
            <div className="bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-sm divide-y divide-white/5">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Name</div>
                    <div className="text-sm font-medium text-slate-200">Arjun Developer</div>
                  </div>
                </div>
                <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                  <Edit3 className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Phone Number</div>
                    <div className="text-sm font-medium text-slate-200">+91 98765 43210</div>
                  </div>
                </div>
                <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                  <Edit3 className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          </motion.section>

          {/* App Preferences */}
          <motion.section variants={itemVariants} className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-slate-300" /> Preferences
            </h2>
            <div className="bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-sm divide-y divide-white/5">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">WhatsApp Alerts</div>
                    <div className="text-[10px] text-slate-500">Via CallMeBot API</div>
                  </div>
                </div>
                <Switch 
                  checked={whatsappAlerts} 
                  onCheckedChange={setWhatsappAlerts}
                  className="data-[state=checked]:bg-[#25D366]"
                />
              </div>
              <div className="p-4 flex items-center justify-between opacity-70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Moon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">Dark Mode</div>
                    <div className="text-[10px] text-slate-500">Always on for premium feel</div>
                  </div>
                </div>
                <Switch checked={true} disabled />
              </div>
            </div>
          </motion.section>

          {/* Auth Actions */}
          <motion.section variants={itemVariants} className="pt-4">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                variant="outline"
                className="w-full h-14 rounded-2xl bg-[#ef4444]/5 hover:bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20 hover:border-[#ef4444]/40 font-bold text-base shadow-[0_0_15px_rgba(239,68,68,0.1)] transition-all"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Logout
              </Button>
            </motion.div>
          </motion.section>

        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
