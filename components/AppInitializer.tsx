"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

export function AppInitializer() {
  useEffect(() => {
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
