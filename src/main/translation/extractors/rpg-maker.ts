import * as path from 'path';
import * as fs from 'fs/promises';
import { TranslationExtractor } from './base';

export class RpgMakerExtractor implements TranslationExtractor {
    async extract(gameDir: string): Promise<string[]> {
        const strings = new Set<string>();

        // Detect MV (www/data/) or MZ (data/) directory
        let dataDir = path.join(gameDir, 'data');
        try {
            await fs.access(dataDir);
        } catch {
            dataDir = path.join(gameDir, 'www', 'data');
        }

        try {
            const files = await fs.readdir(dataDir);
            const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'));

            for (const file of jsonFiles) {
                const filePath = path.join(dataDir, file);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const json = JSON.parse(content);
                    
                    if (file.toLowerCase().startsWith('map') && !file.toLowerCase().startsWith('master')) {
                        this.extractFromMap(json, strings);
                    } else if (file.toLowerCase() === 'system.json') {
                        this.extractFromSystem(json, strings);
                    } else if (Array.isArray(json)) {
                        this.extractFromDatabase(json, strings);
                    }
                } catch (e: any) {
                    console.warn(`[RPG-EXTRACTOR] Failed to parse ${file}:`, e.message);
                }
            }
        } catch (err: any) {
            console.error('[RPG-EXTRACTOR] Failed to read data directory:', err.message);
        }

        return Array.from(strings);
    }

    private extractFromMap(mapJson: any, strings: Set<string>) {
        if (!mapJson || !Array.isArray(mapJson.events)) return;

        // Extract displayName
        if (mapJson.displayName) {
            this.addCleanString(mapJson.displayName, strings);
        }

        for (const event of mapJson.events) {
            if (!event || !Array.isArray(event.pages)) continue;
            for (const page of event.pages) {
                if (!page || !Array.isArray(page.list)) continue;
                for (const cmd of page.list) {
                    // Code 401 = Show Text dialogue line
                    // Code 402 = Show Choices selection option
                    // Code 102 = Choice headers / parameters
                    if (cmd.code === 401 && cmd.parameters && typeof cmd.parameters[0] === 'string') {
                        this.addCleanString(cmd.parameters[0], strings);
                    } else if (cmd.code === 402 && cmd.parameters && typeof cmd.parameters[1] === 'string') {
                        this.addCleanString(cmd.parameters[1], strings);
                    } else if (cmd.code === 102 && cmd.parameters && Array.isArray(cmd.parameters[0])) {
                        for (const choice of cmd.parameters[0]) {
                            if (typeof choice === 'string') this.addCleanString(choice, strings);
                        }
                    }
                }
            }
        }
    }

    private extractFromDatabase(dbJson: any[], strings: Set<string>) {
        const textKeys = ['name', 'description', 'message1', 'message2', 'message3', 'message4', 'profile', 'nickname'];
        for (const item of dbJson) {
            if (!item) continue;
            for (const key of textKeys) {
                if (typeof item[key] === 'string') {
                    this.addCleanString(item[key], strings);
                }
            }
            // Parse nested common events
            if (Array.isArray(item.list)) {
                for (const cmd of item.list) {
                    if (cmd.code === 401 && cmd.parameters && typeof cmd.parameters[0] === 'string') {
                        this.addCleanString(cmd.parameters[0], strings);
                    } else if (cmd.code === 402 && cmd.parameters && typeof cmd.parameters[1] === 'string') {
                        this.addCleanString(cmd.parameters[1], strings);
                    }
                }
            }
        }
    }

    private extractFromSystem(sysJson: any, strings: Set<string>) {
        if (!sysJson) return;

        if (sysJson.gameTitle) this.addCleanString(sysJson.gameTitle, strings);
        if (sysJson.currencyUnit) this.addCleanString(sysJson.currencyUnit, strings);

        // Extract UI Terms
        const terms = sysJson.terms;
        if (terms) {
            const extractObjectValues = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                for (const k of Object.keys(obj)) {
                    const val = obj[k];
                    if (typeof val === 'string') {
                        this.addCleanString(val, strings);
                    } else if (Array.isArray(val)) {
                        val.forEach(v => typeof v === 'string' && this.addCleanString(v, strings));
                    } else if (typeof val === 'object') {
                        extractObjectValues(val);
                    }
                }
            };
            extractObjectValues(terms);
        }
    }

    private addCleanString(str: string, strings: Set<string>) {
        const trimmed = str.trim();
        // Ignore empty, purely numeric, or control code-only strings (e.g. RPG Maker script control symbols)
        if (!trimmed || /^\d+$/.test(trimmed) || trimmed.startsWith('//') || trimmed.length <= 1) return;
        
        // Escape newlines to match XUnity.AutoTranslator dictionary format (single line per entry)
        const escaped = trimmed.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        strings.add(escaped);
    }
}
