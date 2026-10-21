/** Формы слова для `Intl.PluralRules`. Английскому хватает one/other, остальные ключи повторяют словарь. */
export interface PluralForms {
  one: string;
  few: string;
  many: string;
  other: string;
}

/** Категория, которой нет в словаре, берёт `other`. */
export function plural(locale: string, n: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(locale).select(n);
  if (category === 'one' || category === 'few' || category === 'many') return forms[category];
  return forms.other;
}

/** «3 дня», «21 point». */
export const countLabel = (locale: string, n: number, forms: PluralForms) => `${n} ${plural(locale, n, forms)}`;

/** Подставляет `{name}` в шаблон. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''));
}
