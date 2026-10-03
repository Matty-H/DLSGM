export declare const LANGUAGE_CODE: RegExp;
export declare function defaultLanguage(code: string): { name: string; locale: string };
export interface TemplateReport {
  sections: Record<string, { total: number; translated: number; added: number }>;
  obsolete: { section: string; key: string }[];
  restored: { section: string; key: string }[];
  badParams: { section: string; key: string }[];
}
export declare function updateLocale(
  existing: unknown,
  code: string,
  used: Record<'ui' | 'main', string[]>
): { data: Record<string, any>; report: TemplateReport };
