import { FormEvent, useState } from 'react';

interface PasswordFormProps {
  busy: boolean;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onCancel: () => void;
  message: string;
  onMessageChange: (msg: string) => void;
}

export default function PasswordForm({ busy, onSubmit, onCancel, message, onMessageChange }: PasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onMessageChange('');
    if (newPassword !== confirmPassword) {
      onMessageChange('New passwords do not match.');
      return;
    }
    await onSubmit(currentPassword, newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <form className="password-panel" onSubmit={handleSubmit}>
      <label>
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <label>
        New password
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={6}
          required
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={6}
          required
          autoComplete="new-password"
        />
      </label>
      <div className="password-actions">
        <button className="primary" disabled={busy}>
          Update password
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </form>
  );
}
