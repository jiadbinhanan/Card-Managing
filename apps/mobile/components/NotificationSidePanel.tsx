import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from './HapticButton';
import {
  Bell,
  X,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  CalendarClock,
  Clock,
  Banknote,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { requestOverlayPermission } from '../utils/overlayPermission';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(SCREEN_WIDTH * 0.88, 380);

const SPRING_CONFIG = {
  damping: 28,
  stiffness: 340,
  mass: 0.8,
};

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  category?: string;
  is_read?: boolean;
  created_at: string;
}

interface NotificationSidePanelProps {
  visible: boolean;
  onClose: () => void;
  urgentBill?: {
    cardName: string;
    last4Digits: string;
    dueAmount: number;
    dueDate: string;
    daysLeft: number;
    onPayNow?: () => void;
    onRotateLimit?: () => void;
  } | null;
}

export function NotificationSidePanel({
  visible,
  onClose,
  urgentBill,
}: NotificationSidePanelProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'bills' | 'general'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const translateX = useSharedValue(PANEL_WIDTH);
  const backdropOpacity = useSharedValue(0);

  // Fetch live notifications from Supabase
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchNotifs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);

        if (!error && data && isMounted) {
          setNotifications(data as NotificationItem[]);
        }
      } catch (e) {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNotifs();
    return () => {
      isMounted = false;
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      translateX.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(0.6, { duration: 240 });
    } else {
      translateX.value = PANEL_WIDTH;
      backdropOpacity.value = 0;
    }
  }, [visible]);

  const handleDismiss = () => {
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateX.value = withSpring(PANEL_WIDTH, { damping: 30, stiffness: 420 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  // Swipe right on the panel to dismiss
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationX > 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      if (event.translationX > 80 || event.velocityX > 400) {
        runOnJS(handleDismiss)();
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, PANEL_WIDTH],
      [0.6, 0],
      Extrapolation.CLAMP
    ),
  }));

  const filteredNotifs = useMemo(() => {
    if (activeTab === 'bills') {
      return notifications.filter((n) => n.category === 'bill' || (n.title || '').toLowerCase().includes('bill'));
    }
    if (activeTab === 'general') {
      return notifications.filter((n) => n.category !== 'bill');
    }
    return notifications;
  }, [notifications, activeTab]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Separate backdrop overlay - NEVER wraps the panel so panel is never dimmed */}
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </Animated.View>

        {/* Right Slide-in Panel */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.panel, animatedPanelStyle]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.bellBadge}>
                  <Bell size={18} color="#071A12" strokeWidth={2.4} />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Notifications</Text>
                  <Text style={styles.headerSubtitle}>Alerts & Activity Feed</Text>
                </View>
              </View>

              <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={10}>
                <X size={20} color={CedarColors.ink700} />
              </Pressable>
            </View>

            {/* Filter Tabs */}
            <View style={styles.tabBar}>
              {(['all', 'bills', 'general'] as const).map((tab) => {
                const isTab = activeTab === tab;
                const label = tab === 'all' ? 'All' : tab === 'bills' ? 'Bills Due' : 'General';
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tabBtn, isTab && styles.activeTabBtn]}
                  >
                    <Text style={[styles.tabBtnText, isTab && styles.activeTabBtnText]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Panel Scroll Content */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Urgent Bill Banner (if present) */}
              {urgentBill && (
                <View style={styles.urgentCard}>
                  <View style={styles.urgentHeader}>
                    <View style={styles.urgentAlertBadge}>
                      <AlertTriangle size={13} color="#FFFFFF" strokeWidth={2.5} />
                      <Text style={styles.urgentAlertText}>
                        {urgentBill.daysLeft <= 1
                          ? 'DUE IN 24 HOURS'
                          : `DUE IN ${urgentBill.daysLeft} DAYS`}
                      </Text>
                    </View>
                    <Text style={styles.urgentDueDate}>{urgentBill.dueDate}</Text>
                  </View>

                  <View style={styles.urgentBody}>
                    <View>
                      <Text style={styles.urgentCardName}>
                        {urgentBill.cardName} (••{urgentBill.last4Digits})
                      </Text>
                      <Text style={styles.urgentSub}>Payment Pending</Text>
                    </View>
                    <Text style={styles.urgentAmount}>
                      ₹{urgentBill.dueAmount.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.urgentActionRow}>
                    <HapticButton
                      style={styles.payBtn}
                      onPress={urgentBill.onPayNow || handleDismiss}
                    >
                      <Text style={styles.payBtnText}>Pay Bill Now</Text>
                      <ArrowRight size={14} color="#F6F9F5" strokeWidth={2.4} />
                    </HapticButton>

                    <HapticButton
                      style={styles.rotateBtn}
                      onPress={urgentBill.onRotateLimit || handleDismiss}
                    >
                      <RefreshCw size={13} color={CedarColors.forest800} strokeWidth={2} />
                      <Text style={styles.rotateBtnText}>Rotate</Text>
                    </HapticButton>
                  </View>

                  <Pressable
                    style={styles.overlayPermRow}
                    onPress={requestOverlayPermission}
                  >
                    <ShieldAlert size={12} color="#2E944B" />
                    <Text style={styles.overlayPermText}>
                      Enable display over other apps for background popups
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Feed Title */}
              <View style={styles.feedHeaderRow}>
                <Clock size={13} color={CedarColors.ink500} />
                <Text style={styles.feedHeaderText}>Recent Alerts</Text>
              </View>

              {/* Notification List */}
              {filteredNotifs.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <CalendarClock size={36} color={CedarColors.ink500} opacity={0.6} />
                  <Text style={styles.emptyTitle}>No New Notifications</Text>
                  <Text style={styles.emptySub}>
                    You're all caught up with your statements and cards.
                  </Text>
                </View>
              ) : (
                filteredNotifs.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.notifCard, !item.is_read && styles.unreadCard]}
                  >
                    <View style={styles.notifIconCircle}>
                      {item.category === 'bill' ? (
                        <CreditCard size={15} color={CedarColors.forest800} />
                      ) : (
                        <Banknote size={15} color="#2E944B" />
                      )}
                    </View>
                    <View style={styles.notifBody}>
                      <Text style={styles.notifTitle}>{item.title}</Text>
                      <Text style={styles.notifDesc}>{item.body}</Text>
                      <Text style={styles.notifTime}>
                        {new Date(item.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#040D09',
  },
  panel: {
    width: PANEL_WIDTH,
    height: '100%',
    backgroundColor: '#F8FAF8', // Crisp solid luxury background
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 24,
    borderLeftWidth: 1.5,
    borderLeftColor: '#DCE8DE',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EFE7',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#E4EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C8DEC9',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAEFE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#EBF2EC',
  },
  activeTabBtn: {
    backgroundColor: CedarColors.forest800,
  },
  tabBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  activeTabBtnText: {
    color: '#F6F9F5',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  urgentCard: {
    backgroundColor: '#FFF8F7',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginBottom: 18,
    shadowColor: '#D94338',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  urgentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  urgentAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  urgentAlertText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  urgentDueDate: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#DC2626',
    fontWeight: '700',
  },
  urgentBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urgentCardName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  urgentSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  urgentAmount: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#DC2626',
  },
  urgentActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  payBtn: {
    flex: 2,
    backgroundColor: CedarColors.forest800,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  payBtnText: {
    color: '#F6F9F5',
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
  },
  rotateBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E2D5',
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  rotateBtnText: {
    color: CedarColors.forest800,
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  overlayPermRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
    justifyContent: 'center',
  },
  overlayPermText: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    marginTop: 4,
  },
  feedHeaderText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '800',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  emptySub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  notifCard: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6ECE6',
    marginBottom: 8,
    gap: 10,
  },
  unreadCard: {
    borderColor: '#A8D5B5',
    backgroundColor: '#F3FAF5',
  },
  notifIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EAF3EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBody: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  notifDesc: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 4,
  },
});
