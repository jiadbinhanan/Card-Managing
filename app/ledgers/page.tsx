"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Banknote, 
  Receipt, 
  Coins, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown,
  ChevronUp,
  Check,
  Info,
  ArrowRight,
  Send,
  Calendar,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useCardStore } from "@/store/cardStore";
import { BottomNav } from "@/components/BottomNav";
import TransactionTraceInline, { type TraceTarget } from "@/components/TransactionTraceInline";

interface CardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary?: boolean;
  parent_card_id?: string;
}

interface ProfileItem {
  id: string;
  name: string;
  avatar_url?: string;
}

interface CashLedgerRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  transaction_type: "credit" | "debit";
  remarks: string | null;
  transaction_date: string;
  linked_card_transaction_id: string | null;
}

interface SpendRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  spend_type: string;
  payment_method: string;
  remarks: string | null;
  spend_date: string;
  linked_card_transaction_id: string | null;
}

interface PocketAdvanceRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  entry_type: string;
  remarks: string | null;
  transaction_date: string;
  linked_card_transaction_id: string | null;
  created_at: string;
}

interface PocketBalanceRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
  updated_at: string;
}

const cleanUrl = (url?: string | null) => {
  if (!url) return "";
  return url.trim().replace(/^['"]|['"]$/g, "");
};

function LedgersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<"cash" | "spends" | "pocket">(
    tabFromUrl === "spends" ? "spends" : tabFromUrl === "pocket" ? "pocket" : "cash"
  );

  useEffect(() => {
    if (tabFromUrl === "cash" || tabFromUrl === "spends" || tabFromUrl === "pocket") {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (tab: "cash" | "spends" | "pocket") => {
    setActiveTab(tab);
    router.replace(`/ledgers?tab=${tab}`);
  };

  const { globalSelectedCardIds, setGlobalSelectedCardIds } = useCardStore();
  const [currentUser, setCurrentUser] = useState<ProfileItem | null>(null);
  const [imgError, setImgError] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Active User Selection (defaults to logged in user)
  const [activeUserId, setActiveUserId] = useState<string>("");

  // Card Dropdown state in header
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);

  // Pagination / Visible count for infinite scroll
  const [visibleCount, setVisibleCount] = useState(30);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Cash on Hand States
  const [cashBalances, setCashBalances] = useState<{ user_id: string; card_id: string; current_balance: number }[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerRow[]>([]);
  const [cashFilterType, setCashFilterType] = useState<"all" | "credit" | "debit">("all");
  const [cashSearch, setCashSearch] = useState("");

  // Spends States
  const [spends, setSpends] = useState<SpendRow[]>([]);
  const [spendsSearch, setSpendsSearch] = useState("");

  // Pocket Advances States
  const [pocketBalances, setPocketBalances] = useState<PocketBalanceRow[]>([]);
  const [pocketLedger, setPocketLedger] = useState<PocketAdvanceRow[]>([]);

  // Reclaim Pocket Modal State
  const [reclaimModalOpen, setReclaimModalOpen] = useState(false);
  const [selectedReclaimCardId, setSelectedReclaimCardId] = useState("");
  const [reclaimAmount, setReclaimAmount] = useState("");
  const [reclaimRemarks, setReclaimRemarks] = useState("");
  const [reclaimSubmitting, setReclaimSubmitting] = useState(false);
  const [reclaimSuccessMsg, setReclaimSuccessMsg] = useState("");
  const [reclaimErrorMsg, setReclaimErrorMsg] = useState("");

  // Cash Transfer Modal State (Peer-to-Peer Transfer between users)
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSenderCardId, setTransferSenderCardId] = useState("");
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const [transferReceiverCardId, setTransferReceiverCardId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRemarks, setTransferRemarks] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState("");
  const [transferErrorMsg, setTransferErrorMsg] = useState("");

  // Inline Trace Flow State
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  // Load all master data & profiles
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user || null;

        const [{ data: cData }, { data: pData }] = await Promise.all([
          supabase.from("cards").select("id, card_name, last_4_digits, is_primary, parent_card_id"),
          supabase.from("profiles").select("id, name, avatar_url"),
        ]);
        setCards(cData || []);

        const profList: ProfileItem[] = (pData || []).map(p => ({
          ...p,
          avatar_url: cleanUrl(p.avatar_url),
        }));
        setProfiles(profList);

        if (authUser) {
          const myProf = profList.find(p => p.id === authUser.id);
          if (myProf) {
            setCurrentUser(myProf);
            setActiveUserId(myProf.id);
          } else if (profList.length > 0) {
            setCurrentUser(profList[0]);
            setActiveUserId(profList[0].id);
          }
        } else if (profList.length > 0) {
          setCurrentUser(profList[0]);
          setActiveUserId(profList[0].id);
        }

        await fetchAllLedgers();
      } catch (err) {
        console.error("Error loading master data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function fetchAllLedgers() {
    const [
      { data: cohBalances },
      { data: cohRows },
      { data: spRows },
      { data: paBalances },
      { data: paRows }
    ] = await Promise.all([
      supabase.from("cash_on_hand").select("*"),
      supabase.from("cash_on_hand_ledger").select("*").order("transaction_date", { ascending: false }).limit(300),
      supabase.from("spends").select("*").order("spend_date", { ascending: false }).limit(300),
      supabase.from("pocket_advances").select("*"),
      supabase.from("pocket_advances_ledger").select("*").order("transaction_date", { ascending: false }).limit(200)
    ]);

    setCashBalances(cohBalances || []);
    setCashLedger(cohRows || []);
    setSpends(spRows || []);
    setPocketBalances(paBalances || []);
    setPocketLedger(paRows || []);
  }

  // Infinite Scroll Listener
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
        setVisibleCount(prev => prev + 30);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const getCardName = (cardId: string) => {
    const c = cards.find(x => x.id === cardId);
    return c ? `${c.card_name} (**${c.last_4_digits})` : "Card";
  };

  const getUserName = (userId: string) => {
    const p = profiles.find(x => x.id === userId);
    return p ? p.name : "User";
  };

  const isCardSelected = (cardId: string) => {
    if (globalSelectedCardIds.includes("all")) return true;
    return globalSelectedCardIds.includes(cardId);
  };

  // -------------------------
  // Active User Specific Calculations
  // -------------------------
  const activeUserCashBalances = useMemo(() => {
    return cashBalances.filter(b => b.user_id === activeUserId && isCardSelected(b.card_id));
  }, [cashBalances, activeUserId, globalSelectedCardIds]);

  const totalUserCashOnHand = useMemo(() => {
    return activeUserCashBalances.reduce((acc, curr) => acc + (Number(curr.current_balance) || 0), 0);
  }, [activeUserCashBalances]);

  const activeUserCardCashMap = useMemo(() => {
    const map: Record<string, number> = {};
    cashBalances.filter(b => b.user_id === activeUserId).forEach(b => {
      map[b.card_id] = Number(b.current_balance || 0);
    });
    return map;
  }, [cashBalances, activeUserId]);

  const filteredCashLedger = useMemo(() => {
    return cashLedger.filter(row => {
      if (row.user_id !== activeUserId) return false;
      if (!isCardSelected(row.card_id)) return false;
      if (cashFilterType !== "all" && row.transaction_type !== cashFilterType) return false;
      if (cashSearch.trim()) {
        const q = cashSearch.toLowerCase();
        const rem = (row.remarks || "").toLowerCase();
        const amt = String(row.amount);
        if (!rem.includes(q) && !amt.includes(q)) return false;
      }
      return true;
    });
  }, [cashLedger, activeUserId, globalSelectedCardIds, cashFilterType, cashSearch]);

  const activeUserSpends = useMemo(() => {
    return spends.filter(s => s.user_id === activeUserId && isCardSelected(s.card_id));
  }, [spends, activeUserId, globalSelectedCardIds]);

  const totalUserPersonalDue = useMemo(() => {
    return activeUserSpends.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [activeUserSpends]);

  const filteredSpends = useMemo(() => {
    return activeUserSpends.filter(row => {
      if (spendsSearch.trim()) {
        const q = spendsSearch.toLowerCase();
        const rem = (row.remarks || "").toLowerCase();
        const amt = String(row.amount);
        if (!rem.includes(q) && !amt.includes(q)) return false;
      }
      return true;
    });
  }, [activeUserSpends, spendsSearch]);

  const activeUserPocketBalances = useMemo(() => {
    return pocketBalances.filter(pb => pb.user_id === activeUserId && isCardSelected(pb.card_id));
  }, [pocketBalances, activeUserId, globalSelectedCardIds]);

  const totalUserPocketBalance = useMemo(() => {
    return activeUserPocketBalances.reduce((acc, curr) => acc + (Number(curr.current_balance) || 0), 0);
  }, [activeUserPocketBalances]);

  const filteredPocketLedger = useMemo(() => {
    return pocketLedger.filter(row => {
      if (row.user_id !== activeUserId) return false;
      if (!isCardSelected(row.card_id)) return false;
      return true;
    });
  }, [pocketLedger, activeUserId, globalSelectedCardIds]);

  // -------------------------
  // Date-wise Grouping for Timeline
  // -------------------------
  const currentTabItems = useMemo(() => {
    if (activeTab === "cash") {
      return filteredCashLedger.map(item => ({
        ...item,
        timelineDate: item.transaction_date,
        itemType: "cash" as const,
      }));
    } else if (activeTab === "spends") {
      return filteredSpends.map(item => ({
        ...item,
        timelineDate: item.spend_date,
        itemType: "spend" as const,
      }));
    } else {
      return filteredPocketLedger.map(item => ({
        ...item,
        timelineDate: item.transaction_date,
        itemType: "pocket" as const,
      }));
    }
  }, [activeTab, filteredCashLedger, filteredSpends, filteredPocketLedger]);

  const groupedTimeline = useMemo(() => {
    const sliced = currentTabItems.slice(0, visibleCount);
    const groups: { dateLabel: string; items: any[] }[] = [];
    const dateMap = new Map<string, any[]>();

    sliced.forEach(item => {
      const d = item.timelineDate || "";
      const dateKey = d ? new Date(d).toISOString().slice(0, 10) : "other";
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(item);
    });

    dateMap.forEach((items, dateKey) => {
      if (dateKey === "other") {
        groups.push({ dateLabel: "Other Entries", items });
        return;
      }
      const dateObj = new Date(dateKey);
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      let label = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      if (dateKey === today) label = `Today • ${label}`;
      else if (dateKey === yesterday) label = `Yesterday • ${label}`;

      groups.push({ dateLabel: label, items });
    });

    return groups;
  }, [currentTabItems, visibleCount]);

  // Reclaim Handlers with Balance Validation
  const handleOpenReclaim = (cardId?: string, defaultAmt?: number) => {
    const cardTarget = cardId || activeUserPocketBalances.find(p => Number(p.current_balance) < 0)?.card_id || cards[0]?.id || "";
    setSelectedReclaimCardId(cardTarget);
    const balObj = activeUserPocketBalances.find(p => p.card_id === cardTarget);
    const deficit = balObj ? Math.abs(Number(balObj.current_balance)) : 0;
    setReclaimAmount(defaultAmt ? String(defaultAmt) : deficit > 0 ? String(deficit) : "");
    setReclaimRemarks("");
    setReclaimSuccessMsg("");
    setReclaimErrorMsg("");
    setReclaimModalOpen(true);
  };

  const availableCashForReclaim = useMemo(() => {
    return Number(activeUserCardCashMap[selectedReclaimCardId] || 0);
  }, [activeUserCardCashMap, selectedReclaimCardId]);

  const handleConfirmReclaim = async () => {
    if (!selectedReclaimCardId) {
      setReclaimErrorMsg("Please select a card.");
      return;
    }
    const amt = Number(reclaimAmount);
    if (!amt || amt <= 0) {
      setReclaimErrorMsg("Enter a valid amount.");
      return;
    }

    if (amt > availableCashForReclaim) {
      setReclaimErrorMsg(`পর্যাপ্ত ব্যালেন্স নেই! আপনার available cash: ₹${availableCashForReclaim.toLocaleString("en-IN")}`);
      return;
    }

    setReclaimSubmitting(true);
    setReclaimErrorMsg("");
    setReclaimSuccessMsg("");

    try {
      const now = new Date().toISOString();
      const cardObj = cards.find(c => c.id === selectedReclaimCardId);
      const cardName = cardObj ? cardObj.card_name : "Card";

      // 1. Deduct from cash_on_hand
      const { data: curCoh } = await supabase
        .from("cash_on_hand")
        .select("current_balance")
        .eq("user_id", activeUserId)
        .eq("card_id", selectedReclaimCardId)
        .maybeSingle();

      const nextCoh = (Number(curCoh?.current_balance) || 0) - amt;
      await supabase
        .from("cash_on_hand")
        .upsert({ user_id: activeUserId, card_id: selectedReclaimCardId, current_balance: nextCoh, updated_at: now });

      // 2. Insert debit row into cash_on_hand_ledger
      await supabase.from("cash_on_hand_ledger").insert({
        user_id: activeUserId,
        card_id: selectedReclaimCardId,
        amount: amt,
        transaction_type: "debit",
        transaction_date: now,
        remarks: `Transferred to Pocket (Reclaimed advance for ${cardName})${reclaimRemarks.trim() ? `: ${reclaimRemarks.trim()}` : ""}`
      });

      // 3. Insert recovery row into pocket_advances_ledger
      await supabase.from("pocket_advances_ledger").insert({
        user_id: activeUserId,
        card_id: selectedReclaimCardId,
        amount: amt,
        entry_type: "recovery",
        transaction_date: now.slice(0, 10),
        remarks: `Reclaimed from Cash on Hand (Returned to pocket)${reclaimRemarks.trim() ? `: ${reclaimRemarks.trim()}` : ""}`
      });

      // 4. Update pocket_advances
      const { data: curAdv } = await supabase
        .from("pocket_advances")
        .select("current_balance")
        .eq("user_id", activeUserId)
        .eq("card_id", selectedReclaimCardId)
        .maybeSingle();

      const nextAdv = (Number(curAdv?.current_balance) || 0) + amt;
      await supabase
        .from("pocket_advances")
        .upsert({ user_id: activeUserId, card_id: selectedReclaimCardId, current_balance: nextAdv, updated_at: now });

      setReclaimSuccessMsg("Transferred to pocket successfully!");
      await fetchAllLedgers();
      setTimeout(() => {
        setReclaimModalOpen(false);
      }, 1000);
    } catch (err: any) {
      console.error("Error in reclaim transfer:", err);
      setReclaimErrorMsg(err.message || "Transfer failed. Please try again.");
    } finally {
      setReclaimSubmitting(false);
    }
  };

  // -------------------------
  // Cash Transfer Between Users Handlers
  // -------------------------
  const senderCashCards = useMemo(() => {
    return cards
      .map(c => ({
        ...c,
        balance: Number(activeUserCardCashMap[c.id] || 0),
      }))
      .filter(c => c.balance > 0);
  }, [cards, activeUserCardCashMap]);

  const handleOpenTransferModal = () => {
    setTransferSenderCardId(senderCashCards[0]?.id || "");
    const otherUser = profiles.find(p => p.id !== activeUserId);
    setTransferTargetUserId(otherUser?.id || "");
    setTransferReceiverCardId(cards[0]?.id || "");
    setTransferAmount("");
    setTransferRemarks("");
    setTransferErrorMsg("");
    setTransferSuccessMsg("");
    setTransferModalOpen(true);
  };

  const availableSenderCash = useMemo(() => {
    return Number(activeUserCardCashMap[transferSenderCardId] || 0);
  }, [activeUserCardCashMap, transferSenderCardId]);

  const handleConfirmTransfer = async () => {
    if (!transferSenderCardId) {
      setTransferErrorMsg("আপনার কার্ড নির্বাচন করুন।");
      return;
    }
    if (!transferTargetUserId || !transferReceiverCardId) {
      setTransferErrorMsg("প্রাপক ও কার্ড নির্বাচন করুন।");
      return;
    }
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) {
      setTransferErrorMsg("সঠিক পরিমাণ লিখুন।");
      return;
    }
    if (amt > availableSenderCash) {
      setTransferErrorMsg(`পর্যাপ্ত ব্যালেন্স নেই! আপনার available cash: ₹${availableSenderCash.toLocaleString("en-IN")}`);
      return;
    }

    setTransferSubmitting(true);
    setTransferErrorMsg("");
    setTransferSuccessMsg("");

    try {
      const now = new Date().toISOString();
      const targetUser = profiles.find(p => p.id === transferTargetUserId);
      const senderName = getUserName(activeUserId);
      const targetName = targetUser?.name || "Recipient";
      const note = transferRemarks.trim() || `Fund transfer to ${targetName}`;

      // 1. Sender Cash on Hand Deduct
      const { data: sRow } = await supabase.from("cash_on_hand")
        .select("current_balance")
        .eq("user_id", activeUserId).eq("card_id", transferSenderCardId).single();
      await supabase.from("cash_on_hand")
        .update({ current_balance: Number(sRow?.current_balance || 0) - amt, updated_at: now })
        .eq("user_id", activeUserId).eq("card_id", transferSenderCardId);

      // 2. Receiver Cash on Hand Credit
      const { data: rRow } = await supabase.from("cash_on_hand")
        .select("current_balance")
        .eq("user_id", transferTargetUserId).eq("card_id", transferReceiverCardId).maybeSingle();
      await supabase.from("cash_on_hand")
        .upsert({
          user_id: transferTargetUserId,
          card_id: transferReceiverCardId,
          current_balance: Number(rRow?.current_balance || 0) + amt,
          updated_at: now
        });

      // 3. Ledger Entries
      await supabase.from("cash_on_hand_ledger").insert({
        user_id: activeUserId,
        card_id: transferSenderCardId,
        amount: amt,
        transaction_type: "debit",
        transaction_date: now,
        remarks: `Transfer to ${targetName} — ${note}`,
      });
      await supabase.from("cash_on_hand_ledger").insert({
        user_id: transferTargetUserId,
        card_id: transferReceiverCardId,
        amount: amt,
        transaction_type: "credit",
        transaction_date: now,
        remarks: `Received from ${senderName} — ${note}`,
      });

      setTransferSuccessMsg(`₹${amt.toLocaleString("en-IN")} সফলভাবে ${targetName} কে পাঠানো হয়েছে!`);
      await fetchAllLedgers();
      setTimeout(() => {
        setTransferModalOpen(false);
      }, 1000);
    } catch (err: any) {
      console.error("Error executing cash transfer:", err);
      setTransferErrorMsg(err.message || "ট্রান্সফার ব্যর্থ হয়েছে।");
    } finally {
      setTransferSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">
      {/* ================= BACKGROUND GRID & AMBIENT LIGHTS ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-[-10%] right-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#0ea5e9] opacity-[0.16] blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[5%] left-[-25%] w-[100vw] h-[100vw] rounded-full bg-[#a855f7] opacity-[0.16] blur-[130px] mix-blend-screen" />
        <div className="absolute top-[30%] left-[15%] w-[60vw] h-[60vw] rounded-full bg-[#10b981] opacity-[0.12] blur-[100px] mix-blend-screen" />
      </div>

      {/* ================= HEADER (MATCHING TRANSACTIONS & SETTLEMENTS) ================= */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative z-50 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_20px_rgba(14,165,233,0.4)] cursor-pointer hover:scale-105 transition-transform overflow-hidden">
              <div className="w-full h-full bg-[#030014] rounded-full flex items-center justify-center relative overflow-hidden">
                {currentUser?.avatar_url && !imgError ? (
                  <img
                    src={currentUser.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-full"
                    style={{ aspectRatio: "1/1" }}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span className="text-sm font-black text-white">{currentUser?.name?.charAt(0) || "U"}</span>
                )}
              </div>
            </div>
          </Link>
          <div>
            <motion.div
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 5, ease: "linear", repeat: Infinity }}
              className="bg-[length:200%_200%] bg-gradient-to-r from-[#0ea5e9] via-[#a855f7] to-[#0ea5e9] bg-clip-text"
            >
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">Accounts & Dues</p>
            </motion.div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              Central Ledgers
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={() => fetchAllLedgers()}
            className="h-9 w-9 flex items-center justify-center bg-white/[0.03] border border-white/10 text-white rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md hover:bg-white/10 transition-colors"
            title="Refresh Ledgers"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#0ea5e9]" : "text-slate-300"}`} />
          </button>

          {/* Custom Header Dropdown — Card Filter */}
          <div className="relative">
            <button
              onClick={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/10 text-white text-[10px] font-bold py-2 pl-3 pr-3 rounded-xl outline-none focus:border-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.15)] backdrop-blur-md"
            >
              <span className="truncate max-w-[120px]">
                {globalSelectedCardIds.includes("all")
                  ? "All Cards"
                  : globalSelectedCardIds.length === 1
                    ? (() => {
                        const card = cards.find(c => c.id === globalSelectedCardIds[0]);
                        return card ? `${card.card_name} (**${card.last_4_digits})` : "Select Card";
                      })()
                    : `${globalSelectedCardIds.length} Cards`
                }
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isCardDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {isCardDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsCardDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 top-[calc(100%+8px)] w-60 bg-[#050505]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 py-1"
                    style={{ transformOrigin: "top right" }}
                  >
                    <button
                      onClick={() => {
                        setGlobalSelectedCardIds(["all"]);
                        setIsCardDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-xs font-bold transition-colors border-b border-white/5 flex items-center justify-between ${globalSelectedCardIds.includes("all") ? "text-[#0ea5e9] bg-[#0ea5e9]/10" : "text-slate-300 hover:bg-white/5"}`}
                    >
                      All Cards
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${globalSelectedCardIds.includes("all") ? "bg-[#0ea5e9] border-[#0ea5e9]" : "border-white/20"}`}>
                        {globalSelectedCardIds.includes("all") && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </button>
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                      {cards.map((c) => {
                        const isSelected = !globalSelectedCardIds.includes("all") && globalSelectedCardIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setGlobalSelectedCardIds([c.id]);
                              setIsCardDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-between ${isSelected ? "text-[#0ea5e9] bg-[#0ea5e9]/10" : "text-slate-300 hover:bg-white/5"}`}
                          >
                            <span className="truncate">{c.card_name} (**{c.last_4_digits})</span>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-[#0ea5e9] border-[#0ea5e9]" : "border-white/20"}`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {/* ================= MAIN CONTENT ================= */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-4 space-y-4">
        
        {/* User Switcher Pill Bar (Separates Users Cleanly with DPs) */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl">
          {profiles.map(p => {
            const isSelected = p.id === activeUserId;
            return (
              <button
                key={p.id}
                onClick={() => setActiveUserId(p.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-[#0ea5e9]/15 text-[#0ea5e9] border border-[#0ea5e9]/30 shadow-lg shadow-[#0ea5e9]/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-[10px] text-white shrink-0 border border-white/10">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{p.name.charAt(0)}</span>
                  )}
                </div>
                <span className="truncate">{p.name}</span>
                {currentUser?.id === p.id && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#0ea5e9]/20 text-[#0ea5e9] font-bold">
                    You
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 3-Tab Switcher */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
          <button
            onClick={() => handleTabChange("cash")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "cash"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Cash on Hand</span>
          </button>

          <button
            onClick={() => handleTabChange("spends")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "spends"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-lg shadow-amber-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Personal Spends</span>
          </button>

          <button
            onClick={() => handleTabChange("pocket")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "pocket"
                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Pocket Advances</span>
          </button>
        </div>

        {/* ============================================================ */}
        {/* SUMMARY CARD FOR ACTIVE TAB */}
        {/* ============================================================ */}
        {activeTab === "cash" && (
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400/80 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-400" />
                {getUserName(activeUserId)}'s Cash on Hand
              </span>
              <button
                type="button"
                onClick={handleOpenTransferModal}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                ক্যাশ ট্রান্সফার
              </button>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              ₹{totalUserCashOnHand.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              রোটেশন উইথড্র থেকে আসা ও কার্ডের বিল পরিশোধের জন্য রক্ষিত ক্যাশ।
            </p>

            {/* Card Breakdown for this user */}
            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
              {activeUserCashBalances.map(b => (
                <div key={b.card_id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-[11px] text-slate-400 font-medium truncate">{getCardName(b.card_id)}</p>
                  <p className="text-sm font-bold text-emerald-300 mt-0.5">
                    ₹{Number(b.current_balance).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
              {activeUserCashBalances.length === 0 && (
                <div className="col-span-2 text-center text-slate-500 text-xs py-2">
                  No cash balances on selected cards
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "spends" && (
          <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-amber-400" />
                {getUserName(activeUserId)}'s Personal Due
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">
                Personal Due
              </span>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              ₹{totalUserPersonalDue.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              কার্ডের লিমিট থেকে বা ক্যাশ ফান্ড থেকে নেওয়া ব্যক্তিগত খরচের অবশিষ্ট দেনা।
            </p>
          </div>
        )}

        {activeTab === "pocket" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 flex items-start gap-3">
              <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-purple-300">পকেট ফান্ড হিসাবের নিয়ম:</p>
                <p className="text-[11px] text-purple-300/80 leading-relaxed">
                  কার্ডে বিল দেওয়ার সময় নিজের পকেট থেকে দিলে তা একটি <strong>নেগেটিভ ব্যালেন্স</strong> হিসেবে থাকে (ঘাটতি)। রোটেশন তোলার পর ক্যাশ অন হ্যান্ড থেকে টাকা পকেটে ট্রান্সফার করলেই ব্যালেন্স স্বয়ংক্রিয়ভাবে <strong>₹০ (ক্লিয়ার)</strong> হয়ে যায়।
                </p>
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400/80 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-purple-400" />
                  {getUserName(activeUserId)}'s Pocket Advance
                </span>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
                    totalUserPocketBalance < 0
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {totalUserPocketBalance < 0 ? "পকেট ঘাটতি (Due from Pocket)" : "সব ক্লিয়ার (Zero Deficit)"}
                </span>
              </div>

              <div className="text-3xl font-black text-white tracking-tight">
                {totalUserPocketBalance < 0
                  ? `-₹${Math.abs(totalUserPocketBalance).toLocaleString("en-IN")}`
                  : `₹${totalUserPocketBalance.toLocaleString("en-IN")}`}
              </div>

              {/* Action Button: Reclaim from Cash on Hand */}
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  রোটেশন উইথড্রলের ক্যাশ টাকা থেকে পকেটে ফেরত নিয়ে ব্যালেন্স ক্লিয়ার করুন:
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenReclaim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/25 transition-all"
                >
                  <ArrowRight className="w-4 h-4" />
                  ক্যাশ অন হ্যান্ড থেকে পকেটে ট্রান্সফার
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="রিমার্কস বা টাকার অংক খুঁজুন..."
              value={activeTab === "cash" ? cashSearch : spendsSearch}
              onChange={e => activeTab === "cash" ? setCashSearch(e.target.value) : setSpendsSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
            />
          </div>

          {activeTab === "cash" && (
            <div className="flex gap-1.5">
              {(["all", "credit", "debit"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setCashFilterType(type)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                    cashFilterType === type
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-white/[0.02] text-slate-400 border border-white/5 hover:bg-white/5"
                  }`}
                >
                  {type === "all" ? "All Entries" : type === "credit" ? "Cash In (+)" : "Cash Out (-)"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* TIMELINE VIEW (DATE-WISE GROUPED WITH EXPANDABLE REMARKS) */}
        {/* ============================================================ */}
        <div className="space-y-6 pt-2">
          {loading ? (
            /* Skeleton Loading (No Spinners!) */
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/5" />
                    <div className="space-y-2">
                      <div className="w-24 h-3 bg-white/10 rounded" />
                      <div className="w-40 h-2.5 bg-white/5 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="w-16 h-3 bg-white/10 rounded ml-auto" />
                    <div className="w-10 h-2.5 bg-white/5 rounded ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedTimeline.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs border border-white/5 rounded-2xl">
              কোনো রেকর্ড পাওয়া যায়নি
            </div>
          ) : (
            groupedTimeline.map(group => (
              <div key={group.dateLabel} className="space-y-3">
                {/* Date Header Pill */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>{group.dateLabel}</span>
                  </div>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                {/* Timeline Connector Line & Nodes */}
                <div className="relative pl-4 space-y-2.5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                  {group.items.map((row: any) => {
                    const isExpanded = expandedRowId === row.id;
                    const isCredit = row.itemType === "cash" 
                      ? row.transaction_type === "credit"
                      : row.itemType === "spend"
                        ? Number(row.amount) < 0
                        : row.entry_type === "recovery" || Number(row.amount) > 0;

                    const amtDisplay = row.itemType === "spend"
                      ? Math.abs(Number(row.amount))
                      : Math.abs(Number(row.amount));

                    const dotColor = isCredit ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]";

                    return (
                      <div key={row.id} className="relative">
                        {/* Timeline Node Dot */}
                        <div className={`absolute -left-[14px] top-4 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-[#030014]`} />

                        {/* Interactive Card */}
                        <div
                          onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                          className={`p-3.5 rounded-2xl bg-white/[0.02] border transition-all cursor-pointer ${
                            isExpanded ? "border-white/20 bg-white/[0.04]" : "border-white/5 hover:border-white/15"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCredit
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/5 font-semibold truncate max-w-[140px]">
                                    {getCardName(row.card_id)}
                                  </span>
                                  {row.itemType === "pocket" && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isCredit ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                                      {isCredit ? "ক্যাশ রিকভারি (+)" : "পকেট অ্যাডভান্স (-)"}
                                    </span>
                                  )}
                                  {row.itemType === "spend" && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                                      {row.payment_method}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 truncate">
                                  {row.remarks || "No remarks"}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className={`text-sm font-black ${
                                  isCredit ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {isCredit ? "+" : "-"}₹{amtDisplay.toLocaleString("en-IN")}
                              </div>
                              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-0.5">
                                <span>
                                  {new Date(row.timelineDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                              </div>
                            </div>
                          </div>

                          {/* Expandable Remarks & Trace Flow */}
                          <div
                            style={{
                              maxHeight: isExpanded ? (activeTraceId === row.id ? "1400px" : "280px") : "0px",
                              opacity: isExpanded ? 1 : 0,
                              overflow: "hidden",
                              transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
                              marginTop: isExpanded ? "12px" : "0px"
                            }}
                          >
                            <div className="pt-3 border-t border-white/10 space-y-2 text-xs">
                              <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">বিস্তারিত বিবরণ (Remarks):</span>
                                <p className="text-slate-200 text-xs leading-relaxed">
                                  {row.remarks ? `"${row.remarks}"` : "কোনো অতিরিক্ত বিবরণ যোগ করা হয়নি।"}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-500">
                                  ID: {row.id.slice(0, 8)}...
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTraceId(activeTraceId === row.id ? null : row.id);
                                  }}
                                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                                    activeTraceId === row.id
                                      ? "bg-sky-500/25 text-sky-300 border-sky-400"
                                      : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30"
                                  }`}
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                  {activeTraceId === row.id ? "ট্রেস ফ্লো বন্ধ করুন" : "টাকার উৎস ও জার্নি দেখুন (Trace Flow)"}
                                </button>
                              </div>

                              {/* Inline Trace Card (Transparent backdrop, local to item) */}
                              {activeTraceId === row.id && (
                                <TransactionTraceInline
                                  target={{
                                    id: row.id,
                                    sourceType: row.itemType === "cash" ? "cash_ledger" : row.itemType === "spend" ? "spend" : "pocket_advance",
                                    title: `${getUserName(row.user_id)} ${row.itemType.toUpperCase()}`,
                                    amount: amtDisplay,
                                    date: row.timelineDate,
                                    remarks: row.remarks || ""
                                  }}
                                  onClose={() => setActiveTraceId(null)}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Load More sentinel */}
          {currentTabItems.length > visibleCount && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount(p => p + 30)}
                className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 font-semibold transition-colors"
              >
                আরো লোড করুন ({currentTabItems.length - visibleCount} বাকি)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================= RECLAIM POCKET ADVANCE MODAL ================= */}
      <AnimatePresence>
        {reclaimModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Modal Backdrop: Light Shadow, NO Blur */}
            <div
              onClick={() => !reclaimSubmitting && setReclaimModalOpen(false)}
              className="fixed inset-0 bg-black/75 shadow-2xl transition-opacity"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#0a0a10] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white">
                    পকেটে টাকা ফেরত নিন (Reclaim Advance)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getUserName(activeUserId)} এর ক্যাশ অন হ্যান্ড থেকে পকেটে টাকা ফেরত নিন।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !reclaimSubmitting && setReclaimModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reclaimErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reclaimErrorMsg}</span>
                </div>
              )}

              {reclaimSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{reclaimSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">কোন কার্ডের জন্য পকেট ক্লিয়ার করবেন?</label>
                  <select
                    value={selectedReclaimCardId}
                    onChange={e => {
                      setSelectedReclaimCardId(e.target.value);
                      const balObj = activeUserPocketBalances.find(p => p.card_id === e.target.value);
                      if (balObj && Number(balObj.current_balance) < 0) {
                        setReclaimAmount(String(Math.abs(Number(balObj.current_balance))));
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500"
                  >
                    {cards.map(c => {
                      const balObj = activeUserPocketBalances.find(p => p.card_id === c.id);
                      const deficit = balObj ? Number(balObj.current_balance) : 0;
                      return (
                        <option key={c.id} value={c.id} className="bg-[#121216]">
                          {c.card_name} (**{c.last_4_digits}) {deficit < 0 ? `[ঘাটতি: ₹${Math.abs(deficit)}]` : "[ক্লিয়ার]"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Available Balance Verification Display */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">নির্বাচিত কার্ডে Available Cash:</span>
                  <span className={`font-bold ${availableCashForReclaim > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ₹{availableCashForReclaim.toLocaleString("en-IN")}
                  </span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">টাকার পরিমাণ (₹)</label>
                  <input
                    type="number"
                    placeholder="পরিমাণ লিখুন..."
                    value={reclaimAmount}
                    onChange={e => setReclaimAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-base font-bold outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">রিমার্কস (ঐচ্ছিক)</label>
                  <input
                    type="text"
                    placeholder="যেমন: রোটেশন তোলার পর পকেটে ফেরত নিলাম"
                    value={reclaimRemarks}
                    onChange={e => setReclaimRemarks(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={reclaimSubmitting}
                  onClick={() => setReclaimModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-semibold hover:bg-white/5"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={reclaimSubmitting || availableCashForReclaim <= 0 || Number(reclaimAmount) > availableCashForReclaim}
                  onClick={handleConfirmReclaim}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {reclaimSubmitting ? "প্রসেস হচ্ছে..." : "ট্রান্সফার নিশ্চিত করুন"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= CASH TRANSFER MODAL (PEER-TO-PEER) ================= */}
      <AnimatePresence>
        {transferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Modal Backdrop: Light Shadow, NO Blur */}
            <div
              onClick={() => !transferSubmitting && setTransferModalOpen(false)}
              className="fixed inset-0 bg-black/75 shadow-2xl transition-opacity"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#0a0a10] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white">
                    ক্যাশ অন হ্যান্ড ট্রান্সফার
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getUserName(activeUserId)} থেকে অন্য ইউজারের কাছে ফান্ড পাঠান।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !transferSubmitting && setTransferModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {transferErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{transferErrorMsg}</span>
                </div>
              )}

              {transferSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{transferSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                {/* Sender Card Selection */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">আপনার কোন কার্ড থেকে পাঠাবেন?</label>
                  {senderCashCards.length === 0 ? (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
                      আপনার কোনো কার্ডে ক্যাশ ব্যালেন্স নেই।
                    </div>
                  ) : (
                    <select
                      value={transferSenderCardId}
                      onChange={e => setTransferSenderCardId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500"
                    >
                      {senderCashCards.map(c => (
                        <option key={c.id} value={c.id} className="bg-[#121216]">
                          {c.card_name} (**{c.last_4_digits}) — ব্যালেন্স: ₹{c.balance.toLocaleString("en-IN")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">Available Balance:</span>
                  <span className="font-bold text-emerald-400">
                    ₹{availableSenderCash.toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Recipient User */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">কাকে পাঠাবেন?</label>
                  <select
                    value={transferTargetUserId}
                    onChange={e => setTransferTargetUserId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500"
                  >
                    {profiles.filter(p => p.id !== activeUserId).map(p => (
                      <option key={p.id} value={p.id} className="bg-[#121216]">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Receiver Card */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">প্রাপকের কোন কার্ডে জমা হবে?</label>
                  <select
                    value={transferReceiverCardId}
                    onChange={e => setTransferReceiverCardId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500"
                  >
                    {cards.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#121216]">
                        {c.card_name} (**{c.last_4_digits})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">টাকার পরিমাণ (₹)</label>
                  <input
                    type="number"
                    placeholder="পরিমাণ লিখুন..."
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-base font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Remarks */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">রিমার্কস (ঐচ্ছিক)</label>
                  <input
                    type="text"
                    placeholder="যেমন: মামার দেওয়া টাকার ক্যাশ হস্তান্তর"
                    value={transferRemarks}
                    onChange={e => setTransferRemarks(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={transferSubmitting}
                  onClick={() => setTransferModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-semibold hover:bg-white/5"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={transferSubmitting || availableSenderCash <= 0 || Number(transferAmount) > availableSenderCash}
                  onClick={handleConfirmTransfer}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {transferSubmitting ? "প্রসেস হচ্ছে..." : "ট্রান্সফার পাঠান"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Global Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

export default function LedgersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#030014] flex items-center justify-center text-slate-500 text-xs">Loading ledgers...</div>}>
      <LedgersContent />
    </Suspense>
  );
}
