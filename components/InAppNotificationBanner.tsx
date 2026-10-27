"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, X, ExternalLink, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { initCapacitorPush } from "@/lib/pushNotifications";
import { supabase } from "@/lib/supabase";

interface InAppAlert {
  id: string;
  title: string;
  body: string;
  url?: string;
  type?: string;
}

export function InAppNotificationBanner() {
  const router = useRouter();
  const [activeAlert, setActiveAlert] = useState<InAppAlert | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    // Check user auth and initialize Push listener
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await initCapacitorPush(user.id, (notification) => {
        // Foreground in-app notification received
        const inAppTitle = notification.data?.title || notification.title || "ক্রেডিক্স অ্যালার্ট 🔔";
        const inAppBody = notification.data?.body || notification.body || "একটি নতুন আপডেট এসেছে।";
        const targetUrl = notification.data?.url || "/dashboard";

        setActiveAlert({
          id: String(Date.now()),
          title: inAppTitle,
          body: inAppBody,
          url: targetUrl,
          type: notification.data?.type,
        });

        // Auto dismiss after 6 seconds
        clearTimeout(timer);
        timer = setTimeout(() => {
          setActiveAlert(null);
        }, 6000);
      });
    };

    setup();

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleOpen = () => {
    if (activeAlert?.url) {
      router.push(activeAlert.url);
    }
    setActiveAlert(null);
  };

  return (
    <AnimatePresence>
      {activeAlert && (
        <motion.div
          initial={{ opacity: 0, y: -60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.95 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto pointer-events-auto"
        >
          <div className="relative overflow-hidden rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-emerald-500/30 p-4 shadow-2xl shadow-emerald-950/40 text-white">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Bell className="w-5 h-5 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    Live Alert
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-zinc-100 mt-1 truncate">
                  {activeAlert.title}
                </h4>
                <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2 leading-relaxed">
                  {activeAlert.body}
                </p>

                {activeAlert.url && (
                  <button
                    onClick={handleOpen}
                    className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <span>দেখুন</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setActiveAlert(null)}
                className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-200 p-1 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Glowing Accent Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
