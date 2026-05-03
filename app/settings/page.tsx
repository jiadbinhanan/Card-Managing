"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";
import { 
  Bell, 
  CreditCard, 
  Edit3, 
  LogOut, 
  Moon, 
  Phone, 
  User,
  Settings as SettingsIcon,
  Camera,
  Plus,
  ShieldCheck,
  CalendarDays,
  Smartphone,
  ChevronRight,
  Hash,
  ShieldAlert,
  CalendarClock,
  Eye,
  UserPlus,
  AlertTriangle,
  Link as LinkIcon,
  X,
  Check
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  name: string;
  phone: string;
  avatar_url: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  network: string;
  bill_gen_day: number;
  bill_due_day: number;
  parent_card_id?: string;
  holder_name?: string;
  card_number?: string;
  expiry?: string;
  cvv?: string;
}

// ─── Multi-User Picker Component ──────────────────────────────────────────────
interface UserPickerProps {
  allProfiles: Profile[];
  currentUserId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  accentColor: string;
  cleanUrl: (url?: string | null) => string;
}

function UserPicker({ allProfiles, currentUserId, selectedIds, onChange, label, accentColor, cleanUrl }: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: string) => {
    if (id === currentUserId) return; // owner cannot be removed
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(s => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedProfiles = allProfiles.filter(p => selectedIds.includes(p.id));

  const accentClass = accentColor === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
    : "border-[#a855f7]/40 bg-[#a855f7]/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]";
  const accentFocus = accentColor === "emerald" ? "border-emerald-400" : "border-[#a855f7]";
  const labelColor = accentColor === "emerald" ? "text-emerald-400" : "text-[#a855f7]";
  const checkColor = accentColor === "emerald" ? "bg-emerald-500" : "bg-[#a855f7]";

  return (
    <div className="space-y-1.5 pt-2" ref={ref}>
      <label className={`text-[11px] font-bold ${labelColor} uppercase tracking-wider ml-1 flex items-center gap-1`}>
        <UserPlus className="w-3 h-3" /> {label}
      </label>

      {/* Selected chips */}
      {selectedProfiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedProfiles.map(p => {
            const isOwnerSelf = p.id === currentUserId;
            const avatarUrl = cleanUrl(p.avatar_url);
            return (
              <div key={p.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border ${accentClass} text-xs font-bold text-white`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={p.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-white/20" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">{p.name.charAt(0)}</div>
                )}
                <span>{p.name}</span>
                {isOwnerSelf && <span className="text-[9px] opacity-60">(you)</span>}
                {!isOwnerSelf && (
                  <button onClick={() => toggle(p.id)} className="ml-0.5 text-white/50 hover:text-white/90 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full h-14 flex items-center px-4 rounded-2xl border ${accentClass} text-sm font-bold text-slate-400 text-left transition-colors ${open ? accentFocus : ''}`}
      >
        <UserPlus className="w-4 h-4 mr-2 opacity-60" />
        {selectedProfiles.length === 0 ? "Select users..." : `${selectedProfiles.length} user(s) selected`}
        <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {/* Dropdown list */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-1 rounded-2xl border border-white/10 bg-[#0a0a1a]/95 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50"
          >
            {allProfiles.map(p => {
              const isSelected = selectedIds.includes(p.id);
              const isSelf = p.id === currentUserId;
              const avatarUrl = cleanUrl(p.avatar_url);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { toggle(p.id); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${isSelf ? 'opacity-70 cursor-default' : ''}`}
                >
                  <div className="relative flex-shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={p.name} className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#0ea5e9] flex items-center justify-center text-sm font-black text-white">
                        {p.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{isSelf ? "You (owner)" : p.phone || "Member"}</div>
                  </div>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full ${checkColor} flex items-center justify-center flex-shrink-0`}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Modals
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);

  // Profile Form States
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Card Form States
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [viewingCard, setViewingCard] = useState<CardData | null>(null);
  const [cardName, setCardName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [network, setNetwork] = useState("RuPay");
  const [billGenDay, setBillGenDay] = useState("");
  const [billDueDay, setBillDueDay] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [parentCardId, setParentCardId] = useState("");
  // Multi-owner: array of user IDs who get 'owner' access
  const [ownerUserIds, setOwnerUserIds] = useState<string[]>([]);
  const [isSavingCard, setIsSavingCard] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const cleanUrl = (url?: string | null) => {
    if (!url) return "";
    return url.trim().replace(/^['"]|['"]$/g, '');
  };

  useEffect(() => {
    if (!isPrimary && parentCardId) {
      const parent = cards.find(c => c.id === parentCardId);
      if (parent) {
        setCardName(parent.card_name);
        setTotalLimit(parent.total_limit.toString());
        setNetwork(parent.network || "RuPay");
        setBillGenDay(parent.bill_gen_day?.toString() || "");
        setBillDueDay(parent.bill_due_day?.toString() || "");
      }
    }
  }, [parentCardId, isPrimary, cards]);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profData } = await supabase.from('profiles').select('*');
      if (profData) {
        setAllProfiles(profData);
        const myProfile = profData.find(p => p.id === user.id);
        if (myProfile) {
          setCurrentUser({ ...myProfile, avatar_url: cleanUrl(myProfile.avatar_url) });
          setEditName(myProfile.name);
          setEditPhone(myProfile.phone || "");
        }
      }

      const { data: accessData } = await supabase.from('card_access').select('card_id').eq('user_id', user.id);

      if (accessData && accessData.length > 0) {
        const cardIds = accessData.map(a => a.card_id);
        const { data: cardData } = await supabase.from('cards').select('*').in('id', cardIds).order('is_primary', { ascending: false });
        if (cardData) setCards(cardData);
      } else {
        setCards([]);
      }
    }
    setIsLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingAvatar(true);
      const file = e.target.files?.[0];
      if (!file || !currentUser) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${currentUser.id}-${Math.random()}.${fileExt}`;
      const filePath = `profiles/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('qr-vault').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('qr-vault').getPublicUrl(filePath);

      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
      setCurrentUser({ ...currentUser, avatar_url: data.publicUrl });
      setImgError(false);
      fetchData();
    } catch (error: any) {
      alert("Error uploading avatar: " + error.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    await supabase.from('profiles').update({ name: editName, phone: editPhone }).eq('id', currentUser.id);
    setCurrentUser({ ...currentUser, name: editName, phone: editPhone });
    setIsProfileModalOpen(false);
  };

  const openAddCardModal = () => {
    setEditingCard(null);
    setCardName("");
    setHolderName(currentUser?.name || "");
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setTotalLimit("");
    setNetwork("RuPay");
    setBillGenDay("");
    setBillDueDay("");
    setIsPrimary(true);
    setParentCardId("");
    // Default: current user is always owner
    setOwnerUserIds(currentUser ? [currentUser.id] : []);
    setIsCardModalOpen(true);
  };

  const openEditCardModal = async (card: CardData) => {
    setEditingCard(card);
    setCardName(card.card_name);
    setHolderName(card.holder_name || "");
    setCardNumber(card.card_number || "");
    setExpiry(card.expiry || "");
    setCvv(card.cvv || "");
    setTotalLimit(card.total_limit.toString());
    setNetwork(card.network || "RuPay");
    setBillGenDay(card.bill_gen_day?.toString() || "");
    setBillDueDay(card.bill_due_day?.toString() || "");
    setIsPrimary(card.is_primary);
    setParentCardId(card.parent_card_id || "");

    // Fetch existing access list for this card
    const { data: existingAccess } = await supabase
      .from('card_access')
      .select('user_id, role')
      .eq('card_id', card.id);

    if (existingAccess) {
      const ownerIds = existingAccess.map(a => a.user_id);
      // Make sure current user is always in the list
      if (currentUser && !ownerIds.includes(currentUser.id)) {
        ownerIds.push(currentUser.id);
      }
      setOwnerUserIds(ownerIds);
    } else {
      setOwnerUserIds(currentUser ? [currentUser.id] : []);
    }

    setIsCardModalOpen(true);
  };

  const handleSaveCard = async () => {
    if (!cardName || !cardNumber || !totalLimit || !billGenDay || !billDueDay || !currentUser) {
      alert("Please fill all mandatory fields.");
      return;
    }

    setIsSavingCard(true);
    try {
      const last_4_digits = cardNumber.slice(-4);

      const cardPayload = {
        card_name: cardName,
        holder_name: holderName,
        card_number: cardNumber,
        expiry: expiry,
        cvv: cvv,
        total_limit: Number(totalLimit),
        network: network,
        bill_gen_day: Number(billGenDay),
        bill_due_day: Number(billDueDay),
        is_primary: isPrimary,
        parent_card_id: !isPrimary && parentCardId ? parentCardId : null,
        last_4_digits: last_4_digits
      };

      if (editingCard) {
        // ── EDIT MODE ──
        await supabase.from('cards').update(cardPayload).eq('id', editingCard.id);

        // Fetch old access rows
        const { data: oldAccess } = await supabase
          .from('card_access')
          .select('user_id')
          .eq('card_id', editingCard.id);

        const oldIds = (oldAccess || []).map(a => a.user_id);

        // Remove users no longer in list (except current owner can't remove themselves)
        const toRemove = oldIds.filter(id => !ownerUserIds.includes(id) && id !== currentUser.id);
        for (const uid of toRemove) {
          await supabase.from('card_access').delete()
            .eq('card_id', editingCard.id)
            .eq('user_id', uid);
        }

        // Upsert all selected users as 'owner' for primary, 'shared' for sub
        const role = isPrimary ? 'owner' : 'shared';
        for (const uid of ownerUserIds) {
          await supabase.from('card_access').upsert({
            card_id: editingCard.id,
            user_id: uid,
            role: uid === currentUser.id ? 'owner' : role
          }, { onConflict: 'card_id,user_id' });
        }

        // For sub-card: also give access to parent card
        if (!isPrimary && parentCardId) {
          for (const uid of ownerUserIds) {
            if (uid !== currentUser.id) {
              await supabase.from('card_access').upsert({
                card_id: parentCardId,
                user_id: uid,
                role: 'shared'
              }, { onConflict: 'card_id,user_id' });
            }
          }
        }

      } else {
        // ── ADD MODE ──
        const { data: newCard, error: insertError } = await supabase
          .from('cards')
          .insert(cardPayload)
          .select()
          .single();
        if (insertError) throw insertError;

        // Give current user 'owner' access always
        await supabase.from('card_access').insert({
          card_id: newCard.id,
          user_id: currentUser.id,
          role: 'owner'
        });

        // Give all other selected users access
        const role = isPrimary ? 'owner' : 'shared';
        for (const uid of ownerUserIds) {
          if (uid !== currentUser.id) {
            await supabase.from('card_access').upsert({
              card_id: newCard.id,
              user_id: uid,
              role: role
            }, { onConflict: 'card_id,user_id' });

            // For sub-card: also grant parent access
            if (!isPrimary && parentCardId) {
              await supabase.from('card_access').upsert({
                card_id: parentCardId,
                user_id: uid,
                role: 'shared'
              }, { onConflict: 'card_id,user_id' });
            }
          }
        }
      }

      setIsCardModalOpen(false);
      fetchData();
    } catch (error: any) {
      alert("Error saving card: " + error.message);
    } finally {
      setIsSavingCard(false);
    }
  };

  const formatCardNumber = (num: string) => {
    const cleaned = num.replace(/\D/g, '');
    const chunks = [];
    for (let i = 0; i < cleaned.length; i += 4) {
      chunks.push(cleaned.substring(i, i + 4));
    }
    return chunks.join(' ');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
  };

  const isInherited = !isPrimary && parentCardId !== "";

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-50 font-sans pb-28 overflow-x-hidden selection:bg-[#0ea5e9]/30">

      {/* ================= EXTREME GLOWING BACKGROUND ================= */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e51a_1px,transparent_1px),linear-gradient(to_bottom,#4f46e51a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <motion.div animate={{ x: [0, -40, 40, 0], y: [0, 50, -50, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute top-[-10%] left-[-20%] w-[90vw] h-[90vw] rounded-full bg-[#0ea5e9] opacity-[0.12] blur-[120px] mix-blend-screen" />
        <motion.div animate={{ x: [0, 50, -50, 0], y: [0, -60, 60, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} className="absolute bottom-[5%] right-[-15%] w-[100vw] h-[100vw] rounded-full bg-[#a855f7] opacity-[0.12] blur-[130px] mix-blend-screen" />
      </div>

      {/* ================= HEADER ================= */}
      <header className="relative z-10 px-5 pt-8 pb-3 sticky top-0 bg-[#030014]/70 backdrop-blur-3xl border-b border-white/5 shadow-[0_15px_40px_rgba(0,0,0,0.8)]">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div>
            <motion.div
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 5, ease: "linear", repeat: Infinity }}
              className="bg-[length:200%_200%] bg-gradient-to-r from-[#0ea5e9] via-[#a855f7] to-[#0ea5e9] bg-clip-text"
            >
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5 text-transparent">
                Control Center
              </p>
            </motion.div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              Settings & Profile
            </h1>
          </div>
          <div className="p-2 bg-white/[0.03] rounded-xl border border-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.2)] flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-slate-300" />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-4 pt-6 max-w-md mx-auto">

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0ea5e9]"></div>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">

            {/* ================= PROFILE MANAGEMENT ================= */}
            <motion.section variants={itemVariants} className="space-y-3">
              <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#d946ef] uppercase tracking-wider flex items-center gap-2 drop-shadow-[0_0_15px_rgba(168,85,247,0.4)] px-1">
                <User className="w-4 h-4 text-[#a855f7]" /> Identity
              </h2>

              <div className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 rounded-[28px] p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden relative">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#a855f7]/20 rounded-full blur-[40px] pointer-events-none" />

                <div className="flex items-center gap-5 relative z-10">
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#a855f7] to-[#0ea5e9] p-0.5 shadow-[0_0_25px_rgba(168,85,247,0.4)]">
                      <div className="w-full h-full bg-[#030014] rounded-2xl flex items-center justify-center overflow-hidden relative">
                        {currentUser?.avatar_url && !imgError ? (
                          <img
                            src={currentUser.avatar_url}
                            alt="Profile"
                            className={`w-full h-full object-cover ${uploadingAvatar ? 'opacity-50' : ''}`}
                            style={{ aspectRatio: '1/1' }}
                            onError={() => setImgError(true)}
                          />
                        ) : (
                          <span className="text-2xl font-black text-white">{currentUser?.name?.charAt(0) || 'U'}</span>
                        )}
                      </div>
                    </div>
                    <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-white text-black rounded-xl flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.5)] hover:scale-110 transition-transform">
                      <Camera className="w-4 h-4" />
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="hidden" />
                    </label>
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-black text-white leading-tight mb-1">{currentUser?.name}</h3>
                    <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Smartphone className="w-3 h-3 text-[#0ea5e9]" /> {currentUser?.phone || "No phone added"}</p>
                    <Button onClick={() => setIsProfileModalOpen(true)} size="sm" className="mt-3 h-8 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg border border-white/10 transition-all shadow-inner">
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
                    </Button>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* ================= CARD MANAGEMENT SECTION ================= */}
            <motion.section variants={itemVariants} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] uppercase tracking-wider flex items-center gap-2 drop-shadow-[0_0_15px_rgba(14,165,233,0.4)]">
                  <CreditCard className="w-4 h-4 text-[#0ea5e9]" /> My Vault Cards
                </h2>
                <button onClick={openAddCardModal} className="text-[10px] font-bold bg-[#0ea5e9]/10 text-[#0ea5e9] px-2 py-1 rounded-md border border-[#0ea5e9]/20 flex items-center gap-1 hover:bg-[#0ea5e9]/20 transition-colors">
                  <Plus className="w-3 h-3" /> Add Card
                </button>
              </div>

              <div className="space-y-4">
                {cards.map((card) => {
                  const isPrimaryCard = card.is_primary;
                  const gradient = isPrimaryCard ? "from-[#0ea5e9]/15 to-transparent" : "from-[#a855f7]/15 to-transparent";
                  const border = isPrimaryCard ? "border-[#0ea5e9]/40" : "border-[#a855f7]/40";
                  const shadow = isPrimaryCard ? "shadow-[0_10px_40px_rgba(14,165,233,0.15)]" : "shadow-[0_10px_40px_rgba(168,85,247,0.15)]";

                  return (
                    <motion.div
                      key={card.id}
                      className={`relative p-5 rounded-[28px] overflow-hidden border ${border} bg-white/[0.02] backdrop-blur-xl ${shadow} group`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} z-0 opacity-50`} />
                      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] opacity-20 pointer-events-none ${isPrimaryCard ? 'bg-[#0ea5e9]' : 'bg-[#a855f7]'}`} />

                      <div className="relative z-10 flex justify-between items-start mb-6">
                        <div>
                          <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isPrimaryCard ? 'text-[#0ea5e9]' : 'text-[#a855f7]'}`}>
                            {isPrimaryCard ? 'Primary Card' : 'Sub Card'}
                          </div>
                          <h3 className="text-base font-bold text-white tracking-wide">{card.card_name}</h3>
                        </div>
                        <div className="h-6 px-2 bg-black/40 rounded flex items-center justify-center border border-white/10 text-[10px] font-black italic text-slate-300">
                          {card.network || "RuPay"}
                        </div>
                      </div>

                      <div className="relative z-10 flex justify-between items-end">
                        <div>
                          <div className="text-xl font-space font-black tracking-widest text-slate-200 drop-shadow-md mb-2">
                            **** **** **** {card.last_4_digits || "XXXX"}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 text-slate-500" /> Gen: {card.bill_gen_day}th</span>
                            <span className="flex items-center gap-1 text-rose-400/80"><AlertTriangle className="w-3 h-3 text-rose-500/80" /> Due: {card.bill_due_day}th</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Total Limit</div>
                          <div className="text-sm font-black text-white bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                            ₹{card.total_limit.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10 relative z-10">
                        <Button
                          onClick={() => { setViewingCard(card); setIsViewDetailsOpen(true); }}
                          size="sm"
                          className="bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> View Details
                        </Button>
                        <Button
                          onClick={() => openEditCardModal(card)}
                          size="sm"
                          className="bg-transparent hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
                {cards.length === 0 && (
                  <div className="text-center py-6 bg-white/[0.02] rounded-[24px] border border-white/10 border-dashed backdrop-blur-sm">
                    <CreditCard className="w-8 h-8 text-slate-500/40 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">No cards linked yet.</p>
                  </div>
                )}
              </div>
            </motion.section>

            {/* ================= SYSTEM CONFIG ================= */}
            <motion.section variants={itemVariants} className="space-y-3">
              <h2 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#34d399] uppercase tracking-wider flex items-center gap-2 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] px-1">
                <SettingsIcon className="w-4 h-4 text-[#10b981]" /> System Config
              </h2>
              <div className="bg-white/[0.02] border border-white/5 rounded-[24px] backdrop-blur-xl divide-y divide-white/5 shadow-inner">

                <div className="p-4.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors rounded-t-[24px]">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.15)]">
                      <Bell className="w-5 h-5 text-[#25D366]" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">WhatsApp Alerts</div>
                      <div className="text-[10px] font-medium text-slate-500">Live CallMeBot API Sync</div>
                    </div>
                  </div>
                  <Switch
                    checked={whatsappAlerts}
                    onCheckedChange={setWhatsappAlerts}
                    className="data-[state=checked]:bg-[#25D366] data-[state=checked]:shadow-[0_0_10px_#25D366]"
                  />
                </div>

                <div className="p-4.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 flex items-center justify-center shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                      <ShieldCheck className="w-5 h-5 text-[#0ea5e9]" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">Database Security</div>
                      <div className="text-[10px] font-medium text-emerald-500">RLS Active & Protected</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </div>

                <div className="p-4.5 flex items-center justify-between opacity-70 rounded-b-[24px] bg-black/20">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Moon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">Cyber Dark Mode</div>
                      <div className="text-[10px] font-medium text-slate-500">Fixed for premium aesthetics</div>
                    </div>
                  </div>
                  <Switch checked={true} disabled className="opacity-50" />
                </div>

              </div>
            </motion.section>

            {/* ================= LOGOUT ACTION ================= */}
            <motion.section variants={itemVariants} className="pt-2">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleLogout}
                  className="w-full h-14 rounded-[20px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-base border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:shadow-[0_0_30px_rgba(244,63,94,0.3)] transition-all"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Secure Logout
                </Button>
              </motion.div>
            </motion.section>

          </motion.div>
        )}
      </main>

      {/* ================= EDIT PROFILE MODAL ================= */}
      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[92vw] max-w-sm p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#a855f7] to-[#0ea5e9] bg-clip-text text-transparent">
              Edit Identity
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Full Name</label>
              <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#a855f7] shadow-inner transition-colors">
                <User className="w-5 h-5 text-slate-500 mr-3" />
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Phone Number</label>
              <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#0ea5e9] shadow-inner transition-colors">
                <Phone className="w-5 h-5 text-slate-500 mr-3" />
                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+91" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
              </div>
            </div>

            <Button onClick={handleSaveProfile} className="w-full h-14 mt-4 rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#0ea5e9] text-white font-black text-lg shadow-[0_0_30px_rgba(168,85,247,0.4)] border-0">
              Update Identity
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= SECURE VIEW DETAILS MODAL ================= */}
      <Dialog open={isViewDetailsOpen} onOpenChange={setIsViewDetailsOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-sm p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#10b981]/15 rounded-full blur-[50px] pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-space font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#10b981]" /> Secure View
            </DialogTitle>
          </DialogHeader>

          {viewingCard && (
            <div className="relative p-5 rounded-[24px] overflow-hidden border border-white/20 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">{viewingCard.card_name}</h3>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">Full Details Unlocked</p>
                </div>
                <div className="text-xs font-black italic text-white/50">{viewingCard.network}</div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Card Number</p>
                  <p className="text-xl font-space font-black tracking-widest text-white drop-shadow-md">
                    {viewingCard.card_number ? formatCardNumber(viewingCard.card_number) : "Not Saved"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Holder Name</p>
                    <p className="text-sm font-bold text-white uppercase">{viewingCard.holder_name || "Unknown"}</p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valid Thru</p>
                      <p className="text-sm font-bold text-white">{viewingCard.expiry || "MM/YY"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">CVV</p>
                      <p className="text-sm font-bold text-white">{viewingCard.cvv || "***"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Button onClick={() => setIsViewDetailsOpen(false)} className="w-full h-12 mt-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors">
            Close View
          </Button>
        </DialogContent>
      </Dialog>

      {/* ================= ADD / EDIT CARD MODAL ================= */}
      <Dialog open={isCardModalOpen} onOpenChange={setIsCardModalOpen}>
        <DialogContent className="bg-[#050505]/95 backdrop-blur-3xl border border-white/10 text-slate-50 rounded-[40px] w-[95vw] max-w-md p-0 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-space font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">
                {editingCard ? "Edit Card Vault" : "Secure New Card"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">

              {/* Hierarchy Toggle */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">Is this a Primary Card?</div>
                  <div className="text-[10px] text-slate-500">Toggle off to link as a Sub-Card</div>
                </div>
                <Switch checked={isPrimary} onCheckedChange={setIsPrimary} className="data-[state=checked]:bg-[#0ea5e9]" />
              </div>

              <AnimatePresence>
                {!isPrimary && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 pb-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#a855f7] uppercase tracking-wider ml-1 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Select Parent Card</label>
                      <select value={parentCardId} onChange={(e) => setParentCardId(e.target.value)} className="w-full h-14 bg-white/[0.03] border border-[#a855f7]/40 rounded-2xl px-4 text-sm font-bold text-white outline-none focus:border-[#a855f7] appearance-none shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <option value="" className="bg-black">Choose a Primary Card...</option>
                        {cards.filter(c => c.is_primary).map(card => (
                          <option key={card.id} value={card.id} className="bg-black">{card.card_name} (**** {card.last_4_digits})</option>
                        ))}
                      </select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Full Card Number */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Full Card Number</label>
                <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#0ea5e9] shadow-inner transition-colors">
                  <CreditCard className="w-5 h-5 text-slate-500 mr-3" />
                  <input type="text" inputMode="numeric" value={formatCardNumber(cardNumber)} onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))} placeholder="0000 0000 0000 0000" className="bg-transparent border-none outline-none w-full text-base font-space font-bold tracking-widest text-white" />
                </div>
              </div>

              {/* Expiry & CVV */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Valid Thru</label>
                  <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#a855f7] shadow-inner transition-colors">
                    <CalendarDays className="w-4 h-4 text-slate-500 mr-2" />
                    <input type="text" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">CVV</label>
                  <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-14 px-4 focus-within:border-[#a855f7] shadow-inner transition-colors">
                    <ShieldAlert className="w-4 h-4 text-slate-500 mr-2" />
                    <input type="password" inputMode="numeric" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} placeholder="•••" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white tracking-widest" />
                  </div>
                </div>
              </div>

              {/* Card Name & Holder Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Alias / Name</label>
                  <div className={`relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 shadow-inner transition-colors ${isInherited ? 'opacity-50' : 'focus-within:border-[#0ea5e9]'}`}>
                    <input type="text" disabled={isInherited} value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="e.g. SBI BPCL" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Holder Name</label>
                  <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 focus-within:border-[#0ea5e9] shadow-inner transition-colors">
                    <input type="text" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Name on Card" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                  </div>
                </div>
              </div>

              {/* Total Limit & Network */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Total Limit (₹)</label>
                  <div className={`relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl h-12 px-4 shadow-inner transition-colors ${isInherited ? 'opacity-50' : 'focus-within:border-[#10b981]'}`}>
                    <Hash className="w-4 h-4 text-slate-500 mr-2" />
                    <input type="text" disabled={isInherited} inputMode="numeric" value={totalLimit} onChange={(e) => setTotalLimit(e.target.value.replace(/\D/g, ''))} placeholder="180000" className="bg-transparent border-none outline-none w-full text-sm font-bold text-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Network</label>
                  <select disabled={isInherited} value={network} onChange={(e) => setNetwork(e.target.value)} className={`w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-sm font-bold text-white outline-none shadow-inner ${isInherited ? 'opacity-50 appearance-none' : 'focus:border-[#10b981] appearance-none'}`}>
                    <option value="RuPay" className="bg-black">RuPay</option>
                    <option value="Visa" className="bg-black">Visa</option>
                    <option value="Mastercard" className="bg-black">Mastercard</option>
                  </select>
                </div>
              </div>

              {/* Billing Cycle Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Gen Day</label>
                  <input type="number" disabled={isInherited} min="1" max="31" value={billGenDay} onChange={(e) => setBillGenDay(e.target.value)} placeholder="e.g. 7" className={`w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-sm font-bold text-white outline-none shadow-inner ${isInherited ? 'opacity-50' : 'focus:border-[#0ea5e9]'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1"><CalendarClock className="w-3 h-3 text-rose-400" /> Due Day</label>
                  <input type="number" disabled={isInherited} min="1" max="31" value={billDueDay} onChange={(e) => setBillDueDay(e.target.value)} placeholder="e.g. 26" className={`w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-sm font-bold text-white outline-none shadow-inner ${isInherited ? 'opacity-50' : 'focus:border-[#0ea5e9]'}`} />
                </div>
              </div>

              {/* ── Owner / Access Assignment (Both Primary & Sub) ── */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-[#0ea5e9]" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    {isPrimary ? "Grant Owner Access" : "Assign Sub-Card Access"}
                  </span>
                  <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 text-[#0ea5e9] font-bold uppercase">
                    {isPrimary ? "owner" : "shared"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mb-1">
                  {isPrimary
                    ? "Select additional users who will have owner-level access to this primary card."
                    : "Select users who can access this sub-card (they'll also get view access to the parent card)."}
                </p>
                <UserPicker
                  allProfiles={allProfiles}
                  currentUserId={currentUser?.id || ""}
                  selectedIds={ownerUserIds}
                  onChange={setOwnerUserIds}
                  label={isPrimary ? "Select co-owners" : "Assign to users"}
                  accentColor={isPrimary ? "blue" : "emerald"}
                  cleanUrl={cleanUrl}
                />
              </div>

              <Button onClick={handleSaveCard} disabled={isSavingCard} className="w-full h-14 mt-4 rounded-2xl bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] hover:opacity-90 text-white font-black text-lg shadow-[0_0_30px_rgba(14,165,233,0.4)] border-0 disabled:opacity-50 transition-all">
                {isSavingCard ? "Securing Vault..." : "Save Card Details"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}