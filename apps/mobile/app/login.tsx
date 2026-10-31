import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CedarColors, CedarTypography } from '@credics/core';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  ChevronLeft,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ViewState = 'login' | 'forgot-email' | 'forgot-otp' | 'update-password';
type LoginTab = 'password' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>('login');
  const [activeTab, setActiveTab] = useState<LoginTab>('password');

  // Form States - Default user matches web app
  const [email, setEmail] = useState('jiadbinhanan@gmail.com');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');

  // Visibility States
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // OTP Login sub-state
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailPickerOpen, setIsEmailPickerOpen] = useState(false);

  // Resend countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 1. Password Login
  const handlePasswordLogin = async () => {
    if (!email.trim() || !password) {
      setError('ইমেইল ও পাসওয়ার্ড উভয়ই প্রদান করুন।');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
                router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err?.message || 'লগইন ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. OTP Login Request
  const handleSendOtpLogin = async () => {
    if (!email.trim()) {
      setError('অনুগ্রহ করে আপনার ইমেইল এড্রেস লিখুন।');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (otpError) {
        setError(otpError.message);
      } else {
                setOtpSent(true);
        setCountdown(60);
      }
    } catch (err: any) {
      setError(err?.message || 'লগইন কোড পাঠাতে সমস্যা হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Verify OTP Login
  const handleVerifyOtpLogin = async () => {
    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 8 && cleanOtp.length !== 6) {
      setError('অনুগ্রহ করে আপনার ইমেইলে প্রাপ্ত ৮ অথবা ৬ ডিজিটের ওটিপি কোডটি লিখুন।');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'email',
      });

      // Resilience fallback for magiclink OTP type
      if (verifyError && (verifyError.message?.toLowerCase().includes('type') || verifyError.message?.toLowerCase().includes('invalid'))) {
        const fallback = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: cleanOtp,
          type: 'magiclink' as any,
        });
        if (!fallback.error && (fallback.data?.session || fallback.data?.user)) {
          data = fallback.data;
          verifyError = null;
        }
      }

      if (verifyError) {
        setError(verifyError.message || 'ওটিপি কোডটি সঠিক নয় বা মেয়াদ শেষ হয়েছে।');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err?.message || 'ওটিপি ভেরিফিকেশন ব্যর্থ হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Send Reset Code
  const handleSendResetCode = async () => {
    if (!email.trim()) {
      setError('অনুগ্রহ করে আপনার ইমেইল এড্রেস লিখুন।');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) {
        setError(resetError.message);
      } else {
                setView('forgot-otp');
        setCountdown(60);
      }
    } catch (err: any) {
      setError(err?.message || 'রিসেট কোড পাঠাতে সমস্যা হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Verify Reset OTP
  const handleVerifyResetOtp = async () => {
    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 8 && cleanOtp.length !== 6) {
      setError('অনুগ্রহ করে আপনার ইমেইলে প্রাপ্ত ৮ অথবা ৬ ডিজিটের ওটিপি কোডটি লিখুন।');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'recovery',
      });

      if (verifyError) {
        setError(verifyError.message || 'ওটিপি ভ্যালিডেশন ব্যর্থ হয়েছে।');
      } else {
        setView('update-password');
      }
    } catch (err: any) {
      setError(err?.message || 'ওটিপি ভ্যালিডেশন ব্যর্থ হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Update Password
  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
                router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err?.message || 'পাসওয়ার্ড আপডেট করতে সমস্যা হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  const changeView = (newView: ViewState) => {
        setError(null);
    setOtp('');
    setView(newView);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <ShieldCheck size={28} color={CedarColors.forest800} strokeWidth={2.4} />
            </View>
            <Text style={styles.brandTitle}>Credics</Text>
            <Text style={styles.brandTagline}>Credit & Cash Synchronization</Text>
          </View>

          {/* Card Container with Soft Ambient Styling */}
          <View style={styles.cardBox}>
            {/* 1. MAIN LOGIN VIEW */}
            {view === 'login' && (
              <>
                {/* Tabs Switcher: Password vs Instant OTP */}
                <View style={styles.tabSwitcher}>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'password' && styles.activeTabButton]}
                    onPress={() => {
                                            setActiveTab('password');
                      setError(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        activeTab === 'password' && styles.activeTabButtonText,
                      ]}
                    >
                      পাসওয়ার্ড লগইন
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'otp' && styles.activeTabButton]}
                    onPress={() => {
                                            setActiveTab('otp');
                      setError(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        activeTab === 'otp' && styles.activeTabButtonText,
                      ]}
                    >
                      লগইন কোড (OTP)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Email Selector */}
                <Text style={styles.inputLabel}>ইমেইল আইডি</Text>
                <TouchableOpacity
                  style={styles.emailSelector}
                  onPress={() => {
                                        setIsEmailPickerOpen(!isEmailPickerOpen);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.inputIconLeft}>
                    <Mail size={16} color={CedarColors.ink500} />
                  </View>
                  <Text style={styles.emailSelectorText} numberOfLines={1}>
                    {email}
                  </Text>
                  <ChevronDown size={16} color={CedarColors.ink500} />
                </TouchableOpacity>

                {/* Email Dropdown Options */}
                {isEmailPickerOpen && (
                  <View style={styles.emailDropdown}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        email === 'jiadbinhanan@gmail.com' && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                                                setEmail('jiadbinhanan@gmail.com');
                        setIsEmailPickerOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>jiadbinhanan@gmail.com (Jiad)</Text>
                      {email === 'jiadbinhanan@gmail.com' && (
                        <CheckCircle2 size={14} color={CedarColors.forest800} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        email === 'iasik7591@gmail.com' && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                                                setEmail('iasik7591@gmail.com');
                        setIsEmailPickerOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>iasik7591@gmail.com (Asik)</Text>
                      {email === 'iasik7591@gmail.com' && (
                        <CheckCircle2 size={14} color={CedarColors.forest800} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* TAB 1: PASSWORD LOGIN FORM */}
                {activeTab === 'password' && (
                  <View style={styles.tabContent}>
                    <View style={styles.passwordHeaderRow}>
                      <Text style={styles.inputLabel}>পাসওয়ার্ড</Text>
                      <TouchableOpacity
                        onPress={() => changeView('forgot-email')}
                        hitSlop={8}
                      >
                        <Text style={styles.forgotLink}>পাসওয়ার্ড ভুলে গেছেন?</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputWrap}>
                      <View style={styles.inputIconLeft}>
                        <Lock size={16} color={CedarColors.ink500} />
                      </View>
                      <TextInput
                        style={styles.textInput}
                        placeholder="••••••••"
                        placeholderTextColor={CedarColors.ink500}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={10}
                      >
                        {showPassword ? (
                          <EyeOff size={18} color={CedarColors.ink500} />
                        ) : (
                          <Eye size={18} color={CedarColors.ink500} />
                        )}
                      </TouchableOpacity>
                    </View>

                    {error && (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.submitBtn}
                      onPress={handlePasswordLogin}
                      disabled={isLoading}
                      activeOpacity={0.88}
                    >
                      <LinearGradient
                        colors={[CedarColors.forest900, CedarColors.forest800]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.submitGradient}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#F6F9F5" />
                        ) : (
                          <>
                            <Text style={styles.submitBtnText}>ড্যাশবোর্ডে প্রবেশ করুন</Text>
                            <ArrowRight size={16} color="#F6F9F5" strokeWidth={2.4} />
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                {/* TAB 2: INSTANT OTP LOGIN FORM */}
                {activeTab === 'otp' && (
                  <View style={styles.tabContent}>
                    {!otpSent ? (
                      <>
                        <Text style={styles.helperText}>
                          পাসওয়ার্ডের প্রয়োজন নেই—নির্বাচিত ইমেইলে সরাসরি সিকিউর লগইন ওটিপি যাবে।
                        </Text>

                        {error && (
                          <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.submitBtn}
                          onPress={handleSendOtpLogin}
                          disabled={isLoading}
                          activeOpacity={0.88}
                        >
                          <LinearGradient
                            colors={[CedarColors.forest900, CedarColors.forest800]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.submitGradient}
                          >
                            {isLoading ? (
                              <ActivityIndicator size="small" color="#F6F9F5" />
                            ) : (
                              <>
                                <Text style={styles.submitBtnText}>লগইন কোড পাঠান</Text>
                                <ArrowRight size={16} color="#F6F9F5" strokeWidth={2.4} />
                              </>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <View style={styles.otpNoticeBox}>
                          <CheckCircle2 size={16} color="#2E944B" />
                          <Text style={styles.otpNoticeText}>
                            কোড পাঠানো হয়েছে: <Text style={{ fontWeight: '700' }}>{email}</Text>
                          </Text>
                        </View>

                        <Text style={styles.inputLabel}>ওটিপি কোড লিখুন (৮ বা ৬ ডিজিট)</Text>
                        <TextInput
                          style={[styles.textInputFull, styles.otpInput]}
                          placeholder="12345678"
                          placeholderTextColor={CedarColors.ink500}
                          keyboardType="numeric"
                          maxLength={16}
                          value={otp}
                          onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 8))}
                        />

                        {error && (
                          <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.submitBtn}
                          onPress={handleVerifyOtpLogin}
                          disabled={isLoading || otp.replace(/\D/g, '').length < 6}
                          activeOpacity={0.88}
                        >
                          <LinearGradient
                            colors={[CedarColors.forest900, CedarColors.forest800]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.submitGradient}
                          >
                            {isLoading ? (
                              <ActivityIndicator size="small" color="#F6F9F5" />
                            ) : (
                              <Text style={styles.submitBtnText}>কোড যাচাই ও লগইন</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.otpActionsRow}>
                          <TouchableOpacity
                            onPress={() => {
                                                            setOtpSent(false);
                              setOtp('');
                              setError(null);
                            }}
                          >
                            <Text style={styles.subLink}>ইমেইল পরিবর্তন</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={countdown > 0 || isLoading}
                            onPress={handleSendOtpLogin}
                          >
                            <Text
                              style={[
                                styles.subLink,
                                countdown > 0 && { color: CedarColors.ink500 },
                              ]}
                            >
                              {countdown > 0 ? `পুনরায় পাঠান (${countdown}s)` : 'কোড পুনরায় পাঠান'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </>
            )}

            {/* 2. FORGOT PASSWORD - EMAIL VIEW */}
            {view === 'forgot-email' && (
              <View style={styles.tabContent}>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={() => changeView('login')}
                  hitSlop={8}
                >
                  <ChevronLeft size={16} color={CedarColors.forest800} />
                  <Text style={styles.backText}>লগইনে ফিরে যান</Text>
                </TouchableOpacity>

                <View style={styles.forgotHeader}>
                  <KeyRound size={24} color={CedarColors.forest800} />
                  <Text style={styles.viewTitle}>পাসওয়ার্ড রিসেট</Text>
                  <Text style={styles.viewSubtitle}>
                    আপনার ইমেইল আইডি দিন, আমরা ভেরিফিকেশন ওটিপি পাঠাবো।
                  </Text>
                </View>

                <Text style={styles.inputLabel}>ইউজার ইমেইল</Text>
                <TextInput
                  style={styles.textInputFull}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                {error && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSendResetCode}
                  disabled={isLoading}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[CedarColors.forest900, CedarColors.forest800]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.submitGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#F6F9F5" />
                    ) : (
                      <Text style={styles.submitBtnText}>রিসেট কোড পাঠান</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* 3. FORGOT PASSWORD - OTP VIEW */}
            {view === 'forgot-otp' && (
              <View style={styles.tabContent}>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={() => changeView('login')}
                  hitSlop={8}
                >
                  <ChevronLeft size={16} color={CedarColors.forest800} />
                  <Text style={styles.backText}>লগইনে ফিরে যান</Text>
                </TouchableOpacity>

                <View style={styles.forgotHeader}>
                  <Mail size={24} color={CedarColors.forest800} />
                  <Text style={styles.viewTitle}>কোড যাচাই করুন</Text>
                  <Text style={styles.viewSubtitle}>
                    আমরা {email} এ ভেরিফিকেশন কোড পাঠিয়েছি।
                  </Text>
                </View>

                <Text style={styles.inputLabel}>৮ বা ৬ ডিজিটের কোড</Text>
                <TextInput
                  style={[styles.textInputFull, styles.otpInput]}
                  placeholder="••••••••"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                  maxLength={16}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 8))}
                />

                {error && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleVerifyResetOtp}
                  disabled={isLoading || otp.replace(/\D/g, '').length < 6}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[CedarColors.forest900, CedarColors.forest800]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.submitGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#F6F9F5" />
                    ) : (
                      <Text style={styles.submitBtnText}>কোড যাচাই ও কন্টিনিউ</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* 4. UPDATE PASSWORD VIEW */}
            {view === 'update-password' && (
              <View style={styles.tabContent}>
                <View style={styles.forgotHeader}>
                  <ShieldCheck size={24} color={CedarColors.forest800} />
                  <Text style={styles.viewTitle}>নতুন পাসওয়ার্ড সেট করুন</Text>
                  <Text style={styles.viewSubtitle}>
                    আপনার অ্যাকাউন্টের জন্য নতুন একটি শক্তিশালী পাসওয়ার্ড লিখুন।
                  </Text>
                </View>

                <Text style={styles.inputLabel}>নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</Text>
                <View style={styles.inputWrap}>
                  <View style={styles.inputIconLeft}>
                    <Lock size={16} color={CedarColors.ink500} />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor={CedarColors.ink500}
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    hitSlop={10}
                  >
                    {showNewPassword ? (
                      <EyeOff size={18} color={CedarColors.ink500} />
                    ) : (
                      <Eye size={18} color={CedarColors.ink500} />
                    )}
                  </TouchableOpacity>
                </View>

                {error && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleUpdatePassword}
                  disabled={isLoading}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[CedarColors.forest900, CedarColors.forest800]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.submitGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#F6F9F5" />
                    ) : (
                      <Text style={styles.submitBtnText}>পাসওয়ার্ড সেভ ও কন্টিনিউ</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: CedarColors.card,
    borderWidth: 1.5,
    borderColor: CedarColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  brandTitle: {
    fontSize: 28,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  cardBox: {
    backgroundColor: CedarColors.card,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1.2,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  activeTabButton: {
    backgroundColor: CedarColors.forest800,
  },
  tabButtonText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  activeTabButtonText: {
    color: '#F6F9F5',
  },
  tabContent: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emailSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  emailSelectorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '600',
    marginLeft: 8,
  },
  emailDropdown: {
    backgroundColor: CedarColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingVertical: 4,
    marginBottom: 14,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(10, 38, 28, 0.06)',
  },
  dropdownItemText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  passwordHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIconLeft: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    height: '100%',
  },
  textInputFull: {
    height: 48,
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    marginBottom: 12,
  },
  otpInput: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: '800',
  },
  eyeBtn: {
    padding: 6,
  },
  helperText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    lineHeight: 16,
    marginBottom: 14,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#DC2626',
    textAlign: 'center',
  },
  submitBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  submitGradient: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  otpNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(46, 148, 75, 0.2)',
    marginBottom: 12,
  },
  otpNoticeText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#2E944B',
  },
  otpActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  subLink: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  forgotHeader: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  viewTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  viewSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textAlign: 'center',
  },
});
