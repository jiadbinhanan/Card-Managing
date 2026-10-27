"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

export function AppInitializer() {
  useEffect(() => {
    // 0. Initialize native Android Status Bar style (#030014 background + white text/icons)
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#030014" }).catch(() => {});
    }

    // 1. Kick off background auth & cards initialization on initial app load
    useAuthStore.getState().initAuth();

    // 2. Listen to Supabase auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        useAuthStore.getState().initAuth(true);
      } else if (event === "SIGNED_OUT") {
        useAuthStore.getState().resetAuth();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
