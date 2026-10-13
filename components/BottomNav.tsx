"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Home, 
  PieChart, 
  Wallet, 
  CreditCard, 
  Banknote, 
  Receipt, 
  Coins,
  Loader2
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [navigatingPath, setNavigatingPath] = useState<string | null>(null);

  const navContainerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const baseNavItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: PieChart, label: "Trans", path: "/transactions" },
    { icon: Wallet, label: "Settled", path: "/settlements" },
    { icon: CreditCard, label: "Loans", path: "/lents" },
  ];

  const ledgerDrawerItems = [
    {
      id: "cash",
      icon: Banknote,
      label: "Cash on Hand",
      path: "/ledgers?tab=cash",
      cardStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 active:bg-emerald-500/30",
      iconStyle: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    },
    {
      id: "spends",
      icon: Receipt,
      label: "Personal Spends",
      path: "/ledgers?tab=spends",
      cardStyle: "bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20 active:bg-amber-500/30",
      iconStyle: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    },
    {
      id: "pocket",
      icon: Coins,
      label: "Pocket Advances",
      path: "/ledgers?tab=pocket",
      cardStyle: "bg-violet-500/10 text-purple-300 border-purple-500/25 hover:bg-violet-500/20 active:bg-violet-500/30",
      iconStyle: "bg-purple-500/20 text-purple-200 border border-purple-500/30",
    },
  ];

  // Reset navigating feedback once pathname updates
  useEffect(() => {
    setNavigatingPath(null);
  }, [pathname]);

  // Click handler with instant tactile feedback animation
  const handleNavClick = useCallback((targetPath: string) => {
    setNavigatingPath(targetPath);
    setIsExpanded(false);
    router.push(targetPath);

    // Safety timeout in case Next.js page is already cached/fast
    const timer = setTimeout(() => {
      setNavigatingPath(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [router]);

  // -------------------------------------------------------------
  // PREVENT BACKGROUND PAGE SCROLLING WHEN SCROLLING OVER BOTTOMNAV
  // Native non-passive event listeners stop event propagation & default scroll
  // -------------------------------------------------------------
  useEffect(() => {
    const el = navContainerRef.current;
    if (!el) return;

    // 1. Native Non-Passive Wheel Event (Desktop)
    const handleNativeWheel = (e: WheelEvent) => {
      // Strictly prevent the window/background page underneath from scrolling
      e.preventDefault();
      e.stopPropagation();

      // Smooth drawer toggle on wheel
      if (e.deltaY < -10) {
        setIsExpanded(true);
      } else if (e.deltaY > 10) {
        setIsExpanded(false);
      }
    };

    // 2. Native Non-Passive Touch Move Event (Mobile touch swipe)
    const handleNativeTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null) return;
      const currentY = e.touches[0].clientY;
      const diff = touchStartY.current - currentY;

      // Prevent the mobile browser from scrolling the body behind BottomNav
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();

      // Smooth threshold for mobile: swipe up expands, swipe down collapses
      if (diff > 18) {
        setIsExpanded(true);
        touchStartY.current = currentY; // reset reference for continuous feel
      } else if (diff < -18) {
        setIsExpanded(false);
        touchStartY.current = currentY;
      }
    };

    const handleNativeTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleNativeTouchEnd = () => {
      touchStartY.current = null;
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    el.addEventListener("touchstart", handleNativeTouchStart, { passive: true });
    el.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    el.addEventListener("touchend", handleNativeTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleNativeWheel);
      el.removeEventListener("touchstart", handleNativeTouchStart);
      el.removeEventListener("touchmove", handleNativeTouchMove);
      el.removeEventListener("touchend", handleNativeTouchEnd);
    };
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) setIsExpanded(false);
    };
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isExpanded]);

  const isLedgerPage = pathname === "/ledgers";

  return (
    <div 
      ref={navContainerRef}
      className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto pointer-events-auto select-none"
      style={{
        touchAction: "none",
        overscrollBehavior: "contain"
      }}
    >
      <motion.div
        layout
        transition={{ type: "spring", damping: 26, stiffness: 340 }}
        className="relative bg-[#030014]/90 border border-white/10 backdrop-blur-2xl rounded-[28px] overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.6)]"
      >
        {/* Sleek Drag Handle Bar (Toggles drawer on tap, visual affordance on hover) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="pt-2 pb-1.5 flex items-center justify-center cursor-pointer group transition-all"
          title={isExpanded ? "নিচে নামিয়ে বন্ধ করুন" : "সোয়াইপ করে লেজার হিসাব দেখুন"}
        >
          <motion.div 
            animate={{ width: isExpanded ? 48 : 36, opacity: isExpanded ? 0.8 : 0.4 }}
            whileHover={{ scale: 1.15, opacity: 0.9 }}
            className="h-1 bg-white rounded-full transition-all" 
          />
        </div>

        {/* Expanded Drawer Area: Reveals the 3 Ledger Options */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden px-3 pb-3 pt-1 border-b border-white/10"
            >
              <div className="grid grid-cols-3 gap-2">
                {ledgerDrawerItems.map((item) => {
                  const isNavigating = navigatingPath === item.path;

                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => handleNavClick(item.path)}
                      className={`relative p-2.5 rounded-2xl ${item.cardStyle} border flex flex-col items-center text-center transition-all hover:scale-[1.02] ${
                        isNavigating ? "ring-2 ring-purple-400 shadow-lg scale-95" : ""
                      }`}
                    >
                      <motion.div 
                        animate={isNavigating ? { scale: [1, 0.75, 1.25, 1], rotate: [0, -12, 12, 0] } : { scale: 1, rotate: 0 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${item.iconStyle}`}
                      >
                        {isNavigating ? (
                          <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                        ) : (
                          <item.icon className="w-4 h-4" />
                        )}
                      </motion.div>
                      <span className="text-[11px] font-bold text-white line-clamp-1">
                        {item.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary 4-Tab Bottom Nav Row */}
        <nav className="h-14 px-2 flex justify-around items-center">
          {baseNavItems.map((item, i) => {
            const isActive = pathname === item.path;
            const isNavigating = navigatingPath === item.path;

            return (
              <motion.button
                key={i}
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => handleNavClick(item.path)}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "text-[#0ea5e9] font-bold"
                    : isNavigating
                    ? "text-sky-300 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {/* Active Tab Glow Pill */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabBadge"
                    className="absolute inset-0 bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 rounded-2xl -z-10 shadow-[0_0_15px_rgba(14,165,233,0.15)]"
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  />
                )}

                {/* Click / Navigation Feedback Pulse Halo */}
                {isNavigating && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut" }}
                    className="absolute inset-0 bg-sky-400/20 border border-sky-400/40 rounded-2xl -z-10 shadow-[0_0_20px_rgba(14,165,233,0.5)]"
                  />
                )}

                {/* Icon with interactive spring bounce & tactile feedback */}
                <motion.div
                  animate={isNavigating ? { 
                    scale: [1, 0.75, 1.25, 1],
                    rotate: [0, -10, 10, 0]
                  } : { 
                    scale: 1,
                    rotate: 0 
                  }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="relative flex items-center justify-center"
                >
                  <item.icon
                    className={`w-5 h-5 transition-transform duration-200 ${
                      isActive
                        ? "drop-shadow-[0_0_8px_rgba(14,165,233,0.8)] scale-105"
                        : isNavigating
                        ? "text-sky-300 drop-shadow-[0_0_10px_rgba(14,165,233,0.9)] scale-110"
                        : "group-hover:scale-105"
                    }`}
                  />

                  {/* Micro loading badge indicator on navigating icon */}
                  {isNavigating && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                    </span>
                  )}
                </motion.div>

                <span className="text-[9px] uppercase tracking-wider font-semibold">
                  {item.label}
                </span>
              </motion.button>
            );
          })}

          {/* Subtle indicator if currently on /ledgers */}
          {isLedgerPage && (
            <div className="absolute right-3.5 top-2 pointer-events-none">
              <span className="flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-500"></span>
              </span>
            </div>
          )}
        </nav>
      </motion.div>
    </div>
  );
}
