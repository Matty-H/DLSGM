export declare const SECTIONS: Record<'ui' | 'main', { dir: string; fns: string[] }>;
export declare function collectKeys(root: string, dir: string, fns: string[]): { keys: Map<string, string>; nonLiteral: string[] };
export declare function collectAllKeys(root: string): Record<'ui' | 'main', { keys: Map<string, string>; nonLiteral: string[] }>;
export declare function placeholders(text: string): string[];
