import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticButton } from '../components/HapticButton';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  User,
  CreditCard,
  Edit3,
  LogOut,
  ShieldCheck,
  Plus,
  Eye,
  EyeOff,
  ChevronRight,
  X,
  Check,
  Phone,
  Layers,
  Calendar,
  Lock,
  Smartphone,
  UserPlus,
} from 'lucide-react-native';

interface Profile {
  id: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  network?: string;
  bill_gen_day?: number;
  bill_due_day?: number;
  parent_card_id?: string;
  holder_name?: string;
  card_number?: string;
  expiry?: string;
  cvv?: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);

  // Profile Edit Modal
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Card Details Secure Modal
  const [viewingCard, setViewingCard] = useState<CardData | null>(null);
  const [isCvvVisible, setIsCvvVisible] = useState(false);

  // Add / Edit Card Modal
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [cardName, setCardName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [totalLimit, setTotalLimit] = useState('');
  const [network, setNetwork] = useState('RuPay');
  const [billGenDay, setBillGenDay] = useState('');
  const [billDueDay, setBillDueDay] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [parentCardId, setParentCardId] = useState('');
  const [ownerUserIds, setOwnerUserIds] = useState<string[]>([]);
  const [isSavingCard, setIsSavingCard] = useState(false);

  // Preferences
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: authData } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (user) {
        const [profRes, accessRes, cardsRes] = await Promise.all([
          supabase.from('profiles').select('*'),
          supabase.from('card_access').select('card_id').eq('user_id', user.id),
          supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        ]);

        const allProfs: Profile[] = profRes.data || [];
        setAllProfiles(allProfs);

        const myProfile = allProfs.find((p) => p.id === user.id);
        if (myProfile) {
          setCurrentUser(myProfile);
          setEditName(myProfile.name);
          setEditPhone(myProfile.phone || '');
        }

        const accessCards = accessRes.data || [];
        const cardIds = accessCards.map((a) => a.card_id);

        const allCardsList: CardData[] = cardsRes.data || [];
        const userAccessibleCards = allCardsList.filter((c) => cardIds.includes(c.id));
        setCards(userAccessibleCards);
      }
    } catch (err) {
      console.error('Error fetching settings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Profile Save
  const handleSaveProfile = async () => {
    if (!currentUser || !editName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    setIsSavingProfile(true);

    try {
      await supabase
        .from('profiles')
        .update({ name: editName.trim(), phone: editPhone.trim() || null })
        .eq('id', currentUser.id);

      setCurrentUser({ ...currentUser, name: editName.trim(), phone: editPhone.trim() || null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditProfileOpen(false);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      Alert.alert('Error', err?.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Open Add Card Modal
  const openAddCardModal = () => {
    setEditingCard(null);
    setCardName('');
    setHolderName(currentUser?.name || '');
    setCardNumber('');
    setExpiry('');
    setCvv('');
    setTotalLimit('');
    setNetwork('RuPay');
    setBillGenDay('7');
    setBillDueDay('26');
    setIsPrimary(true);
    setParentCardId('');
    setOwnerUserIds(currentUser ? [currentUser.id] : []);
    setIsCardModalOpen(true);
  };

  // Open Edit Card Modal
  const openEditCardModal = async (card: CardData) => {
    setEditingCard(card);
    setCardName(card.card_name);
    setHolderName(card.holder_name || '');
    setCardNumber(card.card_number || `**** **** **** ${card.last_4_digits}`);
    setExpiry(card.expiry || '');
    setCvv(card.cvv || '');
    setTotalLimit(card.total_limit?.toString() || '');
    setNetwork(card.network || 'RuPay');
    setBillGenDay(card.bill_gen_day?.toString() || '');
    setBillDueDay(card.bill_due_day?.toString() || '');
    setIsPrimary(card.is_primary);
    setParentCardId(card.parent_card_id || '');

    const { data: existingAccess } = await supabase
      .from('card_access')
      .select('user_id')
      .eq('card_id', card.id);

    if (existingAccess) {
      const ownerIds = existingAccess.map((a) => a.user_id);
      if (currentUser && !ownerIds.includes(currentUser.id)) {
        ownerIds.push(currentUser.id);
      }
      setOwnerUserIds(ownerIds);
    } else {
      setOwnerUserIds(currentUser ? [currentUser.id] : []);
    }

    setIsCardModalOpen(true);
  };

  // Save Card
  const handleSaveCard = async () => {
    if (!cardName.trim() || !totalLimit || !currentUser) {
      Alert.alert('Required', 'Please fill in all mandatory card fields.');
      return;
    }

    setIsSavingCard(true);

    try {
      const rawNumber = cardNumber.replace(/\D/g, '');
      const last4 = rawNumber.slice(-4) || editingCard?.last_4_digits || '0000';

      const cardPayload = {
        card_name: cardName.trim(),
        holder_name: holderName.trim() || currentUser.name,
        card_number: rawNumber || editingCard?.card_number || null,
        expiry: expiry.trim() || null,
        cvv: cvv.trim() || null,
        total_limit: Number(totalLimit) || 0,
        network: network,
        bill_gen_day: Number(billGenDay) || 7,
        bill_due_day: Number(billDueDay) || 26,
        is_primary: isPrimary,
        parent_card_id: !isPrimary && parentCardId ? parentCardId : null,
        last_4_digits: last4,
      };

      if (editingCard) {
        await supabase.from('cards').update(cardPayload).eq('id', editingCard.id);

        // Update card access
        const role = isPrimary ? 'owner' : 'shared';
        for (const uid of ownerUserIds) {
          await supabase.from('card_access').upsert(
            {
              card_id: editingCard.id,
              user_id: uid,
              role: uid === currentUser.id ? 'owner' : role,
            },
            { onConflict: 'card_id,user_id' }
          );
        }
      } else {
        const { data: newCard, error: insertError } = await supabase
          .from('cards')
          .insert(cardPayload)
          .select()
          .single();

        if (insertError) throw insertError;

        // Give current user owner access
        await supabase.from('card_access').insert({
          card_id: newCard.id,
          user_id: currentUser.id,
          role: 'owner',
        });

        // Give other selected users access
        const role = isPrimary ? 'owner' : 'shared';
        for (const uid of ownerUserIds) {
          if (uid !== currentUser.id) {
            await supabase.from('card_access').upsert(
              {
                card_id: newCard.id,
                user_id: uid,
                role: role,
              },
              { onConflict: 'card_id,user_id' }
            );
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsCardModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving card:', err);
      Alert.alert('Error', err?.message || 'Failed to save card.');
    } finally {
      setIsSavingCard(false);
    }
  };

  // Toggle user access in modal
  const toggleUserAccess = (userId: string) => {
    if (userId === currentUser?.id) return; // Cannot remove self
    if (ownerUserIds.includes(userId)) {
      setOwnerUserIds(ownerUserIds.filter((id) => id !== userId));
    } else {
      setOwnerUserIds([...ownerUserIds, userId]);
    }
  };

  // Logout
  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of Credics?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={CedarColors.ink900} />
        </TouchableOpacity>

        <View style={styles.headerTitleCol}>
          <Text style={styles.headerSub}>Control Center</Text>
          <Text style={styles.headerTitle}>Settings & Profile</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1B4D3E" />
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ================= 1. IDENTITY & PROFILE CARD ================= */}
          <View style={styles.profileCard}>
            <View style={styles.profileMainRow}>
              {currentUser?.avatar_url ? (
                <Image source={{ uri: currentUser.avatar_url }} style={styles.profileAvatar} />
              ) : (
                <View style={styles.profileAvatarPlaceholder}>
                  <Text style={styles.profileInitial}>{currentUser?.name?.[0] || 'U'}</Text>
                </View>
              )}

              <View style={styles.profileInfoCol}>
                <View style={styles.profileNameRow}>
                  <Text style={styles.profileName}>{currentUser?.name || 'User'}</Text>
                  <View style={styles.adminBadge}>
                    <ShieldCheck size={11} color="#2D7A5D" />
                    <Text style={styles.adminBadgeText}>Active</Text>
                  </View>
                </View>
                <Text style={styles.profilePhone}>{currentUser?.phone || 'No phone attached'}</Text>
              </View>

              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => {
                  setIsEditProfileOpen(true);
                }}
              >
                <Edit3 size={15} color="#1B4D3E" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ================= 2. MY VAULT CARDS SECTION ================= */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>My Vault Cards</Text>
              <Text style={styles.sectionSub}>Active credit lines & liquidity pools</Text>
            </View>

            <HapticButton
              style={styles.addCardBtn}
              onPress={openAddCardModal}
              feedbackType="rigid"
            >
              <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.addCardBtnText}>Add Card</Text>
            </HapticButton>
          </View>

          <View style={styles.cardsContainer}>
            {cards.map((c) => {
              const isSub = !c.is_primary;
              return (
                <View key={c.id} style={styles.cardItem}>
                  <View style={styles.cardItemTop}>
                    <View style={styles.cardIconBox}>
                      <CreditCard size={18} color="#1B4D3E" />
                    </View>

                    <View style={styles.cardInfoCol}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardName}>{c.card_name}</Text>
                        {isSub && (
                          <View style={styles.subCardBadge}>
                            <Text style={styles.subCardBadgeText}>Sub Card</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardDigits}>
                        {c.network || 'RuPay'} • **{c.last_4_digits}
                      </Text>
                    </View>

                    <View style={styles.cardLimitCol}>
                      <Text style={styles.cardLimit}>₹{Number(c.total_limit || 0).toLocaleString('en-IN')}</Text>
                      <Text style={styles.cardBillingCycle}>
                        Bill: {c.bill_gen_day || 7}th • Due: {c.bill_due_day || 26}th
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => {
                        setViewingCard(c);
                        setIsCvvVisible(false);
                      }}
                    >
                      <Eye size={12} color="#1B4D3E" />
                      <Text style={styles.cardActionBtnText}>View Details</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openEditCardModal(c)}
                    >
                      <Edit3 size={12} color="#1B4D3E" />
                      <Text style={styles.cardActionBtnText}>Edit Card</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ================= 3. SYSTEM SECURITY & PREFERENCES ================= */}
          <Text style={styles.prefSectionTitle}>System & Security</Text>

          <View style={styles.prefBox}>
            <View style={styles.prefRow}>
              <View style={styles.prefIconBox}>
                <Smartphone size={16} color="#1B4D3E" />
              </View>
              <View style={styles.prefInfoCol}>
                <Text style={styles.prefTitle}>WhatsApp Alerts</Text>
                <Text style={styles.prefSub}>Instant notifications on swipes & settlements</Text>
              </View>
              <Switch
                value={whatsappAlerts}
                onValueChange={(val) => {
                  setWhatsappAlerts(val);
                }}
                trackColor={{ false: '#DCE4DA', true: '#2D7A5D' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.prefDivider} />

            <View style={styles.prefRow}>
              <View style={styles.prefIconBox}>
                <Lock size={16} color="#1B4D3E" />
              </View>
              <View style={styles.prefInfoCol}>
                <Text style={styles.prefTitle}>Database Security (RLS)</Text>
                <Text style={styles.prefSub}>PostgreSQL Row Level Security Active</Text>
              </View>
              <View style={styles.activeSecBadge}>
                <Check size={12} color="#2D7A5D" />
                <Text style={styles.activeSecBadgeText}>Enforced</Text>
              </View>
            </View>
          </View>

          {/* ================= 4. APP VERSION & SIGN OUT ================= */}
          <View style={styles.footerContainer}>
            <Text style={styles.versionText}>Credics Mobile • v1.0.0 (Cedar Engine)</Text>

            <HapticButton
              style={styles.logoutBtn}
              onPress={handleLogout}
              feedbackType="rigid"
            >
              <LogOut size={16} color="#E05D52" />
              <Text style={styles.logoutBtnText}>Sign Out</Text>
            </HapticButton>
          </View>
        </ScrollView>
      )}

      {/* ================= EDIT PROFILE MODAL ================= */}
      <Modal visible={isEditProfileOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setIsEditProfileOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your Name"
                  placeholderTextColor={CedarColors.ink500}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.saveBtn, isSavingProfile && styles.saveBtnDisabled]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
                feedbackType="rigid"
              >
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Profile</Text>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= VIEW SECURE CARD MODAL ================= */}
      {viewingCard && (
        <Modal visible={!!viewingCard} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{viewingCard.card_name}</Text>
                <TouchableOpacity onPress={() => setViewingCard(null)}>
                  <X size={18} color={CedarColors.ink700} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {/* Visual Credit Card Preview */}
                <LinearGradient
                  colors={['#071A12', '#0C2B20', '#071A12']}
                  style={styles.creditCardVisual}
                >
                  <View style={styles.cardVisualTop}>
                    <Text style={styles.cardVisualBank}>{viewingCard.card_name}</Text>
                    <Text style={styles.cardVisualNetwork}>{viewingCard.network || 'RuPay'}</Text>
                  </View>

                  <Text style={styles.cardVisualNumber}>
                    {viewingCard.card_number
                      ? viewingCard.card_number.replace(/(.{4})/g, '$1 ')
                      : `**** **** **** ${viewingCard.last_4_digits}`}
                  </Text>

                  <View style={styles.cardVisualBottom}>
                    <View>
                      <Text style={styles.cardVisualLabel}>CARD HOLDER</Text>
                      <Text style={styles.cardVisualValue}>
                        {viewingCard.holder_name || currentUser?.name || 'PRIMARY USER'}
                      </Text>
                    </View>

                    <View>
                      <Text style={styles.cardVisualLabel}>EXPIRES</Text>
                      <Text style={styles.cardVisualValue}>{viewingCard.expiry || '12/28'}</Text>
                    </View>

                    <View>
                      <Text style={styles.cardVisualLabel}>CVV</Text>
                      <Text style={styles.cardVisualValue}>
                        {isCvvVisible ? viewingCard.cvv || '123' : '•••'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>

                <TouchableOpacity
                  style={styles.toggleCvvRow}
                  onPress={() => {
                    setIsCvvVisible(!isCvvVisible);
                  }}
                >
                  {isCvvVisible ? <EyeOff size={14} color="#1B4D3E" /> : <Eye size={14} color="#1B4D3E" />}
                  <Text style={styles.toggleCvvText}>
                    {isCvvVisible ? 'Hide CVV' : 'Reveal CVV'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ================= ADD / EDIT CARD MODAL ================= */}
      <Modal visible={isCardModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCard ? 'Edit Vault Card' : 'Add Vault Card'}
              </Text>
              <TouchableOpacity onPress={() => setIsCardModalOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Primary vs Sub Switcher */}
              <View style={styles.primarySwitchRow}>
                <TouchableOpacity
                  style={[styles.primarySwitchBtn, isPrimary && styles.primarySwitchBtnActive]}
                  onPress={() => {
                    setIsPrimary(true);
                  }}
                >
                  <Text
                    style={[
                      styles.primarySwitchBtnText,
                      isPrimary && styles.primarySwitchBtnTextActive,
                    ]}
                  >
                    Primary Card
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primarySwitchBtn, !isPrimary && styles.primarySwitchBtnActive]}
                  onPress={() => {
                    setIsPrimary(false);
                  }}
                >
                  <Text
                    style={[
                      styles.primarySwitchBtnText,
                      !isPrimary && styles.primarySwitchBtnTextActive,
                    ]}
                  >
                    Sub Card (Add-on)
                  </Text>
                </TouchableOpacity>
              </View>

              {!isPrimary && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Parent Primary Card</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    {cards
                      .filter((c) => c.is_primary)
                      .map((c) => {
                        const isSelected = parentCardId === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.pickerPill, isSelected && styles.pickerPillActive]}
                            onPress={() => {
                              setParentCardId(c.id);
                            }}
                          >
                            <Text
                              style={[
                                styles.pickerPillText,
                                isSelected && styles.pickerPillTextActive,
                              ]}
                            >
                              {c.card_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Card Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={cardName}
                  onChangeText={setCardName}
                  placeholder="e.g. HDFC Millennia"
                  placeholderTextColor={CedarColors.ink500}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Total Limit (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  value={totalLimit}
                  onChangeText={setTotalLimit}
                  placeholder="e.g. 150000"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Card Number (or Last 4)</Text>
                <TextInput
                  style={styles.textInput}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  placeholder="Card Number"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Bill Gen Day</Text>
                  <TextInput
                    style={styles.textInput}
                    value={billGenDay}
                    onChangeText={setBillGenDay}
                    placeholder="7"
                    placeholderTextColor={CedarColors.ink500}
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Bill Due Day</Text>
                  <TextInput
                    style={styles.textInput}
                    value={billDueDay}
                    onChangeText={setBillDueDay}
                    placeholder="26"
                    placeholderTextColor={CedarColors.ink500}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Multi-User Access Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Card Access Sharing</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {allProfiles.map((p) => {
                    const isSelected = ownerUserIds.includes(p.id);
                    const isSelf = p.id === currentUser?.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.userChip, isSelected && styles.userChipActive]}
                        onPress={() => toggleUserAccess(p.id)}
                      >
                        <Text
                          style={[styles.userChipText, isSelected && styles.userChipTextActive]}
                        >
                          {p.name.split(' ')[0]} {isSelf ? '(You)' : ''}
                        </Text>
                        {isSelected && <Check size={11} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.saveBtn, isSavingCard && styles.saveBtnDisabled]}
                onPress={handleSaveCard}
                disabled={isSavingCard}
                feedbackType="rigid"
              >
                {isSavingCard ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Card</Text>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
    backgroundColor: '#EFF3EE',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F6F9F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  headerTitleCol: {
    alignItems: 'center',
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2D7A5D',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#F6F9F5',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    marginBottom: 20,
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#2D7A5D',
    marginRight: 12,
  },
  profileAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#071A12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2D7A5D',
    marginRight: 12,
  },
  profileInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  profileInfoCol: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A3D9A5',
  },
  adminBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#2E944B',
  },
  profilePhone: {
    fontSize: 11,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  editProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  sectionSub: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1B4D3E',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addCardBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardsContainer: {
    marginBottom: 20,
  },
  cardItem: {
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
    marginBottom: 8,
  },
  cardItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardInfoCol: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  subCardBadge: {
    backgroundColor: '#E4ECE3',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  subCardBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: CedarColors.ink700,
  },
  cardDigits: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cardLimitCol: {
    alignItems: 'flex-end',
  },
  cardLimit: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1B4D3E',
  },
  cardBillingCycle: {
    fontSize: 9,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCE4DA',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4ECE3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardActionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1B4D3E',
  },
  prefSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  prefBox: {
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
    marginBottom: 24,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  prefInfoCol: {
    flex: 1,
  },
  prefTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  prefSub: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  activeSecBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeSecBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2E944B',
  },
  prefDivider: {
    height: 1,
    backgroundColor: '#DCE4DA',
    marginVertical: 10,
  },
  footerContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  versionText: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginBottom: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FCEBEA',
    borderWidth: 1,
    borderColor: '#F8B4AF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E05D52',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#F6F9F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textInput: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 12,
    color: CedarColors.ink900,
  },
  primarySwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#E4ECE3',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  primarySwitchBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  primarySwitchBtnActive: {
    backgroundColor: '#1B4D3E',
  },
  primarySwitchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  primarySwitchBtnTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  pickerPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  pickerPillActive: {
    backgroundColor: '#1B4D3E',
  },
  pickerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  pickerPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#E4ECE3',
  },
  userChipActive: {
    backgroundColor: '#1B4D3E',
  },
  userChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  userChipTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B4D3E',
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  creditCardVisual: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardVisualTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardVisualBank: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  cardVisualNetwork: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A0ACA2',
  },
  cardVisualNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F6F9F5',
    letterSpacing: 2,
    marginBottom: 16,
  },
  cardVisualBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardVisualLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8A948C',
  },
  cardVisualValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F6F9F5',
    marginTop: 2,
  },
  toggleCvvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  toggleCvvText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B4D3E',
  },
});
