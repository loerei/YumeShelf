export interface TranslationExtractor {
    extract(gameDir: string): Promise<string[]>;
}
