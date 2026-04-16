"use client";

import { Home, PieChart, Wallet, CreditCard } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: PieChart, label: "Trans", path: "/transactions" },
    { icon: Wallet, label: "Settled", path: "/settlements" },
    { icon: CreditCard, label: "Loans", path: "/loans" }
  ];

  return (
    <nav className="fixed bottom-5 left-5 right-5 h-16 bg-[#0a0a0a]/80 backdrop-blur-md border border-white/10 rounded-[24px] flex justify-around items-center z-50 max-w-md mx-auto">
      {navItems.map((item, i) => {
        const isActive = pathname === item.path;
        return (
          <button 
            key={i} 
            onClick={() => router.push(item.path)}
            className={`flex flex-col items-center gap-1 p-2 transition-all duration-300 ${isActive ? 'opacity-100 text-[#0ea5e9]' : 'opacity-50 text-slate-50 hover:opacity-100'}`}
          >
            <item.icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_8px_rgba(14,165,233,0.8)]' : ''}`} />
            <span className="text-[9px] font-semibold uppercase tracking-wider">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
