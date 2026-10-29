import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { onToast, type ToastMsg } from './toastBus';

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => onToast((t) => {
    setItems((x) => [...x.slice(-3), t]);
    window.setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 5000);
  }), []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.kind === 'error' ? ' toast-error' : ''}`}>
          <Icon name={t.kind === 'error' ? 'alert' : 'check'} />
          <div><strong>{t.title}</strong>{t.text && <span>{t.text}</span>}</div>
        </div>
      ))}
    </div>
  );
}
