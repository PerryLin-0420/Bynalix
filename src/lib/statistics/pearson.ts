/** Pearson correlation and influence ranking for body recorder statistics. */

export interface DailyRecord {
  date: string;           // YYYY-MM-DD
  weight_kg?: number;
  calories_kcal?: number;
  protein_g?: number;
  carb_g?: number;
  fat_g?: number;
  water_ml?: number;
  exercise_count?: number;      // number of cardio sessions
  exercise_min?: number;        // total cardio minutes
  exercise_kcal?: number;       // total cardio calories burned
  strength_volume_kg?: number;  // Σ(weight_kg × reps) across all strength sets
}

export type Factor =
  | 'calories_kcal'
  | 'protein_g'
  | 'carb_g'
  | 'fat_g'
  | 'water_ml'
  | 'exercise_count'
  | 'exercise_min'
  | 'exercise_kcal'
  | 'strength_volume_kg';

export interface CorrelationResult {
  factor: Factor;
  label: string;
  r: number;           // Pearson r, -1 to 1
  direction: 'positive' | 'negative';
  sampleSize: number;
}

export const FACTOR_LABELS: Record<Factor, string> = {
  calories_kcal:      '每日熱量',
  protein_g:          '蛋白質攝取',
  carb_g:             '碳水攝取',
  fat_g:              '脂肪攝取',
  water_ml:           '飲水量',
  exercise_count:     '有氧次數',
  exercise_min:       '有氧時長',
  exercise_kcal:      '運動消耗',
  strength_volume_kg: '重訓總量',
};

export const FACTOR_LABELS_EN: Record<Factor, string> = {
  calories_kcal:      'Daily calories',
  protein_g:          'Protein intake',
  carb_g:             'Carb intake',
  fat_g:              'Fat intake',
  water_ml:           'Water intake',
  exercise_count:     'Cardio sessions',
  exercise_min:       'Cardio duration',
  exercise_kcal:      'Exercise calories',
  strength_volume_kg: 'Strength volume',
};

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    sx  += dx * dx;
    sy  += dy * dy;
  }
  const denom = Math.sqrt(sx * sy);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Calculates 3-day rolling average weight change as the target variable.
 * Returns an array aligned with records that have weight data.
 */
function rollingWeightChange(records: DailyRecord[], windowDays = 3): Map<string, number> {
  const withWeight = records.filter(r => r.weight_kg != null).sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map<string, number>();
  for (let i = windowDays; i < withWeight.length; i++) {
    const current = withWeight.slice(i - windowDays + 1, i + 1);
    const prev    = withWeight.slice(i - windowDays, i);
    const avgCurrent = current.reduce((s, r) => s + r.weight_kg!, 0) / current.length;
    const avgPrev    = prev.reduce((s, r) => s + r.weight_kg!, 0) / prev.length;
    result.set(withWeight[i].date, avgCurrent - avgPrev);
  }
  return result;
}

/**
 * Computes Pearson correlation between each factor and rolling weight change.
 * Requires MIN_RECORDS days with both factor data and weight data.
 * Returns top N results sorted by |r|.
 */
export function computeInfluenceRanking(
  records: DailyRecord[],
  factors: Factor[] = Object.keys(FACTOR_LABELS) as Factor[],
  topN = 5,
  minRecords = 14,
): CorrelationResult[] | null {
  const weightChanges = rollingWeightChange(records);
  if (weightChanges.size < minRecords) return null;  // requires minRecords (default 14)

  const results: CorrelationResult[] = [];

  for (const factor of factors) {
    const pairs: [number, number][] = [];
    for (const [date, wChange] of weightChanges) {
      const rec = records.find(r => r.date === date);
      if (!rec) continue;
      const val = rec[factor];
      if (val == null) continue;
      pairs.push([val, wChange]);
    }
    if (pairs.length < minRecords) continue;

    const xArr = pairs.map(p => p[0]);
    const yArr = pairs.map(p => p[1]);
    const r = pearson(xArr, yArr);

    results.push({
      factor,
      label: FACTOR_LABELS[factor],
      r,
      direction: r >= 0 ? 'positive' : 'negative',
      sampleSize: pairs.length,
    });
  }

  return results
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, topN);
}

/**
 * For cut mode: factors negatively correlated with weight change are beneficial
 * (eating less = losing weight). Positive r factors increase weight.
 *
 * For bulk mode: factors positively correlated are beneficial.
 */
export type GoalMode = 'cut' | 'bulk' | 'maintain';

export function rankingInsight(result: CorrelationResult, goalMode: GoalMode, lang: 'zh' | 'en' = 'zh'): string {
  const { label, factor, r, direction } = result;
  const displayLabel = lang === 'en' ? FACTOR_LABELS_EN[factor] : label;

  if (lang === 'en') {
    const strength = Math.abs(r) > 0.5 ? 'strong' : Math.abs(r) > 0.3 ? 'moderate' : 'mild';
    if (goalMode === 'cut') {
      return direction === 'negative'
        ? `${displayLabel} shows a ${strength} positive link with weight loss (more = helps cut)`
        : `${displayLabel} shows a ${strength} positive link with weight gain (monitor intake)`;
    }
    if (goalMode === 'bulk') {
      return direction === 'positive'
        ? `${displayLabel} shows a ${strength} positive link with weight gain (supports bulk)`
        : `${displayLabel} correlates with weight loss (may hinder bulk)`;
    }
    return `${displayLabel} correlation with weight change: ${r.toFixed(2)}`;
  }

  const strong = Math.abs(r) > 0.5 ? '強' : Math.abs(r) > 0.3 ? '中等' : '輕微';
  if (goalMode === 'cut') {
    return direction === 'negative'
      ? `${displayLabel} 與體重下降呈${strong}正向關係（多攝取有助減重）`
      : `${displayLabel} 與體重上升呈${strong}正向關係（需注意控制）`;
  }
  if (goalMode === 'bulk') {
    return direction === 'positive'
      ? `${displayLabel} 與體重增加呈${strong}正向關係（有助增肌增重）`
      : `${displayLabel} 與體重下降相關（可能影響增重效果）`;
  }
  return `${displayLabel} 與體重變化的相關係數為 ${r.toFixed(2)}`;
}
