const fs = require('fs/promises');
const path = require('path');
const SaveMappingManager = require('./mapping-manager');

// Registered save file formats
const formats = [
    require('./formats/rpg-maker-mz'),
    require('./formats/rpg-maker-mv'),
    require('./formats/rpg-wolf-sav'),
    require('./formats/unity-mono-bin'),
    require('./formats/renpy')
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
            
            // Inject user mappings
            const mappingMgr = new SaveMappingManager(gameKey);
            jsonData._userMappings = mappingMgr.mappings.variables;
            
            const metadata = typeof format.metadata === 'function'
                ? await format.metadata(jsonData, paths, fileName)
                : await loadMetadata(paths.dataDir, paths.langDataDir);
            
            return {
                data: jsonData,
                metadata
            };
        } catch (err) {
            console.error(`[SAVE-EDITOR] Error loading save data:`, err);
            throw err;
        }
    }

    async function updateMapping(gameKey, name, offset, dataType) {
        const mappingMgr = new SaveMappingManager(gameKey);
        mappingMgr.addMapping(name, offset, dataType);
        return { ok: true };
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

    const { app } = require('electron');

    function getTranslationFilePath(lang = 'en') {
        const cleanLang = (lang || 'en').replace(/[^a-zA-Z0-9_\-]/g, '');
        return path.join(app.getPath('userData'), `save_editor_translations_${cleanLang}.json`);
    }

    async function loadTranslations(lang = 'en') {
        const filePath = getTranslationFilePath(lang);
        const legacyPath = path.join(app.getPath('userData'), 'save_editor_translations.json');
        try {
            // Backward compatibility fallback for English users
            if (lang === 'en' && !(await exists(filePath)) && (await exists(legacyPath))) {
                try {
                    await fs.rename(legacyPath, filePath);
                    console.log(`[SAVE-EDITOR] Migrated legacy translations file to: ${filePath}`);
                } catch (e) {
                    console.warn(`[SAVE-EDITOR] Failed to migrate legacy translations, reading directly:`, e);
                    const raw = await fs.readFile(legacyPath, 'utf8');
                    return JSON.parse(raw) || {};
                }
            }

            if (await exists(filePath)) {
                const raw = await fs.readFile(filePath, 'utf8');
                const cache = JSON.parse(raw) || {};
                console.log(`[SAVE-EDITOR] Loaded translations from AppData: ${filePath} (${Object.keys(cache).length} keys)`);
                return cache;
            }
        } catch (err) {
            console.error('[SAVE-EDITOR] Error loading translations from AppData:', err);
        }
        return {};
    }

    async function saveTranslations(lang = 'en', translations = {}) {
        const filePath = getTranslationFilePath(lang);
        const tempPath = filePath + '.tmp';
        
        // Strip off "Identical":"Identical" results from translations dictionary BEFORE writing to disk
        const strippedTranslations = {};
        for (const [k, v] of Object.entries(translations)) {
            if (k !== v) {
                strippedTranslations[k] = v;
            }
        }

        try {
            await fs.writeFile(tempPath, JSON.stringify(strippedTranslations, null, 2), 'utf8');
            try {
                if (await exists(filePath)) {
                    await fs.unlink(filePath);
                }
            } catch (unlinkErr) {
                console.warn('[SAVE-EDITOR] Could not unlink existing translation file during atomic save:', unlinkErr);
            }
            await fs.rename(tempPath, filePath);
            console.log(`[SAVE-EDITOR] Successfully persisted atomically ${Object.keys(strippedTranslations).length} translations to AppData: ${filePath}`);
            return { ok: true };
        } catch (err) {
            console.error('[SAVE-EDITOR] Error saving translations atomically, falling back to direct write:', err);
            try {
                await fs.writeFile(filePath, JSON.stringify(strippedTranslations, null, 2), 'utf8');
                console.log('[SAVE-EDITOR] Successfully wrote translations directly after atomic failure');
                return { ok: true };
            } catch (directWriteErr) {
                console.error('[SAVE-EDITOR] Fallback direct write failed:', directWriteErr);
                return { ok: false, error: directWriteErr.message };
            } finally {
                try {
                    if (await exists(tempPath)) {
                        await fs.unlink(tempPath);
                    }
                } catch {}
            }
        }
    }

    return {
        listSaveFiles,
        loadSaveData,
        writeSaveData,
        updateMapping,
        loadTranslations,
        saveTranslations
    };
}

module.exports = {
    createSaveEditorService
};
