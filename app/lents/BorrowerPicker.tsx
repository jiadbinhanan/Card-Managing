"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Plus, User, Loader2, MoreVertical, Pencil, Trash2, AlertTriangle, Check } from "lucide-react";
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
  // borrower_id -> আছে কি না কোনো entry (card_lent_ledger শেয়ার্ড + নিজের pocket_lent_ledger মিলিয়ে)
  const [hasEntryMap, setHasEntryMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  // --- 3-dot menu / edit / delete ---
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingBorrower, setEditingBorrower] = useState<Borrower | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Borrower | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPhone("");
      fetchBorrowers();
    }
  }, [open]);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpenId]);

  // Card ও Pocket — দুই সিস্টেমের borrower-ই একই শেয়ার্ড টেবিল থেকে আসে, তাই
  // এখানে সব borrower-ই (entry থাকুক বা না থাকুক) দেখানো হচ্ছে — যাতে একবার
  // তৈরি করা কাউকে কখনো আবার নতুন করে বানাতে না হয়
  const fetchBorrowers = async () => {
    setIsLoading(true);
    const [{ data }, { data: cardRows }, { data: pocketRows }] = await Promise.all([
      supabase.from("borrowers").select("id, name, phone").order("name"),
      supabase.from("card_lent_ledger").select("borrower_id"),
      // পকেট RLS নিজে থেকেই শুধু নিজের row দেখাবে — তাই এই check শুধু "আমার দৃষ্টিকোণ থেকে"
      supabase.from("pocket_lent_ledger").select("borrower_id"),
    ]);
    setAllBorrowers((data as Borrower[]) || []);
    const map: Record<string, boolean> = {};
    (cardRows || []).forEach((r: any) => { map[r.borrower_id] = true; });
    (pocketRows || []).forEach((r: any) => { map[r.borrower_id] = true; });
    setHasEntryMap(map);
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

  const startEdit = (b: Borrower) => {
    setEditingBorrower(b);
    setEditName(b.name);
    setEditPhone(b.phone || "");
  };

  const saveEdit = async () => {
    if (!editingBorrower || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from("borrowers")
        .update({ name: editName.trim(), phone: editPhone.trim() || null })
        .eq("id", editingBorrower.id);
      if (error) throw error;
      setEditingBorrower(null);
      await fetchBorrowers();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("borrowers").delete().eq("id", deleteTarget.id);
      if (error) {
        // FK constraint (কোথাও entry থাকলে, এমনকি অন্য user-এর প্রাইভেট pocket entry হলেও) delete block করবে
        if (error.code === "23503") {
          alert("এই borrower-এর সাথে এখনো কোথাও lending entry যুক্ত আছে, তাই ডিলিট করা যাবে না।");
        } else {
          throw error;
        }
      } else {
        setDeleteTarget(null);
        await fetchBorrowers();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsDeleting(false);
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
            className="fixed inset-x-6 top-20 z-[71] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[72vh] overflow-visible"
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

            <div className="flex-1 overflow-y-auto overflow-x-visible px-3 pb-2 space-y-1">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className={`w-5 h-5 animate-spin ${accentText}`} />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-6">কোনো মিল পাওয়া যায়নি</p>
              ) : (
                filtered.map((b) => {
                  const hasEntry = !!hasEntryMap[b.id];
                  const isMenuOpen = menuOpenId === b.id;
                  return (
                    <div key={b.id} className="relative flex items-center gap-1 rounded-xl hover:bg-white/5 transition-colors">
                      <button
                        onClick={() => onSelectExisting(b)}
                        className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{b.name}</p>
                          {b.phone && <p className="text-[10px] text-slate-500 truncate">{b.phone}</p>}
                        </div>
                        <span
                          className={`ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                            hasEntry ? "bg-white/5 text-slate-400 border border-white/10" : "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                          }`}
                        >
                          {hasEntry ? "Entry আছে" : "No Entry"}
                        </span>
                      </button>
                      <div className="relative shrink-0 pr-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : b.id); }}
                          className="p-1.5 rounded-full hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                        <AnimatePresence>
                          {isMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-8 z-[75] bg-[#0d0d0d] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[130px]"
                            >
                              <button
                                onClick={() => { setMenuOpenId(null); startEdit(b); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit Details
                              </button>
                              <button
                                onClick={() => { setMenuOpenId(null); if (!hasEntry) setDeleteTarget(b); }}
                                disabled={hasEntry}
                                title={hasEntry ? "Entry থাকা অবস্থায় ডিলিট করা যাবে না" : ""}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold ${
                                  hasEntry ? "text-slate-600 cursor-not-allowed" : "text-[#ef4444] hover:bg-[#ef4444]/10"
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })
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

          {/* Edit Borrower Modal */}
          <AnimatePresence>
            {editingBorrower && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !isSavingEdit && setEditingBorrower(null)}
                  className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="fixed inset-x-6 top-24 z-[81] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-black text-white">Borrower Details Edit</h3>
                    <button onClick={() => !isSavingEdit && setEditingBorrower(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                  <input
                    type="text" placeholder="নাম" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none ${accentBorderFocus}`}
                  />
                  <input
                    type="text" placeholder="ফোন নম্বর (optional)" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none ${accentBorderFocus}`}
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditingBorrower(null)}
                      disabled={isSavingEdit}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={isSavingEdit || !editName.trim()}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-black ${accentBg} flex items-center justify-center gap-2 disabled:opacity-50`}
                    >
                      {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteTarget && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !isDeleting && setDeleteTarget(null)}
                  className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="fixed inset-x-6 top-32 z-[81] max-w-sm mx-auto bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl p-5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-[#ef4444]">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="text-sm font-black">"{deleteTarget.name}"-কে ডিলিট করবে?</h3>
                  </div>
                  <p className="text-xs text-slate-400">কোনো entry নেই এই borrower-এর নামে, তাই safely ডিলিট করা যাবে।</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setDeleteTarget(null)}
                      disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDelete}
                      disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#ef4444] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}