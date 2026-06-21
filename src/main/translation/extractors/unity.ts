import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { TranslationExtractor } from './base';

export class UnityExtractor implements TranslationExtractor {
    async extract(gameDir: string): Promise<string[]> {
        const strings = new Set<string>();

        // 1. Locate Unity Managed folder or Assembly-CSharp.dll
        try {
            const entries = await fs.readdir(gameDir);
            const dataDir = entries.find(e => e.toLowerCase().endsWith('_data'));
            if (!dataDir) return [];

            const managedDir = path.join(gameDir, dataDir, 'Managed');
            const assemblyPath = path.join(managedDir, 'Assembly-CSharp.dll');

            // 2. Scan Assembly-CSharp.dll binary for UTF-16LE localizable string patterns
            try {
                await fs.access(assemblyPath);
                const buffer = await fs.readFile(assemblyPath);
                this.scanBinaryForStrings(buffer, strings);
            } catch {
                // Ignore missing assembly (IL2CPP compilation builds)
            }

            // 3. Scan sharedassets*.assets or globalgamemanagers files
            const dataPath = path.join(gameDir, dataDir);
            const dataFiles = await fs.readdir(dataPath).catch(() => []);
            const assetFiles = dataFiles.filter(f => 
                (f.toLowerCase().startsWith('sharedassets') && f.toLowerCase().endsWith('.assets')) ||
                f.toLowerCase() === 'globalgamemanagers' ||
                f.toLowerCase() === 'resources.assets'
            );

            for (const file of assetFiles) {
                const assetPath = path.join(dataPath, file);
                try {
                    // Read up to first 25MB of asset files to prevent memory issues on massive bundles
                    const handle = await fs.open(assetPath, 'r');
                    const { size } = await handle.stat();
                    const readSize = Math.min(size, 25 * 1024 * 1024);
                    const buffer = Buffer.alloc(readSize);
                    await handle.read(buffer, 0, readSize, 0);
                    await handle.close();

                    this.scanBinaryForStrings(buffer, strings);
                } catch (e: any) {
                    console.warn(`[UNITY-EXTRACTOR] Failed to scan asset ${file}:`, e.message);
                }
            }

        } catch (err: any) {
            console.error('[UNITY-EXTRACTOR] Extraction failed:', err.message);
        }

        return Array.from(strings);
    }

    private scanBinaryForStrings(buffer: Buffer, strings: Set<string>) {
        // Look for printable ASCII/UTF-16LE characters separated by null bytes
        // Pattern: [A-Za-z0-9][\x00][A-Za-z0-9...][\x00]
        const content = buffer.toString('binary');
        
        // Scan for UTF-16LE string literals (printable Japanese/English sequences)
        // Match printable English UTF-16LE strings (3+ characters)
        const englishMatches = content.match(/[A-Z\x00a-z\x000-9\x00\s\x00!,?.:;'"-]{6,100}/g) || [];
        for (const match of englishMatches) {
            const clean = match.replace(/\x00/g, '').trim();
            if (this.isValidString(clean)) {
                const escaped = clean.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
                strings.add(escaped);
            }
        }

        // Match printable Japanese/Chinese/Korean UTF-16LE strings (contains CJK blocks)
        // Range: CJK Unified Ideographs [\u4e00-\u9faf] + Hiragana/Katakana [\u3040-\u30ff]
        const cjkRegex = /[\u3040-\u30ff\u4e00-\u9faf\u3000-\u303f\uff00-\uffef\x00]{6,120}/g;
        const cjkMatches = content.match(cjkRegex) || [];
        for (const match of cjkMatches) {
            const clean = match.replace(/\x00/g, '').trim();
            if (this.isValidString(clean)) {
                const escaped = clean.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
                strings.add(escaped);
            }
        }
    }

    private isValidString(str: string): boolean {
        if (!str || str.length < 3) return false;
        // Ignore structural paths, assembly namespaces, purely numeric codes, or system variables
        if (str.includes('/') || str.includes('\\') || str.includes('__') || /^\d+$/.test(str)) return false;
        if (str.startsWith('UnityEngine') || str.startsWith('System.') || str.startsWith('Assembly-')) return false;
        
        // Reject strings that are only symbols or punctuation
        if (/^[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/-]+$/.test(str)) return false;
        
        return true;
    }
}
