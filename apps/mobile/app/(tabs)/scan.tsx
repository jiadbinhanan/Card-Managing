import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { QrCode, Flashlight, Image as ImageIcon, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_FRAME_SIZE = SCREEN_WIDTH * 0.7;

export default function ScanScreen() {
  const router = useRouter();
  const [torchOn, setTorchOn] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <HapticButton
          style={styles.iconCircle}
          onPress={() => router.back()}
          feedbackType="light"
        >
          <ArrowLeft size={20} color={CedarColors.ink900} />
        </HapticButton>
        <Text style={styles.headerTitle}>Scan & Pay</Text>
        <HapticButton
          style={[styles.iconCircle, torchOn ? { backgroundColor: CedarColors.forest800 } : undefined]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTorchOn(!torchOn);
          }}
          feedbackType="medium"
        >
          <Flashlight size={20} color={torchOn ? '#FFFFFF' : CedarColors.ink900} />
        </HapticButton>
      </View>

      {/* Camera Viewfinder Frame */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.scanBox}>
          {/* 4 Deep Forest Corner Accents */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />

          <View style={styles.scanLaser} />
          <QrCode size={72} color="rgba(15, 56, 42, 0.2)" />
        </View>

        <Text style={styles.scanHint}>Align QR code inside the frame to pay</Text>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.actionPill}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <ImageIcon size={18} color={CedarColors.ink900} />
          <Text style={styles.actionText}>Upload QR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionPill, styles.myQrPill]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        >
          <QrCode size={18} color="#FFFFFF" />
          <Text style={styles.myQrText}>My Receive QR</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas, // #F4F6F2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerTitle: {
    color: CedarColors.ink900,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
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
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: CedarColors.forest800, // #0F382A
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scanLaser: {
    position: 'absolute',
    width: '80%',
    height: 2,
    backgroundColor: CedarColors.mint500, // #34A853
    shadowColor: CedarColors.mint500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  scanHint: {
    color: CedarColors.ink700,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 24,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CedarColors.card,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  actionText: {
    color: CedarColors.ink900,
    fontSize: 13,
    fontWeight: '700',
  },
  myQrPill: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  myQrText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
