import type { Item, Source } from '../../../src/types';
import { markRead, setStarred } from '../lib/api';
import { topics } from '../hooks';

function previewText(value: string | null | undefined, maxLength = 420) {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function renderItemBody(text: string | null | undefined) {
  if (!text) return null;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length <= 1) return <p>{previewText(text, 180)}</p>;
  return paragraphs.map((p, i) => <p key={i}>{previewText(p.trim(), 300)}</p>);
}

interface InboxViewProps {
  items: Item[];
  sources: Source[];
  selectedItem: Item | null;
  busy: boolean;
  topic: string;
  sourceId: string;
  query: string;
  unreadOnly: boolean;
  onTopicChange: (topic: string) => void;
  onSourceIdChange: (id: string) => void;
  onQueryChange: (q: string) => void;
  onUnreadOnlyChange: (v: boolean) => void;
  onSelectItem: (item: Item) => void;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
  onSearch: () => void;
}

export default function InboxView({
  items, sources, selectedItem, busy,
  topic, sourceId, query, unreadOnly,
  onTopicChange, onSourceIdChange, onQueryChange, onUnreadOnlyChange,
  onSelectItem, onAction, onSearch
}: InboxViewProps) {
  return (
    <div className="inbox-layout">
      <section className="list-panel">
        <div className="filters">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearch();
            }}
            placeholder="Search title, summary, content"
          />
          <select value={topic} onChange={(event) => onTopicChange(event.target.value)}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={sourceId} onChange={(event) => onSourceIdChange(event.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className={unreadOnly ? 'active' : ''} onClick={() => onUnreadOnlyChange(!unreadOnly)}>
            Unread
          </button>
          <button disabled={busy} onClick={onSearch}>
            Search
          </button>
        </div>

        <div className="items">
          {items.map((item) => (
            <article
              key={item.id}
              className={`${item.readAt ? 'item read' : 'item'} ${selectedItem?.id === item.id ? 'selected' : ''}`}
              onClick={() => onSelectItem(item)}
            >
              <div className="item-meta">
                <span>
                  {!item.readAt ? <b className="unread-dot" aria-label="Unread" /> : null}
                  {item.sourceName}
                </span>
                <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'No date'}</span>
              </div>
              <h2>{item.title}</h2>
              {item.summary ? renderItemBody(item.summary) : null}
              <div className="item-footer">
                <div className="tags">
                  {item.topics.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="item-actions">
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onAction(() => markRead(item.id, !item.readAt));
                    }}
                  >
                    {item.readAt ? 'Unread' : 'Read'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onAction(() => setStarred(item.id, !item.starred));
                    }}
                  >
                    {item.starred ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {items.length === 0 ? (
            <div className="empty">Add a source, fetch it, and the inbox will fill here.</div>
          ) : null}
        </div>
      </section>

      <article className="reading-panel">
        {selectedItem ? (
          <ReadingView item={selectedItem} busy={busy} onAction={onAction} />
        ) : (
          <div className="empty">Select an item to preview it here.</div>
        )}
      </article>
    </div>
  );
}

function ReadingView({ item, busy, onAction }: { item: Item; busy: boolean; onAction: (action: () => Promise<unknown>) => Promise<void> }) {
  const bodyText = item.summary || item.contentText;
  const paragraphs = bodyText ? bodyText.split(/\n{2,}/).filter((p) => p.trim()) : [];

  return (
    <>
      <div className="reading-meta">
        <span>{item.sourceName}</span>
        <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'No date'}</span>
      </div>
      <h2>{item.title}</h2>
      <div className="reading-actions">
        <a
          href={item.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
        <button disabled={busy} onClick={() => void onAction(() => markRead(item.id, !item.readAt))}>
          {item.readAt ? 'Mark unread' : 'Mark read'}
        </button>
        <button disabled={busy} onClick={() => void onAction(() => setStarred(item.id, !item.starred))}>
          {item.starred ? 'Saved' : 'Save'}
        </button>
      </div>
      <div className="reading-tags">
        {item.topics.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="reading-body">
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => <p key={i}>{p.trim()}</p>)
        ) : (
          <p>No summary is available for this item. Open the original source for the full article.</p>
        )}
      </div>
    </>
  );
}
