import { FormEvent, useMemo, useState } from 'react';
import type { Source, SourceType, Topic } from '../../../src/types';
import { createSource, deleteSource, refreshAll, refreshSource, type SourceInput } from '../lib/api';
import { topics } from '../hooks';

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

interface SourcePanelProps {
  sources: Source[];
  busy: boolean;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
}

export default function SourcePanel({ sources, busy, onAction }: SourcePanelProps) {
  const [draft, setDraft] = useState<SourceInput>(emptySource);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const value = window.localStorage.getItem('rss-reader.sourceGroups');
      return value ? (JSON.parse(value) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

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

  function toggleTopic(nextTopic: Topic) {
    setDraft((current) => ({
      ...current,
      topics: current.topics.includes(nextTopic)
        ? current.topics.filter((existing) => existing !== nextTopic)
        : [...current.topics, nextTopic]
    }));
  }

  async function submitSource(event: FormEvent) {
    event.preventDefault();
    await onAction(async () => {
      await createSource(draft);
      setDraft(emptySource);
    });
  }

  function toggleSourceGroup(groupId: string) {
    setCollapsedGroups((current) => {
      const next = { ...current, [groupId]: !current[groupId] };
      window.localStorage.setItem('rss-reader.sourceGroups', JSON.stringify(next));
      return next;
    });
  }

  return (
    <aside className="source-panel">
      <div className="panel-heading">
        <h2>Sources</h2>
        <button disabled={busy} onClick={() => void onAction(() => refreshAll())}>
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
                <span>{collapsed ? '\u25B8' : '\u25BE'} {group.label}</span>
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
                          {source.type} \u00b7 {source.lastStatus ?? 'new'}
                        </span>
                      </div>
                      <div className="row-actions">
                        <button disabled={busy} onClick={() => void onAction(() => refreshSource(source.id))}>
                          Fetch
                        </button>
                        <button disabled={busy} onClick={() => void onAction(() => deleteSource(source.id))}>
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
  );
}
