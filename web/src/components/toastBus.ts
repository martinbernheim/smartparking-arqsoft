export interface ToastMsg { id: number; kind: 'success' | 'error'; title: string; text?: string }

let seq = 0;
const subs = new Set<(t: ToastMsg) => void>();

export const onToast = (fn: (t: ToastMsg) => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const emit = (kind: ToastMsg['kind'], title: string, text?: string) => {
  const t = { id: ++seq, kind, title, text };
  subs.forEach((s) => s(t));
};
export const toast = {
  success: (title: string, text?: string) => emit('success', title, text),
  error: (title: string, text?: string) => emit('error', title, text),
};
