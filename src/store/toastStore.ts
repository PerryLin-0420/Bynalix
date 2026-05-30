import { create } from "zustand";

export type ToastKind = "ok" | "error" | "info";

export interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ToastState {
  toast: ToastMsg | null;
  show: (text: string, kind?: ToastKind, durationMs?: number) => void;
}

let _counter = 0;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (text, kind = "info", durationMs = 2400) => {
    if (_hideTimer) clearTimeout(_hideTimer);
    const id = ++_counter;
    set({ toast: { id, text, kind } });
    _hideTimer = setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, durationMs);
  },
}));

/** Imperative helper for use outside React components. */
export function showToast(text: string, kind: ToastKind = "info", durationMs = 2400) {
  useToastStore.getState().show(text, kind, durationMs);
}
