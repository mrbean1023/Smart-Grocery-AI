import { create } from "zustand";

interface UpgradeState {
  open: boolean;
  message: string | null;
  show: (message?: string) => void;
  close: () => void;
}

/** Centralised upgrade prompt — any 402 handler can open it, even outside React. */
export const useUpgradePrompt = create<UpgradeState>((set) => ({
  open: false,
  message: null,
  show: (message) => set({ open: true, message: message ?? null }),
  close: () => set({ open: false }),
}));
