import { useState } from 'react';
import { changePassword } from '../lib/api';
import PasswordForm from './PasswordForm';

interface TopBarProps {
  email: string;
  sourcesCount: number;
  itemsCount: number;
  unreadCount: number;
  starredCount: number;
  onLogout: () => void;
  busy: boolean;
  onError: (msg: string) => void;
}

export default function TopBar({
  email, sourcesCount, itemsCount, unreadCount, starredCount,
  onLogout, busy, onError
}: TopBarProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  async function handlePasswordChange(currentPassword: string, newPassword: string) {
    setPasswordMessage('');
    try {
      await changePassword(currentPassword, newPassword);
      setShowPasswordForm(false);
      setPasswordMessage('Password updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPasswordMessage(msg);
      onError(msg);
    }
  }

  return (
    <>
      <section className="topbar">
        <div>
          <p className="eyebrow">Local intelligence reader</p>
          <h1>RSS-reader</h1>
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
              <button type="button" onClick={() => setShowPasswordForm((v) => !v)}>
                Password
              </button>
              <button type="button" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
          <div className="metrics" aria-label="Reader metrics">
            <span>{sourcesCount} sources</span>
            <span>{itemsCount} items</span>
            <span>{unreadCount} unread</span>
            <span>{starredCount} saved</span>
          </div>
        </div>
      </section>

      {passwordMessage && !showPasswordForm ? (
        <div className="notice">{passwordMessage}</div>
      ) : null}

      {showPasswordForm ? (
        <PasswordForm
          busy={busy}
          onSubmit={handlePasswordChange}
          onCancel={() => setShowPasswordForm(false)}
          message={passwordMessage}
          onMessageChange={setPasswordMessage}
        />
      ) : null}
    </>
  );
}
