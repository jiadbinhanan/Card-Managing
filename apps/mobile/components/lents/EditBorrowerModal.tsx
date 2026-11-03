import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { User, Phone, Check, Trash2, AlertTriangle } from 'lucide-react-native';
import { BorrowerSummary } from './BorrowerCard';

interface EditBorrowerModalProps {
  visible: boolean;
  onClose: () => void;
  borrower: BorrowerSummary | null;
  onUpdate: (params: { id: string; name: string; phone?: string }) => Promise<void>;
  onDelete: (borrowerId: string) => Promise<void>;
}

export function EditBorrowerModal({
  visible,
  onClose,
  borrower,
  onUpdate,
  onDelete,
}: EditBorrowerModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (visible && borrower) {
      setName(borrower.name || '');
      setPhone(borrower.phone || '');
    }
  }, [visible, borrower]);

  if (!borrower) return null;

  const handleUpdate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Borrower name cannot be empty.');
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdate({
        id: borrower.id,
        name: trimmedName,
        phone: phone.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update borrower');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = () => {
    const hasDue = borrower.netDue > 0;
    const warningMsg = hasDue
      ? `This borrower has an active outstanding due of ₹${borrower.netDue.toLocaleString('en-IN')}. Deleting will remove their profile from the active ledger. Are you sure you want to proceed?`
      : 'Are you sure you want to remove this borrower?';

    Alert.alert('Confirm Delete', warningMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Borrower',
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await onDelete(borrower.id);
            onClose();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to delete borrower');
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      heightPercent={0.65}
      title="Edit Borrower"
      subtitle={`Manage ${borrower.name}`}
    >
      <View style={styles.container}>
        <DrawerScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {borrower.netDue > 0 && (
            <View style={styles.warningCard}>
              <AlertTriangle size={16} color="#DC2626" strokeWidth={2.4} />
              <Text style={styles.warningCardText}>
                Active Outstanding Due: ₹{borrower.netDue.toLocaleString('en-IN')}
              </Text>
            </View>
          )}

          <View style={styles.inputCard}>
            <View style={styles.inputRow}>
              <User size={16} color="#658270" strokeWidth={2.2} />
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Borrower Full Name *"
                placeholderTextColor="#A0B3A6"
              />
            </View>

            <View style={styles.inputDivider} />

            <View style={styles.inputRow}>
              <Phone size={16} color="#658270" strokeWidth={2.2} />
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone Number (Optional)"
                placeholderTextColor="#A0B3A6"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Delete Danger Zone */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={isDeleting || isUpdating}
            activeOpacity={0.8}
          >
            {isDeleting ? (
              <ActivityIndicator color="#DC2626" size="small" />
            ) : (
              <>
                <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.deleteBtnText}>Delete Borrower</Text>
              </>
            )}
          </TouchableOpacity>
        </DrawerScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!name.trim() || isUpdating || isDeleting) && styles.submitBtnDisabled,
            ]}
            onPress={handleUpdate}
            disabled={!name.trim() || isUpdating || isDeleting}
            activeOpacity={0.88}
          >
            {isUpdating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" strokeWidth={2.6} />
                <Text style={styles.submitBtnText}>SAVE CHANGES</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  warningCardText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#072C1C',
    padding: 0,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#F0F4F1',
    marginVertical: 4,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.2,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    height: 44,
    gap: 8,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.2,
    borderTopColor: '#DFE8E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  submitBtn: {
    backgroundColor: '#0E4426',
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
});
