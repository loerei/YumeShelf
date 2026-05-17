const fs = require('fs/promises');
const path = require('path');

// Registered save file formats
const formats = [
    require('./save-editor/formats/rpg-maker-mz'),
    require('./save-editor/formats/rpg-maker-mv'),
    require('./save-editor/formats/unity-mono-bin')
];

/**
 * Resolves the appropriate save file format strategy by file name
 */
function getFormat(fileName) {
    const matched = formats.find(f => f.match(fileName));
    if (!matched) {
        throw new Error(`Unsupported save file format for file: ${fileName}`);
    }
    return matched;
}

function createSaveEditorService({ libraryState, saveFolderResolver }) {
    
    async function getGamePaths(gameKey) {
        const record = await libraryState.getGameRecord(gameKey);
        if (!record || !record.exePath) return null;
        
        const exeDir = path.dirname(record.exePath);
        const saveInfo = await saveFolderResolver.resolveSaveFolder(record.exePath, record.saveFolderOverride);
        
        if (!saveInfo || !saveInfo.path) return null;
        
        // Find data directory (MV/MZ specific)
        let dataDir = path.join(exeDir, 'www', 'data');
        if (!(await exists(dataDir))) {
            dataDir = path.join(exeDir, 'data');
        }

        // Check for language packs (Specific to certain engines/plugins like in Fallen Priestess)
        let langDataDir = null;
        const langConfigPath = path.join(exeDir, 'www', 'language_config.json');
        if (await exists(langConfigPath)) {
            try {
                const config = JSON.parse(await fs.readFile(langConfigPath, 'utf8'));
                if (config && config.lang) {
                    const potentialPath = path.join(exeDir, 'www', 'lang_packs', config.lang, 'data');
                    if (await exists(potentialPath)) {
                        langDataDir = potentialPath;
                    }
                }
            } catch (e) {
                console.warn('[SAVE-EDITOR] Failed to read language_config.json:', e);
            }
        }
        
        return {
            exeDir,
            saveDir: saveInfo.path,
            dataDir,
            langDataDir,
            engine: saveInfo.engine
        };
    }

    async function exists(p) {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }

    async function listSaveFiles(gameKey) {
        try {
            const paths = await getGamePaths(gameKey);
            if (!paths) return [];
            
            if (!(await exists(paths.saveDir))) return [];

            const files = await fs.readdir(paths.saveDir);
            const saveFiles = files
                .filter(f => formats.some(fmt => fmt.match(f)))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            
            return saveFiles;
        } catch (err) {
            console.error(`[SAVE-EDITOR] Error listing save files:`, err);
            throw err;
        }
    }

    async function loadSaveData(gameKey, fileName) {
        try {
            const paths = await getGamePaths(gameKey);
            if (!paths) throw new Error('Could not resolve game paths');
            
            const savePath = path.join(paths.saveDir, fileName);
            const rawData = await fs.readFile(savePath);
            
            const format = getFormat(fileName);
            const jsonData = await format.decode(rawData, paths, fileName);
            
            const metadata = await loadMetadata(paths.dataDir, paths.langDataDir);
            
            return {
                data: jsonData,
                metadata
            };
        } catch (err) {
            console.error(`[SAVE-EDITOR] Error loading save data:`, err);
            throw err;
        }
    }

    async function loadMetadata(dataDir, langDataDir) {
        const metadata = {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: ''
        };
        
        try {
            // Helper to get prioritized file path
            async function getFilePath(fileName) {
                if (langDataDir) {
                    const lp = path.join(langDataDir, fileName);
                    if (await exists(lp)) return lp;
                }
                return path.join(dataDir, fileName);
            }

            // Load System.json for variables and switches
            const systemPath = await getFilePath('System.json');
            if (await exists(systemPath)) {
                const system = JSON.parse(await fs.readFile(systemPath, 'utf8'));
                metadata.variables = system.variables || [];
                metadata.switches = system.switches || [];
                metadata.gameTitle = system.gameTitle || '';
            }
            
            // Helper to load item-like files
            async function loadItemType(fileName, target) {
                const p = await getFilePath(fileName);
                if (await exists(p)) {
                    const list = JSON.parse(await fs.readFile(p, 'utf8'));
                    list.forEach(item => {
                        if (item && item.id) {
                            target[item.id] = {
                                name: item.name,
                                description: item.description,
                                iconIndex: item.iconIndex
                            };
                        }
                    });
                }
            }

            await loadItemType('Items.json', metadata.items);
            await loadItemType('Weapons.json', metadata.weapons);
            await loadItemType('Armors.json', metadata.armors);

        } catch (err) {
            console.warn('[SAVE-EDITOR] Failed to load metadata:', err);
        }
        
        return metadata;
    }

    async function writeSaveData(gameKey, fileName, jsonData) {
        try {
            const paths = await getGamePaths(gameKey);
            if (!paths) throw new Error('Could not resolve game paths');
            
            const savePath = path.join(paths.saveDir, fileName);
            
            const format = getFormat(fileName);
            const outputData = await format.encode(jsonData, paths, fileName);
            
            try {
                await fs.copyFile(savePath, savePath + '.bak');
            } catch {}
            
            await fs.writeFile(savePath, outputData);
            return { ok: true };
        } catch (err) {
            console.error(`[SAVE-EDITOR] Error writing save data:`, err);
            throw err;
        }
    }

    return {
        listSaveFiles,
        loadSaveData,
        writeSaveData
    };
}

module.exports = {
    createSaveEditorService
};
