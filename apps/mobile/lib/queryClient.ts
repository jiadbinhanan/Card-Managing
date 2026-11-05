import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { createStoragePersister } from './storage';

// 1. Wire TanStack Query onlineManager to NetInfo
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

// 2. Wire TanStack Query focusManager to React Native AppState (background/foreground)
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

AppState.addEventListener('change', onAppStateChange);

// 3. Initialize QueryClient with optimal mobile options
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes fresh cache
      gcTime: 24 * 60 * 60 * 1000, // 24 hours persistent retention on disk
      networkMode: 'offlineFirst', // Instant offline fallback
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

// 4. Create persistent storage persister
export const queryPersister = createStoragePersister('CREDICS_REACT_QUERY_CACHE');
