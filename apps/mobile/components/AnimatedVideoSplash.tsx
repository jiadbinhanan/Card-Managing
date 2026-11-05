import React, { useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Dimensions, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { CedarColors } from '@credics/core';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const splashVideoSource = require('../assets/videos/logo_splash.mp4');

// Safely probe for native expo-video support to avoid crashes on builds without the native binary
let hasVideoModule = false;
let useVideoPlayer: any = null;
let VideoView: any = null;
let useEventListener: any = null;

try {
  const expoVideo = require('expo-video');
  const expoModule = require('expo');
  useVideoPlayer = expoVideo.useVideoPlayer;
  VideoView = expoVideo.VideoView;
  useEventListener = expoModule.useEventListener;
  if (useVideoPlayer && VideoView && useEventListener) {
    hasVideoModule = true;
  }
} catch (e) {
  hasVideoModule = false;
}

interface AnimatedVideoSplashProps {
  onFinish: () => void;
}

function VideoSplashInner({ onFinish }: AnimatedVideoSplashProps) {
  const opacity = useSharedValue(1);
  const isDismissing = useRef(false);

  // Initialize expo-video player
  const player = useVideoPlayer(splashVideoSource, (p: any) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  const handleComplete = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;

    // 120Hz smooth Reanimated fade-out
    opacity.value = withTiming(0, { duration: 300 }, (isFinished) => {
      if (isFinished) {
        runOnJS(onFinish)();
      }
    });
  }, [onFinish, opacity]);

  // Listen to video finish event
  useEventListener(player, 'playToEnd', () => {
    handleComplete();
  });

  useEffect(() => {
    // Hide native OS splash screen once video splash mounts
    SplashScreen.hideAsync().catch(() => {});

    // Fallback safety timeout: In case the native playToEnd event is delayed,
    // ensure smooth transition after 1.25 seconds.
    const safetyTimer = setTimeout(() => {
      handleComplete();
    }, 1250);

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [handleComplete]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable style={styles.pressable} onPress={handleComplete}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          showsTimecodes={false}
        />
      </Pressable>
    </Animated.View>
  );
}

export function AnimatedVideoSplash({ onFinish }: AnimatedVideoSplashProps) {
  useEffect(() => {
    if (!hasVideoModule) {
      SplashScreen.hideAsync().catch(() => {});
      onFinish();
    }
  }, [onFinish]);

  if (!hasVideoModule) {
    return null;
  }

  return <VideoSplashInner onFinish={onFinish} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CedarColors.canvas,
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressable: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CedarColors.canvas,
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: CedarColors.canvas,
  },
});
