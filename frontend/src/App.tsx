import { useEffect, useState } from 'react';
import { refreshAll, refreshSource, markRead } from './lib/api';
import { useAuth, useSources, useItems } from './hooks';
import LoginPage from './components/LoginPage';
import TopBar from './components/TopBar';
import SourcePanel from './components/SourcePanel';
import InboxView from './components/InboxView';
import FetchLogView from './components/FetchLogView';
import ClashPage from './components/ClashPage';
import './styles.css';

export default function App() {
  const { currentUser, authLoading, handleLoginSuccess, handleLogout } = useAuth();
  const { sources, runs, load: loadSources } = useSources();
  const {
    items, setItems, topic, setTopic, sourceId, setSourceId,
    query, setQuery, unreadOnly, setUnreadOnly,
    selectedItem, setSelectedItemId,
    unreadCount, starredCount, load: loadItems
  } = useItems(sources);
  const [view, setView] = useState<'inbox' | 'fetch-log'>('inbox');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    await Promise.all([loadSources(), loadItems()]);
  }

  useEffect(() => {
    if (!currentUser) return;
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [currentUser, topic, sourceId, unreadOnly]);

  async function withBusy(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectItem(item: typeof items[0]) {
    setSelectedItemId(item.id);
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt } : entry)));
      try {
        await markRead(item.id, true);
      } catch (err) {
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: null } : entry)));
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (authLoading && !currentUser) {
    return (
      <main className="shell">
        <div className="login-page">
          <div className="login-card">
            <p className="eyebrow">Checking authentication...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="shell">
        <LoginPage onSuccess={handleLoginSuccess} />
      </main>
    );
  }

  if (window.location.pathname === '/clash') {
    return <ClashPage email={currentUser.email} onLogout={handleLogout} />;
  }

  return (
    <main className="shell">
      <TopBar
        email={currentUser.email}
        sourcesCount={sources.length}
        itemsCount={items.length}
        unreadCount={unreadCount}
        starredCount={starredCount}
        onLogout={handleLogout}
        busy={busy}
        onError={setError}
      />

      {error ? <div className="notice">{error}</div> : null}

      <section className="workspace">
        <SourcePanel
          sources={sources}
          busy={busy}
          onAction={withBusy}
        />

        <section className="reader-workspace">
          <div className="view-tabs" aria-label="Main view">
            <button className={view === 'inbox' ? 'active' : ''} onClick={() => setView('inbox')}>
              Inbox
            </button>
            <button className={view === 'fetch-log' ? 'active' : ''} onClick={() => setView('fetch-log')}>
              Fetch log
            </button>
          </div>

          {view === 'inbox' ? (
            <InboxView
              items={items}
              sources={sources}
              selectedItem={selectedItem}
              busy={busy}
              topic={topic}
              sourceId={sourceId}
              query={query}
              unreadOnly={unreadOnly}
              onTopicChange={setTopic}
              onSourceIdChange={setSourceId}
              onQueryChange={setQuery}
              onUnreadOnlyChange={setUnreadOnly}
              onSelectItem={selectItem}
              onAction={withBusy}
              onSearch={() => void load()}
            />
          ) : (
            <FetchLogView runs={runs} />
          )}
        </section>
      </section>
    </main>
  );
}
