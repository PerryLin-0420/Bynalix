import { create } from "zustand";
import { type Lang, type TKey, translate, detectSystemLang } from "@/lib/i18n";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";

interface LangState {
  lang: Lang;
  t: (key: TKey) => string;
  loadLang: () => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: "zh",
  t: (key) => translate(get().lang, key),

  loadLang: async () => {
    try {
      const db = await getDb();
      const [row] = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='language'"
      );
      if (row) {
        const lang = row.value as Lang;
        set({ lang, t: (key) => translate(lang, key) });
      } else {
        // First time: detect system language and save it
        const lang = detectSystemLang();
        await db.execute(
          "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('language', ?)",
          [lang]
        );
        set({ lang, t: (key) => translate(lang, key) });
      }
    } catch (e) { logError("langStore.loadLang", e); }
  },

  setLang: async (lang) => {
    set({ lang, t: (key) => translate(lang, key) });
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('language', ?)",
        [lang]
      );
    } catch (e) { logError("langStore.setLang", e); }
  },
}));
