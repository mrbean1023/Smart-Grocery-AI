import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Ad-hoc ingredient list drafted on the Optimize page (survives reloads). */
  draftIngredients: string[];
  setDraftIngredients: (list: string[]) => void;
  addDraftIngredient: (name: string) => void;
  removeDraftIngredient: (name: string) => void;
  clearDraftIngredients: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      draftIngredients: [],
      setDraftIngredients: (list) => set({ draftIngredients: list }),
      addDraftIngredient: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const existing = get().draftIngredients;
        if (existing.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
        set({ draftIngredients: [...existing, trimmed] });
      },
      removeDraftIngredient: (name) =>
        set({ draftIngredients: get().draftIngredients.filter((i) => i !== name) }),
      clearDraftIngredients: () => set({ draftIngredients: [] }),
    }),
    { name: "sgai-ui" },
  ),
);
