import { useEffect, useMemo, useState } from 'react';
import type { Item, Source, FetchRun, Topic } from '../../src/types';
import {
  getCurrentUser,
  getToken,
  clearToken,
  setToken as storeToken,
  listSources,
  listItems,
  listFetchRuns
} from './lib/api';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    getCurrentUser()
      .then((user: { id: number; email: string }) => setCurrentUser(user))
      .catch(() => {
        clearToken();
        setCurrentUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  function handleLoginSuccess(token: string, user: { id: number; email: string }) {
    storeToken(token);
    setCurrentUser(user);
  }

  function handleLogout() {
    clearToken();
    setCurrentUser(null);
  }

  return { currentUser, authLoading, handleLoginSuccess, handleLogout };
}

export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<FetchRun[]>([]);

  async function load() {
    const [nextSources, nextRuns] = await Promise.all([
      listSources(),
      listFetchRuns()
    ]);
    setSources(nextSources);
    setRuns(nextRuns);
  }

  return { sources, setSources, runs, setRuns, load };
}

export function useItems(sources: Source[]) {
  const [items, setItems] = useState<Item[]>([]);
  const [topic, setTopic] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  async function load() {
    const nextItems = await listItems({
      topic: topic || undefined,
      sourceId: sourceId ? Number(sourceId) : undefined,
      unread: unreadOnly,
      q: query || undefined
    });
    setItems(nextItems);
  }

  useEffect(() => {
    load().catch(() => {});
  }, [topic, sourceId, unreadOnly]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const starredCount = useMemo(() => items.filter((item) => item.starred).length, [items]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId]
  );

  useEffect(() => {
    if (items.length === 0) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  return {
    items, setItems, topic, setTopic, sourceId, setSourceId,
    query, setQuery, unreadOnly, setUnreadOnly,
    selectedItemId, setSelectedItemId, selectedItem,
    unreadCount, starredCount, load
  };
}

export const topics: Topic[] = ['ai', 'games', 'single-cell', 'biopharma', 'medicine', 'other'];
