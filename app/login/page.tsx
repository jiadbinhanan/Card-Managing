"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { ArrowRight, ChevronLeft, Fingerprint, Lock, Mail, Sparkles, Loader2, KeyRound } from "lucide-react";
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

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("login");

  // Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otp, setOtp] = useState("");

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animation variants
  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        duration: 0.5, 
        ease: "easeOut",
        staggerChildren: 0.1
      }
    },
    exit: { 
      opacity: 0, 
      y: -20, 
      scale: 0.95,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  // ১. লগইন লজিক
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false); // শুধু এরর হলেই লোডিং বন্ধ হবে
    } else {
      // FIX: Next.js router.push এর বদলে Hard Redirect, এতে Session ঠিকমত সিঙ্ক হবে
      window.location.href = "/dashboard";
    }
  };

  // ২. OTP সেন্ড করার লজিক
  const handleSendCode = async () => {
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setError(error.message);
    } else {
      setView("forgot-otp");
    }
    setIsLoading(false);
  };

  // ৩. OTP ভেরিফাই করার লজিক
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'recovery'
    });

    if (error) {
      setError(error.message);
    } else {
      setView("update-password");
    }
    setIsLoading(false);
  };

  // ৪. নতুন পাসওয়ার্ড আপডেট করার লজিক
  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      window.location.href = "/dashboard";
    }
  };

  const changeView = (newView: ViewState) => {
    setError(null);
    setView(newView);
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-slate-50 overflow-hidden flex items-center justify-center p-6 font-sans">

      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        <motion.div
          animate={{
            x: [0, 30, -30, 0],
            y: [0, -30, 30, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#0ea5e9] opacity-20 blur-[100px] mix-blend-screen"
        />
        <motion.div
          animate={{
            x: [0, -40, 40, 0],
            y: [0, 40, -40, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#a855f7] opacity-20 blur-[120px] mix-blend-screen"
        />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">

          {/* ================= LOGIN VIEW ================= */}
          {view === "login" && (
            <motion.div
              key="login"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl shadow-black/50"
            >
              <motion.div variants={itemVariants} className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0ea5e9]/20 to-[#a855f7]/20 border border-white/10 mb-6 shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                  <Fingerprint className="w-8 h-8 text-[#0ea5e9]" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight font-space bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                  NexLimit
                </h1>
                <p className="text-sm text-slate-400 mt-2">Secure access to your wallet</p>
              </motion.div>

              <form onSubmit={handleLogin} className="space-y-5">
                <motion.div variants={itemVariants} className="space-y-1.5">
                  <label htmlFor="login-email" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      id="login-email"
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="arjun@example.com" 
                      required
                      className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-[#0ea5e9]/50 focus-visible:border-[#0ea5e9] rounded-xl transition-all"
                    />
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <label htmlFor="login-password" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                    <button 
                      type="button"
                      onClick={() => changeView("forgot-email")}
                      className="text-xs font-medium text-[#0ea5e9] hover:text-[#38bdf8] transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      id="login-password"
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      required
                      className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-[#0ea5e9]/50 focus-visible:border-[#0ea5e9] rounded-xl transition-all"
                    />
                  </div>
                </motion.div>

                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs text-center font-medium">
                    {error}
                  </motion.p>
                )}

                <motion.div variants={itemVariants} className="pt-4">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-semibold text-base shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] border-0 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <>
                          Login to Dashboard
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </form>
            </motion.div>
          )}

          {/* ================= FORGOT PASSWORD - EMAIL VIEW ================= */}
          {view === "forgot-email" && (
            <motion.div
              key="forgot-email"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl shadow-black/50"
            >
              <motion.div variants={itemVariants} className="mb-8">
                <button 
                  onClick={() => changeView("login")}
                  className="flex items-center text-sm text-slate-400 hover:text-white transition-colors mb-6"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </button>
                <h2 className="text-2xl font-bold tracking-tight font-space text-white mb-2">Reset Password</h2>
                <p className="text-sm text-slate-400">Enter your email to receive a 6-digit verification code.</p>
              </motion.div>

              <div className="space-y-6">
                <motion.div variants={itemVariants} className="space-y-1.5">
                  <label htmlFor="forgot-email-input" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      id="forgot-email-input"
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="arjun@example.com" 
                      className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-[#a855f7]/50 focus-visible:border-[#a855f7] rounded-xl transition-all"
                    />
                  </div>
                </motion.div>

                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs text-center font-medium">
                    {error}
                  </motion.p>
                )}

                <motion.div variants={itemVariants} className="pt-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      onClick={handleSendCode}
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl bg-white text-black hover:bg-slate-200 font-semibold text-base transition-all border-0 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <>
                          Send Code
                          <Sparkles className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ================= FORGOT PASSWORD - OTP VIEW ================= */}
          {view === "forgot-otp" && (
            <motion.div
              key="forgot-otp"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl shadow-black/50"
            >
              <motion.div variants={itemVariants} className="mb-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#a855f7]/20 border border-[#a855f7]/30 mb-4">
                  <Mail className="w-5 h-5 text-[#a855f7]" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight font-space text-white mb-2">Enter Code</h2>
                <p className="text-sm text-slate-400">
                  We sent a 6-digit code to <br/>
                  <span className="text-white font-medium">{email || "your email"}</span>
                </p>
              </motion.div>

              <div className="space-y-8 flex flex-col items-center">
                <motion.div variants={itemVariants}>
                  <InputOTP 
                    maxLength={6} 
                    value={otp}
                    onChange={setOtp}
                    containerClassName="gap-2"
                  >
                    <InputOTPGroup className="gap-2">
                      {[...Array(6)].map((_, i) => (
                        <InputOTPSlot 
                          key={i} 
                          index={i} 
                          className="w-10 h-12 bg-black/20 border-white/10 border-l rounded-lg text-lg font-bold text-white focus-visible:ring-[#a855f7]/50 focus-visible:border-[#a855f7] transition-all"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </motion.div>

                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs text-center font-medium w-full">
                    {error}
                  </motion.p>
                )}

                <motion.div variants={itemVariants} className="w-full space-y-3">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      onClick={handleVerifyOtp}
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#0ea5e9] hover:opacity-90 text-white font-semibold text-base shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all border-0 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify Code"}
                    </Button>
                  </motion.div>
                  <button 
                    onClick={() => changeView("login")}
                    className="w-full h-12 rounded-xl bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-medium text-sm transition-all"
                  >
                    Back to Login
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ================= UPDATE PASSWORD VIEW ================= */}
          {view === "update-password" && (
            <motion.div
              key="update-password"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl shadow-black/50"
            >
              <motion.div variants={itemVariants} className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#10b981]/20 border border-[#10b981]/30 mb-4">
                  <KeyRound className="w-5 h-5 text-[#10b981]" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight font-space text-white mb-2">New Password</h2>
                <p className="text-sm text-slate-400">Secure your account with a new password.</p>
              </motion.div>

              <div className="space-y-6">
                <motion.div variants={itemVariants} className="space-y-1.5">
                  <label htmlFor="new-password-input" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      id="new-password-input"
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters" 
                      className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-[#10b981]/50 focus-visible:border-[#10b981] rounded-xl transition-all"
                    />
                  </div>
                </motion.div>

                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs text-center font-medium">
                    {error}
                  </motion.p>
                )}

                <motion.div variants={itemVariants} className="pt-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      onClick={handleUpdatePassword}
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] hover:opacity-90 text-white font-semibold text-base shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all border-0 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <>
                          Save & Continue
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}