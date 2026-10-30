"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  CalendarClock,
  HandCoins,
  CreditCard,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Loader2,
  Filter
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

export interface AppNotification {
  id: string;
  user_id?: string | null;
  title: string;
  body: string;
  category: string;
  payload: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export function NotificationPanel() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "bills" | "loans">("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setNotifications(data as AppNotification[]);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Supabase Realtime subscription for live notifications
    const channel = supabase
      .channel("public:notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  // Mark single as read
  const handleMarkAsRead = async (id: string, url?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }

    if (url) {
      setIsOpen(false);
      router.push(url);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  // Clear all history
  const handleClearHistory = async () => {
    if (!window.confirm("আপনি কি নিশ্চিতভাবে সব নোটিফিকেশন হিস্ট্রি মুছে ফেলতে চান?")) return;
    setNotifications([]);
    try {
      await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  // Category Icon & Accent Colors
  const getCategoryDetails = (category: string) => {
    switch (category) {
      case "bill":
      case "bill_entry":
        return {
          icon: CalendarClock,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10 border-emerald-500/20",
          badge: "বিল অ্যালার্ট"
        };
      case "lent_issue":
      case "lent_recovery":
        return {
          icon: HandCoins,
          color: "text-cyan-400",
          bg: "bg-cyan-500/10 border-cyan-500/20",
          badge: "ধার লেনদেন"
        };
      case "spend":
      case "rotation_withdraw":
        return {
          icon: CreditCard,
          color: "text-purple-400",
          bg: "bg-purple-500/10 border-purple-500/20",
          badge: "কার্ড স্পেন্ড"
        };
      case "settlement":
        return {
          icon: ShieldCheck,
          color: "text-amber-400",
          bg: "bg-amber-500/10 border-amber-500/20",
          badge: "সেটেলমেন্ট"
        };
      default:
        return {
          icon: Sparkles,
          color: "text-[#0ea5e9]",
          bg: "bg-[#0ea5e9]/10 border-[#0ea5e9]/20",
          badge: "সিস্টেম"
        };
    }
  };

  // Format date helper
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", hour12: true });
      }
      return d.toLocaleDateString("bn-BD", { day: "numeric", month: "short" }) + " " +
        d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  // Filtered list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === "unread") return !n.is_read;
      if (activeTab === "bills") return n.category === "bill" || n.category === "bill_entry";
      if (activeTab === "loans") return n.category === "lent_issue" || n.category === "lent_recovery";
      return true;
    });
  }, [notifications, activeTab]);

  return (
    <>
      {/* ── Bell Trigger Button with Glowing Unread Dot ── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="নোটিফিকেশন প্যানেল"
        className="relative w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 hover:border-[#0ea5e9]/50 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(14,165,233,0.15)]"
      >
        <Bell className="w-4 h-4 text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-[9px] font-black text-black shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Slide-over Drawer (Portaled directly to document.body to prevent parent header clipping) ── */}
      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] flex justify-end">
              {/* Backdrop Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
              />

              {/* Panel Sheet */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="relative w-full max-w-md h-screen max-h-screen bg-[#060216]/95 border-l border-white/10 shadow-2xl flex flex-col backdrop-blur-3xl isolate pb-8"
              >
                {/* Header */}
                <div className="px-5 pt-6 pb-4 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0ea5e9]/20 to-[#a855f7]/20 border border-white/10 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-[#0ea5e9]" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white flex items-center gap-2">
                        নোটিফিকেশন
                        {unreadCount > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                            {unreadCount} নতুন
                          </span>
                        )}
                      </h2>
                      <p className="text-[10px] text-slate-400">সর্বমোট {notifications.length}টি অ্যালার্ট সংরক্ষিত</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        title="সব পঠিত মার্ক করুন"
                        className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={handleClearHistory}
                        title="হিস্ট্রি মুছে ফেলুন"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="px-5 py-2.5 border-b border-white/5 flex gap-1.5 overflow-x-auto custom-scrollbar">
                  {[
                    { key: "all", label: "সকল" },
                    { key: "unread", label: "অপঠিত" },
                    { key: "bills", label: "বিল" },
                    { key: "loans", label: "ধার লেনদেন" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key as any)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                        activeTab === t.key
                          ? "bg-[#0ea5e9] text-black shadow-[0_0_12px_rgba(14,165,233,0.5)]"
                          : "bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
                  {isLoading ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin text-[#0ea5e9]" />
                      <span className="text-xs">নোটিফিকেশন লোড হচ্ছে...</span>
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-2 text-center text-slate-500">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-slate-600 mb-1">
                        <Bell className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-400">কোনো নোটিফিকেশন নেই</p>
                      <p className="text-xs text-slate-600 max-w-xs">
                        নতুন কোনো বিল, রোটেশন বা ধার সংক্রান্ত কার্যকলাপ ঘটলে এখানে নোটিফিকেশন দেখতে পাবেন।
                      </p>
                    </div>
                  ) : (
                    filteredNotifications.map((n) => {
                      const cat = getCategoryDetails(n.category);
                      const IconComp = cat.icon;
                      return (
                        <motion.div
                          key={n.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => handleMarkAsRead(n.id, n.payload?.url)}
                          className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            !n.is_read
                              ? "bg-white/[0.05] border-white/15 hover:border-[#0ea5e9]/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                              : "bg-white/[0.015] border-white/5 hover:bg-white/[0.03] text-slate-400"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${cat.bg}`}>
                              <IconComp className={`w-4 h-4 ${cat.color}`} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {cat.badge}
                                </span>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {formatTime(n.created_at)}
                                </span>
                              </div>

                              <h4 className={`text-xs font-bold leading-snug mb-1 ${!n.is_read ? "text-white" : "text-slate-300"}`}>
                                {n.title}
                              </h4>

                              <p className="text-[11px] text-slate-400 leading-relaxed break-words">
                                {n.body}
                              </p>

                              {n.payload?.url && (
                                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#38bdf8] opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span>বিস্তারিত দেখুন</span>
                                  <ExternalLink className="w-3 h-3" />
                                </div>
                              )}
                            </div>

                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)] shrink-0 mt-2" />
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
