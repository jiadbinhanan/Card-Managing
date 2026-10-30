"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { 
  ArrowRight, 
  ChevronLeft, 
  ChevronDown,
  Lock, 
  Mail, 
  Sparkles, 
  Loader2, 
  KeyRound, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ViewState = "login" | "forgot-email" | "forgot-otp" | "update-password";
type LoginTab = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("login");
  const [activeTab, setActiveTab] = useState<LoginTab>("password");

  // Form States - Default to first user
  const [email, setEmail] = useState("jiadbinhanan@gmail.com");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otp, setOtp] = useState("");

  // Visibility States
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // OTP Login sub-state
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resend countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Animation variants
  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 16, scale: 0.98 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        duration: 0.45, 
        ease: [0.22, 1, 0.36, 1],
        staggerChildren: 0.08
      }
    },
    exit: { 
      opacity: 0, 
      y: -16, 
      scale: 0.98,
      transition: { duration: 0.25 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }
  };

  // ১. পাসওয়ার্ড দিয়ে লগইন
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("ইমেইল ও পাসওয়ার্ড উভয়ই প্রদান করুন।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err.message || "লগইন ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।");
      setIsLoading(false);
    }
  };

  // ২. ওটিপি কোড পাঠানো (Passwordless Login)
  const handleSendOtpLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setError("অনুগ্রহ করে আপনার ইমেইল এড্রেস লিখুন।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (error) {
        setError(error.message);
      } else {
        setOtpSent(true);
        setCountdown(60);
      }
    } catch (err: any) {
      setError(err.message || "লগইন কোড পাঠাতে সমস্যা হয়েছে।");
    } finally {
      setIsLoading(false);
    }
  };

  // ৩. ওটিপি ভেরিফাই করে লগইন
  const handleVerifyOtpLogin = async () => {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 8 && trimmedOtp.length !== 6) {
      setError("অনুগ্রহ করে ৮ ডিজিটের ওটিপি কোডটি লিখুন।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmedOtp,
        type: 'email',
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err.message || "ওটিপি ভেরিফিকেশন ব্যর্থ হয়েছে।");
      setIsLoading(false);
    }
  };

  // ৪. পাসওয়ার্ড রিসেট ওটিপি পাঠানো
  const handleSendResetCode = async () => {
    if (!email.trim()) {
      setError("অনুগ্রহ করে আপনার ইমেইল এড্রেস লিখুন।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (error) {
        setError(error.message);
      } else {
        setView("forgot-otp");
        setCountdown(60);
      }
    } catch (err: any) {
      setError(err.message || "রিসেট কোড পাঠাতে সমস্যা হয়েছে।");
    } finally {
      setIsLoading(false);
    }
  };

  // ৫. পাসওয়ার্ড রিসেট ওটিপি ভেরিফাই করা
  const handleVerifyResetOtp = async () => {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 8 && trimmedOtp.length !== 6) {
      setError("অনুগ্রহ করে ৮ ডিজিটের ওটিপি কোডটি লিখুন।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmedOtp,
        type: 'recovery',
      });

      if (error) {
        setError(error.message);
      } else {
        setView("update-password");
      }
    } catch (err: any) {
      setError(err.message || "ওটিপি ভ্যালিডেশন ব্যর্থ হয়েছে।");
    } finally {
      setIsLoading(false);
    }
  };

  // ৬. নতুন পাসওয়ার্ড সেভ করা
  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err.message || "পাসওয়ার্ড আপডেট করতে সমস্যা হয়েছে।");
      setIsLoading(false);
    }
  };

  const changeView = (newView: ViewState) => {
    setError(null);
    setOtp("");
    setView(newView);
  };

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 overflow-hidden flex items-center justify-center p-5 font-sans selection:bg-[#0ea5e9]/30">

      {/* ── AMBIENT BACKGROUND GLOWS & GRID ── */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)]" />
        <motion.div
          animate={{ x: [0, 30, -30, 0], y: [0, -40, 40, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[75vw] h-[75vw] rounded-full bg-[#0ea5e9] opacity-[0.14] blur-[120px] mix-blend-screen"
        />
        <motion.div
          animate={{ x: [0, -30, 30, 0], y: [0, 35, -35, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[75vw] h-[75vw] rounded-full bg-[#a855f7] opacity-[0.14] blur-[130px] mix-blend-screen"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute top-[40%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-[#10b981] opacity-10 blur-[100px] mix-blend-screen"
        />
      </div>

      {/* ── CARD CONTAINER ── */}
      <div className="relative z-10 w-full max-w-md my-auto">
        <AnimatePresence mode="wait">

          {/* ================= 1. MAIN LOGIN VIEW ================= */}
          {view === "login" && (
            <motion.div
              key="login"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative p-6 sm:p-8 bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 rounded-[32px] sm:rounded-[36px] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* Top Edge Glow Accent */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#0ea5e9] to-transparent opacity-60 blur-[2px]" />

              {/* Brand Header */}
              <motion.div variants={itemVariants} className="text-center mb-6">
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0ea5e9]/20 via-[#030014] to-[#a855f7]/20 border border-white/15 p-2 shadow-[0_0_25px_rgba(14,165,233,0.3)] mb-3">
                  <img src="/icon-512x512.png" alt="Credics" className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-space bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  Credics
                </h1>
                <p className="text-xs text-slate-400 mt-1 font-medium">Credit & Cash Synchronization</p>
              </motion.div>

              {/* Mode Switcher (Pill Tabs) */}
              <motion.div variants={itemVariants} className="flex p-1 bg-black/40 border border-white/10 rounded-2xl mb-6 shadow-inner">
                <button
                  type="button"
                  onClick={() => { setActiveTab("password"); setError(null); }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                    activeTab === "password"
                      ? "bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] text-white shadow-[0_0_18px_rgba(14,165,233,0.35)]"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  পাসওয়ার্ড লগইন
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("otp"); setError(null); }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                    activeTab === "otp"
                      ? "bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] text-white shadow-[0_0_18px_rgba(14,165,233,0.35)]"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  লগইন কোড (OTP)
                </button>
              </motion.div>

              {/* ── TAB 1: PASSWORD LOGIN ── */}
              {activeTab === "password" && (
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  {/* Email Dropdown */}
                  <motion.div variants={itemVariants} className="space-y-1.5">
                    <label htmlFor="login-email-select" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                      ইমেইল আইডি
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                      <select 
                        id="login-email-select"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-10 h-12 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 focus:border-[#0ea5e9] appearance-none font-medium text-sm transition-all cursor-pointer shadow-inner"
                      >
                        <option value="jiadbinhanan@gmail.com" className="bg-[#030014] text-white py-2">
                          jiadbinhanan@gmail.com (Jiad)
                        </option>
                        <option value="iasik7591@gmail.com" className="bg-[#030014] text-white py-2">
                          iasik7591@gmail.com (Asik)
                        </option>
                      </select>
                      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </motion.div>

                  {/* Password with Eye toggle */}
                  <motion.div variants={itemVariants} className="space-y-1.5">
                    <div className="flex justify-between items-center ml-1">
                      <label htmlFor="login-password" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        পাসওয়ার্ড
                      </label>
                      <button 
                        type="button"
                        onClick={() => changeView("forgot-email")}
                        className="text-[11px] font-semibold text-[#0ea5e9] hover:text-[#38bdf8] transition-colors"
                      >
                        পাসওয়ার্ড ভুলে গেছেন?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input 
                        id="login-password"
                        type={showPassword ? "text" : "password"} 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••" 
                        required
                        autoComplete="current-password"
                        className="pl-10 pr-11 h-12 bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-[#0ea5e9]/50 focus-visible:border-[#0ea5e9] rounded-xl transition-all font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -4 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                    >
                      {error}
                    </motion.div>
                  )}

                  <motion.div variants={itemVariants} className="pt-2">
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#a855f7] hover:opacity-95 text-white font-bold text-sm shadow-[0_0_25px_rgba(14,165,233,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            ড্যাশবোর্ডে প্রবেশ করুন
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </motion.div>
                </form>
              )}

              {/* ── TAB 2: EMAIL OTP LOGIN (Instant Code) ── */}
              {activeTab === "otp" && (
                <div className="space-y-4">
                  {!otpSent ? (
                    // Step A: Select Email to Send Code
                    <form onSubmit={handleSendOtpLogin} className="space-y-4">
                      <motion.div variants={itemVariants} className="space-y-1.5">
                        <label htmlFor="otp-email-select" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          আপনার ইমেইল আইডি
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                          <select 
                            id="otp-email-select"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-10 h-12 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 focus:border-[#0ea5e9] appearance-none font-medium text-sm transition-all cursor-pointer shadow-inner"
                          >
                            <option value="jiadbinhanan@gmail.com" className="bg-[#030014] text-white py-2">
                              jiadbinhanan@gmail.com (Jiad)
                            </option>
                            <option value="iasik7591@gmail.com" className="bg-[#030014] text-white py-2">
                              iasik7591@gmail.com (Asik)
                            </option>
                          </select>
                          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        <p className="text-[11px] text-slate-500 ml-1">
                          পাসওয়ার্ডের প্রয়োজন নেই—নির্বাচিত ইমেইলে সরাসরি ৮ ডিজিটের সিকিউর কোড যাবে।
                        </p>
                      </motion.div>

                      {error && (
                        <motion.div 
                          initial={{ opacity: 0, y: -4 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                        >
                          {error}
                        </motion.div>
                      )}

                      <motion.div variants={itemVariants} className="pt-2">
                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                          <Button 
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#a855f7] hover:opacity-95 text-white font-bold text-sm shadow-[0_0_25px_rgba(14,165,233,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                          >
                            {isLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <>
                                ৮ ডিজিটের লগইন কোড পাঠান
                                <Sparkles className="w-4 h-4 ml-2" />
                              </>
                            )}
                          </Button>
                        </motion.div>
                      </motion.div>
                    </form>
                  ) : (
                    // Step B: Enter Received 8-Digit OTP
                    <div className="space-y-5 flex flex-col items-center">
                      <div className="text-center space-y-1">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mb-1">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <p className="text-xs text-slate-300">
                          লগইন কোড পাঠানো হয়েছে: <span className="text-cyan-400 font-semibold">{email}</span>
                        </p>
                        <p className="text-[10px] text-slate-500">
                          (ইনবক্সে না পেলে Spam / Junk ফোল্ডার চেক করুন)
                        </p>
                      </div>

                      <div className="w-full flex justify-center py-2">
                        <InputOTP 
                          maxLength={8} 
                          value={otp}
                          onChange={setOtp}
                          containerClassName="gap-1.5 sm:gap-2 justify-center"
                        >
                          <InputOTPGroup className="gap-1.5 sm:gap-2">
                            {[...Array(8)].map((_, i) => (
                              <InputOTPSlot 
                                key={i} 
                                index={i} 
                                className="w-8.5 sm:w-10 h-12 sm:h-13 bg-black/50 border-white/15 rounded-xl text-base sm:text-lg font-black text-white focus-visible:ring-[#0ea5e9]/50 focus-visible:border-[#0ea5e9] transition-all shadow-inner"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      {error && (
                        <motion.div 
                          initial={{ opacity: 0, y: -4 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                        >
                          {error}
                        </motion.div>
                      )}

                      <div className="w-full space-y-2.5">
                        <Button 
                          onClick={handleVerifyOtpLogin}
                          disabled={isLoading || (otp.length !== 8 && otp.length !== 6)}
                          className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-95 text-white font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                        >
                          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "কোড ভেরিফাই ও লগইন"}
                        </Button>

                        <div className="flex justify-between items-center px-1 text-xs">
                          <button
                            type="button"
                            onClick={() => { setOtpSent(false); setOtp(""); setError(null); }}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            ইমেইল পরিবর্তন
                          </button>

                          <button
                            type="button"
                            disabled={countdown > 0 || isLoading}
                            onClick={() => handleSendOtpLogin()}
                            className="text-[#0ea5e9] hover:text-[#38bdf8] disabled:text-slate-600 transition-colors flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                            {countdown > 0 ? `পুনরায় পাঠান (${countdown}s)` : "কোড পুনরায় পাঠান"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ================= 2. FORGOT PASSWORD - EMAIL VIEW ================= */}
          {view === "forgot-email" && (
            <motion.div
              key="forgot-email"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative p-6 sm:p-8 bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 rounded-[32px] sm:rounded-[36px] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#a855f7] to-transparent opacity-60 blur-[2px]" />

              <motion.div variants={itemVariants} className="mb-6">
                <button 
                  onClick={() => changeView("login")}
                  className="flex items-center text-xs font-semibold text-slate-400 hover:text-white transition-colors mb-4 group"
                >
                  <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" /> 
                  লগইনে ফিরে যান
                </button>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#a855f7]/20 border border-[#a855f7]/30 text-[#a855f7] mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black tracking-tight font-space text-white">পাসওয়ার্ড রিসেট</h2>
                <p className="text-xs text-slate-400 mt-1">
                  আপনার ইমেইল আইডি দিন, আমরা ৬ ডিজিটের ভেরিফিকেশন ওটিপি পাঠাবো।
                </p>
              </motion.div>

              <div className="space-y-4">
                <motion.div variants={itemVariants} className="space-y-1.5">
                  <label htmlFor="forgot-email-select" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                    ইউজার নির্বাচন করুন
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                    <select 
                      id="forgot-email-select"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-10 h-12 bg-black/40 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#a855f7]/50 focus:border-[#a855f7] appearance-none font-medium text-sm transition-all cursor-pointer shadow-inner"
                    >
                      <option value="jiadbinhanan@gmail.com" className="bg-[#030014] text-white py-2">
                        jiadbinhanan@gmail.com (Jiad)
                      </option>
                      <option value="iasik7591@gmail.com" className="bg-[#030014] text-white py-2">
                        iasik7591@gmail.com (Asik)
                      </option>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </motion.div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -4 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.div variants={itemVariants} className="pt-2">
                  <Button 
                    onClick={handleSendResetCode}
                    disabled={isLoading}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#0ea5e9] hover:opacity-95 text-white font-bold text-sm shadow-[0_0_20px_rgba(168,85,247,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "রিসেট কোড পাঠান"}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ================= 3. FORGOT PASSWORD - OTP VIEW ================= */}
          {view === "forgot-otp" && (
            <motion.div
              key="forgot-otp"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative p-6 sm:p-8 bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 rounded-[32px] sm:rounded-[36px] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#a855f7] to-transparent opacity-60 blur-[2px]" />

              <motion.div variants={itemVariants} className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#a855f7]/20 border border-[#a855f7]/30 text-[#a855f7] mb-3">
                  <Mail className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black tracking-tight font-space text-white">কোড লিখুন</h2>
                <p className="text-xs text-slate-400 mt-1">
                  আমরা ৮ ডিজিটের ভেরিফিকেশন কোড পাঠিয়েছি: <br />
                  <span className="text-cyan-400 font-semibold">{email}</span>
                </p>
              </motion.div>

              <div className="space-y-6 flex flex-col items-center">
                <div className="w-full flex justify-center py-2">
                  <InputOTP 
                    maxLength={8} 
                    value={otp}
                    onChange={setOtp}
                    containerClassName="gap-1.5 sm:gap-2 justify-center"
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      {[...Array(8)].map((_, i) => (
                        <InputOTPSlot 
                          key={i} 
                          index={i} 
                          className="w-8.5 sm:w-10 h-12 sm:h-13 bg-black/50 border-white/15 rounded-xl text-base sm:text-lg font-black text-white focus-visible:ring-[#a855f7]/50 focus-visible:border-[#a855f7] transition-all shadow-inner"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -4 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <div className="w-full space-y-2.5">
                  <Button 
                    onClick={handleVerifyResetOtp}
                    disabled={isLoading || (otp.length !== 8 && otp.length !== 6)}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#0ea5e9] hover:opacity-95 text-white font-bold text-sm shadow-[0_0_20px_rgba(168,85,247,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "কোড যাচাই করুন"}
                  </Button>

                  <button 
                    onClick={() => changeView("login")}
                    className="w-full h-11 rounded-xl bg-transparent border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 font-semibold text-xs transition-all"
                  >
                    লগইনে ফিরে যান
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================= 4. UPDATE PASSWORD VIEW ================= */}
          {view === "update-password" && (
            <motion.div
              key="update-password"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative p-6 sm:p-8 bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 rounded-[32px] sm:rounded-[36px] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-60 blur-[2px]" />

              <motion.div variants={itemVariants} className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mb-3">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black tracking-tight font-space text-white">নতুন পাসওয়ার্ড সেট করুন</h2>
                <p className="text-xs text-slate-400 mt-1">আপনার অ্যাকাউন্টের জন্য নতুন একটি শক্তিশালী পাসওয়ার্ড লিখুন।</p>
              </motion.div>

              <div className="space-y-4">
                <motion.div variants={itemVariants} className="space-y-1.5">
                  <label htmlFor="new-password-input" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                    নতুন পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      id="new-password-input"
                      type={showNewPassword ? "text" : "password"} 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="কমপক্ষে ৬ অক্ষর" 
                      className="pl-10 pr-11 h-12 bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500 rounded-xl transition-all font-mono tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </motion.div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -4 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.div variants={itemVariants} className="pt-2">
                  <Button 
                    onClick={handleUpdatePassword}
                    disabled={isLoading}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all border-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        পাসওয়ার্ড সেভ ও কন্টিনিউ
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}