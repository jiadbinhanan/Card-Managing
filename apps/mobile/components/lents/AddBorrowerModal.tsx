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
import { User, Phone, Plus } from 'lucide-react-native';

interface AddBorrowerModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (params: { name: string; phone?: string }) => Promise<void>;
}

export function AddBorrowerModal({
  visible,
  onClose,
  onSave,
}: AddBorrowerModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setPhone('');
    }
  }, [visible]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Please enter a borrower name.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        name: trimmedName,
        phone: phone.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add borrower');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      heightPercent={0.55}
      title="Add New Borrower"
      subtitle="Register borrower to track receivables"
    >
      <View style={styles.container}>
        <DrawerScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inputCard}>
            <View style={styles.inputRow}>
              <User size={16} color="#658270" strokeWidth={2.2} />
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Borrower Full Name *"
                placeholderTextColor="#A0B3A6"
                autoFocus
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
        </DrawerScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!name.trim() || isSubmitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!name.trim() || isSubmitting}
            activeOpacity={0.88}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
                <Text style={styles.submitBtnText}>REGISTER BORROWER</Text>
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
