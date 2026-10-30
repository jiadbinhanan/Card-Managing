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
  X,
  Plus,
  Trash2,
  Wallet,
  CreditCard
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useCardStore } from "@/store/cardStore";
import { BottomNav } from "@/components/BottomNav";
import TransactionTraceInline, { type TraceTarget } from "@/components/TransactionTraceInline";
import { NotificationPanel } from "@/components/NotificationPanel";

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
  cash_source_breakdown?: { card_id: string; amount: number }[] | null;
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
  cash_source_breakdown?: { card_id: string; amount: number }[] | null;
  created_at: string;
}

interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string;
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
  const [cashSubCardFilter, setCashSubCardFilter] = useState<string>("all");
  const [cashSearch, setCashSearch] = useState("");

  // Spends States
  const [spends, setSpends] = useState<SpendRow[]>([]);
  const [spendsSubCardFilter, setSpendsSubCardFilter] = useState<string>("all");
  const [spendsSearch, setSpendsSearch] = useState("");

  // Pocket Advances States
  const [pocketBalances, setPocketBalances] = useState<PocketBalanceRow[]>([]);
  const [pocketLedger, setPocketLedger] = useState<PocketAdvanceRow[]>([]);

  // Reclaim Pocket Modal State (Cross-Card Reclaim)
  const [reclaimModalOpen, setReclaimModalOpen] = useState(false);
  const [selectedReclaimDebtCardId, setSelectedReclaimDebtCardId] = useState("");
  const [reclaimCashSources, setReclaimCashSources] = useState<CashSourceRow[]>([]);
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

  // Spend Modal State (Add Spend in Ledgers page)
  const [spendModalOpen, setSpendModalOpen] = useState(false);
  const [spendUserId, setSpendUserId] = useState<string>("");
  const [spendCardId, setSpendCardId] = useState<string>("");
  const [spendAmount, setSpendAmount] = useState<string>("");
  const [spendDate, setSpendDate] = useState<string>("");
  const [spendMethod, setSpendMethod] = useState<"credit_card" | "cash_on_hand">("credit_card");
  const [spendCashSources, setSpendCashSources] = useState<CashSourceRow[]>([]);
  const [spendRemarks, setSpendRemarks] = useState<string>("");
  const [spendSubmitting, setSpendSubmitting] = useState(false);
  const [spendSuccessMsg, setSpendSuccessMsg] = useState("");
  const [spendErrorMsg, setSpendErrorMsg] = useState("");

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

  // Reset card sub-filters whenever header card selection changes
  useEffect(() => {
    setCashSubCardFilter("all");
    setSpendsSubCardFilter("all");
  }, [globalSelectedCardIds]);

  // -------------------------
  // Card Family Computations for Cash on Hand
  // -------------------------
  const activeFamilyCards = useMemo(() => {
    if (globalSelectedCardIds.includes("all") || globalSelectedCardIds.length === 0) {
      return cards;
    }
    const primaryIds = new Set<string>();
    globalSelectedCardIds.forEach(id => {
      const card = cards.find(c => c.id === id);
      if (card) {
        const primId = card.is_primary ? card.id : (card.parent_card_id || card.id);
        primaryIds.add(primId);
      }
    });
    return cards.filter(c => primaryIds.has(c.id) || (c.parent_card_id && primaryIds.has(c.parent_card_id)));
  }, [cards, globalSelectedCardIds]);

  const activeFamilyCardIds = useMemo(() => {
    return activeFamilyCards.map(c => c.id);
  }, [activeFamilyCards]);

  const isCardFamilyActive = useMemo(() => {
    return !globalSelectedCardIds.includes("all") && activeFamilyCards.length > 1;
  }, [globalSelectedCardIds, activeFamilyCards]);

  const activeUserCardCashMap = useMemo(() => {
    const map: Record<string, number> = {};
    cashBalances.filter(b => b.user_id === activeUserId).forEach(b => {
      map[b.card_id] = Number(b.current_balance || 0);
    });
    return map;
  }, [cashBalances, activeUserId]);

  const displayedCashCards = useMemo(() => {
    if (globalSelectedCardIds.includes("all")) {
      const withBal = cards.filter(c => (activeUserCardCashMap[c.id] || 0) > 0);
      return withBal.length > 0 ? withBal : cards;
    }
    return activeFamilyCards;
  }, [globalSelectedCardIds, cards, activeFamilyCards, activeUserCardCashMap]);

  const totalUserCashOnHand = useMemo(() => {
    return activeFamilyCards.reduce((acc, c) => acc + (activeUserCardCashMap[c.id] || 0), 0);
  }, [activeFamilyCards, activeUserCardCashMap]);

  const filteredCashLedger = useMemo(() => {
    return cashLedger.filter(row => {
      if (row.user_id !== activeUserId) return false;
      // Must belong to the selected family (or all cards if 'all' is selected)
      if (!activeFamilyCardIds.includes(row.card_id)) return false;
      // Card sub-filter if specific card chosen within family
      if (isCardFamilyActive && cashSubCardFilter !== "all" && row.card_id !== cashSubCardFilter) {
        return false;
      }
      if (cashFilterType !== "all" && row.transaction_type !== cashFilterType) return false;
      if (cashSearch.trim()) {
        const q = cashSearch.toLowerCase();
        const rem = (row.remarks || "").toLowerCase();
        const amt = String(row.amount);
        if (!rem.includes(q) && !amt.includes(q)) return false;
      }
      return true;
    });
  }, [cashLedger, activeUserId, activeFamilyCardIds, isCardFamilyActive, cashSubCardFilter, cashFilterType, cashSearch]);

  const activeUserSpends = useMemo(() => {
    return spends.filter(s => s.user_id === activeUserId && activeFamilyCardIds.includes(s.card_id));
  }, [spends, activeUserId, activeFamilyCardIds]);

  const totalUserPersonalDue = useMemo(() => {
    return activeUserSpends.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [activeUserSpends]);

  const filteredSpends = useMemo(() => {
    return activeUserSpends.filter(row => {
      // Sub-card filter if specific card chosen within family
      if (isCardFamilyActive && spendsSubCardFilter !== "all" && row.card_id !== spendsSubCardFilter) {
        return false;
      }
      if (spendsSearch.trim()) {
        const q = spendsSearch.toLowerCase();
        const rem = (row.remarks || "").toLowerCase();
        const amt = String(row.amount);
        if (!rem.includes(q) && !amt.includes(q)) return false;
      }
      return true;
    });
  }, [activeUserSpends, isCardFamilyActive, spendsSubCardFilter, spendsSearch]);

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

  // Cross-Card Reclaim Handlers & Helpers
  const cardsWithAvailableCash = useMemo(() => {
    return cards
      .map(c => ({
        ...c,
        balance: Number(activeUserCardCashMap[c.id] || 0),
      }))
      .filter(c => c.balance > 0);
  }, [cards, activeUserCardCashMap]);

  const selectedDebtCardObj = useMemo(() => {
    return cards.find(c => c.id === selectedReclaimDebtCardId);
  }, [cards, selectedReclaimDebtCardId]);

  const selectedDebtBalance = useMemo(() => {
    const balObj = activeUserPocketBalances.find(p => p.card_id === selectedReclaimDebtCardId);
    return balObj ? Number(balObj.current_balance) : 0;
  }, [activeUserPocketBalances, selectedReclaimDebtCardId]);

  const selectedDebtDeficit = useMemo(() => {
    return selectedDebtBalance < 0 ? Math.abs(selectedDebtBalance) : 0;
  }, [selectedDebtBalance]);

  const totalReclaimAllocated = useMemo(() => {
    return reclaimCashSources.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  }, [reclaimCashSources]);

  const reclaimAllocationValid = useMemo(() => {
    if (totalReclaimAllocated <= 0) return false;
    for (const src of reclaimCashSources) {
      if (!src.cardId) return false;
      const amt = Number(src.amount) || 0;
      if (amt <= 0) return false;
      const avail = Number(activeUserCardCashMap[src.cardId] || 0);
      if (amt > avail) return false;
    }
    return true;
  }, [totalReclaimAllocated, reclaimCashSources, activeUserCardCashMap]);

  const handleOpenReclaim = (targetCardId?: string, defaultAmt?: number) => {
    // 1. Target debt card (card with negative pocket balance, or provided card)
    const cardTarget = targetCardId || activeUserPocketBalances.find(p => Number(p.current_balance) < 0)?.card_id || cards[0]?.id || "";
    setSelectedReclaimDebtCardId(cardTarget);

    const balObj = activeUserPocketBalances.find(p => p.card_id === cardTarget);
    const deficit = balObj ? Math.abs(Number(balObj.current_balance)) : 0;
    const needed = defaultAmt !== undefined ? defaultAmt : deficit > 0 ? deficit : 0;

    // 2. Pick primary or first card with available cash
    const availCashCards = cards.filter(c => (Number(activeUserCardCashMap[c.id]) || 0) > 0);
    const defaultSrcCard = availCashCards[0]?.id || cards[0]?.id || "";
    const firstAvail = Number(activeUserCardCashMap[defaultSrcCard] || 0);
    const firstAmt = needed > 0 ? (firstAvail > 0 ? Math.min(needed, firstAvail) : needed) : 0;

    setReclaimCashSources([
      {
        uid: `src-${Date.now()}`,
        cardId: defaultSrcCard,
        amount: firstAmt > 0 ? String(firstAmt) : "",
      }
    ]);
    setReclaimRemarks("");
    setReclaimSuccessMsg("");
    setReclaimErrorMsg("");
    setReclaimModalOpen(true);
  };

  const addReclaimSource = () => {
    const used = new Set(reclaimCashSources.map(s => s.cardId));
    const nextCard = cardsWithAvailableCash.find(c => !used.has(c.id));
    if (!nextCard) return;
    setReclaimCashSources(prev => [
      ...prev,
      { uid: `src-${Date.now()}-${Math.random()}`, cardId: nextCard.id, amount: "" }
    ]);
  };

  const updateReclaimSource = (idx: number, patch: Partial<CashSourceRow>) => {
    setReclaimCashSources(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeReclaimSource = (idx: number) => {
    setReclaimCashSources(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmReclaim = async () => {
    if (!selectedReclaimDebtCardId) {
      setReclaimErrorMsg("টার্গেট কার্ড নির্বাচন করুন।");
      return;
    }

    const validSources = reclaimCashSources.filter(s => s.cardId && Number(s.amount) > 0);
    if (validSources.length === 0) {
      setReclaimErrorMsg("কমপক্ষে একটি ক্যাশ সোর্স কার্ড ও পরিমাণ দিন।");
      return;
    }

    // Verify per-source balance
    for (const src of validSources) {
      const avail = Number(activeUserCardCashMap[src.cardId] || 0);
      const amt = Number(src.amount);
      if (amt > avail) {
        setReclaimErrorMsg(`${getCardName(src.cardId)}-এ পর্যাপ্ত ক্যাশ নেই! উপলব্ধ: ₹${avail.toLocaleString("en-IN")}`);
        return;
      }
    }

    const totalAmt = validSources.reduce((acc, s) => acc + Number(s.amount), 0);
    setReclaimSubmitting(true);
    setReclaimErrorMsg("");
    setReclaimSuccessMsg("");

    try {
      const sourcesPayload = validSources.map(s => ({
        card_id: s.cardId,
        amount: Number(s.amount)
      }));

      const { data, error } = await supabase.rpc("atomic_reclaim_pocket_advance", {
        p_user_id: activeUserId,
        p_target_card_id: selectedReclaimDebtCardId,
        p_total_amount: totalAmt,
        p_sources: sourcesPayload,
        p_remarks: reclaimRemarks.trim()
      });

      if (error) throw error;

      setReclaimSuccessMsg(`₹${totalAmt.toLocaleString("en-IN")} সফলভাবে পকেটে ফেরত নেওয়া হয়েছে!`);
      await fetchAllLedgers();
      setTimeout(() => {
        setReclaimModalOpen(false);
      }, 1000);
    } catch (err: any) {
      console.error("Error in cross-card reclaim:", err);
      setReclaimErrorMsg(err.message || "রিক্লেইম ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
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

      // Ledger Entries (Database trigger trg_sync_cash_on_hand automatically syncs cash_on_hand balance)
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

  // -------------------------
  // Spend Entry Modal Handlers (Ledgers Page)
  // -------------------------
  const spendUserCardCashMap = useMemo(() => {
    const map: Record<string, number> = {};
    cashBalances.filter(b => b.user_id === spendUserId).forEach(b => {
      map[b.card_id] = Number(b.current_balance || 0);
    });
    return map;
  }, [cashBalances, spendUserId]);

  const cardsWithCashForSpend = useMemo(() => {
    return cards
      .map(c => ({
        ...c,
        balance: spendUserCardCashMap[c.id] || 0,
      }))
      .filter(c => c.balance > 0);
  }, [cards, spendUserCardCashMap]);

  const handleOpenSpendModal = () => {
    const targetUid = activeUserId || profiles[0]?.id || "";
    setSpendUserId(targetUid);
    const defaultCard = (!globalSelectedCardIds.includes("all") && globalSelectedCardIds[0]) ? globalSelectedCardIds[0] : (cards[0]?.id || "");
    setSpendCardId(defaultCard);
    setSpendAmount("");
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    setSpendDate(todayStr);
    setSpendMethod("credit_card");
    setSpendRemarks("");
    setSpendErrorMsg("");
    setSpendSuccessMsg("");

    const userCashMap: Record<string, number> = {};
    cashBalances.filter(b => b.user_id === targetUid).forEach(b => {
      userCashMap[b.card_id] = Number(b.current_balance || 0);
    });
    const firstCashCard = cards.find(c => (userCashMap[c.id] || 0) > 0)?.id || defaultCard;
    setSpendCashSources([{ uid: `sp-src-${Date.now()}`, cardId: firstCashCard, amount: "" }]);

    setSpendModalOpen(true);
  };

  const handleSpendUserChange = (newUid: string) => {
    setSpendUserId(newUid);
    const userCashMap: Record<string, number> = {};
    cashBalances.filter(b => b.user_id === newUid).forEach(b => {
      userCashMap[b.card_id] = Number(b.current_balance || 0);
    });
    const firstCashCard = cards.find(c => (userCashMap[c.id] || 0) > 0)?.id || spendCardId;
    setSpendCashSources([{ uid: `sp-src-${Date.now()}`, cardId: firstCashCard, amount: "" }]);
  };

  const addSpendSource = () => {
    const used = new Set(spendCashSources.map(s => s.cardId));
    const nextCard = cardsWithCashForSpend.find(c => !used.has(c.id));
    if (!nextCard) return;
    setSpendCashSources(prev => [
      ...prev,
      { uid: `sp-src-${Date.now()}-${Math.random()}`, cardId: nextCard.id, amount: "" }
    ]);
  };

  const updateSpendSource = (idx: number, patch: Partial<CashSourceRow>) => {
    setSpendCashSources(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeSpendSource = (idx: number) => {
    setSpendCashSources(prev => prev.filter((_, i) => i !== idx));
  };

  const spendCashAllocatedTotal = useMemo(() => {
    return spendCashSources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [spendCashSources]);

  const spendAllocationValid = useMemo(() => {
    const amtNum = Number(spendAmount) || 0;
    if (amtNum <= 0) return false;
    if (spendCashAllocatedTotal !== amtNum) return false;
    for (const src of spendCashSources) {
      if (!src.cardId) return false;
      const val = Number(src.amount) || 0;
      if (val <= 0) return false;
      const bal = spendUserCardCashMap[src.cardId] || 0;
      if (val > bal) return false;
    }
    return true;
  }, [spendAmount, spendCashAllocatedTotal, spendCashSources, spendUserCardCashMap]);

  const handleConfirmSpend = async () => {
    const amtNum = Number(spendAmount);
    if (!spendAmount || isNaN(amtNum) || amtNum <= 0) {
      setSpendErrorMsg("সঠিক পরিমাণ লিখুন।");
      return;
    }
    if (!spendCardId) {
      setSpendErrorMsg("একটি কার্ড নির্বাচন করুন।");
      return;
    }
    if (spendMethod === "cash_on_hand" && !spendAllocationValid) {
      setSpendErrorMsg(`ক্যাশ বরাদ্দের পরিমাণ মোট খরচের সমান হতে হবে (মোট: ₹${amtNum.toLocaleString("en-IN")}, বরাদ্দ: ₹${spendCashAllocatedTotal.toLocaleString("en-IN")}) এবং কার্ড ব্যালেন্সের অতিরিক্ত হতে পারবে না।`);
      return;
    }

    setSpendSubmitting(true);
    setSpendErrorMsg("");
    setSpendSuccessMsg("");

    try {
      const finalDate = spendDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const validSources = spendCashSources
        .filter(s => s.cardId && Number(s.amount) > 0)
        .map(s => ({ card_id: s.cardId, amount: Number(s.amount) }));

      if (spendMethod === "cash_on_hand") {
        const { error: spErr } = await supabase.from("spends").insert({
          user_id: spendUserId,
          amount: amtNum,
          spend_type: "personal",
          payment_method: "cash_on_hand",
          remarks: spendRemarks.trim() || null,
          spend_date: finalDate,
          card_id: spendCardId,
          cash_source_breakdown: validSources
        });
        if (spErr) throw spErr;

        for (const src of validSources) {
          // Database trigger trg_sync_cash_on_hand automatically syncs cash_on_hand balance
          await supabase.from("cash_on_hand_ledger").insert({
            user_id: spendUserId,
            card_id: src.card_id,
            amount: src.amount,
            transaction_type: "debit",
            remarks: `Personal spend ${spendRemarks ? "- " + spendRemarks.trim() : ""}`,
            transaction_date: new Date().toISOString()
          });
        }
      } else {
        const { error: spErr } = await supabase.from("spends").insert({
          user_id: spendUserId,
          amount: amtNum,
          spend_type: "personal",
          payment_method: "credit_card",
          remarks: spendRemarks.trim() || null,
          spend_date: finalDate,
          card_id: spendCardId
        });
        if (spErr) throw spErr;
      }

      setSpendSuccessMsg(`₹${amtNum.toLocaleString("en-IN")} স্পেন্ড সফলভাবে রেকর্ড করা হয়েছে!`);
      await fetchAllLedgers();
      setTimeout(() => {
        setSpendModalOpen(false);
      }, 1000);
    } catch (err: any) {
      console.error("Error saving spend:", err);
      setSpendErrorMsg(err.message || "স্পেন্ড রেকর্ড করতে সমস্যা হয়েছে।");
    } finally {
      setSpendSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-36 overflow-x-hidden selection:bg-[#0ea5e9]/30">
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
        className="relative z-50 px-5 pt-9 pb-3.5 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex justify-between items-center"
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
          <NotificationPanel />
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

            {/* Pill-shaped breakdown of individual cards when multiple cards or card family is active */}
            {activeFamilyCards.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-emerald-500/15">
                {activeFamilyCards.map(c => {
                  const bal = activeUserCardCashMap[c.id] || 0;
                  return (
                    <div
                      key={c.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-xs shadow-sm backdrop-blur-sm"
                    >
                      <CreditCard className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="text-slate-300 font-medium">{c.card_name} (**{c.last_4_digits}):</span>
                      <span className="font-bold text-emerald-400">₹{bal.toLocaleString("en-IN")}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-2">
              রোটেশন উইথড্র থেকে আসা ও কার্ডের বিল পরিশোধের জন্য রক্ষিত ক্যাশ।
            </p>
          </div>
        )}

        {activeTab === "spends" && (
          <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-amber-400" />
                {getUserName(activeUserId)}'s Personal Due
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">
                  Personal Due
                </span>
                <button
                  type="button"
                  onClick={handleOpenSpendModal}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + স্পেন্ড এন্ট্রি
                </button>
              </div>
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
            <div className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
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

              {/* Card Family Sub-filter: Only shown when selected card belongs to a card family with >1 cards */}
              {isCardFamilyActive && (
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-white/5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5 flex items-center gap-1 shrink-0">
                    <CreditCard className="w-3 h-3 text-emerald-400" />
                    Card:
                  </span>
                  <button
                    onClick={() => setCashSubCardFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      cashSubCardFilter === "all"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                        : "bg-white/[0.03] text-slate-400 border border-white/5 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    All Family Cards ({activeFamilyCards.length})
                  </button>
                  {activeFamilyCards.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCashSubCardFilter(c.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all truncate max-w-[160px] ${
                        cashSubCardFilter === c.id
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                          : "bg-white/[0.03] text-slate-400 border border-white/5 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {c.card_name} (**{c.last_4_digits})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "spends" && isCardFamilyActive && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5 flex items-center gap-1 shrink-0">
                <CreditCard className="w-3 h-3 text-amber-400" />
                Card:
              </span>
              <button
                onClick={() => setSpendsSubCardFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  spendsSubCardFilter === "all"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "bg-white/[0.03] text-slate-400 border border-white/5 hover:bg-white/5 hover:text-white"
                }`}
              >
                All Family Cards ({activeFamilyCards.length})
              </button>
              {activeFamilyCards.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSpendsSubCardFilter(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all truncate max-w-[160px] ${
                    spendsSubCardFilter === c.id
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                      : "bg-white/[0.03] text-slate-400 border border-white/5 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {c.card_name} (**{c.last_4_digits})
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
                                    <>
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                                        {row.payment_method === "credit_card" ? "Credit Card" : "Cash on Hand"}
                                      </span>
                                      {row.cash_source_breakdown && row.cash_source_breakdown.length > 0 && row.cash_source_breakdown.some((b: any) => b.card_id !== row.card_id) && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                                          Cross-Card
                                        </span>
                                      )}
                                    </>
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
                              maxHeight: isExpanded ? (activeTraceId === row.id ? "1400px" : "380px") : "0px",
                              opacity: isExpanded ? 1 : 0,
                              overflow: "hidden",
                              transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
                              marginTop: isExpanded ? "12px" : "0px"
                            }}
                          >
                            <div className="pt-3 border-t border-white/10 space-y-2 text-xs">
                              {row.itemType === "spend" && row.cash_source_breakdown && row.cash_source_breakdown.length > 0 && (
                                <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    ক্যাশ সোর্স বিন্যাস (Cash Source Breakdown):
                                  </span>
                                  <div className="space-y-1">
                                    {row.cash_source_breakdown.map((b: any, bIdx: number) => (
                                      <div key={bIdx} className="flex items-center justify-between text-xs py-0.5 border-b border-white/[0.03] last:border-0">
                                        <span className="text-slate-300 font-medium">{getCardName(b.card_id)}</span>
                                        <span className="text-emerald-400 font-mono font-bold">₹{Number(b.amount).toLocaleString("en-IN")}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

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
              className="relative w-full max-w-lg bg-[#0a0a10] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-purple-400" />
                    পকেটে টাকা ফেরত নিন (Cross-Card Reclaim)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getUserName(activeUserId)} এর যেকোনো কার্ডের ক্যাশ অন হ্যান্ড থেকে পকেট অগ্রিম সমন্বয় করুন।
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

              <div className="space-y-4 text-xs">
                {/* 1. Target Debt Card */}
                <div>
                  <label className="text-slate-300 block mb-1.5 font-bold flex items-center justify-between">
                    <span>১. কোন কার্ডের পকেট বকেয়া ক্লিয়ার করবেন? (Target Card)</span>
                    {selectedDebtDeficit > 0 && (
                      <span className="text-rose-400 font-mono font-bold text-[11px]">
                        বকেয়া ঋণ: ₹{selectedDebtDeficit.toLocaleString("en-IN")}
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedReclaimDebtCardId}
                    onChange={e => {
                      const newId = e.target.value;
                      setSelectedReclaimDebtCardId(newId);
                      const balObj = activeUserPocketBalances.find(p => p.card_id === newId);
                      const def = balObj && Number(balObj.current_balance) < 0 ? Math.abs(Number(balObj.current_balance)) : 0;
                      if (def > 0 && reclaimCashSources.length === 1) {
                        const curSrcCard = reclaimCashSources[0]?.cardId;
                        const avail = curSrcCard ? Number(activeUserCardCashMap[curSrcCard] || 0) : 0;
                        updateReclaimSource(0, { amount: String(avail > 0 ? Math.min(def, avail) : def) });
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500 font-medium"
                  >
                    {cards.map(c => {
                      const balObj = activeUserPocketBalances.find(p => p.card_id === c.id);
                      const bal = balObj ? Number(balObj.current_balance) : 0;
                      return (
                        <option key={c.id} value={c.id} className="bg-[#121216]">
                          {c.card_name} (**{c.last_4_digits}) {bal < 0 ? `[বকেয়া ঋণ: ₹${Math.abs(bal).toLocaleString("en-IN")}]` : "[ক্লিয়ার • ₹0]"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Cash on Hand Source Allocation */}
                <div className="space-y-2 p-3.5 bg-white/[0.02] border border-white/10 rounded-2xl">
                  <div className="flex items-center justify-between pb-1">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                      <span>২. ক্যাশ অন হ্যান্ড সোর্স নির্ধারণ (Source Cards)</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      মোট বরাদ্দ: <strong className={reclaimAllocationValid ? "text-emerald-400" : "text-amber-400"}>₹{totalReclaimAllocated.toLocaleString("en-IN")}</strong>
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    যে কার্ডগুলোর ক্যাশ অন হ্যান্ড থেকে টাকা কেটে পকেটে ফেরত নেওয়া হবে:
                  </p>

                  <div className="space-y-2 pt-1">
                    {reclaimCashSources.map((src, idx) => {
                      const avail = Number(activeUserCardCashMap[src.cardId] || 0);
                      const srcAmt = Number(src.amount) || 0;
                      const isOver = srcAmt > avail;

                      return (
                        <div key={src.uid} className="flex items-center gap-2">
                          <select
                            value={src.cardId}
                            onChange={e => updateReclaimSource(idx, { cardId: e.target.value })}
                            className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-sky-500"
                          >
                            <option value="" className="bg-[#121216]">কার্ড নির্বাচন করুন...</option>
                            {cards.map(c => {
                              const cashBal = Number(activeUserCardCashMap[c.id] || 0);
                              return (
                                <option key={c.id} value={c.id} className="bg-[#121216]">
                                  {c.card_name} (**{c.last_4_digits}) — ক্যাশ: ₹{cashBal.toLocaleString("en-IN")}
                                </option>
                              );
                            })}
                          </select>

                          <div className="relative w-28">
                            <input
                              type="number"
                              placeholder="0"
                              value={src.amount}
                              onChange={e => updateReclaimSource(idx, { amount: e.target.value })}
                              className={`w-full pl-2.5 pr-10 py-2 bg-black/40 border rounded-xl text-xs font-bold text-white outline-none ${
                                isOver ? "border-rose-500 text-rose-300" : "border-white/10 focus:border-sky-500"
                              }`}
                            />
                              <button
                                type="button"
                                onClick={() => {
                                  const otherAllocated = reclaimCashSources.reduce((sum, s, i) => (i !== idx ? sum + (Number(s.amount) || 0) : sum), 0);
                                  const remainingNeeded = selectedDebtDeficit > 0 ? Math.max(0, selectedDebtDeficit - otherAllocated) : 0;
                                  const targetCap = remainingNeeded > 0 ? remainingNeeded : (selectedDebtDeficit > 0 ? selectedDebtDeficit : avail);
                                  const maxAllowed = Math.min(avail, targetCap);
                                  updateReclaimSource(idx, { amount: String(maxAllowed > 0 ? maxAllowed : avail) });
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-black text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded transition-colors"
                              >
                                MAX
                              </button>
                          </div>

                          {reclaimCashSources.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeReclaimSource(idx)}
                              className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addReclaimSource}
                    disabled={reclaimCashSources.length >= cardsWithAvailableCash.length}
                    className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 border border-dashed border-sky-500/20 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    আরেকটি ক্যাশ সোর্স যোগ করুন (+ Add Another Cash Source)
                  </button>
                </div>

                {/* 3. Remarks */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">রিমার্কস (ঐচ্ছিক বিবরণ)</label>
                  <input
                    type="text"
                    placeholder="যেমন: রোটেশন তোলার পর ক্যাশ থেকে পকেটে শোধ করলাম"
                    value={reclaimRemarks}
                    onChange={e => setReclaimRemarks(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  disabled={reclaimSubmitting}
                  onClick={() => setReclaimModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={reclaimSubmitting || !reclaimAllocationValid}
                  onClick={handleConfirmReclaim}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors disabled:opacity-40 shadow-lg shadow-purple-600/20"
                >
                  {reclaimSubmitting ? "প্রসেস হচ্ছে..." : `₹${totalReclaimAllocated.toLocaleString("en-IN")} ট্রান্সফার নিশ্চিত করুন`}
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

      {/* ================= SPEND ENTRY MODAL ================= */}
      <AnimatePresence>
        {spendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              onClick={() => !spendSubmitting && setSpendModalOpen(false)}
              className="fixed inset-0 bg-black/75 shadow-2xl transition-opacity"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0a0a10] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    নতুন স্পেন্ড এন্ট্রি
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    কার্ড বা ক্যাশ অন হ্যান্ড থেকে ব্যক্তিগত খরচ রেকর্ড করুন।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !spendSubmitting && setSpendModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {spendErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{spendErrorMsg}</span>
                </div>
              )}

              {spendSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{spendSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-4 text-xs">
                {/* 1. User Selection */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">ইউজার (কার নামে খরচ?)</label>
                  <select
                    value={spendUserId}
                    onChange={e => handleSpendUserChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-medium outline-none focus:border-amber-500"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#121216]">
                        {p.name} {p.id === currentUser?.id ? "(You)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Target Attached Card */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">সংযুক্ত কার্ড (Attached Card)</label>
                  <select
                    value={spendCardId}
                    onChange={e => setSpendCardId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-medium outline-none focus:border-amber-500"
                  >
                    <option value="" disabled className="bg-[#121216]">একটি কার্ড নির্বাচন করুন...</option>
                    {cards.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#121216]">
                        {c.is_primary ? "" : "↳ "}{c.card_name} (**{c.last_4_digits})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Amount & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-semibold">টাকার পরিমাণ (₹)</label>
                    <input
                      type="number"
                      placeholder="যেমন: 5000"
                      value={spendAmount}
                      onChange={e => setSpendAmount(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-base font-bold outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-semibold">তারিখ</label>
                    <input
                      type="date"
                      value={spendDate}
                      onChange={e => setSpendDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-medium outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* 4. Payment Method */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold flex justify-between">
                    পেমেন্ট সোর্স
                    <span className="text-[10px] text-amber-400 font-normal">Cross-card supported for Cash</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSpendMethod("credit_card")}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                        spendMethod === "credit_card"
                          ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                          : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <CreditCard className="w-4 h-4" />
                        <span className="text-xs font-bold">Direct Card</span>
                      </div>
                      <span className="text-[9px] font-medium opacity-70">কার্ড লিমিট ব্যবহার</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpendMethod("cash_on_hand")}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${
                        spendMethod === "cash_on_hand"
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                          : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Banknote className="w-4 h-4" />
                        <span className="text-xs font-bold">Cash on Hand</span>
                      </div>
                      <span className="text-[9px] font-medium opacity-70">মাল্টি-কার্ড ক্যাশ</span>
                    </button>
                  </div>
                </div>

                {/* 5. Multi-Source Cash Breakdown (when Cash on Hand selected) */}
                {spendMethod === "cash_on_hand" && (
                  <div className="space-y-3 p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <div className={`flex justify-between items-center px-3 py-2 rounded-xl text-[11px] font-black ${
                      spendAllocationValid ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                    }`}>
                      <span className="uppercase tracking-wider">Allocated Cash</span>
                      <span>₹{spendCashAllocatedTotal.toLocaleString("en-IN")} / ₹{(Number(spendAmount) || 0).toLocaleString("en-IN")}</span>
                    </div>

                    <div className="space-y-2">
                      {spendCashSources.map((src, idx) => {
                        const bal = spendUserCardCashMap[src.cardId] || 0;
                        const over = Number(src.amount || 0) > bal;
                        const amtNum = Number(spendAmount) || 0;
                        return (
                          <div key={src.uid} className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <select
                                value={src.cardId}
                                onChange={e => updateSpendSource(idx, { cardId: e.target.value })}
                                className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] font-bold text-white pl-3 pr-7 outline-none focus:border-amber-500 appearance-none"
                              >
                                <option value="" className="bg-[#121216]">কার্ড বেছে নিন...</option>
                                {cardsWithCashForSpend
                                  .filter(c => c.id === src.cardId || !spendCashSources.some(s => s.cardId === c.id))
                                  .map(c => (
                                    <option key={c.id} value={c.id} className="bg-[#121216]">
                                      {c.card_name} (**{c.last_4_digits}) — ₹{(spendUserCardCashMap[c.id] || 0).toLocaleString("en-IN")}
                                    </option>
                                  ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                            <input
                              type="number"
                              value={src.amount}
                              onChange={e => updateSpendSource(idx, { amount: e.target.value })}
                              placeholder="0"
                              className={`w-24 h-10 bg-white/[0.03] border rounded-xl text-center text-xs font-bold text-white outline-none ${
                                over ? "border-rose-500" : "border-white/10 focus:border-amber-500"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const otherAllocated = spendCashSources.reduce((sum, s, i) => (i !== idx ? sum + (Number(s.amount) || 0) : sum), 0);
                                const remainingNeeded = amtNum > 0 ? Math.max(0, amtNum - otherAllocated) : 0;
                                const targetCap = remainingNeeded > 0 ? remainingNeeded : (amtNum > 0 ? amtNum : bal);
                                const maxVal = Math.min(bal, targetCap);
                                updateSpendSource(idx, { amount: String(maxVal > 0 ? maxVal : bal) });
                              }}
                              className="h-10 px-2 text-[9px] font-black text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg shrink-0 transition-colors"
                            >
                              MAX
                            </button>
                            {spendCashSources.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSpendSource(idx)}
                                className="h-10 w-8 flex items-center justify-center text-slate-500 hover:text-rose-400 shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={addSpendSource}
                      disabled={spendCashSources.length >= cardsWithCashForSpend.length}
                      className="w-full py-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 border border-dashed border-amber-500/20 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      আরেকটি কার্ডের ক্যাশ যোগ করুন (+ Add Source)
                    </button>
                  </div>
                )}

                {/* 6. Remarks */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-semibold">রিমার্কস (খরচের বিবরণ)</label>
                  <input
                    type="text"
                    placeholder="যেমন: অনলাইন শপিং, ডিনার বা ব্যক্তিগত খরচ"
                    value={spendRemarks}
                    onChange={e => setSpendRemarks(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  disabled={spendSubmitting}
                  onClick={() => setSpendModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={spendSubmitting || !spendAmount || Number(spendAmount) <= 0 || (spendMethod === "cash_on_hand" && !spendAllocationValid)}
                  onClick={handleConfirmSpend}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-40 shadow-lg shadow-amber-600/20"
                >
                  {spendSubmitting ? "সংরক্ষণ হচ্ছে..." : "স্পেন্ড কনফার্ম করুন"}
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
