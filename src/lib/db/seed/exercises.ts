/**
 * Built-in exercise database seed
 * MET values from: Ainsworth et al. (2011) Compendium of Physical Activities
 * Reference: https://sites.google.com/site/compendiumofphysicalactivities/
 * Internal version — do NOT expose raw data directly to end users.
 */

export interface SeedExercise {
  name:         string;
  name_en?:     string;
  category:     string;
  default_mets: number;
  body_part?:   string; // for strength exercises: 胸/背/腿/腹/手/肩
}

export const SEED_EXERCISES: SeedExercise[] = [
  // ── 有氧 ────────────────────────────────────────────────────────────────────
  { name: "快走（6km/h）",       name_en: "Brisk Walk (6km/h)",         category: "有氧", default_mets: 3.5  },
  { name: "健走（5km/h）",       name_en: "Walking (5km/h)",            category: "有氧", default_mets: 3.0  },
  { name: "慢跑（7km/h）",       name_en: "Light Jog (7km/h)",          category: "有氧", default_mets: 7.0  },
  { name: "跑步（9km/h）",       name_en: "Running (9km/h)",            category: "有氧", default_mets: 9.8  },
  { name: "快跑（12km/h）",      name_en: "Fast Run (12km/h)",          category: "有氧", default_mets: 11.8 },
  { name: "腳踏車（中等強度）",  name_en: "Cycling (Moderate)",         category: "有氧", default_mets: 8.0  },
  { name: "腳踏車（輕鬆）",      name_en: "Cycling (Easy)",             category: "有氧", default_mets: 5.8  },
  { name: "游泳（自由式）",      name_en: "Swimming (Freestyle)",       category: "有氧", default_mets: 8.0  },
  { name: "游泳（蛙式）",        name_en: "Swimming (Breaststroke)",    category: "有氧", default_mets: 5.3  },
  { name: "跳繩",                name_en: "Jump Rope",                  category: "有氧", default_mets: 11.0 },
  { name: "HIIT",                name_en: "HIIT",                       category: "有氧", default_mets: 8.0  },
  { name: "有氧舞蹈",            name_en: "Aerobic Dance",              category: "有氧", default_mets: 6.0  },
  { name: "爬山（背包）",        name_en: "Hiking (Backpack)",          category: "有氧", default_mets: 5.3  },
  { name: "爬樓梯",              name_en: "Stair Climbing",             category: "有氧", default_mets: 4.0  },
  { name: "橢圓機（中等強度）",  name_en: "Elliptical (Moderate)",      category: "有氧", default_mets: 5.0  },
  { name: "划船機（中等強度）",  name_en: "Rowing Machine (Moderate)",  category: "有氧", default_mets: 7.0  },
  { name: "跑步機（中等強度）",  name_en: "Treadmill (Moderate)",       category: "有氧", default_mets: 8.0  },
  { name: "飛輪課程（室內）",    name_en: "Indoor Cycling Class",       category: "有氧", default_mets: 8.5  },

  // ── 重訓（一般）────────────────────────────────────────────────────────────
  { name: "重量訓練（一般）",    name_en: "Weight Training (General)",  category: "重訓", default_mets: 5.0  },
  { name: "重量訓練（高強度）",  name_en: "Weight Training (Heavy)",    category: "重訓", default_mets: 6.0  },
  { name: "自體重量訓練",        name_en: "Bodyweight Training",        category: "重訓", default_mets: 3.8  },

  // ── 胸 ─────────────────────────────────────────────────────────────────────
  { name: "槓鈴臥推",            name_en: "Barbell Bench Press",        category: "重訓", default_mets: 5.0, body_part: "胸" },
  { name: "啞鈴臥推",            name_en: "Dumbbell Bench Press",       category: "重訓", default_mets: 5.0, body_part: "胸" },
  { name: "上斜臥推",            name_en: "Incline Bench Press",        category: "重訓", default_mets: 5.0, body_part: "胸" },
  { name: "下斜臥推",            name_en: "Decline Bench Press",        category: "重訓", default_mets: 5.0, body_part: "胸" },
  { name: "蝴蝶機夾胸",          name_en: "Pec Deck Fly",               category: "重訓", default_mets: 4.5, body_part: "胸" },
  { name: "啞鈴飛鳥",            name_en: "Dumbbell Fly",               category: "重訓", default_mets: 4.5, body_part: "胸" },
  { name: "伏地挺身",            name_en: "Push-Up",                    category: "重訓", default_mets: 3.8, body_part: "胸" },
  { name: "雙槓撐體",            name_en: "Dips",                       category: "重訓", default_mets: 4.0, body_part: "胸" },

  // ── 背 ─────────────────────────────────────────────────────────────────────
  { name: "引體向上",            name_en: "Pull-Up",                    category: "重訓", default_mets: 4.5, body_part: "背" },
  { name: "滑輪下拉",            name_en: "Lat Pulldown",               category: "重訓", default_mets: 4.5, body_part: "背" },
  { name: "槓鈴划船",            name_en: "Barbell Row",                category: "重訓", default_mets: 5.0, body_part: "背" },
  { name: "坐姿划船",            name_en: "Seated Cable Row",           category: "重訓", default_mets: 4.5, body_part: "背" },
  { name: "單臂啞鈴划船",        name_en: "Single-Arm Dumbbell Row",    category: "重訓", default_mets: 4.5, body_part: "背" },
  { name: "T-bar 划船",          name_en: "T-Bar Row",                  category: "重訓", default_mets: 5.0, body_part: "背" },
  { name: "直腿硬舉",            name_en: "Romanian Deadlift",          category: "重訓", default_mets: 6.0, body_part: "背" },
  { name: "槓鈴硬舉",            name_en: "Barbell Deadlift",           category: "重訓", default_mets: 6.0, body_part: "背" },
  { name: "背部伸展",            name_en: "Back Extension",             category: "重訓", default_mets: 3.0, body_part: "背" },

  // ── 腿 ─────────────────────────────────────────────────────────────────────
  { name: "槓鈴深蹲",            name_en: "Barbell Squat",              category: "重訓", default_mets: 5.0, body_part: "腿" },
  { name: "腿舉（器械）",        name_en: "Leg Press (Machine)",        category: "重訓", default_mets: 4.5, body_part: "腿" },
  { name: "腿彎舉",              name_en: "Leg Curl",                   category: "重訓", default_mets: 4.0, body_part: "腿" },
  { name: "腿伸展",              name_en: "Leg Extension",              category: "重訓", default_mets: 4.0, body_part: "腿" },
  { name: "弓箭步",              name_en: "Lunge",                      category: "重訓", default_mets: 4.5, body_part: "腿" },
  { name: "保加利亞分腿蹲",      name_en: "Bulgarian Split Squat",      category: "重訓", default_mets: 5.0, body_part: "腿" },
  { name: "硬舉",                name_en: "Deadlift",                   category: "重訓", default_mets: 6.0, body_part: "腿" },
  { name: "小腿提踵",            name_en: "Calf Raise",                 category: "重訓", default_mets: 3.5, body_part: "腿" },
  { name: "深蹲跳",              name_en: "Jump Squat",                 category: "重訓", default_mets: 5.5, body_part: "腿" },

  // ── 腹 ─────────────────────────────────────────────────────────────────────
  { name: "仰臥起坐",            name_en: "Sit-Up",                     category: "重訓", default_mets: 3.8, body_part: "腹" },
  { name: "捲腹",                name_en: "Crunch",                     category: "重訓", default_mets: 3.5, body_part: "腹" },
  { name: "懸吊舉腿",            name_en: "Hanging Leg Raise",          category: "重訓", default_mets: 4.0, body_part: "腹" },
  { name: "棒式（Plank）",       name_en: "Plank",                      category: "重訓", default_mets: 3.0, body_part: "腹" },
  { name: "俄式轉體",            name_en: "Russian Twist",              category: "重訓", default_mets: 3.5, body_part: "腹" },
  { name: "繩索捲腹",            name_en: "Cable Crunch",               category: "重訓", default_mets: 3.8, body_part: "腹" },
  { name: "登山者式",            name_en: "Mountain Climber",           category: "重訓", default_mets: 4.5, body_part: "腹" },

  // ── 手 ─────────────────────────────────────────────────────────────────────
  { name: "槓鈴彎舉",            name_en: "Barbell Curl",               category: "重訓", default_mets: 4.0, body_part: "手" },
  { name: "啞鈴彎舉",            name_en: "Dumbbell Curl",              category: "重訓", default_mets: 4.0, body_part: "手" },
  { name: "鎚式彎舉",            name_en: "Hammer Curl",                category: "重訓", default_mets: 4.0, body_part: "手" },
  { name: "集中彎舉",            name_en: "Concentration Curl",         category: "重訓", default_mets: 3.8, body_part: "手" },
  { name: "三頭下壓",            name_en: "Tricep Pushdown",            category: "重訓", default_mets: 4.0, body_part: "手" },
  { name: "窄握臥推",            name_en: "Close-Grip Bench Press",     category: "重訓", default_mets: 5.0, body_part: "手" },
  { name: "頭後三頭伸展",        name_en: "Overhead Tricep Extension",  category: "重訓", default_mets: 4.0, body_part: "手" },
  { name: "繩索三頭下壓",        name_en: "Rope Tricep Pushdown",       category: "重訓", default_mets: 4.0, body_part: "手" },

  // ── 肩 ─────────────────────────────────────────────────────────────────────
  { name: "槓鈴肩推",            name_en: "Barbell Overhead Press",     category: "重訓", default_mets: 5.0, body_part: "肩" },
  { name: "啞鈴肩推",            name_en: "Dumbbell Shoulder Press",    category: "重訓", default_mets: 5.0, body_part: "肩" },
  { name: "阿諾德推舉",          name_en: "Arnold Press",               category: "重訓", default_mets: 5.0, body_part: "肩" },
  { name: "側平舉",              name_en: "Lateral Raise",              category: "重訓", default_mets: 3.5, body_part: "肩" },
  { name: "前平舉",              name_en: "Front Raise",                category: "重訓", default_mets: 3.5, body_part: "肩" },
  { name: "反向飛鳥",            name_en: "Reverse Fly",                category: "重訓", default_mets: 3.8, body_part: "肩" },
  { name: "槓鈴聳肩",            name_en: "Barbell Shrug",              category: "重訓", default_mets: 4.0, body_part: "肩" },
  { name: "面拉",                name_en: "Face Pull",                  category: "重訓", default_mets: 4.0, body_part: "肩" },

  // ── 球類 ────────────────────────────────────────────────────────────────────
  { name: "籃球",                name_en: "Basketball",                 category: "球類", default_mets: 6.5  },
  { name: "足球",                name_en: "Soccer",                     category: "球類", default_mets: 7.0  },
  { name: "羽毛球",              name_en: "Badminton",                  category: "球類", default_mets: 5.5  },
  { name: "乒乓球",              name_en: "Table Tennis",               category: "球類", default_mets: 4.0  },
  { name: "網球（單打）",        name_en: "Tennis (Singles)",           category: "球類", default_mets: 7.3  },
  { name: "排球",                name_en: "Volleyball",                 category: "球類", default_mets: 4.0  },

  // ── 伸展 ────────────────────────────────────────────────────────────────────
  { name: "瑜珈",                name_en: "Yoga",                       category: "伸展", default_mets: 2.5  },
  { name: "皮拉提斯",            name_en: "Pilates",                    category: "伸展", default_mets: 3.0  },
  { name: "靜態伸展",            name_en: "Static Stretching",          category: "伸展", default_mets: 2.3  },

  // ── 水上運動 ────────────────────────────────────────────────────────────────
  { name: "水中有氧",            name_en: "Water Aerobics",             category: "水上運動", default_mets: 5.5  },
  { name: "衝浪",                name_en: "Surfing",                    category: "水上運動", default_mets: 3.0  },

  // ── 其他 ────────────────────────────────────────────────────────────────────
  { name: "高爾夫（步行）",      name_en: "Golf (Walking)",             category: "其他", default_mets: 4.8  },
  { name: "騎馬",                name_en: "Horse Riding",               category: "其他", default_mets: 4.0  },
  { name: "滑雪（下坡）",        name_en: "Downhill Skiing",            category: "其他", default_mets: 6.0  },
];
