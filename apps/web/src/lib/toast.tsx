import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

const EVENT = 'saldio:toast';
let sequence = 0;

function emit(kind: Kind, message: string) {
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { id: `${Date.now()}-${sequence++}`, kind, message } }),
  );
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  info: (message: string) => emit('info', message),
  warning: (message: string) => emit('warning', message),
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current, detail].slice(-4));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== detail.id));
      }, 5200);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {items.map((item) => {
        const Icon =
          item.kind === 'success'
            ? CheckCircle2
            : item.kind === 'error'
              ? XCircle
              : item.kind === 'warning'
                ? AlertCircle
                : Info;
        return (
          <div className={`toast ${item.kind}`} key={item.id}>
            <Icon aria-hidden="true" />
            <span>{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
