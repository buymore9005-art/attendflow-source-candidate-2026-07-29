export type LocaleCode = 'id' | 'en' | 'zh';
export type TranslationParams = Record<string, string | number>;
export type FlatDictionary = Readonly<Record<string, string>>;
export type Dictionaries = Readonly<Record<LocaleCode, FlatDictionary>>;

const interpolate = (value: string, params: TranslationParams): string =>
  value.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const replacement = params[key];
    return replacement === undefined ? match : String(replacement);
  });

export function createTranslator(
  locale: LocaleCode,
  dictionaries: Dictionaries,
  fallbackLocale: LocaleCode = 'id'
): (key: string, params?: TranslationParams) => string {
  return (key, params = {}) => {
    const value = dictionaries[locale][key] ?? dictionaries[fallbackLocale][key] ?? key;
    return interpolate(value, params);
  };
}
