import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface UserProfile {
  id: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
}

export interface AccessibleCard {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string | null;
  bill_gen_day?: number;
  bill_due_day?: number;
  holder_name?: string | null;
  network?: string | null;
  [key: string]: any;
}

interface AuthState {
  currentUser: any | null;
  userProfile: UserProfile | null;
  allProfiles: UserProfile[];
  accessibleCards: AccessibleCard[];
  isInitialized: boolean;
  isLoading: boolean;
  initAuth: (force?: boolean) => Promise<{
    user: any | null;
    profile: UserProfile | null;
    allProfiles: UserProfile[];
    cards: AccessibleCard[];
  }>;
  refreshCards: () => Promise<AccessibleCard[]>;
  resetAuth: () => void;
}

let activeInitPromise: Promise<{
  user: any | null;
  profile: UserProfile | null;
  allProfiles: UserProfile[];
  cards: AccessibleCard[];
}> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  userProfile: null,
  allProfiles: [],
  accessibleCards: [],
  isInitialized: false,
  isLoading: false,

  initAuth: async (force = false) => {
    const state = get();
    // Return cached state instantly if already initialized and not forced
    if (state.isInitialized && !force && state.currentUser) {
      return {
        user: state.currentUser,
        profile: state.userProfile,
        allProfiles: state.allProfiles,
        cards: state.accessibleCards,
      };
    }

    // Deduplicate in-flight requests (prevent simultaneous redundant calls)
    if (activeInitPromise && !force) {
      return activeInitPromise;
    }

    activeInitPromise = (async () => {
      set({ isLoading: true });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          set({
            currentUser: null,
            userProfile: null,
            allProfiles: [],
            accessibleCards: [],
            isInitialized: true,
            isLoading: false,
          });
          return { user: null, profile: null, allProfiles: [], cards: [] };
        }

        // Fetch user profile, all profiles, and card access in parallel
        const [profileRes, allProfilesRes, accessRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('profiles').select('*'),
          supabase.from('card_access').select('card_id').eq('user_id', user.id),
        ]);

        const profile = profileRes.data || null;
        const allProfiles = allProfilesRes.data || [];
        const accessData = accessRes.data || [];

        let cards: AccessibleCard[] = [];
        if (accessData.length > 0) {
          const cardIds = accessData.map((a: any) => a.card_id);
          const { data: cardData } = await supabase
            .from('cards')
            .select('*')
            .in('id', cardIds)
            .order('is_primary', { ascending: false });
          if (cardData) {
            cards = cardData;
          }
        }

        set({
          currentUser: user,
          userProfile: profile,
          allProfiles,
          accessibleCards: cards,
          isInitialized: true,
          isLoading: false,
        });

        return { user, profile, allProfiles, cards };
      } catch (err) {
        console.error('Error in useAuthStore.initAuth:', err);
        set({ isLoading: false });
        return {
          user: get().currentUser,
          profile: get().userProfile,
          allProfiles: get().allProfiles,
          cards: get().accessibleCards,
        };
      } finally {
        activeInitPromise = null;
      }
    })();

    return activeInitPromise;
  },

  refreshCards: async () => {
    const user = get().currentUser;
    if (!user) return [];
    try {
      const { data: accessData } = await supabase
        .from('card_access')
        .select('card_id')
        .eq('user_id', user.id);

      if (accessData && accessData.length > 0) {
        const cardIds = accessData.map((a: any) => a.card_id);
        const { data: cards } = await supabase
          .from('cards')
          .select('*')
          .in('id', cardIds)
          .order('is_primary', { ascending: false });

        const newCards = (cards || []) as AccessibleCard[];
        set({ accessibleCards: newCards });
        return newCards;
      }
      return [];
    } catch (err) {
      console.error('Error refreshing cards in authStore:', err);
      return get().accessibleCards;
    }
  },

  resetAuth: () => {
    set({
      currentUser: null,
      userProfile: null,
      allProfiles: [],
      accessibleCards: [],
      isInitialized: false,
      isLoading: false,
    });
  },
}));
