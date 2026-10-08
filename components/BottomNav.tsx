"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Home, 
  PieChart, 
  Wallet, 
  CreditCard, 
  Banknote, 
  Receipt, 
  Coins 
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const touchStartY = useRef<number | null>(null);

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
      cardStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20",
      iconStyle: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    },
    {
      id: "spends",
      icon: Receipt,
      label: "Personal Spends",
      path: "/ledgers?tab=spends",
      cardStyle: "bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20",
      iconStyle: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    },
    {
      id: "pocket",
      icon: Coins,
      label: "Pocket Advances",
      path: "/ledgers?tab=pocket",
      cardStyle: "bg-violet-500/10 text-purple-300 border-purple-500/25 hover:bg-violet-500/20",
      iconStyle: "bg-purple-500/20 text-purple-200 border border-purple-500/30",
    },
  ];

  // Gesture handling: Touch swipe up on the nav
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = touchStartY.current - currentY;

    // Swiped up by > 24px -> Expand
    if (diff > 24 && !isExpanded) {
      setIsExpanded(true);
      touchStartY.current = null;
    }
    // Swiped down by > 24px -> Collapse
    else if (diff < -24 && isExpanded) {
      setIsExpanded(false);
      touchStartY.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  // Wheel scroll up detection
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < -15 && !isExpanded) {
      setIsExpanded(true);
    } else if (e.deltaY > 15 && isExpanded) {
      setIsExpanded(false);
    }
  };

  // Close on Escape or click outside
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) setIsExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded]);

  const isLedgerPage = pathname === "/ledgers";

  return (
    <div 
      className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto pointer-events-auto select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <motion.div
        layout
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="relative bg-[#030014]/90 border border-white/10 backdrop-blur-2xl rounded-[28px] overflow-hidden"
      >
        {/* Sleek top white drag handle bar only (no text) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="pt-2 pb-1.5 flex items-center justify-center cursor-pointer group"
          title="Swipe up or tap for Ledgers"
        >
          <div className="w-10 h-1 bg-white/25 group-hover:bg-white/50 rounded-full transition-colors" />
        </div>

        {/* Expanded Area: Reveals the 3 Options cleanly (no clutter text, no extra icons) */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden px-3 pb-3 pt-1 border-b border-white/10"
            >
              <div className="grid grid-cols-3 gap-2">
                {ledgerDrawerItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsExpanded(false);
                      router.push(item.path);
                    }}
                    className={`p-2.5 rounded-2xl ${item.cardStyle} border flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-95`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${item.iconStyle}`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold text-white line-clamp-1">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary 4-Tab Bottom Nav Row */}
        <nav className="h-14 px-2 flex justify-around items-center">
          {baseNavItems.map((item, i) => {
            const isActive = pathname === item.path;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                  router.push(item.path);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "text-[#0ea5e9] font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBadge"
                    className="absolute inset-0 bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 rounded-2xl -z-10"
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  />
                )}
                <item.icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive
                      ? "drop-shadow-[0_0_8px_rgba(14,165,233,0.8)] scale-105"
                      : "group-hover:scale-105"
                  }`}
                />
                <span className="text-[9px] uppercase tracking-wider font-semibold">
                  {item.label}
                </span>
              </button>
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
