/**
 * Built-in food database seed
 * Sources: USDA FoodData Central (fdc.nal.usda.gov) &
 *          Taiwan TFND Nutrition Database (food.fda.gov.tw)
 * All values per base_quantity (default 100g/100ml unless noted).
 * Internal version — do NOT expose raw data to end users directly.
 */

export interface SeedFood {
  food_name:       string;   // Primary name (Traditional Chinese)
  name_en?:        string;   // English name (USDA / common English)
  protein_g:       number;
  carbohydrates_g: number;
  fat_g:           number;
  calories_kcal:   number;
  base_quantity:   number;
  base_unit:       string;
  category:        string;
  counts_as_water?: boolean;
}

export const SEED_FOODS: SeedFood[] = [

  // ── 主食 ─────────────────────────────────────────────────────────────────────
  { food_name: "白飯（熟）",         name_en: "White Rice, Cooked",          protein_g: 2.7,  carbohydrates_g: 28.2, fat_g: 0.3,  calories_kcal: 130,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "糙米飯（熟）",       name_en: "Brown Rice, Cooked",          protein_g: 2.6,  carbohydrates_g: 22.8, fat_g: 0.9,  calories_kcal: 111,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "義大利麵（熟）",     name_en: "Pasta, Cooked",               protein_g: 5.0,  carbohydrates_g: 25.0, fat_g: 1.1,  calories_kcal: 131,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "燕麥片（乾）",       name_en: "Rolled Oats, Dry",            protein_g: 16.9, carbohydrates_g: 66.3, fat_g: 6.9,  calories_kcal: 389,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "全麥吐司",           name_en: "Whole Wheat Bread",           protein_g: 11.0, carbohydrates_g: 41.2, fat_g: 4.2,  calories_kcal: 243,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "白吐司",             name_en: "White Bread",                 protein_g: 9.0,  carbohydrates_g: 49.3, fat_g: 3.4,  calories_kcal: 265,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "地瓜（熟）",         name_en: "Sweet Potato, Cooked",        protein_g: 1.6,  carbohydrates_g: 26.3, fat_g: 0.1,  calories_kcal: 114,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "馬鈴薯（水煮）",     name_en: "Potato, Boiled",              protein_g: 1.9,  carbohydrates_g: 20.1, fat_g: 0.1,  calories_kcal: 87,   base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "玉米（熟）",         name_en: "Corn, Cooked",                protein_g: 3.2,  carbohydrates_g: 19.0, fat_g: 1.2,  calories_kcal: 86,   base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "烏龍麵（熟）",       name_en: "Udon Noodles, Cooked",        protein_g: 2.6,  carbohydrates_g: 21.6, fat_g: 0.4,  calories_kcal: 105,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "冬粉（熟）",         name_en: "Glass Noodles, Cooked",       protein_g: 0.1,  carbohydrates_g: 22.2, fat_g: 0.0,  calories_kcal: 90,   base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "藜麥（熟）",         name_en: "Quinoa, Cooked",              protein_g: 4.4,  carbohydrates_g: 21.3, fat_g: 1.9,  calories_kcal: 120,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "糙米（乾）",         name_en: "Brown Rice, Dry",             protein_g: 7.5,  carbohydrates_g: 77.2, fat_g: 2.7,  calories_kcal: 367,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "玉米餅",             name_en: "Corn Tortilla",               protein_g: 5.7,  carbohydrates_g: 46.1, fat_g: 3.0,  calories_kcal: 234,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "白饅頭",             name_en: "Steamed Bun, Plain",          protein_g: 7.5,  carbohydrates_g: 47.3, fat_g: 1.0,  calories_kcal: 230,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "法國麵包",           name_en: "French Bread",                protein_g: 9.1,  carbohydrates_g: 57.7, fat_g: 3.0,  calories_kcal: 274,  base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "蕎麥麵（熟）",       name_en: "Soba Noodles, Cooked",        protein_g: 5.1,  carbohydrates_g: 21.4, fat_g: 0.1,  calories_kcal: 99,   base_quantity: 100, base_unit: "g",  category: "主食" },
  { food_name: "米粉（熟）",         name_en: "Rice Vermicelli, Cooked",     protein_g: 1.6,  carbohydrates_g: 25.9, fat_g: 0.2,  calories_kcal: 109,  base_quantity: 100, base_unit: "g",  category: "主食" },

  // ── 肉類 ─────────────────────────────────────────────────────────────────────
  { food_name: "雞胸肉（熟）",       name_en: "Chicken Breast, Cooked",      protein_g: 31.0, carbohydrates_g: 0.0,  fat_g: 3.6,  calories_kcal: 165,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "雞腿肉（熟）",       name_en: "Chicken Thigh, Cooked",       protein_g: 24.0, carbohydrates_g: 0.0,  fat_g: 8.5,  calories_kcal: 177,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "豬里肌（熟）",       name_en: "Pork Loin, Cooked",           protein_g: 22.0, carbohydrates_g: 0.0,  fat_g: 5.9,  calories_kcal: 143,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "豬五花（熟）",       name_en: "Pork Belly, Cooked",          protein_g: 17.0, carbohydrates_g: 0.0,  fat_g: 19.0, calories_kcal: 240,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "牛絞肉85%瘦（熟）",  name_en: "Ground Beef 85% Lean, Cooked",protein_g: 26.0, carbohydrates_g: 0.0,  fat_g: 12.0, calories_kcal: 215,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "牛排（里肌）",       name_en: "Beef Sirloin Steak",          protein_g: 28.0, carbohydrates_g: 0.0,  fat_g: 10.4, calories_kcal: 207,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "豬絞肉（熟）",       name_en: "Ground Pork, Cooked",         protein_g: 20.0, carbohydrates_g: 0.0,  fat_g: 14.0, calories_kcal: 211,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "火雞胸肉（熟）",     name_en: "Turkey Breast, Cooked",       protein_g: 29.9, carbohydrates_g: 0.0,  fat_g: 1.0,  calories_kcal: 135,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "羊肉（熟）",         name_en: "Lamb, Cooked",                protein_g: 25.5, carbohydrates_g: 0.0,  fat_g: 17.0, calories_kcal: 258,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "鴨胸肉（熟）",       name_en: "Duck Breast, Cooked",         protein_g: 23.5, carbohydrates_g: 0.0,  fat_g: 10.0, calories_kcal: 190,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "雞翅（熟）",         name_en: "Chicken Wings, Cooked",       protein_g: 26.9, carbohydrates_g: 0.0,  fat_g: 19.5, calories_kcal: 290,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "豬梅花（熟）",       name_en: "Pork Shoulder, Cooked",       protein_g: 21.0, carbohydrates_g: 0.0,  fat_g: 12.5, calories_kcal: 197,  base_quantity: 100, base_unit: "g",  category: "肉類" },
  { food_name: "牛腱（熟）",         name_en: "Beef Shank, Cooked",          protein_g: 27.0, carbohydrates_g: 0.0,  fat_g: 6.0,  calories_kcal: 163,  base_quantity: 100, base_unit: "g",  category: "肉類" },

  // ── 海鮮 ─────────────────────────────────────────────────────────────────────
  { food_name: "鮭魚",               name_en: "Salmon",                      protein_g: 20.4, carbohydrates_g: 0.0,  fat_g: 13.4, calories_kcal: 208,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "鯛魚（熟）",         name_en: "Tilapia, Cooked",             protein_g: 26.2, carbohydrates_g: 0.0,  fat_g: 2.7,  calories_kcal: 128,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "草蝦（熟）",         name_en: "Shrimp, Cooked",              protein_g: 24.0, carbohydrates_g: 0.2,  fat_g: 0.3,  calories_kcal: 99,   base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "鮪魚罐頭（水漬）",   name_en: "Canned Tuna in Water",        protein_g: 26.0, carbohydrates_g: 0.0,  fat_g: 0.8,  calories_kcal: 116,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "花枝（熟）",         name_en: "Squid, Cooked",               protein_g: 18.0, carbohydrates_g: 3.0,  fat_g: 1.4,  calories_kcal: 92,   base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "鱈魚（熟）",         name_en: "Cod, Cooked",                 protein_g: 22.8, carbohydrates_g: 0.0,  fat_g: 0.9,  calories_kcal: 105,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "鯖魚",               name_en: "Mackerel",                    protein_g: 23.6, carbohydrates_g: 0.0,  fat_g: 13.9, calories_kcal: 205,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "秋刀魚",             name_en: "Pacific Saury",               protein_g: 18.1, carbohydrates_g: 0.1,  fat_g: 19.0, calories_kcal: 247,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "文蛤",               name_en: "Clam",                        protein_g: 12.8, carbohydrates_g: 4.7,  fat_g: 1.6,  calories_kcal: 84,   base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "干貝",               name_en: "Scallop",                     protein_g: 17.0, carbohydrates_g: 4.5,  fat_g: 0.5,  calories_kcal: 90,   base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "吳郭魚（熟）",       name_en: "Tilapia Fillet, Cooked",      protein_g: 26.2, carbohydrates_g: 0.0,  fat_g: 2.7,  calories_kcal: 128,  base_quantity: 100, base_unit: "g",  category: "海鮮" },
  { food_name: "蟹肉（熟）",         name_en: "Crab, Cooked",                protein_g: 19.4, carbohydrates_g: 0.0,  fat_g: 1.5,  calories_kcal: 97,   base_quantity: 100, base_unit: "g",  category: "海鮮" },

  // ── 蛋類 ─────────────────────────────────────────────────────────────────────
  { food_name: "雞蛋（生）",         name_en: "Egg, Raw",                    protein_g: 12.6, carbohydrates_g: 1.1,  fat_g: 10.6, calories_kcal: 155,  base_quantity: 100, base_unit: "g",  category: "蛋類" },
  { food_name: "水煮蛋",             name_en: "Hard-Boiled Egg",             protein_g: 12.6, carbohydrates_g: 1.1,  fat_g: 10.6, calories_kcal: 155,  base_quantity: 100, base_unit: "g",  category: "蛋類" },
  { food_name: "茶葉蛋",             name_en: "Tea Egg",                     protein_g: 12.1, carbohydrates_g: 1.7,  fat_g: 9.9,  calories_kcal: 148,  base_quantity: 100, base_unit: "g",  category: "蛋類" },

  // ── 豆類 ─────────────────────────────────────────────────────────────────────
  { food_name: "板豆腐",             name_en: "Firm Tofu",                   protein_g: 8.0,  carbohydrates_g: 2.0,  fat_g: 4.0,  calories_kcal: 76,   base_quantity: 100, base_unit: "g",  category: "豆類" },
  { food_name: "嫩豆腐",             name_en: "Silken Tofu",                 protein_g: 5.3,  carbohydrates_g: 2.5,  fat_g: 2.5,  calories_kcal: 55,   base_quantity: 100, base_unit: "g",  category: "豆類" },
  { food_name: "豆干",               name_en: "Dried Tofu",                  protein_g: 15.6, carbohydrates_g: 5.2,  fat_g: 9.0,  calories_kcal: 161,  base_quantity: 100, base_unit: "g",  category: "豆類" },
  { food_name: "毛豆（熟）",         name_en: "Edamame, Cooked",             protein_g: 11.9, carbohydrates_g: 8.9,  fat_g: 5.2,  calories_kcal: 121,  base_quantity: 100, base_unit: "g",  category: "豆類" },
  { food_name: "黃豆（熟）",         name_en: "Soybeans, Cooked",            protein_g: 16.6, carbohydrates_g: 9.9,  fat_g: 9.0,  calories_kcal: 173,  base_quantity: 100, base_unit: "g",  category: "豆類" },
  { food_name: "天貝",               name_en: "Tempeh",                      protein_g: 19.9, carbohydrates_g: 7.6,  fat_g: 10.8, calories_kcal: 193,  base_quantity: 100, base_unit: "g",  category: "豆類" },

  // ── 乳製品 ────────────────────────────────────────────────────────────────────
  { food_name: "希臘優格（無糖）",   name_en: "Greek Yogurt, Plain Nonfat",  protein_g: 10.2, carbohydrates_g: 3.6,  fat_g: 0.4,  calories_kcal: 59,   base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "全脂牛奶",           name_en: "Whole Milk",                  protein_g: 3.2,  carbohydrates_g: 4.8,  fat_g: 3.3,  calories_kcal: 61,   base_quantity: 100, base_unit: "ml", category: "乳製品" },
  { food_name: "低脂牛奶",           name_en: "Low-Fat Milk (1%)",           protein_g: 3.4,  carbohydrates_g: 5.0,  fat_g: 1.0,  calories_kcal: 42,   base_quantity: 100, base_unit: "ml", category: "乳製品" },
  { food_name: "豆漿（無糖）",       name_en: "Soy Milk, Unsweetened",       protein_g: 3.3,  carbohydrates_g: 2.3,  fat_g: 2.0,  calories_kcal: 39,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "起司片",             name_en: "American Cheese Slice",       protein_g: 18.0, carbohydrates_g: 2.5,  fat_g: 25.0, calories_kcal: 300,  base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "茅屋起司（低脂）",   name_en: "Cottage Cheese, Low-Fat",     protein_g: 11.1, carbohydrates_g: 3.4,  fat_g: 1.0,  calories_kcal: 72,   base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "無糖優格",           name_en: "Plain Yogurt, Whole Milk",    protein_g: 3.5,  carbohydrates_g: 4.7,  fat_g: 3.3,  calories_kcal: 61,   base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "切達起司",           name_en: "Cheddar Cheese",              protein_g: 24.9, carbohydrates_g: 1.3,  fat_g: 33.1, calories_kcal: 403,  base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "莫扎瑞拉起司",       name_en: "Mozzarella Cheese",           protein_g: 22.2, carbohydrates_g: 2.2,  fat_g: 22.4, calories_kcal: 300,  base_quantity: 100, base_unit: "g",  category: "乳製品" },
  { food_name: "奶油（無鹽）",       name_en: "Butter, Unsalted",            protein_g: 0.9,  carbohydrates_g: 0.1,  fat_g: 81.1, calories_kcal: 717,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "脫脂牛奶",           name_en: "Skim Milk (Nonfat)",          protein_g: 3.4,  carbohydrates_g: 5.0,  fat_g: 0.1,  calories_kcal: 34,   base_quantity: 100, base_unit: "ml", category: "乳製品" },

  // ── 蔬菜 ─────────────────────────────────────────────────────────────────────
  { food_name: "花椰菜",             name_en: "Broccoli",                    protein_g: 2.8,  carbohydrates_g: 6.6,  fat_g: 0.4,  calories_kcal: 34,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "高麗菜",             name_en: "Cabbage",                     protein_g: 1.3,  carbohydrates_g: 5.8,  fat_g: 0.1,  calories_kcal: 25,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "菠菜",               name_en: "Spinach",                     protein_g: 2.9,  carbohydrates_g: 3.6,  fat_g: 0.4,  calories_kcal: 23,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "番茄",               name_en: "Tomato",                      protein_g: 0.9,  carbohydrates_g: 3.9,  fat_g: 0.2,  calories_kcal: 18,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "小黃瓜",             name_en: "Cucumber",                    protein_g: 0.7,  carbohydrates_g: 3.6,  fat_g: 0.1,  calories_kcal: 15,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "地瓜葉",             name_en: "Sweet Potato Leaves",         protein_g: 3.0,  carbohydrates_g: 5.0,  fat_g: 0.3,  calories_kcal: 28,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "紅蘿蔔",             name_en: "Carrot",                      protein_g: 0.9,  carbohydrates_g: 9.6,  fat_g: 0.2,  calories_kcal: 41,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "鴻喜菇",             name_en: "Shimeji Mushroom",            protein_g: 2.5,  carbohydrates_g: 3.9,  fat_g: 0.1,  calories_kcal: 22,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "青椒",               name_en: "Green Bell Pepper",           protein_g: 1.0,  carbohydrates_g: 6.0,  fat_g: 0.2,  calories_kcal: 20,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "洋蔥",               name_en: "Onion",                       protein_g: 1.1,  carbohydrates_g: 9.3,  fat_g: 0.1,  calories_kcal: 40,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "蘆筍",               name_en: "Asparagus",                   protein_g: 2.2,  carbohydrates_g: 3.9,  fat_g: 0.1,  calories_kcal: 20,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "茄子",               name_en: "Eggplant",                    protein_g: 1.0,  carbohydrates_g: 5.9,  fat_g: 0.2,  calories_kcal: 25,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "南瓜",               name_en: "Pumpkin",                     protein_g: 1.0,  carbohydrates_g: 6.5,  fat_g: 0.1,  calories_kcal: 26,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "豆芽菜",             name_en: "Bean Sprouts",                protein_g: 3.0,  carbohydrates_g: 3.8,  fat_g: 0.2,  calories_kcal: 30,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "空心菜",             name_en: "Water Spinach",               protein_g: 2.6,  carbohydrates_g: 3.1,  fat_g: 0.2,  calories_kcal: 22,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "白菜",               name_en: "Napa Cabbage",                protein_g: 1.3,  carbohydrates_g: 2.8,  fat_g: 0.2,  calories_kcal: 13,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "芹菜",               name_en: "Celery",                      protein_g: 0.7,  carbohydrates_g: 3.0,  fat_g: 0.2,  calories_kcal: 16,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "香菇",               name_en: "Shiitake Mushroom",           protein_g: 2.2,  carbohydrates_g: 6.8,  fat_g: 0.5,  calories_kcal: 34,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "秋葵",               name_en: "Okra",                        protein_g: 1.9,  carbohydrates_g: 7.5,  fat_g: 0.2,  calories_kcal: 33,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },
  { food_name: "小松菜",             name_en: "Komatsuna (Japanese Mustard Spinach)", protein_g: 1.5, carbohydrates_g: 2.2, fat_g: 0.2, calories_kcal: 13, base_quantity: 100, base_unit: "g", category: "蔬菜" },
  { food_name: "紅椒",               name_en: "Red Bell Pepper",             protein_g: 1.0,  carbohydrates_g: 6.0,  fat_g: 0.3,  calories_kcal: 31,   base_quantity: 100, base_unit: "g",  category: "蔬菜" },

  // ── 水果 ─────────────────────────────────────────────────────────────────────
  { food_name: "香蕉",               name_en: "Banana",                      protein_g: 1.1,  carbohydrates_g: 22.8, fat_g: 0.3,  calories_kcal: 89,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "蘋果",               name_en: "Apple",                       protein_g: 0.3,  carbohydrates_g: 13.8, fat_g: 0.2,  calories_kcal: 52,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "橘子",               name_en: "Mandarin Orange",             protein_g: 0.9,  carbohydrates_g: 11.8, fat_g: 0.1,  calories_kcal: 47,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "草莓",               name_en: "Strawberry",                  protein_g: 0.7,  carbohydrates_g: 7.7,  fat_g: 0.3,  calories_kcal: 32,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "藍莓",               name_en: "Blueberry",                   protein_g: 0.7,  carbohydrates_g: 14.5, fat_g: 0.3,  calories_kcal: 57,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "葡萄",               name_en: "Grape",                       protein_g: 0.7,  carbohydrates_g: 18.1, fat_g: 0.2,  calories_kcal: 69,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "西瓜",               name_en: "Watermelon",                  protein_g: 0.6,  carbohydrates_g: 7.6,  fat_g: 0.2,  calories_kcal: 30,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "芭樂",               name_en: "Guava",                       protein_g: 2.6,  carbohydrates_g: 14.3, fat_g: 0.9,  calories_kcal: 68,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "芒果",               name_en: "Mango",                       protein_g: 0.8,  carbohydrates_g: 15.0, fat_g: 0.4,  calories_kcal: 60,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "鳳梨",               name_en: "Pineapple",                   protein_g: 0.5,  carbohydrates_g: 13.1, fat_g: 0.1,  calories_kcal: 50,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "奇異果",             name_en: "Kiwi",                        protein_g: 1.1,  carbohydrates_g: 15.0, fat_g: 0.5,  calories_kcal: 61,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "梨子",               name_en: "Pear",                        protein_g: 0.4,  carbohydrates_g: 15.2, fat_g: 0.1,  calories_kcal: 57,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "水蜜桃",             name_en: "Peach",                       protein_g: 0.9,  carbohydrates_g: 9.5,  fat_g: 0.3,  calories_kcal: 39,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "木瓜",               name_en: "Papaya",                      protein_g: 0.5,  carbohydrates_g: 10.8, fat_g: 0.1,  calories_kcal: 43,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "柳橙",               name_en: "Orange",                      protein_g: 0.9,  carbohydrates_g: 11.8, fat_g: 0.1,  calories_kcal: 47,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "龍眼",               name_en: "Longan",                      protein_g: 1.3,  carbohydrates_g: 15.1, fat_g: 0.1,  calories_kcal: 60,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "荔枝",               name_en: "Lychee",                      protein_g: 0.8,  carbohydrates_g: 16.5, fat_g: 0.4,  calories_kcal: 66,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "葡萄柚",             name_en: "Grapefruit",                  protein_g: 0.8,  carbohydrates_g: 11.2, fat_g: 0.1,  calories_kcal: 42,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "檸檬",               name_en: "Lemon",                       protein_g: 1.1,  carbohydrates_g: 9.3,  fat_g: 0.3,  calories_kcal: 29,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "火龍果",             name_en: "Dragon Fruit",                protein_g: 1.2,  carbohydrates_g: 13.2, fat_g: 0.4,  calories_kcal: 60,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "哈密瓜",             name_en: "Cantaloupe",                  protein_g: 0.8,  carbohydrates_g: 8.2,  fat_g: 0.2,  calories_kcal: 34,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "榴槤",               name_en: "Durian",                      protein_g: 1.5,  carbohydrates_g: 27.1, fat_g: 5.3,  calories_kcal: 147,  base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "釋迦",               name_en: "Sugar Apple",                 protein_g: 1.7,  carbohydrates_g: 25.2, fat_g: 0.6,  calories_kcal: 94,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "椰子肉",             name_en: "Coconut Meat",                protein_g: 3.3,  carbohydrates_g: 15.2, fat_g: 33.5, calories_kcal: 354,  base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "楊桃",               name_en: "Star Fruit",                  protein_g: 1.0,  carbohydrates_g: 6.7,  fat_g: 0.3,  calories_kcal: 31,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "百香果",             name_en: "Passion Fruit",               protein_g: 2.2,  carbohydrates_g: 23.4, fat_g: 0.7,  calories_kcal: 97,   base_quantity: 100, base_unit: "g",  category: "水果" },
  { food_name: "枇杷",               name_en: "Loquat",                      protein_g: 0.4,  carbohydrates_g: 12.1, fat_g: 0.2,  calories_kcal: 47,   base_quantity: 100, base_unit: "g",  category: "水果" },

  // ── 油脂 ─────────────────────────────────────────────────────────────────────
  { food_name: "橄欖油",             name_en: "Olive Oil",                   protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "椰子油",             name_en: "Coconut Oil",                 protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 862,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "芥花油",             name_en: "Canola Oil",                  protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "酪梨",               name_en: "Avocado",                     protein_g: 2.0,  carbohydrates_g: 8.5,  fat_g: 14.7, calories_kcal: 160,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "葵花油",             name_en: "Sunflower Oil",               protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "酪梨油",             name_en: "Avocado Oil",                 protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "玄米油",             name_en: "Rice Bran Oil",               protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "豬油",               name_en: "Lard",                        protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 99.5, calories_kcal: 897,  base_quantity: 100, base_unit: "g",  category: "油脂" },
  { food_name: "麻油",               name_en: "Sesame Oil",                  protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 100.0,calories_kcal: 884,  base_quantity: 100, base_unit: "g",  category: "油脂" },

  // ── 堅果 ─────────────────────────────────────────────────────────────────────
  { food_name: "花生醬",             name_en: "Peanut Butter",               protein_g: 25.1, carbohydrates_g: 20.0, fat_g: 50.4, calories_kcal: 588,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "杏仁",               name_en: "Almonds",                     protein_g: 21.2, carbohydrates_g: 21.6, fat_g: 49.9, calories_kcal: 579,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "核桃",               name_en: "Walnuts",                     protein_g: 15.2, carbohydrates_g: 13.7, fat_g: 65.2, calories_kcal: 654,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "花生",               name_en: "Peanuts",                     protein_g: 25.8, carbohydrates_g: 16.1, fat_g: 49.2, calories_kcal: 567,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "奇亞籽",             name_en: "Chia Seeds",                  protein_g: 16.5, carbohydrates_g: 42.1, fat_g: 30.7, calories_kcal: 486,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "腰果",               name_en: "Cashews",                     protein_g: 18.2, carbohydrates_g: 30.2, fat_g: 43.9, calories_kcal: 553,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "開心果",             name_en: "Pistachios",                  protein_g: 20.2, carbohydrates_g: 27.5, fat_g: 45.4, calories_kcal: 562,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "芝麻",               name_en: "Sesame Seeds",                protein_g: 17.7, carbohydrates_g: 23.5, fat_g: 49.7, calories_kcal: 573,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "葵花籽",             name_en: "Sunflower Seeds",             protein_g: 20.8, carbohydrates_g: 20.0, fat_g: 51.5, calories_kcal: 584,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "南瓜籽",             name_en: "Pumpkin Seeds",               protein_g: 30.2, carbohydrates_g: 10.7, fat_g: 49.1, calories_kcal: 559,  base_quantity: 100, base_unit: "g",  category: "堅果" },
  { food_name: "亞麻籽",             name_en: "Flaxseeds",                   protein_g: 18.3, carbohydrates_g: 28.9, fat_g: 42.2, calories_kcal: 534,  base_quantity: 100, base_unit: "g",  category: "堅果" },

  // ── 補劑 ─────────────────────────────────────────────────────────────────────
  { food_name: "乳清蛋白粉",         name_en: "Whey Protein Powder",         protein_g: 80.0, carbohydrates_g: 6.0,  fat_g: 6.0,  calories_kcal: 400,  base_quantity: 100, base_unit: "g",  category: "補劑" },
  { food_name: "乳清分離蛋白",       name_en: "Whey Protein Isolate",        protein_g: 90.0, carbohydrates_g: 3.0,  fat_g: 1.0,  calories_kcal: 380,  base_quantity: 100, base_unit: "g",  category: "補劑" },
  { food_name: "植物性蛋白粉",       name_en: "Plant-Based Protein Powder",  protein_g: 75.0, carbohydrates_g: 8.0,  fat_g: 5.0,  calories_kcal: 380,  base_quantity: 100, base_unit: "g",  category: "補劑" },
  { food_name: "肌酸",               name_en: "Creatine",                    protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 0.0,  calories_kcal: 0,    base_quantity: 5,   base_unit: "g",  category: "補劑" },

  // ── 加工食品 ─────────────────────────────────────────────────────────────────
  { food_name: "黑巧克力（70%）",    name_en: "Dark Chocolate (70%)",        protein_g: 7.8,  carbohydrates_g: 45.9, fat_g: 42.6, calories_kcal: 598,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "燕麥棒",             name_en: "Oat Bar",                     protein_g: 8.0,  carbohydrates_g: 60.0, fat_g: 18.0, calories_kcal: 450,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "水煮雞胸肉罐頭",     name_en: "Canned Chicken Breast",       protein_g: 27.0, carbohydrates_g: 0.0,  fat_g: 2.0,  calories_kcal: 127,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "洋芋片",             name_en: "Potato Chips",                protein_g: 7.0,  carbohydrates_g: 53.2, fat_g: 34.6, calories_kcal: 536,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "泡麵",               name_en: "Instant Noodles",             protein_g: 8.5,  carbohydrates_g: 55.0, fat_g: 16.9, calories_kcal: 411,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "熱狗腸",             name_en: "Hot Dog",                     protein_g: 10.5, carbohydrates_g: 3.8,  fat_g: 16.5, calories_kcal: 208,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "豬肉水餃",           name_en: "Pork Dumplings",              protein_g: 8.5,  carbohydrates_g: 25.0, fat_g: 7.0,  calories_kcal: 197,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "蛋白棒",             name_en: "Protein Bar",                 protein_g: 20.0, carbohydrates_g: 40.0, fat_g: 10.0, calories_kcal: 330,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "飯糰（鮪魚）",       name_en: "Rice Ball, Tuna",             protein_g: 5.2,  carbohydrates_g: 27.5, fat_g: 2.1,  calories_kcal: 149,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "鹽水雞",             name_en: "Poached Salted Chicken",      protein_g: 25.2, carbohydrates_g: 0.0,  fat_g: 7.0,  calories_kcal: 168,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "雞蛋豆腐",           name_en: "Egg Tofu",                    protein_g: 6.4,  carbohydrates_g: 2.2,  fat_g: 3.7,  calories_kcal: 68,   base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "雞塊（炸）",         name_en: "Fried Chicken Nuggets",       protein_g: 14.0, carbohydrates_g: 15.0, fat_g: 16.0, calories_kcal: 258,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "漢堡肉排",           name_en: "Burger Patty",                protein_g: 17.0, carbohydrates_g: 6.0,  fat_g: 18.0, calories_kcal: 258,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "肉鬆",               name_en: "Pork Floss",                  protein_g: 41.8, carbohydrates_g: 28.5, fat_g: 12.0, calories_kcal: 397,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "魚丸",               name_en: "Fish Ball",                   protein_g: 12.0, carbohydrates_g: 10.0, fat_g: 5.0,  calories_kcal: 130,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "貢丸",               name_en: "Taiwanese Pork Ball",         protein_g: 14.0, carbohydrates_g: 9.0,  fat_g: 7.0,  calories_kcal: 155,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "豆皮（油豆腐皮）",   name_en: "Tofu Skin",                   protein_g: 17.4, carbohydrates_g: 5.0,  fat_g: 14.4, calories_kcal: 219,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "凍豆腐",             name_en: "Frozen Tofu",                 protein_g: 13.2, carbohydrates_g: 4.0,  fat_g: 8.3,  calories_kcal: 144,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "薯條（炸）",         name_en: "French Fries",                protein_g: 3.4,  carbohydrates_g: 35.7, fat_g: 14.7, calories_kcal: 289,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "披薩（起司）",       name_en: "Cheese Pizza",                protein_g: 11.0, carbohydrates_g: 33.0, fat_g: 10.0, calories_kcal: 266,  base_quantity: 100, base_unit: "g",  category: "加工食品" },
  { food_name: "蛋炒飯",             name_en: "Egg Fried Rice",              protein_g: 4.5,  carbohydrates_g: 29.5, fat_g: 5.0,  calories_kcal: 181,  base_quantity: 100, base_unit: "g",  category: "加工食品" },

  // ── 飲料 ─────────────────────────────────────────────────────────────────────
  { food_name: "水",                 name_en: "Water",                       protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 0.0,  calories_kcal: 0,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "無糖綠茶",           name_en: "Green Tea, Unsweetened",      protein_g: 0.0,  carbohydrates_g: 0.2,  fat_g: 0.0,  calories_kcal: 1,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "無糖紅茶",           name_en: "Black Tea, Unsweetened",      protein_g: 0.0,  carbohydrates_g: 0.3,  fat_g: 0.0,  calories_kcal: 1,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "無糖烏龍茶",         name_en: "Oolong Tea, Unsweetened",     protein_g: 0.0,  carbohydrates_g: 0.1,  fat_g: 0.0,  calories_kcal: 1,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "黑咖啡（無糖）",     name_en: "Black Coffee, Unsweetened",   protein_g: 0.2,  carbohydrates_g: 0.2,  fat_g: 0.0,  calories_kcal: 2,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "拿鐵（全脂無糖）",   name_en: "Latte, Whole Milk, Unsweetened", protein_g: 3.4, carbohydrates_g: 4.8, fat_g: 3.3, calories_kcal: 62,  base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "豆漿（有糖）",       name_en: "Soy Milk, Sweetened",         protein_g: 2.8,  carbohydrates_g: 7.0,  fat_g: 1.5,  calories_kcal: 53,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "柳橙汁（100%）",     name_en: "Orange Juice, 100%",          protein_g: 0.7,  carbohydrates_g: 10.4, fat_g: 0.2,  calories_kcal: 45,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "蘋果汁（100%）",     name_en: "Apple Juice, 100%",           protein_g: 0.1,  carbohydrates_g: 11.7, fat_g: 0.1,  calories_kcal: 46,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "椰子水",             name_en: "Coconut Water",               protein_g: 0.7,  carbohydrates_g: 3.7,  fat_g: 0.2,  calories_kcal: 19,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "運動飲料",           name_en: "Sports Drink",                protein_g: 0.0,  carbohydrates_g: 6.0,  fat_g: 0.0,  calories_kcal: 24,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "可樂",               name_en: "Cola",                        protein_g: 0.0,  carbohydrates_g: 10.6, fat_g: 0.0,  calories_kcal: 42,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "能量飲料",           name_en: "Energy Drink",                protein_g: 0.0,  carbohydrates_g: 11.0, fat_g: 0.0,  calories_kcal: 45,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "珍珠奶茶（全糖）",   name_en: "Bubble Tea, Full Sugar",      protein_g: 0.7,  carbohydrates_g: 12.9, fat_g: 1.7,  calories_kcal: 71,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "木瓜牛奶",           name_en: "Papaya Milk",                 protein_g: 2.5,  carbohydrates_g: 13.0, fat_g: 2.8,  calories_kcal: 85,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "冬瓜茶",             name_en: "Winter Melon Tea",            protein_g: 0.0,  carbohydrates_g: 12.0, fat_g: 0.0,  calories_kcal: 48,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "蜂蜜檸檬",           name_en: "Honey Lemon Water",           protein_g: 0.1,  carbohydrates_g: 9.0,  fat_g: 0.0,  calories_kcal: 36,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "啤酒",               name_en: "Beer",                        protein_g: 0.5,  carbohydrates_g: 3.6,  fat_g: 0.0,  calories_kcal: 43,   base_quantity: 100, base_unit: "ml", category: "飲料" },
  { food_name: "無糖氣泡水",         name_en: "Sparkling Water, Unsweetened",protein_g: 0.0,  carbohydrates_g: 0.0,  fat_g: 0.0,  calories_kcal: 0,    base_quantity: 100, base_unit: "ml", category: "飲料", counts_as_water: true },
  { food_name: "全脂優酪乳",         name_en: "Whole Milk Kefir/Yogurt Drink",protein_g: 3.2, carbohydrates_g: 6.0,  fat_g: 3.2,  calories_kcal: 63,   base_quantity: 100, base_unit: "ml", category: "飲料" },
];
