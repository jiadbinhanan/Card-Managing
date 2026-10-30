import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { QrCode, Flashlight, Image as ImageIcon, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_FRAME_SIZE = SCREEN_WIDTH * 0.68;

export default function ScanScreen() {
  const router = useRouter();
  const [torchOn, setTorchOn] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <HapticButton style={styles.iconCircle} onPress={() => router.back()}>
          <ArrowLeft size={20} color={CedarColors.bone} />
        </HapticButton>
        <Text style={styles.headerTitle}>Scan & Pay</Text>
        <HapticButton
          style={[styles.iconCircle, torchOn && { backgroundColor: CedarColors.gold500 }]}
          onPress={() => setTorchOn(!torchOn)}
          feedbackType="medium"
        >
          <Flashlight size={20} color={torchOn ? CedarColors.pine900 : CedarColors.bone} />
        </HapticButton>
      </View>

      {/* Camera Viewfinder Mock */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.scanBox}>
          {/* Corner Borders */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />

          <View style={styles.scanLaser} />
          <QrCode size={64} color="rgba(255, 255, 255, 0.2)" />
        </View>

        <Text style={styles.scanHint}>Align QR code inside the frame to pay</Text>
      </View>

      {/* Bottom Options */}
      <View style={styles.bottomActions}>
        <HapticButton style={styles.actionPill} feedbackType="light">
          <ImageIcon size={18} color={CedarColors.bone} />
          <Text style={styles.actionText}>Upload QR</Text>
        </HapticButton>

        <HapticButton style={[styles.actionPill, styles.myQrPill]} feedbackType="medium">
          <QrCode size={18} color={CedarColors.pine900} />
          <Text style={styles.myQrText}>My Receive QR</Text>
        </HapticButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.pine900,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerTitle: {
    color: CedarColors.bone,
    fontSize: 18,
    fontWeight: '800',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CedarColors.pine800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: CedarColors.gold500,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 18,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 18,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 18,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 18,
  },
  scanLaser: {
    position: 'absolute',
    width: '90%',
    height: 2,
    backgroundColor: CedarColors.gold500,
    shadowColor: CedarColors.gold500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  scanHint: {
    color: CedarColors.pine300,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 28,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 100,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  actionText: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '700',
  },
  myQrPill: {
    backgroundColor: CedarColors.gold500,
  },
  myQrText: {
    color: CedarColors.pine900,
    fontSize: 13,
    fontWeight: '800',
  },
});
