/** Выбирает форму слова для числа: plural(3, ["день", "дня", "дней"]) → "дня". */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const DAY_FORMS = ["день", "дня", "дней"] as const;
export const POINT_FORMS = ["точка", "точки", "точек"] as const;

/** «3 дня», «21 точка». */
export const countLabel = (n: number, forms: readonly [string, string, string]) => `${n} ${plural(n, forms)}`;
