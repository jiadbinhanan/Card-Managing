import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  QrCode,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  X,
  Clock,
  Layers,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { QRData } from './QRPaymentModal';

interface EditQRDrawerProps {
  visible: boolean;
  onClose: () => void;
  qr: QRData | null;
  onSaveSuccess: () => Promise<void>;
}

const PLATFORMS = ['PhonePe', 'Paytm', 'GooglePay', 'BharatPe', 'AmazonPay', 'BHIM', 'Static'];
const SETTLEMENT_TIMES = ['T+0 Instant', 'T+1 Morning', 'T+1 Evening', 'N/A'];
const STATUSES = ['active', 'on_hold', 'static'];

export function EditQRDrawer({ visible, onClose, qr, onSaveSuccess }: EditQRDrawerProps) {
  const [merchantName, setMerchantName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [platform, setPlatform] = useState('PhonePe');
  const [settlementTime, setSettlementTime] = useState('T+0 Instant');
  const [basePaymentLink, setBasePaymentLink] = useState('');
  const [status, setStatus] = useState('active');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && qr) {
      setMerchantName(qr.merchant_name || '');
      setUpiId(qr.upi_id || '');
      setPlatform(qr.platform || 'PhonePe');
      setSettlementTime(qr.settlement_time || 'T+0 Instant');
      setBasePaymentLink(qr.base_payment_link || '');
      setStatus(qr.status || 'active');
      setImageUrl((qr as any).qr_image_url || null);
      setImageUri(null);
      setIsSubmitting(false);
    }
  }, [visible, qr]);

  const handlePickImage = async (useCamera: boolean) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          useCamera
            ? 'Camera access is required to take a photo of the QR standee.'
            : 'Photo library access is required to choose a QR image.'
        );
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Image Pick Error', err?.message || 'Could not select image.');
    }
  };

  const uploadQrImage = async (uri: string, name: string): Promise<string> => {
    setIsUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const sanitized = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const fileName = `qrs/${sanitized}_${Date.now()}.jpg`;

      const { data, error } = await supabase.storage.from('qr-vault').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      if (error) throw error;

      const { data: publicData } = supabase.storage.from('qr-vault').getPublicUrl(fileName);
      return publicData.publicUrl;
    } catch (uploadErr) {
      console.warn('Storage upload failed, keeping local uri fallback:', uploadErr);
      return uri;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!qr) return;
    if (!merchantName.trim()) {
      Alert.alert('Required Field', 'Merchant Name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrl;
      if (imageUri) {
        finalImageUrl = await uploadQrImage(imageUri, merchantName.trim());
      }

      const payload: Record<string, any> = {
        merchant_name: merchantName.trim(),
        upi_id: upiId.trim() || qr.upi_id,
        platform,
        settlement_time: settlementTime,
        base_payment_link: basePaymentLink.trim() || null,
        status,
        qr_image_url: finalImageUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('qrs').update(payload).eq('id', qr.id);
      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onSaveSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not update QR endpoint.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!qr) return null;

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      title="Edit QR Endpoint"
      subtitle={qr.merchant_name}
      heightPercent={0.88}
    >
      <View style={styles.container}>
        <DrawerScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* QR Standee Image Preview & Upload */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>QR Standee Photo / Thumbnail</Text>
            <View style={styles.imageRow}>
              {imageUri || imageUrl ? (
                <View style={styles.imagePreviewBox}>
                  <Image source={{ uri: imageUri || imageUrl || '' }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => {
                      setImageUri(null);
                      setImageUrl(null);
                    }}
                  >
                    <X size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.imagePlaceholder}>
                  <QrCode size={28} color="#8CA394" />
                  <Text style={styles.imagePlaceholderText}>No Standee Photo</Text>
                </View>
              )}

              <View style={styles.imageActionsCol}>
                <TouchableOpacity
                  style={styles.imageActionBtn}
                  onPress={() => handlePickImage(true)}
                  activeOpacity={0.8}
                >
                  <Camera size={14} color="#0B3F28" strokeWidth={2.2} />
                  <Text style={styles.imageActionBtnText}>Take Standee Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.imageActionBtnSecondary}
                  onPress={() => handlePickImage(false)}
                  activeOpacity={0.8}
                >
                  <ImageIcon size={14} color="#4A6B56" strokeWidth={2.2} />
                  <Text style={styles.imageActionBtnTextSecondary}>Pick from Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Merchant Name */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Merchant Name</Text>
            <TextInput
              style={styles.textInput}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="e.g. Reliance Smart"
              placeholderTextColor="#8CA394"
            />
          </View>

          {/* UPI ID */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>UPI ID (VPA)</Text>
            <TextInput
              style={styles.textInput}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="e.g. merchant@icici"
              placeholderTextColor="#8CA394"
              autoCapitalize="none"
            />
          </View>

          {/* Provider Platform Selector */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Platform Provider</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {PLATFORMS.map((p) => {
                const isSelected = platform === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setPlatform(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Settlement Speed */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Settlement Speed</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {SETTLEMENT_TIMES.map((t) => {
                const isSelected = settlementTime === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setSettlementTime(t)}
                    activeOpacity={0.8}
                  >
                    <Clock size={11} color={isSelected ? '#FFFFFF' : '#4A6B56'} />
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Status Selection */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Endpoint Status</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const isSelected = status === s;
                const label = s === 'active' ? 'Active' : s === 'on_hold' ? 'On Hold' : 'Static Standee';
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusBtn, isSelected && styles.statusBtnActive]}
                    onPress={() => setStatus(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.statusBtnText, isSelected && styles.statusBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Base Payment Link */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Custom Base Payment Link (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={basePaymentLink}
              onChangeText={setBasePaymentLink}
              placeholder="e.g. upi://pay?pa=... or https://pay..."
              placeholderTextColor="#8CA394"
              autoCapitalize="none"
            />
          </View>
        </DrawerScrollView>

        {/* Footer Button */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[styles.saveBtn, (isSubmitting || isUploading) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSubmitting || isUploading}
            activeOpacity={0.88}
          >
            {isSubmitting || isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.saveBtnText}>Update QR Endpoint</Text>
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
    backgroundColor: '#EFF3EE',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  sectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A6B56',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  imagePreviewBox: {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#EFF3EE',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  imagePlaceholderText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8CA394',
  },
  imageActionsCol: {
    flex: 1,
    gap: 6,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  imageActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B3F28',
  },
  imageActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF3EE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  imageActionBtnTextSecondary: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  textInput: {
    backgroundColor: '#EFF3EE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: '#072C1C',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  statusBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0B3F28',
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
