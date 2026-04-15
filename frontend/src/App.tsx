import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Item, Source, SourceType, Topic, FetchRun } from '../../src/types';
import {
  createSource,
  deleteSource,
  listFetchRuns,
  listItems,
  listSources,
  markRead,
  refreshAll,
  refreshSource,
  setStarred,
  type SourceInput
} from './lib/api';
import './styles.css';

const topics: Topic[] = ['ai', 'games', 'single-cell', 'biopharma', 'medicine', 'other'];
const sourceTypes: SourceType[] = ['rss', 'rsshub', 'web_page', 'x_user', 'x_search'];
const sourceGroups: Array<{ id: string; label: string; types: SourceType[] }> = [
  { id: 'rss-websites', label: 'RSS / Websites', types: ['rss', 'rsshub', 'web_page'] },
  { id: 'x-users', label: 'X Users', types: ['x_user'] },
  { id: 'x-searches', label: 'X Searches', types: ['x_search'] }
];

const emptySource: SourceInput = {
  name: '',
  url: '',
  type: 'rss',
  topics: [],
  enabled: true,
  fetchIntervalMinutes: 30,
  dailyRequestLimit: 100
};

function previewText(value: string | null | undefined, maxLength = 420) {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [runs, setRuns] = useState<FetchRun[]>([]);
  const [draft, setDraft] = useState<SourceInput>(emptySource);
  const [topic, setTopic] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, setView] = useState<'inbox' | 'fetch-log'>('inbox');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const value = window.localStorage.getItem('rss-reader.sourceGroups');
      return value ? (JSON.parse(value) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [nextSources, nextItems, nextRuns] = await Promise.all([
      listSources(),
      listItems({
        topic: topic || undefined,
        sourceId: sourceId ? Number(sourceId) : undefined,
        unread: unreadOnly,
        q: query || undefined
      }),
      listFetchRuns()
    ]);
    setSources(nextSources);
    setItems(nextItems);
    setRuns(nextRuns);
  }

  useEffect(() => {
    load().catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [topic, sourceId, unreadOnly]);

  useEffect(() => {
    window.localStorage.setItem('rss-reader.sourceGroups', JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const starredCount = useMemo(() => items.filter((item) => item.starred).length, [items]);
  const groupedSources = useMemo(
    () =>
      sourceGroups
        .map((group) => ({
          ...group,
          sources: sources.filter((source) => group.types.includes(source.type))
        }))
        .filter((group) => group.sources.length > 0),
    [sources]
  );

  async function withBusy(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function submitSource(event: FormEvent) {
    event.preventDefault();
    await withBusy(async () => {
      await createSource(draft);
      setDraft(emptySource);
    });
  }

  function toggleTopic(nextTopic: Topic) {
    setDraft((current) => ({
      ...current,
      topics: current.topics.includes(nextTopic)
        ? current.topics.filter((existing) => existing !== nextTopic)
        : [...current.topics, nextTopic]
    }));
  }

  async function openItem(item: Item) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt } : entry)));
      try {
        await markRead(item.id, true);
      } catch (nextError) {
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: null } : entry)));
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }
  }

  function toggleSourceGroup(groupId: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId]
    }));
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Local intelligence reader</p>
          <h1>RSS-reader</h1>
        </div>
        <div className="metrics" aria-label="Reader metrics">
          <span>{sources.length} sources</span>
          <span>{items.length} items</span>
          <span>{unreadCount} unread</span>
          <span>{starredCount} saved</span>
        </div>
      </section>

      {error ? <div className="notice">{error}</div> : null}

      <section className="workspace">
        <aside className="source-panel">
          <div className="panel-heading">
            <h2>Sources</h2>
            <button disabled={busy} onClick={() => withBusy(refreshAll)}>
              Refresh all
            </button>
          </div>

          <form className="source-form" onSubmit={submitSource}>
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="OpenAI blog"
                required
              />
            </label>
            <label>
              URL / query
              <input
                value={draft.url}
                onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://openai.com/blog/rss.xml or @xdevs"
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Type
                <select
                  value={draft.type}
                  onChange={(event) => {
                    const nextType = event.target.value as SourceType;
                    setDraft((current) => ({
                      ...current,
                      type: nextType,
                      fetchIntervalMinutes:
                        nextType === 'x_user' || nextType === 'x_search' || nextType === 'web_page'
                          ? 1440
                          : current.fetchIntervalMinutes,
                      dailyRequestLimit:
                        nextType === 'x_user' || nextType === 'x_search'
                          ? 2
                          : nextType === 'web_page'
                            ? 10
                            : current.dailyRequestLimit
                    }));
                  }}
                >
                  {sourceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Interval minutes
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={draft.fetchIntervalMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, fetchIntervalMinutes: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Daily requests
                <input
                  type="number"
                  min="0"
                  value={draft.dailyRequestLimit}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dailyRequestLimit: Number(event.target.value) }))
                  }
                />
              </label>
            </div>
            <div className="topic-picker">
              {topics.map((nextTopic) => (
                <button
                  key={nextTopic}
                  type="button"
                  className={draft.topics.includes(nextTopic) ? 'selected' : ''}
                  onClick={() => toggleTopic(nextTopic)}
                >
                  {nextTopic}
                </button>
              ))}
            </div>
            <button className="primary" disabled={busy}>
              Add source
            </button>
          </form>

          <div className="source-list">
            {groupedSources.map((group) => {
              const collapsed = collapsedGroups[group.id] ?? false;
              return (
                <section key={group.id} className="source-group">
                  <button
                    type="button"
                    className="source-group-heading"
                    aria-expanded={!collapsed}
                    onClick={() => toggleSourceGroup(group.id)}
                  >
                    <span>{collapsed ? '▸' : '▾'} {group.label}</span>
                    <span>{group.sources.length}</span>
                  </button>
                  {!collapsed ? (
                    <div className="source-group-items">
                      {group.sources.map((source) => (
                        <article key={source.id} className="source-row">
                          <div className="favicon" aria-hidden="true">
                            {source.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <strong>{source.name}</strong>
                            <span>
                              {source.type} · {source.lastStatus ?? 'new'}
                            </span>
                          </div>
                          <div className="row-actions">
                            <button disabled={busy} onClick={() => withBusy(() => refreshSource(source.id))}>
                              Fetch
                            </button>
                            <button disabled={busy} onClick={() => withBusy(() => deleteSource(source.id))}>
                              Delete
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </aside>

        <section className="feed-panel">
          <div className="view-tabs" aria-label="Main view">
            <button className={view === 'inbox' ? 'active' : ''} onClick={() => setView('inbox')}>
              Inbox
            </button>
            <button className={view === 'fetch-log' ? 'active' : ''} onClick={() => setView('fetch-log')}>
              Fetch log
            </button>
          </div>

          {view === 'inbox' ? (
            <>
          <div className="filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void load();
              }}
              placeholder="Search title, summary, content"
            />
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">All topics</option>
              {topics.map((nextTopic) => (
                <option key={nextTopic} value={nextTopic}>
                  {nextTopic}
                </option>
              ))}
            </select>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">All sources</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            <button className={unreadOnly ? 'active' : ''} onClick={() => setUnreadOnly((value) => !value)}>
              Unread
            </button>
            <button disabled={busy} onClick={() => void load()}>
              Search
            </button>
          </div>

          <div className="items">
            {items.map((item) => (
              <article key={item.id} className={item.readAt ? 'item read' : 'item'}>
                <div className="item-meta">
                  <span>
                    {!item.readAt ? <b className="unread-dot" aria-label="Unread" /> : null}
                    {item.sourceName}
                  </span>
                  <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'No date'}</span>
                </div>
                <h2>
                  <a href={item.canonicalUrl} target="_blank" rel="noreferrer" onClick={() => void openItem(item)}>
                    {item.title}
                  </a>
                </h2>
                {item.summary ? <p>{previewText(item.summary)}</p> : null}
                <div className="item-footer">
                  <div className="tags">
                    {item.topics.map((itemTopic) => (
                      <span key={itemTopic}>{itemTopic}</span>
                    ))}
                  </div>
                  <div className="item-actions">
                    <button disabled={busy} onClick={() => withBusy(() => markRead(item.id, !item.readAt))}>
                      {item.readAt ? 'Unread' : 'Read'}
                    </button>
                    <button disabled={busy} onClick={() => withBusy(() => setStarred(item.id, !item.starred))}>
                      {item.starred ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {items.length === 0 ? <div className="empty">Add a source, fetch it, and the inbox will fill here.</div> : null}
          </div>
            </>
          ) : (
            <section className="runs">
              <div className="run-grid">
                {runs.map((run) => (
                  <div key={run.id} className="run-row">
                    <strong>{run.sourceName}</strong>
                    <span>{run.status}</span>
                    <span>{run.newCount}/{run.itemCount} new</span>
                    <span>{run.requestCount} requests</span>
                    {run.error ? <em>{run.error}</em> : <span />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
