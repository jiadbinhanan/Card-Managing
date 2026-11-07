import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
  Alert,
} from 'react-native';
import { X, QrCode, Download, ExternalLink, ShieldCheck } from 'lucide-react-native';
import { QRData } from './QRPaymentModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StaticQRViewModalProps {
  visible: boolean;
  qr: QRData | null;
  onClose: () => void;
}

export const StaticQRViewModal: React.FC<StaticQRViewModalProps> = ({
  visible,
  qr,
  onClose,
}) => {
  if (!qr) return null;

  const handleOpenOrDownload = async () => {
    if (!qr.qr_image_url) {
      Alert.alert('Notice', 'No image URL available for this static QR.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(qr.qr_image_url);
      if (supported) {
        await Linking.openURL(qr.qr_image_url);
      } else {
        Alert.alert('Image URL', qr.qr_image_url);
      }
    } catch {
      Alert.alert('Notice', 'Unable to open image link.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.badgeRow}>
              <View style={styles.staticPill}>
                <ShieldCheck size={12} color="#10B981" />
                <Text style={styles.staticPillText}>STATIC QR STANDEE</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Merchant Info */}
          <View style={styles.merchantHeader}>
            <Text style={styles.merchantTitle} numberOfLines={1}>
              {qr.merchant_name}
            </Text>
            {!!qr.upi_id && qr.upi_id !== 'offline-standee' && (
              <Text style={styles.upiSub} numberOfLines={1}>
                {qr.upi_id}
              </Text>
            )}
          </View>

          {/* Large Standee Preview Banner */}
          <View style={styles.imageContainer}>
            {qr.qr_image_url ? (
              <Image
                source={{ uri: qr.qr_image_url }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.placeholderBox}>
                <QrCode size={64} color="#4A6B56" />
                <Text style={styles.placeholderText}>Standee photo not uploaded</Text>
              </View>
            )}
          </View>

          {/* Instructions */}
          <Text style={styles.guideText}>
            Show this standee QR code to customer or scan directly with any UPI payment app.
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {!!qr.qr_image_url && (
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={handleOpenOrDownload}
                activeOpacity={0.85}
              >
                <Download size={16} color="#FFFFFF" />
                <Text style={styles.downloadBtnText}>Open / Download Standee</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#071811',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staticPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  staticPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  merchantHeader: {
    marginBottom: 14,
  },
  merchantTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  upiSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#030E09',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  placeholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 12,
    color: '#658270',
    fontWeight: '600',
  },
  guideText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'column',
    gap: 8,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 12,
  },
  downloadBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#03180F',
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CAD6C9',
  },
});
