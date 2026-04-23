import { useEffect, useMemo, useState } from 'react';
import {
  generateClashConfig,
  getClashState,
  saveClashRules,
  type ClashState
} from '../lib/api';

interface ClashPageProps {
  email: string;
  onLogout: () => void;
}

export default function ClashPage({ email, onLogout }: ClashPageProps) {
  const [state, setState] = useState<ClashState | null>(null);
  const [rules, setRules] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const ruleCount = useMemo(
    () => rules.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    }).length,
    [rules]
  );
  const autoRefreshLabel = state?.refreshIntervalMinutes
    ? `Every ${state.refreshIntervalMinutes} min`
    : 'Not configured';

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError('');
    try {
      const next = await getClashState();
      setState(next);
      setRules(next.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    await withBusy(async () => {
      const next = await saveClashRules(rules);
      setState(next);
      setRules(next.rules);
      setMessage('Rules saved.');
    });
  }

  async function handleSaveAndGenerate() {
    await withBusy(async () => {
      await saveClashRules(rules);
      const result = await generateClashConfig();
      const next = await getClashState();
      setState(next);
      setRules(next.rules);
      setMessage(`Generated ${result.ruleCount} custom rules.`);
    });
  }

  async function handleCopy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell clash-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Clash rule workshop</p>
          <h1>Clash 配置</h1>
        </div>
        <div className="account-summary">
          <div className="user-panel">
            <div className="user-identity">
              <span className="user-avatar" aria-hidden="true">
                {email.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <span className="user-label">Signed in</span>
                <strong title={email}>{email}</strong>
              </div>
            </div>
            <div className="account-actions">
              <button type="button" onClick={() => { window.location.href = '/'; }}>
                Reader
              </button>
              <button type="button" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="clash-workspace">
        <section className="clash-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">custom_rules.yaml</p>
              <h2>自定义规则</h2>
            </div>
            <span className="rule-count">{ruleCount} rules</span>
          </div>

          <textarea
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            spellCheck={false}
            className="rules-textarea"
          />

          <div className="clash-actions">
            <button type="button" onClick={handleSave} disabled={busy}>
              Save
            </button>
            <button type="button" className="primary" onClick={handleSaveAndGenerate} disabled={busy}>
              Save & Generate
            </button>
          </div>
        </section>

        <aside className="clash-side">
          <section className="clash-status">
            <p className="eyebrow">Pipeline</p>
            <h2>订阅生成</h2>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{state?.sourceConfigured ? 'Configured' : 'Missing CLASH_SOURCE_URL'}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{state?.configExists ? 'Generated' : 'Not generated'}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{state?.configUpdatedAt ? new Date(state.configUpdatedAt).toLocaleString() : 'Never'}</dd>
              </div>
              <div>
                <dt>Auto</dt>
                <dd>{autoRefreshLabel}</dd>
              </div>
              <div>
                <dt>Success</dt>
                <dd>{state?.lastRefreshSuccessAt ? new Date(state.lastRefreshSuccessAt).toLocaleString() : 'Never'}</dd>
              </div>
              <div>
                <dt>Failure</dt>
                <dd>{state?.lastRefreshErrorAt ? new Date(state.lastRefreshErrorAt).toLocaleString() : 'None'}</dd>
              </div>
              {state?.lastRefreshError ? (
                <div>
                  <dt>Error</dt>
                  <dd>{state.lastRefreshError}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="clash-links">
            <p className="eyebrow">Client URL</p>
            <h2>Clash Verge</h2>
            <label>
              Subscription
              <input value={state?.configUrl ?? ''} readOnly />
            </label>
            <div className="clash-actions compact">
              <button
                type="button"
                onClick={() => state && void handleCopy(state.configUrl, 'Subscription URL')}
                disabled={!state?.configUrl}
              >
                Copy URL
              </button>
              <a
                className={`button-link ${state?.configExists ? 'primary' : 'disabled'}`}
                href={state?.configExists ? state.importUrl : undefined}
              >
                一键导入
              </a>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
