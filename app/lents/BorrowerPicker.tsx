"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Plus, User, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Borrower } from "./BorrowerProfilePanel";

interface BorrowerPickerProps {
  open: boolean;
  onClose: () => void;
  onSelectExisting: (b: Borrower) => void;
  onCreateNew: (name: string, phone: string) => Promise<void>;
  accent?: "amber" | "emerald";
}

export default function BorrowerPicker({ open, onClose, onSelectExisting, onCreateNew, accent = "amber" }: BorrowerPickerProps) {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [allBorrowers, setAllBorrowers] = useState<Borrower[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPhone("");
      fetchBorrowers();
    }
  }, [open]);

  // Card ও Pocket — দুই সিস্টেমের borrower-ই একই শেয়ার্ড টেবিল থেকে আসে, তাই
  // এখানে সব borrower-ই (entry থাকুক বা না থাকুক) দেখানো হচ্ছে — যাতে একবার
  // তৈরি করা কাউকে কখনো আবার নতুন করে বানাতে না হয়
  const fetchBorrowers = async () => {
    setIsLoading(true);
    const { data } = await supabase.from("borrowers").select("id, name, phone").order("name");
    setAllBorrowers((data as Borrower[]) || []);
    setIsLoading(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allBorrowers;
    return allBorrowers.filter((b) => b.name.toLowerCase().includes(q));
  }, [query, allBorrowers]);

  const exactMatch = allBorrowers.some((b) => b.name.trim().toLowerCase() === query.trim().toLowerCase());

  const handleCreate = async () => {
    if (!query.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateNew(query.trim(), phone.trim());
    } finally {
      setIsCreating(false);
    }
  };

  if (!mounted) return null;

  const accentText = accent === "emerald" ? "text-emerald-400" : "text-[#f59e0b]";
  const accentBg = accent === "emerald" ? "bg-emerald-400" : "bg-[#f59e0b]";
  const accentBorderFocus = accent === "emerald" ? "focus:border-emerald-400" : "focus:border-[#f59e0b]";

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-x-6 top-20 z-[71] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[72vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h3 className="text-sm font-black text-white">Borrower বেছে নাও</h3>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  type="text"
                  placeholder="নাম লিখে খোঁজো..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white outline-none ${accentBorderFocus}`}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className={`w-5 h-5 animate-spin ${accentText}`} />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-6">কোনো মিল পাওয়া যায়নি</p>
              ) : (
                filtered.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectExisting(b)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{b.name}</p>
                      {b.phone && <p className="text-[10px] text-slate-500 truncate">{b.phone}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>

            {query.trim() && !exactMatch && (
              <div className="p-4 border-t border-white/5 shrink-0 space-y-2 bg-white/[0.02]">
                <input
                  type="text"
                  placeholder="ফোন নম্বর (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none ${accentBorderFocus}`}
                />
                <button
                  disabled={isCreating}
                  onClick={handleCreate}
                  className={`w-full py-2.5 rounded-xl text-sm font-black text-black ${accentBg} flex items-center justify-center gap-2 disabled:opacity-50`}
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  নতুন যোগ করো: "{query.trim()}"
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}