import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CedarColors, CedarTypography } from '@credics/core';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  Search,
  User,
  Plus,
  X,
  Phone,
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  AlertCircle,
  Users,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export interface BorrowerItem {
  id: string;
  name: string;
  phone?: string | null;
  created_at?: string;
}

interface BorrowerPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBorrower: (borrower: BorrowerItem) => void;
  onBorrowerListChanged?: () => void;
}

export function BorrowerPickerDrawer({
  isOpen,
  onClose,
  onSelectBorrower,
  onBorrowerListChanged,
}: BorrowerPickerDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [borrowers, setBorrowers] = useState<BorrowerItem[]>([]);
  const [hasEntriesMap, setHasEntriesMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Inline Create State
  const [newPhone, setNewPhone] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit / Delete State
  const [editingBorrower, setEditingBorrower] = useState<BorrowerItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  const fetchBorrowers = async () => {
    setIsLoading(true);
    try {
      const [{ data: bData }, { data: cardRows }, { data: pocketRows }] = await Promise.all([
        supabase.from('borrowers').select('*').order('name'),
        supabase.from('card_lent_ledger').select('borrower_id'),
        supabase.from('pocket_lent_ledger').select('borrower_id'),
      ]);

      const list: BorrowerItem[] = bData || [];
      setBorrowers(list);

      const entryMap: Record<string, boolean> = {};
      (cardRows || []).forEach((r: any) => {
        if (r.borrower_id) entryMap[r.borrower_id] = true;
      });
      (pocketRows || []).forEach((r: any) => {
        if (r.borrower_id) entryMap[r.borrower_id] = true;
      });
      setHasEntriesMap(entryMap);
    } catch (err) {
      console.error('Error fetching borrowers in picker:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setNewPhone('');
      setMenuTargetId(null);
      setEditingBorrower(null);
      fetchBorrowers();
    }
  }, [isOpen]);

  const filteredBorrowers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.phone && b.phone.toLowerCase().includes(q))
    );
  }, [borrowers, searchQuery]);

  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return borrowers.some((b) => b.name.trim().toLowerCase() === q);
  }, [borrowers, searchQuery]);

  const handleCreateBorrower = async () => {
    const name = searchQuery.trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('borrowers')
        .insert({
          name,
          phone: newPhone.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchBorrowers();
      onBorrowerListChanged?.();
      if (data) {
        onSelectBorrower(data);
        onClose();
      }
    } catch (err: any) {
      Alert.alert('Create Error', err?.message || 'Could not create borrower.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingBorrower || !editName.trim() || isSavingEdit) return;

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('borrowers')
        .update({
          name: editName.trim(),
          phone: editPhone.trim() || null,
        })
        .eq('id', editingBorrower.id);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingBorrower(null);
      await fetchBorrowers();
      onBorrowerListChanged?.();
    } catch (err: any) {
      Alert.alert('Edit Error', err?.message || 'Failed to update borrower.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteBorrower = (b: BorrowerItem) => {
    Alert.alert(
      'Delete Borrower',
      `Are you sure you want to delete ${b.name}? This is only permitted if no loan transactions exist.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('borrowers').delete().eq('id', b.id);
              if (error) {
                if (error.code === '23503') {
                  Alert.alert(
                    'Cannot Delete',
                    'This borrower is linked to existing loan transactions and cannot be removed.'
                  );
                } else {
                  throw error;
                }
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await fetchBorrowers();
                onBorrowerListChanged?.();
              }
            } catch (err: any) {
              Alert.alert('Delete Error', err?.message || 'Failed to delete borrower.');
            }
          },
        },
      ]
    );
  };

  return (
    <SwipeDownDrawer
      visible={isOpen}
      onClose={onClose}
      title="Borrower Directory"
      subtitle="Select or Register Borrowers"
      heightPercent={0.82}
    >
      <View style={styles.container}>
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Search size={15} color={CedarColors.ink500} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search borrower by name or phone..."
            placeholderTextColor={CedarColors.ink500}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={15} color={CedarColors.ink500} />
            </TouchableOpacity>
          )}
        </View>

        {/* Inline Create Banner if Query doesn't match */}
        {searchQuery.trim().length > 0 && !exactMatchExists && (
          <View style={styles.createCard}>
            <View style={styles.createHeader}>
              <Plus size={14} color="#10B981" />
              <Text style={styles.createTitle}>
                Register &quot;{searchQuery.trim()}&quot;
              </Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="Optional Phone Number (10 digits)"
              placeholderTextColor="#7E9185"
              keyboardType="phone-pad"
              value={newPhone}
              onChangeText={setNewPhone}
            />
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreateBorrower}
              disabled={isCreating}
              activeOpacity={0.8}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={14} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.createBtnText}>Create & Select</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Edit Borrower Modal Box */}
        {editingBorrower && (
          <View style={styles.editCard}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Edit Borrower Details</Text>
              <TouchableOpacity onPress={() => setEditingBorrower(null)}>
                <X size={16} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.editInput}
              placeholder="Borrower Name"
              placeholderTextColor="#7E9185"
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={styles.editInput}
              placeholder="Phone Number"
              placeholderTextColor="#7E9185"
              keyboardType="phone-pad"
              value={editPhone}
              onChangeText={setEditPhone}
            />
            <TouchableOpacity
              style={styles.saveEditBtn}
              onPress={handleSaveEdit}
              disabled={isSavingEdit}
              activeOpacity={0.8}
            >
              {isSavingEdit ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveEditBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Borrowers List */}
        <DrawerScrollView
          contentContainerStyle={styles.listScroll}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={CedarColors.forest800} />
              <Text style={styles.loadingText}>Loading registered borrowers...</Text>
            </View>
          ) : filteredBorrowers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Users size={32} color={CedarColors.ink500} />
              <Text style={styles.emptyTitle}>No Borrowers Found</Text>
              <Text style={styles.emptySub}>
                Type a name above to register a new borrower.
              </Text>
            </View>
          ) : (
            filteredBorrowers.map((b) => {
              const hasEntries = !!hasEntriesMap[b.id];
              const isMenuOpen = menuTargetId === b.id;

              return (
                <View key={b.id} style={styles.borrowerRow}>
                  <TouchableOpacity
                    style={styles.borrowerMain}
                    onPress={() => {
                      onSelectBorrower(b);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarCircle}>
                      <User size={16} color={CedarColors.forest800} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.borrowerName} numberOfLines={1}>
                        {b.name}
                      </Text>
                      <Text style={styles.borrowerPhone}>
                        {b.phone ? `Phone: ${b.phone}` : 'No phone linked'}
                      </Text>
                    </View>

                    <View style={styles.entryBadge}>
                      <Text
                        style={[
                          styles.entryBadgeText,
                          hasEntries ? styles.badgeActive : styles.badgeInactive,
                        ]}
                      >
                        {hasEntries ? 'Active Ledger' : 'No Loans'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* 3-Dot Menu */}
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setMenuTargetId(isMenuOpen ? null : b.id)}
                    activeOpacity={0.7}
                  >
                    <MoreVertical size={16} color={CedarColors.ink500} />
                  </TouchableOpacity>

                  {/* Context Menu Dropdown */}
                  {isMenuOpen && (
                    <View style={styles.contextMenu}>
                      <TouchableOpacity
                        style={styles.contextMenuItem}
                        onPress={() => {
                          setMenuTargetId(null);
                          setEditingBorrower(b);
                          setEditName(b.name);
                          setEditPhone(b.phone || '');
                        }}
                      >
                        <Pencil size={13} color={CedarColors.ink700} />
                        <Text style={styles.contextMenuText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.contextMenuItem}
                        onPress={() => {
                          setMenuTargetId(null);
                          handleDeleteBorrower(b);
                        }}
                      >
                        <Trash2 size={13} color="#EF4444" />
                        <Text style={[styles.contextMenuText, { color: '#EF4444' }]}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </DrawerScrollView>
      </View>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: CedarColors.border,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
  },
  createCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginBottom: 10,
    gap: 8,
  },
  createHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#10B981',
  },
  phoneInput: {
    backgroundColor: CedarColors.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 8,
  },
  createBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editCard: {
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 10,
    gap: 8,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  editInput: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  saveEditBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  saveEditBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  listScroll: {
    paddingBottom: 40,
    gap: 8,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  emptySub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  borrowerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  borrowerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowerName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  borrowerPhone: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  entryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  entryBadgeText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  badgeActive: {
    color: '#10B981',
  },
  badgeInactive: {
    color: CedarColors.ink500,
  },
  moreBtn: {
    padding: 6,
    marginLeft: 6,
  },
  contextMenu: {
    position: 'absolute',
    right: 10,
    top: 40,
    backgroundColor: CedarColors.card,
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 99,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  contextMenuText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
});
