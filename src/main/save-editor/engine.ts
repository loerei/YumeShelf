import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import SaveMappingManager from './mapping-manager';

// Import all format strategies
import rpgMakerMz from './formats/rpg-maker-mz';
import rpgMakerMv from './formats/rpg-maker-mv';
import rpgWolfSav from './formats/rpg-wolf-sav';
import unityMonoBin from './formats/unity-mono-bin';
import renpy from './formats/renpy';
import simpleKeyedJson from './formats/simple-keyed-json';
import pureJson from './formats/pure-json';
import bakinSgs from './formats/bakin-sgs';

export interface SaveFormatStrategy {
    match(fileName: string): boolean;
    decode(rawData: Buffer, paths?: any, fileName?: string): Promise<any>;
    encode(jsonData: any, paths?: any, fileName?: string): Promise<Buffer>;
    metadata?(jsonData: any, paths?: any, fileName?: string): Promise<any>;
}

export interface GamePaths {
    exeDir: string;
    saveDir: string;
    dataDir: string;
    langDataDir: string | null;
    engine?: string;
}

export interface SaveDataEngineConfig {
    getGamePaths(gameKey: string): Promise<GamePaths | null>;
    loadMetadata(dataDir: string, langDataDir: string | null): Promise<any>;
}

export class SaveDataEngine {
    private formats: SaveFormatStrategy[];
    private config: SaveDataEngineConfig;

    constructor(config: SaveDataEngineConfig, customFormats?: SaveFormatStrategy[]) {
        this.config = config;
        this.formats = customFormats || [
            rpgMakerMz,
            rpgMakerMv,
            rpgWolfSav,
            unityMonoBin,
            renpy,
            simpleKeyedJson,
            pureJson,
            bakinSgs
        ];
    }

    findFormat(fileName: string): SaveFormatStrategy {
        const matched = this.formats.find(f => f.match(fileName));
        if (!matched) {
            throw new Error(`Unsupported save file format for file: ${fileName}`);
        }
        return matched;
    }

    async listSaveFiles(gameKey: string): Promise<string[]> {
        const paths = await this.config.getGamePaths(gameKey);
        if (!paths || !(await this.exists(paths.saveDir))) return [];

        const files = await fs.readdir(paths.saveDir);
        return files
            .filter(f => this.formats.some(fmt => fmt.match(f)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }

    async loadSave(gameKey: string, fileName: string) {
        const paths = await this.config.getGamePaths(gameKey);
        if (!paths) throw new Error('Could not resolve game paths');

        const savePath = this.resolveSafePath(paths.saveDir, fileName);
        const rawData = await fs.readFile(savePath);

        const format = this.findFormat(fileName);
        const jsonData = await format.decode(rawData, paths, fileName);

        // Inject user variable mappings
        const mappingMgr = new SaveMappingManager(gameKey);
        jsonData._userMappings = mappingMgr.mappings.variables;

        // Assembly metadata
        const metadata = typeof format.metadata === 'function'
            ? await format.metadata(jsonData, paths, fileName)
            : await this.config.loadMetadata(paths.dataDir, paths.langDataDir);

        return { data: jsonData, metadata };
    }

    async writeSave(gameKey: string, fileName: string, jsonData: any) {
        const paths = await this.config.getGamePaths(gameKey);
        if (!paths) throw new Error('Could not resolve game paths');

        const savePath = this.resolveSafePath(paths.saveDir, fileName);
        const format = this.findFormat(fileName);

        // Sanitize internal YumeShelf UI metadata
        const cleanData = this.sanitizeSaveData(jsonData);

        const outputBuffer = await format.encode(cleanData, paths, fileName);

        // Atomic backup creation
        try {
            await fs.copyFile(savePath, savePath + '.bak');
        } catch {}

        await fs.writeFile(savePath, outputBuffer);
        return { ok: true };
    }

    sanitizeSaveData(data: any): any {
        if (!data || typeof data !== 'object') return data;
        const clean = { ...data };
        delete clean._userMappings;
        delete clean.$type;
        return clean;
    }

    private resolveSafePath(baseDir: string, fileName: string): string {
        const safeName = path.basename(fileName);
        const targetPath = path.join(baseDir, safeName);
        const resolvedPath = path.resolve(targetPath);
        const resolvedBase = path.resolve(baseDir);

        if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
            throw new Error('Invalid save file path: Path traversal detected');
        }
        return targetPath;
    }

    private async exists(p: string): Promise<boolean> {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }
}
