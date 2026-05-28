import { useState, useEffect, useCallback } from "react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Search, Plus, X, Star, Trash2, UtensilsCrossed,
  Clock, Bookmark, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, History, Pencil, Check, AlertCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { checkBound, BOUNDS } from "@/lib/validate";
import { logError } from "@/lib/error";
import { showToast } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { FoodHistoryDrawer } from "@/components/food/FoodHistoryDrawer";
import { TimePicker } from "@/components/TimePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodItem {
  food_id: number; food_name: string; name_en: string | null; calories_kcal: number;
  protein_g: number; carbohydrates_g: number; fat_g: number;
  base_quantity: number; base_unit: string;
  category: string | null; source_type: string;
  counts_as_water: number; // 1 = auto-sync ml quantity to water_log
}

interface BasketItem {
  food: FoodItem; quantity: number;
  cal: number; p: number; c: number; f: number;
}

interface MealEntry {
  meal_log_id: number; food_id: number; food_name: string; name_en: string | null;
  quantity: number; unit: string; meal_type: string; log_time: string;
  calories: number; protein: number; carb: number; fat: number;
}

interface MealGroup {
  meal_type: string;    // display label (Chinese)
  entries: MealEntry[];
  total: { calories: number; protein: number; carb: number; fat: number };
}

interface MealTemplate {
  template_id: number; template_name: string;
  items: { food_id: number; food_name: string; quantity: number; unit: string; calories: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TYPES = ["早餐", "午餐", "晚餐", "點心"];

// English keys stored by debug seed → display labels
const KEY_TO_LABEL: Record<string, string> = {
  breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "點心",
};
// Display label → English key for DB storage
const LABEL_TO_KEY: Record<string, string> = {
  早餐: "breakfast", 午餐: "lunch", 晚餐: "dinner", 點心: "snack",
};

// Normalize any DB variant (English key or Chinese) → canonical Chinese label
const toZhLabel = (mt: string): string => KEY_TO_LABEL[mt] ?? mt;

const CATEGORY_FILTERS = ["全部", "澱粉", "蛋白質", "油質", "我的最愛"] as const;
type CatFilter = string;

const CAT_TAG_MAP: Record<string, string[]> = {
  澱粉:  ["主食", "水果", "飲料"],
  蛋白質: ["肉類", "海鮮", "乳製品", "蛋類", "豆類", "補劑"],
  油質:  ["油脂", "堅果"],
};

const TAG_COLOR: Record<string, string> = {
  澱粉:  "bg-amber-100 text-amber-700",
  蛋白質: "bg-red-100 text-red-600",
  油質:  "bg-blue-100 text-blue-600",
};

// Maps DB category (Chinese) to its English label for the dropdown
const CAT_EN: Record<string, string> = {
  主食: "Staple", 水果: "Fruit", 飲料: "Drinks",
  肉類: "Meat",   海鮮: "Seafood", 乳製品: "Dairy",
  蛋類: "Eggs",   豆類: "Beans",  補劑: "Supplements",
  油脂: "Oils",   堅果: "Nuts",
  蔬菜: "Vegetables", 加工食品: "Processed",
};

function foodTag(cat: string | null): string | null {
  if (!cat) return null;
  for (const [tag, cats] of Object.entries(CAT_TAG_MAP))
    if (cats.includes(cat)) return tag;
  return null;
}

function calcNutri(food: FoodItem, qty: number) {
  const r = qty / food.base_quantity;
  return {
    cal: Math.round(food.calories_kcal * r),
    p:   Math.round(food.protein_g * r * 10) / 10,
    c:   Math.round(food.carbohydrates_g * r * 10) / 10,
    f:   Math.round(food.fat_g * r * 10) / 10,
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FoodLog() {
  const { profile } = useUserStore();
  const { t, lang } = useLangStore();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Locale-aware display helpers (keep Chinese as state/DB values)
  const getMealLabel = (type: string) => {
    const map: Record<string, string> = {
      "早餐": t("food.mealBreakfast"), "午餐": t("food.mealLunch"),
      "晚餐": t("food.mealDinner"),   "點心": t("food.mealSnack"),
      "自訂": t("food.mealCustom"),
    };
    return map[type] ?? type;
  };
  const getCatLabel = (cat: string) => {
    const map: Record<string, string> = {
      "全部": t("food.catAll"), "澱粉": t("food.catCarb"),
      "蛋白質": t("food.catProtein"), "油質": t("food.catFat"),
      "我的最愛": t("food.catFavorite"),
    };
    return map[cat] ?? cat;
  };

  // Translate macro tag for display (澱粉/蛋白質/油質 → locale label)
  const getTagLabel = (tag: string) => getCatLabel(tag);

  // Translate DB category for display in dropdowns / option lists
  const getCatOptionLabel = (cat: string) =>
    lang === "en" ? (CAT_EN[cat] ?? cat) : cat;

  // Bilingual food name: show English when lang=en and name_en exists
  const foodName = (item: { food_name: string; name_en?: string | null }) =>
    (lang === "en" && item.name_en) ? item.name_en : item.food_name;

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [historyOpen, setHistoryOpen]   = useState(false);

  const [mealGroups, setMealGroups]     = useState<MealGroup[]>([]);
  const [dayTotals, setDayTotals]       = useState({ calories: 0, protein: 0, carb: 0, fat: 0 });
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [knownTypes, setKnownTypes]     = useState<string[]>([...DEFAULT_TYPES]);
  // Inline edit state
  const [editEntry, setEditEntry] = useState<{
    meal_log_id: number; food_name: string; quantity: string; unit: string; meal_type: string;
  } | null>(null);
  const [templates, setTemplates]       = useState<MealTemplate[]>([]);
  const [favIds, setFavIds]             = useState<Set<number>>(new Set());

  // Sheet
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [mealType, setMealType]         = useState("早餐");
  const [customTypeName, setCustomTypeName] = useState("");
  const [mealTime, setMealTime]         = useState(format(new Date(), "HH:mm"));
  const [basket, setBasket]             = useState<BasketItem[]>([]);
  const [saveAsTpl, setSaveAsTpl]       = useState(false);
  const [tplName, setTplName]           = useState("");
  const [showTplPicker, setShowTplPicker] = useState(false);

  // Custom quick-filter chips
  const [extraFilters, setExtraFilters] = useState<string[]>([]);
  const [showCatPicker, setShowCatPicker] = useState(false);

  // Save meal group as template dialog
  const [favMealDialogGroup, setFavMealDialogGroup] = useState<string | null>(null);
  const [favMealName, setFavMealName] = useState("");

  // Edit existing meal group
  const [editingMealGroup, setEditingMealGroup] = useState<string | null>(null);

  // Food search inside sheet
  const [query, setQuery]               = useState("");
  const [catFilter, setCatFilter]       = useState<CatFilter>("全部");
  const [results, setResults]           = useState<FoodItem[]>([]);
  const [pickedFood, setPickedFood]     = useState<FoodItem | null>(null);
  const [pickedQty, setPickedQty]       = useState("100");

  // Custom food modal
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [customFoodErr, setCustomFoodErr]   = useState<string | null>(null);
  const [cf, setCf] = useState({
    name: "", name_en: "", calories: "", protein: "", carb: "", fat: "",
    quantity: "100", unit: "g", category: "", addToFav: true,
  });

  useEffect(() => {
    if (profile) { loadLog(); loadFavIds(); loadTemplates(); loadKnownTypes(); loadExtraFilters(); }
  }, [profile, selectedDate]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadLog = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<MealEntry[]>(`
        SELECT ml.meal_log_id, ml.food_id, fd.food_name, fd.name_en, ml.quantity, ml.unit,
          ml.meal_type, ml.log_time,
          ROUND(ml.quantity / fd.base_quantity * fd.calories_kcal, 1)     as calories,
          ROUND(ml.quantity / fd.base_quantity * fd.protein_g, 1)         as protein,
          ROUND(ml.quantity / fd.base_quantity * fd.carbohydrates_g, 1)   as carb,
          ROUND(ml.quantity / fd.base_quantity * fd.fat_g, 1)             as fat
        FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
        WHERE ml.user_id = ? AND ml.log_date = ?
        ORDER BY ml.log_time ASC`, [profile!.user_id, selectedDate]);

      const map = new Map<string, MealEntry[]>();
      for (const r of rows) {
        const label = KEY_TO_LABEL[r.meal_type] ?? r.meal_type;
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(r);
      }
      const groups: MealGroup[] = [...map.entries()].map(([mt, entries]) => ({
        meal_type: mt,
        entries,
        total: entries.reduce((a, e) => ({
          calories: a.calories + e.calories, protein: a.protein + e.protein,
          carb: a.carb + e.carb, fat: a.fat + e.fat,
        }), { calories: 0, protein: 0, carb: 0, fat: 0 }),
      }));
      setMealGroups(groups);
      setDayTotals(groups.reduce((a, g) => ({
        calories: a.calories + g.total.calories, protein: a.protein + g.total.protein,
        carb: a.carb + g.total.carb, fat: a.fat + g.total.fat,
      }), { calories: 0, protein: 0, carb: 0, fat: 0 }));
    } catch (e) { logError("FoodLog", e); }
  };

  const loadFavIds = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ item_id: number }[]>(
        "SELECT item_id FROM user_favorites WHERE user_id=? AND item_type='food'",
        [profile!.user_id]);
      setFavIds(new Set(rows.map(r => r.item_id)));
    } catch (e) { logError("FoodLog", e); }
  };

  const loadTemplates = async () => {
    try {
      const db = await getDb();
      const tmps = await db.select<{ template_id: number; template_name: string }[]>(
        "SELECT template_id, template_name FROM meal_template WHERE user_id=? ORDER BY created_date DESC",
        [profile!.user_id]);
      const result: MealTemplate[] = [];
      for (const t of tmps) {
        const items = await db.select<any[]>(`
          SELECT mti.food_id, fd.food_name, mti.quantity, mti.unit,
            ROUND(mti.quantity / fd.base_quantity * fd.calories_kcal) as calories
          FROM meal_template_items mti JOIN food_database fd ON mti.food_id = fd.food_id
          WHERE mti.template_id = ?`, [t.template_id]);
        result.push({ ...t, items });
      }
      setTemplates(result);
    } catch (e) { logError("FoodLog", e); }
  };

  const loadKnownTypes = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ meal_type: string }[]>(
        "SELECT DISTINCT meal_type FROM meal_log WHERE user_id=?", [profile!.user_id]);
      const labels = rows.map(r => KEY_TO_LABEL[r.meal_type] ?? r.meal_type);
      const custom = labels.filter(l => !DEFAULT_TYPES.includes(l));
      setKnownTypes([...DEFAULT_TYPES, ...custom]);
    } catch (e) { logError("FoodLog", e); }
  };

  const loadExtraFilters = async () => {
    try {
      const db = await getDb();
      const [row] = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='food_quick_filters'");
      if (row?.value) setExtraFilters(JSON.parse(row.value));
    } catch (e) { logError("FoodLog", e); }
  };

  const saveExtraFilters = async (filters: string[]) => {
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('food_quick_filters', ?)",
        [JSON.stringify(filters)]);
    } catch (e) { logError("FoodLog", e); }
  };

  const addExtraFilter = (cat: string) => {
    const updated = [...extraFilters, cat];
    setExtraFilters(updated);
    setShowCatPicker(false);
    saveExtraFilters(updated);
  };

  const removeExtraFilter = (cat: string) => {
    const updated = extraFilters.filter(f => f !== cat);
    setExtraFilters(updated);
    if (catFilter === cat) setCatFilter("全部");
    saveExtraFilters(updated);
  };

  // ── Food search ──────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string, filter: CatFilter) => {
    if (!profile) return;
    try {
      const db = await getDb();
      let rows: FoodItem[] = [];
      const likeQ = `%${q}%`;
      if (filter === "我的最愛") {
        rows = await db.select<FoodItem[]>(`
          SELECT fd.* FROM user_favorites uf
          JOIN food_database fd ON uf.item_id = fd.food_id
          WHERE uf.user_id=? AND uf.item_type='food'
            AND (? = '' OR fd.food_name LIKE ? OR fd.name_en LIKE ?)
          ORDER BY uf.display_order`, [profile.user_id, q, likeQ, likeQ]);
      } else if (filter !== "全部") {
        const cats = CAT_TAG_MAP[filter];
        if (cats?.length) {
          rows = await db.select<FoodItem[]>(
            `SELECT * FROM food_database WHERE category IN (${cats.map(() => "?").join(",")})
             AND (? = '' OR food_name LIKE ? OR name_en LIKE ?) ORDER BY food_name LIMIT 30`,
            [...cats, q, likeQ, likeQ]);
        } else {
          rows = await db.select<FoodItem[]>(
            `SELECT * FROM food_database WHERE category = ?
             AND (? = '' OR food_name LIKE ? OR name_en LIKE ?) ORDER BY food_name LIMIT 30`,
            [filter, q, likeQ, likeQ]);
        }
      } else if (q.trim()) {
        // Prefix match outranks "contains anywhere" so searching「雞胸」surfaces
        // 「雞胸肉」above「去皮雞胸肉」. Custom foods still win the first tier.
        const prefixQ = `${q}%`;
        rows = await db.select<FoodItem[]>(
          `SELECT *,
             CASE WHEN food_name LIKE ? OR name_en LIKE ? THEN 0 ELSE 1 END AS _rank
           FROM food_database
           WHERE food_name LIKE ? OR name_en LIKE ?
           ORDER BY source_type DESC, _rank, food_name LIMIT 30`,
          [prefixQ, prefixQ, likeQ, likeQ]);
      } else {
        // default: show favorites
        rows = await db.select<FoodItem[]>(`
          SELECT fd.* FROM user_favorites uf
          JOIN food_database fd ON uf.item_id = fd.food_id
          WHERE uf.user_id=? AND uf.item_type='food'
          ORDER BY uf.display_order LIMIT 20`, [profile.user_id]);
      }
      setResults(rows);
    } catch (e) { logError("FoodLog", e); }
  }, [profile]);

  useEffect(() => {
    if (!sheetOpen) return;
    const t = setTimeout(() => doSearch(query, catFilter), 250);
    return () => clearTimeout(t);
  }, [query, catFilter, sheetOpen, doSearch]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const pickFood = (food: FoodItem) => {
    setPickedFood(food);
    setPickedQty(String(food.base_quantity));
  };

  const addToBasket = () => {
    if (!pickedFood) return;
    const qty = parseFloat(pickedQty);
    if (!qty || qty <= 0) return;
    setBasket(b => [...b, { food: pickedFood, quantity: qty, ...calcNutri(pickedFood, qty) }]);
    setPickedFood(null);
    setPickedQty("100");
  };

  const applyTemplate = async (t: MealTemplate) => {
    try {
      const db = await getDb();
      const items: BasketItem[] = [];
      for (const item of t.items) {
        const [food] = await db.select<FoodItem[]>(
          "SELECT * FROM food_database WHERE food_id=?", [item.food_id]);
        if (food) items.push({ food, quantity: item.quantity, ...calcNutri(food, item.quantity) });
      }
      setBasket(items);
      setTplName(t.template_name);
      setShowTplPicker(false);
    } catch (e) { logError("FoodLog", e); }
  };

  const saveMeal = async () => {
    if (!profile || basket.length === 0) return;
    try {
      const db = await getDb();
      const finalType = mealType === "自訂"
        ? (customTypeName.trim() || "其他")
        : (LABEL_TO_KEY[mealType] ?? mealType);
      const time = mealTime + ":00";

      // Edit mode: delete old entries and their synced water first
      if (editingMealGroup) {
        const dbOldType = LABEL_TO_KEY[editingMealGroup] ?? editingMealGroup;
        const oldGroup = mealGroups.find(g => g.meal_type === editingMealGroup);
        for (const entry of (oldGroup?.entries ?? [])) {
          await db.execute("DELETE FROM water_log WHERE meal_log_id=?", [entry.meal_log_id]);
        }
        await db.execute(
          "DELETE FROM meal_log WHERE user_id=? AND meal_type=? AND log_date=?",
          [profile.user_id, dbOldType, selectedDate]);
      }

      for (const item of basket) {
        const mealRes = await db.execute(
          "INSERT INTO meal_log (user_id, food_id, quantity, unit, meal_type, log_date, log_time) VALUES (?,?,?,?,?,?,?)",
          [profile.user_id, item.food.food_id, item.quantity, item.food.base_unit, finalType, selectedDate, time]);
        // Auto-sync to water_log if this drink counts as water (unit must be ml)
        if (item.food.counts_as_water && item.food.base_unit === "ml") {
          await db.execute(
            "INSERT INTO water_log (user_id, amount_ml, log_date, log_time, meal_log_id) VALUES (?,?,?,?,?)",
            [profile.user_id, Math.round(item.quantity), selectedDate, time, mealRes.lastInsertId]);
        }
      }

      // Save as template only for new meals (not edits)
      if (!editingMealGroup && saveAsTpl && tplName.trim()) {
        const res = await db.execute(
          "INSERT INTO meal_template (user_id, template_name) VALUES (?,?)",
          [profile.user_id, tplName.trim()]);
        for (const item of basket) {
          await db.execute(
            "INSERT INTO meal_template_items (template_id, food_id, quantity, unit) VALUES (?,?,?,?)",
            [res.lastInsertId, item.food.food_id, item.quantity, item.food.base_unit]);
        }
        loadTemplates();
      }

      closeSheet();
      loadLog();
      loadKnownTypes();
    } catch (e) {
      logError("FoodLog.saveMeal", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const deleteEntry = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM water_log WHERE meal_log_id=?", [id]);
      await db.execute("DELETE FROM meal_log WHERE meal_log_id=?", [id]);
      loadLog();
    } catch (e) {
      logError("FoodLog.deleteEntry", e);
      showToast(lang === "zh" ? "刪除失敗" : "Delete failed", "error");
    }
  };

  const deleteMealGroup = async (group: MealGroup) => {
    if (!profile) return;
    try {
      const db = await getDb();
      const dbType = LABEL_TO_KEY[group.meal_type] ?? group.meal_type;
      for (const e of group.entries) {
        await db.execute("DELETE FROM water_log WHERE meal_log_id=?", [e.meal_log_id]);
      }
      await db.execute(
        "DELETE FROM meal_log WHERE user_id=? AND meal_type=? AND log_date=?",
        [profile.user_id, dbType, selectedDate]
      );
      loadLog();
    } catch (e) {
      logError("FoodLog.deleteMealGroup", e);
      showToast(lang === "zh" ? "刪除失敗" : "Delete failed", "error");
    }
  };

  const saveEditEntry = async () => {
    if (!editEntry) return;
    const qty = parseFloat(editEntry.quantity);
    if (isNaN(qty) || qty <= 0) return;
    try {
      const db = await getDb();
      const mealKey = LABEL_TO_KEY[editEntry.meal_type] ?? editEntry.meal_type;
      await db.execute(
        "UPDATE meal_log SET quantity=?, meal_type=? WHERE meal_log_id=?",
        [qty, mealKey, editEntry.meal_log_id]
      );
      setEditEntry(null);
      loadLog();
    } catch (e) {
      logError("FoodLog.saveEditEntry", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const toggleFav = async (food: FoodItem) => {
    if (!profile) return;
    try {
      const db = await getDb();
      if (favIds.has(food.food_id)) {
        await db.execute(
          "DELETE FROM user_favorites WHERE user_id=? AND item_type='food' AND item_id=?",
          [profile.user_id, food.food_id]);
        setFavIds(s => { const n = new Set(s); n.delete(food.food_id); return n; });
      } else {
        await db.execute(
          "INSERT OR IGNORE INTO user_favorites (user_id, item_type, item_id) VALUES (?,?,?)",
          [profile.user_id, "food", food.food_id]);
        setFavIds(s => new Set(s).add(food.food_id));
      }
    } catch (e) { logError("FoodLog", e); }
  };

  const deleteCustomFood = async (food: FoodItem) => {
    if (food.source_type !== "custom") return;
    try {
      const db = await getDb();
      // Cascade: a deleted food leaves meal_log rows that INNER JOINs silently drop
      // (ghost calories). Remove logged meals of this food + their synced water +
      // any template references, before deleting the food itself.
      await db.execute("DELETE FROM water_log WHERE meal_log_id IN (SELECT meal_log_id FROM meal_log WHERE food_id=?)", [food.food_id]);
      await db.execute("DELETE FROM meal_log WHERE food_id=?", [food.food_id]);
      await db.execute("DELETE FROM meal_template_items WHERE food_id=?", [food.food_id]);
      await db.execute("DELETE FROM user_favorites WHERE item_type='food' AND item_id=?", [food.food_id]);
      await db.execute("DELETE FROM food_database WHERE food_id=? AND source_type='custom'", [food.food_id]);
      setFavIds(s => { const n = new Set(s); n.delete(food.food_id); return n; });
      if (pickedFood?.food_id === food.food_id) setPickedFood(null);
      doSearch(query, catFilter);
    } catch (e) {
      logError("FoodLog.deleteCustomFood", e);
      showToast(lang === "zh" ? "刪除失敗" : "Delete failed", "error");
    }
  };

  const saveCustomFood = async () => {
    if (!cf.name || !cf.calories) return;
    setCustomFoodErr(null);
    const cfErr =
      checkBound(cf.calories, BOUNDS.caloriesVal,   lang, true) ??
      (cf.protein ? checkBound(cf.protein, BOUNDS.macroNutrient, lang) : null) ??
      (cf.carb    ? checkBound(cf.carb,    BOUNDS.macroNutrient, lang) : null) ??
      (cf.fat     ? checkBound(cf.fat,     BOUNDS.macroNutrient, lang) : null);
    if (cfErr) { setCustomFoodErr(cfErr); return; }
    try {
      const db = await getDb();
      const res = await db.execute(
        `INSERT INTO food_database
           (food_name, name_en, protein_g, carbohydrates_g, fat_g, calories_kcal,
            base_quantity, base_unit, category, source_type, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [cf.name, cf.name_en.trim() || null,
         parseFloat(cf.protein)||0, parseFloat(cf.carb)||0,
         parseFloat(cf.fat)||0, parseFloat(cf.calories),
         parseFloat(cf.quantity)||100, cf.unit||"g",
         cf.category||null, "custom", profile?.user_id??null]);
      if (cf.addToFav && profile) {
        await db.execute(
          "INSERT OR IGNORE INTO user_favorites (user_id, item_type, item_id) VALUES (?,?,?)",
          [profile.user_id, "food", res.lastInsertId]);
        setFavIds(s => new Set(s).add(Number(res.lastInsertId)));
      }
      setShowCustomFood(false);
      setCf({ name:"", name_en:"", calories:"", protein:"", carb:"", fat:"", quantity:"100", unit:"g", category:"", addToFav:true });
      doSearch(query, catFilter);
    } catch (e) {
      logError("FoodLog.saveCustomFood", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const openSheet = (initialType?: string) => {
    let type = initialType ?? "早餐";
    if (!initialType) {
      const usedZh = new Set(mealGroups.map(g => toZhLabel(g.meal_type)));
      type = DEFAULT_TYPES.find(t => !usedZh.has(t)) ?? "自訂";
    }
    setMealType(type);
    setMealTime(format(new Date(), "HH:mm"));
    setSheetOpen(true);
    doSearch("", "全部");
  };

  const openEditSheet = async (group: MealGroup) => {
    try {
      const db = await getDb();
      const items: BasketItem[] = [];
      for (const entry of group.entries) {
        const rows = await db.select<FoodItem[]>("SELECT * FROM food_database WHERE food_id=?", [entry.food_id]);
        const food = rows[0];
        if (food) items.push({ food, quantity: entry.quantity, ...calcNutri(food, entry.quantity) });
      }
      setEditingMealGroup(group.meal_type);
      setMealType(group.meal_type); // already a display label (e.g. "早餐")
      // Parse "HH:mm:ss" -> "HH:mm"
      const firstTime = group.entries[0]?.log_time ?? format(new Date(), "HH:mm") + ":00";
      setMealTime(firstTime.slice(0, 5));
      setBasket(items);
      setPickedFood(null);
      setQuery("");
      setCatFilter("全部");
      setSaveAsTpl(false);
      setTplName("");
      setCustomTypeName("");
      setShowTplPicker(false);
      setSheetOpen(true);
      doSearch("", "全部");
    } catch (e) { logError("FoodLog", e); }
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingMealGroup(null);
    setBasket([]);
    setPickedFood(null);
    setQuery("");
    setCatFilter("全部");
    setSaveAsTpl(false);
    setTplName("");
    setCustomTypeName("");
    setShowTplPicker(false);
  };

  const saveMealGroupAsTemplate = async () => {
    if (!profile || !favMealDialogGroup || !favMealName.trim()) return;
    const group = mealGroups.find(g => g.meal_type === favMealDialogGroup);
    if (!group || group.entries.length === 0) return;
    try {
      const db = await getDb();
      const res = await db.execute(
        "INSERT INTO meal_template (user_id, template_name) VALUES (?,?)",
        [profile.user_id, favMealName.trim()]);
      for (const e of group.entries) {
        await db.execute(
          "INSERT INTO meal_template_items (template_id, food_id, quantity, unit) VALUES (?,?,?,?)",
          [res.lastInsertId, e.food_id, e.quantity, e.unit]);
      }
      await loadTemplates();
      setFavMealDialogGroup(null);
      setFavMealName("");
    } catch (e) { logError("FoodLog", e); }
  };

  const basketTotal = basket.reduce(
    (a, b) => ({ cal: a.cal + b.cal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f }),
    { cal: 0, p: 0, c: 0, f: 0 });

  if (!profile) return (
    <div className="flex items-center justify-center h-full text-[var(--text-on-bg-muted)] text-sm">
      {t("common.noProfile")}
    </div>
  );

  const isToday = selectedDate === todayStr;

  return (
    <div className="pt-4 md:pt-6 px-4 md:px-6 max-w-2xl mx-auto pb-24">
      {/* Sticky header */}
      <div 
        className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pb-4 pt-1 md:pt-4 flex items-start justify-between shrink-0"
        style={{ background: 'var(--bg-main)', backgroundAttachment: 'fixed' }}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{t("food.logTitle")}</h1>
          <p className="text-[var(--text-on-bg-muted)] font-bold text-sm mt-0.5">
            {isToday ? t("common.today") : format(parseISO(selectedDate), lang === "zh" ? "M/d EEE" : "M/d EEE", { locale: lang === "zh" ? zhTW : undefined })}
          </p>
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="p-2 text-[var(--text-on-bg)] hover:text-[var(--text-on-bg-muted)] transition-colors mt-0.5"
          title={t("food.history")}
        >
          <History size={20} />
        </button>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-4 bg-white/10 rounded-xl px-1 py-1">
        <button
          onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] transition-colors active:bg-white/20 rounded-xl"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-[var(--text-on-bg)]">
          {isToday
            ? `${t("common.today")} · ${format(parseISO(selectedDate), "M/d")}`
            : format(parseISO(selectedDate), "M/d (EEE)", { locale: lang === "zh" ? zhTW : undefined })}
        </span>
        <button
          onClick={() => {
            const next = format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd");
            if (next <= todayStr) setSelectedDate(next);
          }}
          className={clsx(
            "min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors rounded-xl",
            selectedDate >= todayStr
              ? "text-[var(--text-on-bg-faint)] cursor-not-allowed"
              : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] active:bg-white/20"
          )}
          disabled={selectedDate >= todayStr}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* History drawer */}
      <FoodHistoryDrawer
        open={historyOpen}
        userId={profile.user_id}
        onClose={() => setHistoryOpen(false)}
        onSelectDate={date => { setSelectedDate(date); setHistoryOpen(false); }}
      />

      {/* Day totals */}
      <div className="card mb-5 grid grid-cols-4 divide-x divide-[var(--surface-border)] text-center">
        {[
          { label: t("dashboard.calories"), val: Math.round(dayTotals.calories), unit: "kcal" },
          { label: t("dashboard.protein"),  val: +dayTotals.protein.toFixed(1),  unit: "g" },
          { label: t("dashboard.carb"),     val: +dayTotals.carb.toFixed(1),     unit: "g" },
          { label: t("food.oilFat"),        val: +dayTotals.fat.toFixed(1),      unit: "g" },
        ].map(({ label, val, unit }) => (
          <div key={label} className="flex flex-col items-center gap-0.5 px-1">
            <p className="text-lg font-bold text-[var(--text-on-surface)] leading-tight">{val}</p>
            <p className="text-[10px] text-[var(--text-on-surface-muted)] leading-tight">{unit}</p>
            <p className="text-[10px] text-[var(--text-on-surface-muted)] leading-tight whitespace-nowrap">{label}</p>
          </div>
        ))}
      </div>

      {/* Meal groups */}
      <div className="space-y-3 mb-4">
        {mealGroups.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-on-bg-muted)]">
            <UtensilsCrossed size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t("food.noLog")}</p>
          </div>
        ) : mealGroups.map(group => {
          const isExp = expanded.has(group.meal_type);
          return (
            <div key={group.meal_type} className="card p-0 overflow-hidden">
              <div className="flex items-center">
                <button
                  className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface)] transition-colors"
                  onClick={() => setExpanded(s => { const n = new Set(s); isExp ? n.delete(group.meal_type) : n.add(group.meal_type); return n; })}>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-[var(--text-on-surface)]">{getMealLabel(group.meal_type)}</p>
                    <p className="text-xs text-[var(--text-on-surface-muted)]">
                      {group.entries.length}{t("food.items")} · {Math.round(group.total.calories)} kcal
                    </p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-xs text-[var(--text-on-surface-muted)]"><span className="font-bold text-[var(--text-on-surface)]">P</span>{+group.total.protein.toFixed(1)}g</span>
                      <span className="text-xs text-[var(--text-on-surface-muted)]"><span className="font-bold text-[var(--text-on-surface)]">C</span>{+group.total.carb.toFixed(1)}g</span>
                      <span className="text-xs text-[var(--text-on-surface-muted)]"><span className="font-bold text-[var(--text-on-surface)]">F</span>{+group.total.fat.toFixed(1)}g</span>
                    </div>
                  </div>
                  {isExp ? <ChevronUp size={14} className="text-[var(--text-on-surface-muted)] shrink-0" /> : <ChevronDown size={14} className="text-[var(--text-on-surface-muted)] shrink-0" />}
                </button>
                <button
                  className="px-2 py-3.5 text-yellow-400 hover:text-yellow-500 transition-colors shrink-0"
                  title={t("food.saveGroupAs")}
                  onClick={e => { e.stopPropagation(); setFavMealDialogGroup(group.meal_type); setFavMealName(getMealLabel(group.meal_type)); }}>
                  <Star size={15} />
                </button>
                <button
                  className="px-2 py-3.5 text-yellow-400 hover:text-yellow-500 transition-colors shrink-0"
                  title={lang === "en" ? "Edit meal" : "編輯餐點"}
                  onClick={e => { e.stopPropagation(); openEditSheet(group); }}>
                  <Pencil size={15} />
                </button>
                <button
                  className="px-2 py-3.5 text-red-400 hover:text-red-500 transition-colors shrink-0"
                  title={lang === "en" ? "Delete meal" : "刪除整餐"}
                  onClick={e => { e.stopPropagation(); deleteMealGroup(group); }}>
                  <Trash2 size={15} />
                </button>
              </div>

              {isExp && (
                <div className="border-t border-[var(--surface-border)]">
                  {group.entries.map((e, i) => (
                    <div key={e.meal_log_id}
                      className={clsx("flex items-center gap-2 px-4 py-2.5",
                        i < group.entries.length - 1 && "border-b border-[var(--surface-border)]")}>
                      {editEntry?.meal_log_id === e.meal_log_id ? (
                        /* ── Inline edit row ── */
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--text-on-surface-sub)] truncate mb-1">{foodName(e)}</p>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" inputMode="decimal" min="0"
                                value={editEntry.quantity}
                                onChange={ev => setEditEntry(p => p ? { ...p, quantity: ev.target.value } : null)}
                                className="w-20 rounded-lg border border-[var(--color-outline-variant)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
                              />
                              <span className="text-xs text-[var(--text-on-surface-muted)]">{editEntry.unit}</span>
                              <select
                                value={editEntry.meal_type}
                                onChange={ev => setEditEntry(p => p ? { ...p, meal_type: ev.target.value } : null)}
                                className="rounded-lg border border-[var(--color-outline-variant)] px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]">
                                {(knownTypes).map(mt => <option key={mt} value={mt}>{getMealLabel(mt)}</option>)}
                              </select>
                            </div>
                          </div>
                          <button onClick={saveEditEntry}
                            className="p-1.5 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)] transition-colors">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditEntry(null)}
                            className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] transition-colors">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        /* ── Normal row ── */
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-on-surface)] truncate">{foodName(e)}</p>
                            <p className="text-xs text-[var(--text-on-surface-muted)]">{e.quantity} {e.unit}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-[var(--text-on-surface-sub)]">{e.calories} kcal</p>
                            <p className="text-xs text-[var(--text-on-surface-muted)]"><span className="font-bold text-[var(--text-on-surface)]">P</span>{e.protein} <span className="font-bold text-[var(--text-on-surface)]">C</span>{e.carb} <span className="font-bold text-[var(--text-on-surface)]">F</span>{e.fat}</p>
                          </div>
                          <button
                            onClick={() => setEditEntry({
                              meal_log_id: e.meal_log_id, food_name: e.food_name,
                              quantity: String(e.quantity), unit: e.unit,
                              meal_type: KEY_TO_LABEL[e.meal_type] ?? e.meal_type,
                            })}
                            className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteEntry(e.meal_log_id)}
                            className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  <button onClick={() => openSheet(group.meal_type)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] hover:bg-[var(--surface-container-low)] transition-colors border-t border-[var(--surface-border)]">
                    <Plus size={12} /> {t("food.continueAdd")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add meal */}
      {/* Add meal */}
      <button onClick={() => openSheet()}
        className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 text-sm font-medium">
        <Plus size={16} /> {t("food.addMeal")}
      </button>

      {/* ════════════════════════════════════════════════
          MEAL SHEET
      ════════════════════════════════════════════════ */}
      {sheetOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center pb-16 md:pb-0">
          <div className="bg-[var(--surface)] w-full max-w-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[calc(92vh-4rem)] md:max-h-[92vh]">

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-on-surface)]">
                {editingMealGroup
                  ? (lang === "en" ? `Edit ${getMealLabel(editingMealGroup)}` : `編輯 ${getMealLabel(editingMealGroup)}`)
                  : t("food.addMealTitle")}
              </h2>
              <button onClick={closeSheet} className="p-2 -mr-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">

              {/* ── 餐別 & 時間 ── */}
              <div className="px-5 pb-4 border-b border-[var(--surface-border)] space-y-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-2">{t("food.mealCat")}</p>
                  <div className="flex flex-wrap gap-2">
                    {[...knownTypes, "自訂"].map(mt => {
                      // Gray out meal types already recorded today; in edit mode, exclude the group being edited
                      const isUsed = mt !== "自訂"
                        && DEFAULT_TYPES.includes(mt)
                        && mealGroups.some(g => g.meal_type === mt && g.meal_type !== editingMealGroup);
                      return (
                        <button key={mt}
                          onClick={() => !isUsed && setMealType(mt)}
                          disabled={isUsed}
                          className={clsx("px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                            isUsed
                              ? "border-[var(--surface-border)] text-[var(--text-on-surface-muted)] bg-[var(--surface-container-low)] cursor-not-allowed opacity-50"
                              : mealType === mt
                                ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                                : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--color-outline)]")}>
                          {getMealLabel(mt)}
                        </button>
                      );
                    })}
                  </div>
                  {mealType === "自訂" && (
                    <input className="input-base mt-2 text-sm"
                      placeholder={t("food.customTypePH")}
                      value={customTypeName}
                      onChange={e => setCustomTypeName(e.target.value)} />
                  )}
                </div>

                {/* Time + template */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Clock size={14} className="text-[var(--text-on-surface-muted)] shrink-0" />
                    <TimePicker value={mealTime} onChange={setMealTime} />
                  </div>
                  {templates.length > 0 && (
                    <button onClick={() => setShowTplPicker(!showTplPicker)}
                      className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shrink-0",
                        showTplPicker ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--color-outline)]")}>
                      <Bookmark size={12} /> {t("food.applyTemplate")}
                    </button>
                  )}
                </div>

                {showTplPicker && (
                  <div className="rounded-xl bg-[var(--surface-container-low)] divide-y divide-[var(--surface-border)] overflow-hidden">
                    {templates.map(tpl => (
                      <button key={tpl.template_id} onClick={() => applyTemplate(tpl)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--surface)] transition-all text-left">
                        <span className="text-sm font-medium text-[var(--text-on-surface)]">{tpl.template_name}</span>
                        <span className="text-xs text-[var(--text-on-surface-muted)]">{tpl.items.length} {t("food.items")} · {tpl.items.reduce((s, i) => s + i.calories, 0)} kcal</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── 食物搜尋 ── */}
              <div className="px-5 py-4 border-b border-[var(--surface-border)]">
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-3">{t("food.addFood")}</p>

                {/* Search input */}
                <div className="relative mb-2.5">
                  <Search size={15} className="absolute left-3 top-2.5 text-[var(--text-on-surface-muted)]" />
                  <input className="input-base pl-9 pr-8" placeholder={t("food.searchFood")}
                    value={query} onChange={e => setQuery(e.target.value)} />
                  {query && (
                    <button onClick={() => setQuery("")}
                      className="absolute right-3 top-2.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Category filter chips */}
                <div className="flex gap-1.5 mb-3 flex-wrap items-center">
                  {CATEGORY_FILTERS.map(f => (
                    <button key={f} onClick={() => setCatFilter(f)}
                      className={clsx("px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                        catFilter === f ? "bg-[var(--color-primary)] text-white" : "bg-[var(--surface-container)] text-[var(--text-on-surface-sub)] hover:bg-[var(--surface-container)]")}>
                      {f === "我的最愛" ? `⭐ ${t("food.catFavorite")}` : getCatLabel(f)}
                    </button>
                  ))}
                  {extraFilters.map(f => (
                    <button key={f} onClick={() => setCatFilter(f)}
                      className={clsx("px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                        catFilter === f ? "bg-[var(--color-secondary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--text-accent-mid)] hover:bg-[var(--surface-container)]")}>
                      {getCatOptionLabel(f)}
                    </button>
                  ))}
                  <div className="relative">
                    <button
                      onClick={() => setShowCatPicker(p => !p)}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] hover:bg-[var(--surface-container)] transition-all text-sm font-bold leading-none">
                      +
                    </button>
                    {showCatPicker && (
                      <>
                        <div className="fixed inset-0 z-[9]" onClick={() => setShowCatPicker(false)} />
                        <div className="absolute left-0 top-8 z-10 bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl shadow-lg p-3 w-44">
                          <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] mb-2">
                            {lang === "en" ? "Add quick filter" : "新增快篩"}
                          </p>
                          <div className="space-y-0.5 max-h-48 overflow-y-auto">
                            {Object.keys(CAT_EN).filter(c => !extraFilters.includes(c)).map(cat => (
                              <button key={cat} onClick={() => addExtraFilter(cat)}
                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-[var(--text-on-surface)] hover:bg-[var(--surface-container-low)] transition-colors">
                                {getCatOptionLabel(cat)}
                              </button>
                            ))}
                          </div>
                          {extraFilters.length > 0 && (
                            <>
                              <div className="border-t border-[var(--surface-border)] my-2" />
                              <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] mb-1">
                                {lang === "en" ? "Remove" : "移除"}
                              </p>
                              {extraFilters.map(f => (
                                <button key={f} onClick={() => removeExtraFilter(f)}
                                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center justify-between">
                                  {getCatOptionLabel(f)} <X size={10} />
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Results */}
                <div className="space-y-0.5 max-h-44 overflow-y-auto">
                  {results.length === 0 && query && (
                    <p className="text-xs text-[var(--text-on-surface-muted)] text-center py-4">{lang === "zh" ? `找不到「${query}」` : `No results for "${query}"`}</p>
                  )}
                  {results.length === 0 && !query && catFilter === "全部" && (
                    <p className="text-xs text-[var(--text-on-surface-muted)] text-center py-4">{t("food.hintSearch")}</p>
                  )}
                  {results.map(food => {
                    const tag = foodTag(food.category);
                    const isFav = favIds.has(food.food_id);
                    return (
                      <div key={food.food_id}
                        onClick={() => pickFood(food)}
                        className={clsx("flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all",
                          pickedFood?.food_id === food.food_id ? "bg-[var(--surface-container)]" : "hover:bg-[var(--surface-container-low)]")}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-[var(--text-on-surface)] truncate">{foodName(food)}</p>
                            {tag && (
                              <span className={clsx("px-1.5 py-0.5 rounded-full text-[10px] font-semibold", TAG_COLOR[tag])}>
                                {getTagLabel(tag)}
                              </span>
                            )}
                            {food.source_type === "custom" && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-600">
                                {t("food.mealCustom")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-on-surface-muted)]">
                            {food.calories_kcal} kcal · P{food.protein_g} C{food.carbohydrates_g} F{food.fat_g} / {food.base_quantity}{food.base_unit}
                          </p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); toggleFav(food); }}
                          className={clsx("p-1.5 transition-colors shrink-0",
                            isFav ? "text-yellow-400" : "text-yellow-400 hover:text-yellow-500")}>
                          <Star size={13} fill={isFav ? "currentColor" : "none"} />
                        </button>
                        {food.source_type === "custom" && (
                          <button onClick={e => { e.stopPropagation(); deleteCustomFood(food); }}
                            className="p-1.5 text-red-400 hover:text-red-500 transition-colors shrink-0">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Custom food link */}
                <button onClick={() => setShowCustomFood(true)}
                  className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] transition-colors">
                  <Plus size={12} /> {t("food.addCustom")}
                </button>

                {/* Picked food quantity form */}
                {pickedFood && (
                  <div className="mt-3 p-3 bg-[var(--surface-container-low)] rounded-xl border border-[var(--surface-border)]">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-on-surface)]">{foodName(pickedFood)}</p>
                        {(() => {
                          const n = calcNutri(pickedFood, parseFloat(pickedQty) || 0);
                          return (
                            <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">
                              {n.cal} kcal · <span className="font-bold text-[var(--text-on-surface)]">P</span>{n.p.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">C</span>{n.c.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">F</span>{n.f.toFixed(1)} g
                            </p>
                          );
                        })()}
                      </div>
                      <button onClick={() => setPickedFood(null)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] mt-0.5">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input className="input-base pr-10" type="number" inputMode="decimal" value={pickedQty}
                          onChange={e => setPickedQty(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addToBasket()} />
                        <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">
                          {pickedFood.base_unit}
                        </span>
                      </div>
                      <button onClick={addToBasket}
                        className="btn-primary px-5 text-sm">
                        {t("food.addBtn")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 本餐清單 ── */}
              <div className="px-5 py-4 border-b border-[var(--surface-border)]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide">
                    {t("food.mealList")}{basket.length > 0 && ` (${basket.length})`}
                  </p>
                  {basket.length > 0 && (
                    <span className="text-xs text-[var(--text-on-surface-muted)]">
                      {basketTotal.cal} kcal · <span className="font-bold text-[var(--text-on-surface)]">P</span>{basketTotal.p.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">C</span>{basketTotal.c.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">F</span>{basketTotal.f.toFixed(1)} g
                    </span>
                  )}
                </div>

                {basket.length === 0 ? (
                  <p className="text-xs text-[var(--text-on-surface-muted)] text-center py-3">{t("food.notAdded")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {basket.map((item, idx) => (
                      <div key={idx}
                        className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-container-low)] rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-on-surface)] truncate">{foodName(item.food)}</p>
                          <p className="text-xs text-[var(--text-on-surface-muted)]">
                            {item.quantity} {item.food.base_unit} · {item.cal} kcal
                          </p>
                        </div>
                        <span className="text-xs text-[var(--text-on-surface-muted)] shrink-0">
                          <span className="font-bold text-[var(--text-on-surface)]">P</span>{item.p.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">C</span>{item.c.toFixed(1)} <span className="font-bold text-[var(--text-on-surface)]">F</span>{item.f.toFixed(1)}
                        </span>
                        <button onClick={() => setBasket(b => b.filter((_, i) => i !== idx))}
                          className="p-1 text-red-400 hover:text-red-500 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── 存為範本 (only for new meals) ── */}
              {!editingMealGroup && <div className="px-5 py-4">
                <button onClick={() => setSaveAsTpl(!saveAsTpl)}
                  className={clsx("flex items-center gap-2 text-sm font-medium transition-colors",
                    saveAsTpl ? "text-[var(--text-on-surface)]" : "text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]")}>
                  <Bookmark size={14} fill={saveAsTpl ? "currentColor" : "none"} />
                  {t("food.saveFavMeal")}
                </button>
                {saveAsTpl && (
                  <input className="input-base mt-2 text-sm"
                    placeholder={lang === "en" ? "Template name (e.g. Gym Day Breakfast)" : "範本名稱（如：健身日早餐）"}
                    value={tplName}
                    onChange={e => setTplName(e.target.value)} />
                )}
              </div>}
            </div>

            {/* Sheet footer */}
            <div className="px-5 py-4 border-t border-[var(--surface-border)] shrink-0">
              <button onClick={saveMeal} disabled={basket.length === 0}
                className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-40">
                {editingMealGroup ? (lang === "en" ? "Update" : "更新") : t("common.save")}
                {" "}{mealType !== "自訂" ? getMealLabel(mealType) : (customTypeName || t("food.thisMeal"))}
                {" "}({basket.length} {t("food.items")} · {basketTotal.cal} kcal)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          CUSTOM FOOD MODAL
      ════════════════════════════════════════════════ */}
      {showCustomFood && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("food.addCustomFoodTitle")}</h3>
              <button onClick={() => setShowCustomFood(false)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input className="input-base flex-1"
                  placeholder={lang === "en" ? "Food name *" : "食物名稱 *"}
                  value={cf.name} onChange={e => setCf(f => ({ ...f, name: e.target.value }))} />
                <input className="input-base flex-1"
                  placeholder="English name (optional)"
                  value={cf.name_en} onChange={e => setCf(f => ({ ...f, name_en: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input className="input-base pr-14"
                    placeholder={lang === "en" ? "Calories *" : "熱量 *"} type="number" inputMode="decimal"
                    value={cf.calories} onChange={e => setCf(f => ({ ...f, calories: e.target.value }))} />
                  <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">kcal</span>
                </div>
                <div className="flex gap-1.5">
                  <input className="input-base flex-1"
                    placeholder={lang === "en" ? "Amount" : "份量"} type="number" inputMode="decimal"
                    value={cf.quantity} onChange={e => setCf(f => ({ ...f, quantity: e.target.value }))} />
                  <input className="input-base w-16 text-center" placeholder="g"
                    value={cf.unit} onChange={e => setCf(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {([[t("dashboard.protein"),"protein"],[t("dashboard.carb"),"carb"],[t("food.oilFat"),"fat"]] as [string,string][]).map(([label, key]) => (
                  <div key={key} className="relative">
                    <input className="input-base pr-6" placeholder={label} type="number" inputMode="decimal"
                      value={(cf as any)[key]}
                      onChange={e => setCf(f => ({ ...f, [key]: e.target.value }))} />
                    <span className="absolute right-2 top-2 text-xs text-[var(--text-on-surface-muted)]">g</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <select className="input-base flex-1"
                  value={cf.category} onChange={e => setCf(f => ({ ...f, category: e.target.value }))}>
                  <option value="">{lang === "en" ? "Category (optional)" : "分類（選填）"}</option>
                  {Object.keys(CAT_EN).map(c => (
                    <option key={c} value={c}>{getCatOptionLabel(c)}</option>
                  ))}
                </select>
                <button onClick={() => setCf(f => ({ ...f, addToFav: !f.addToFav }))}
                  className={clsx("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all shrink-0",
                    cf.addToFav ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "border-gray-200 text-gray-500")}>
                  <Star size={14} fill={cf.addToFav ? "currentColor" : "none"} />
                  {t("food.catFavorite")}
                </button>
              </div>
            </div>

            {customFoodErr && (
              <p className="text-xs text-red-500 flex items-center gap-1 pt-1">
                <AlertCircle size={12} className="shrink-0" /> {customFoodErr}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowCustomFood(false); setCustomFoodErr(null); }}
                className="btn-ghost flex-1">{t("common.cancel")}</button>
              <button onClick={saveCustomFood}
                className="btn-primary flex-1">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SAVE MEAL GROUP AS TEMPLATE DIALOG
      ════════════════════════════════════════════════ */}
      {favMealDialogGroup && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-on-surface)]">{t("food.saveGroupAs")}</h3>
              <button onClick={() => setFavMealDialogGroup(null)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("food.templateName")}</label>
              <input className="input-base" value={favMealName}
                onChange={e => setFavMealName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveMealGroupAsTemplate(); }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFavMealDialogGroup(null)}
                className="btn-ghost flex-1">{t("common.cancel")}</button>
              <button onClick={saveMealGroupAsTemplate}
                disabled={!favMealName.trim()}
                className="btn-primary flex-1 disabled:opacity-40">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
