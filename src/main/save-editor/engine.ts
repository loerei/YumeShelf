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
    private readonly formats: SaveFormatStrategy[];
    private readonly config: SaveDataEngineConfig;

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

    async renameSave(gameKey: string, oldFileName: string, newFileName: string, overwrite = false) {
        if (!newFileName || typeof newFileName !== 'string') {
            throw new Error('New save file name cannot be empty');
        }

        const trimmedNewName = newFileName.trim();
        if (!trimmedNewName) {
            throw new Error('New save file name cannot be empty');
        }

        // Validate format compatibility
        this.findFormat(trimmedNewName);

        const paths = await this.config.getGamePaths(gameKey);
        if (!paths) throw new Error('Could not resolve game paths');

        const oldPath = this.resolveSafePath(paths.saveDir, oldFileName);
        const newPath = this.resolveSafePath(paths.saveDir, trimmedNewName);

        if (oldPath === newPath) {
            return { ok: true, renamed: false, fileName: trimmedNewName };
        }

        if (!(await this.exists(oldPath))) {
            throw new Error(`Original save file does not exist: ${oldFileName}`);
        }

        const targetExists = await this.exists(newPath);
        if (targetExists) {
            if (!overwrite) {
                return { ok: false, error: 'FILE_EXISTS', message: `Target save file already exists: ${trimmedNewName}` };
            }
            await fs.unlink(newPath);
        }

        await fs.rename(oldPath, newPath);

        const oldBakPath = oldPath + '.bak';
        const newBakPath = newPath + '.bak';
        try {
            if (await this.exists(oldBakPath)) {
                if (await this.exists(newBakPath)) {
                    await fs.unlink(newBakPath);
                }
                await fs.rename(oldBakPath, newBakPath);
            }
        } catch {}

        return { ok: true, renamed: true, fileName: trimmedNewName };
    }

    async deleteSave(gameKey: string, fileName: string) {
        const paths = await this.config.getGamePaths(gameKey);
        if (!paths) throw new Error('Could not resolve game paths');

        const savePath = this.resolveSafePath(paths.saveDir, fileName);

        if (await this.exists(savePath)) {
            await fs.unlink(savePath);
        }

        const bakPath = savePath + '.bak';
        try {
            if (await this.exists(bakPath)) {
                await fs.unlink(bakPath);
            }
        } catch {}

        return { ok: true };
    }

    sanitizeSaveData(data: any): any {
        if (!data || typeof data !== 'object') return data;
        const clean = { ...data };
        delete clean._userMappings;
        return clean;
    }

    private resolveSafePath(baseDir: string, fileName: string): string {
        if (!fileName || fileName.includes('/') || fileName.includes('\\') || path.basename(fileName) !== fileName) {
            throw new Error('Invalid save file path: Path traversal detected');
        }
        const targetPath = path.join(baseDir, fileName);
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
