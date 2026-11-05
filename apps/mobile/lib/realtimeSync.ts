import { useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { useDashboardStore } from './dashboardStore';

/**
 * Hook to initialize a single centralized Supabase Realtime channel at the app root.
 * Debounces query invalidations to prevent cascading network thrashing.
 */
export function useCentralizedRealtimeSync() {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const triggerDebouncedInvalidate = (keys: string[][]) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        keys.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });

        // Sync with dashboardStore Zustand state if initialized
        if (useDashboardStore.getState().isInitialized) {
          useDashboardStore.getState().fetchDashboardData('all').catch(() => {});
        }
      }, 150);
    };

    const channel = supabase
      .channel('credics-mobile-realtime-bus')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_transactions' },
        () => triggerDebouncedInvalidate([['cards'], ['transactions'], ['dashboard'], ['settlements']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spends' },
        () => triggerDebouncedInvalidate([['cards'], ['transactions'], ['dashboard'], ['ledgers']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_on_hand' },
        () => triggerDebouncedInvalidate([['cash_on_hand'], ['dashboard'], ['ledgers']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_on_hand_ledger' },
        () => triggerDebouncedInvalidate([['cash_on_hand'], ['dashboard'], ['ledgers']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_cycles' },
        () => triggerDebouncedInvalidate([['cards'], ['billing_cycles'], ['dashboard']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_lent_ledger' },
        () => triggerDebouncedInvalidate([['borrowers'], ['lents']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pocket_lent_ledger' },
        () => triggerDebouncedInvalidate([['borrowers'], ['lents']])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qrs' },
        () => triggerDebouncedInvalidate([['qrs'], ['dashboard'], ['settlements']])
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, []);
}
