import { useState, useEffect, useCallback } from 'react';

export type RecentSearch = {
  ticker: string;
  name: string;
  exchange: string;
  logoUrl: string | null;
};

const MAX_RECENT_SEARCHES = 5;
const STORAGE_KEY = 'bullvision_recent_searches';

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isClient, setIsClient] = useState(false);

  const loadSearches = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      } else {
        setRecentSearches([]);
      }
    } catch (e) {
      console.error('Failed to load recent searches', e);
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
    loadSearches();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadSearches();
      }
    };

    const handleCustomEvent = () => {
      loadSearches();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('recentSearchesUpdated', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('recentSearchesUpdated', handleCustomEvent);
    };
  }, [loadSearches]);

  const updateStorageAndNotify = (newSearches: RecentSearch[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSearches));
      window.dispatchEvent(new Event('recentSearchesUpdated'));
    } catch (e) {
      console.error('Failed to save recent search', e);
    }
  };

  const addSearch = (search: RecentSearch) => {
    const filtered = recentSearches.filter((s) => s.ticker !== search.ticker);
    const newSearches = [search, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(newSearches);
    updateStorageAndNotify(newSearches);
  };

  const removeSearch = (ticker: string) => {
    const newSearches = recentSearches.filter((s) => s.ticker !== ticker);
    setRecentSearches(newSearches);
    updateStorageAndNotify(newSearches);
  };

  const clearSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event('recentSearchesUpdated'));
    } catch (e) {
      console.error('Failed to clear recent searches', e);
    }
  };

  return {
    recentSearches: isClient ? recentSearches : [],
    addSearch,
    removeSearch,
    clearSearches,
    isClient,
  };
}
