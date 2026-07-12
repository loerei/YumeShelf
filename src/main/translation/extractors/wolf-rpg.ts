import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { exec } from 'node:child_process';
const lz4 = require('lz4');
import { TranslationExtractor } from './base';
import { downloadFile, ensureDir } from '../../core/shared-io';

export class WolfRpgExtractor implements TranslationExtractor {
    private readonly translatorsDir: string;
    private readonly gameKey: string;
    private isV3Game: boolean = false;

    constructor(translatorsDir: string = '', gameKey: string = '') {
        this.translatorsDir = translatorsDir;
        this.gameKey = gameKey;
    }

    private getPatchDir(): string {
        const sanitizedKey = (this.gameKey || 'wolf-temp').replaceAll(':', '_');
        return path.join(this.translatorsDir, 'patches', sanitizedKey);
    }

    async extract(gameDir: string): Promise<string[]> {
        await this.patchRewolfTrans();
        const patchDir = this.getPatchDir();
        console.log(`[WOLF-EXTRACTOR] Starting extraction for gameDir: "${gameDir}". Temporary patch dir: "${patchDir}"`);
        
        // Ensure loose folders exist. If not, try to automatically extract .wolf archives.
        const dataDir = path.join(gameDir, 'Data');
        let hasLoose = fsSync.existsSync(path.join(dataDir, 'BasicData')) || fsSync.existsSync(path.join(dataDir, 'MapData'));
        
        if (!hasLoose && fsSync.existsSync(dataDir)) {
            console.log('[WOLF-EXTRACTOR] Loose Data folders not found. Searching for .wolf archives to automatically extract...');
            const files = await fs.readdir(dataDir).catch(() => []);
            const wolfFiles = files.filter(f => f.toLowerCase().endsWith('.wolf'));
            
            if (wolfFiles.length > 0) {
                console.log(`[WOLF-EXTRACTOR] Found ${wolfFiles.length} .wolf archives. Preparing UberWolf extractor...`);
                const uberWolfPath = path.join(this.translatorsDir, 'UberWolfCli.exe');
                if (!fsSync.existsSync(uberWolfPath)) {
                    console.log('[WOLF-EXTRACTOR] UberWolfCli.exe not found. Downloading from GitHub...');
                    await ensureDir(this.translatorsDir);
                    const downloadUrl = 'https://github.com/Sinflower/UberWolf/releases/download/v0.6.3/UberWolfCli.exe';
                    await downloadFile(downloadUrl, uberWolfPath, 0, 30000, () => {}, '1.5.10');
                    console.log('[WOLF-EXTRACTOR] UberWolfCli.exe downloaded successfully.');
                }
                
                // Find game executable to decrypt key
                const entries = await fs.readdir(gameDir).catch(() => []);
                const exeFile = entries.find(f => f.toLowerCase().endsWith('.exe') && f.toLowerCase() !== 'config.exe') || 'Game.exe';
                const exePath = path.join(gameDir, exeFile);

                console.log(`[WOLF-EXTRACTOR] Executing UberWolfCli on game executable: "${exeFile}"...`);
                try {
                    await new Promise<void>((resolve, reject) => {
                        const cmd = `"${uberWolfPath}" "${exePath}"`;
                        exec(cmd, (err, stdout) => {
                            console.log('[WOLF-EXTRACTOR] UberWolfCli output:', stdout);
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                    console.log('[WOLF-EXTRACTOR] UberWolfCli execution completed successfully.');
                    
                    // Rename the extracted .wolf files in Data/ to .wolf.bak so the game loads the loose folders
                    console.log('[WOLF-EXTRACTOR] Renaming extracted .wolf archives to .wolf.bak...');
                    const currentFiles = await fs.readdir(dataDir).catch(() => []);
                    let renameCount = 0;
                    for (const file of currentFiles) {
                        if (file.toLowerCase().endsWith('.wolf')) {
                            const oldPath = path.join(dataDir, file);
                            await fs.rename(oldPath, oldPath + '.bak').catch(() => {});
                            renameCount++;
                        }
                    }
                    console.log(`[WOLF-EXTRACTOR] Renamed ${renameCount} .wolf archives.`);
                } catch (err: any) {
                    console.error('[WOLF-EXTRACTOR] Failed to execute UberWolfCli:', err.message);
                }
                
                // Re-verify loose folders
                hasLoose = fsSync.existsSync(path.join(dataDir, 'BasicData')) || fsSync.existsSync(path.join(dataDir, 'MapData'));
            }
        }

        if (!hasLoose) {
            console.error(`[WOLF-EXTRACTOR] Extraction failed: Data/BasicData or Data/MapData directories not found in "${dataDir}".`);
            throw new Error('Data/BasicData directory not found. Please extract .wolf files in Data/ using UberWolf or WolfDec first.');
        }

        console.log('[WOLF-EXTRACTOR] Loose Data folders detected. Cleaning up patch directory...');
        // Clean patchDir
        await fs.rm(patchDir, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(patchDir, { recursive: true });

        // On Windows, rewolf-trans requires a Game.exe to be present.
        // If the game has a custom executable name, we create a temporary Game.exe symbolic link or copy.
        const entries = await fs.readdir(gameDir).catch(() => []);
        const exeFile = entries.find(f => f.toLowerCase().endsWith('.exe') && f.toLowerCase() !== 'config.exe' && f.toLowerCase() !== 'game.exe');
        let tempGameExeCreated = false;
        if (exeFile && !fsSync.existsSync(path.join(gameDir, 'Game.exe'))) {
            try {
                console.log(`[WOLF-EXTRACTOR] Custom exe "${exeFile}" found. Copying to "Game.exe" to satisfy rewolf-trans...`);
                await fs.copyFile(path.join(gameDir, exeFile), path.join(gameDir, 'Game.exe'));
                tempGameExeCreated = true;
            } catch (e) {
                console.warn('[WOLF-EXTRACTOR] Failed to copy custom exe to Game.exe:', e);
            }
        }

        let decompressedFiles: string[] = [];
        try {
            this.isV3Game = false;
            decompressedFiles = await this.decompressDatFiles(gameDir);
            // Run rewolf-trans generate command
            console.log('[WOLF-EXTRACTOR] Spawning rewolf-trans generate command...');
            await new Promise<void>((resolve, reject) => {
                const encOptions = this.isV3Game ? ' --renc utf-8 --wenc utf-8' : '';
                const escGameDir = gameDir.replaceAll('"', String.raw`\\\"`);
                const escPatchDir = patchDir.replaceAll('"', String.raw`\\\"`);
                const cmd = `npx rewolf-trans -r "${escGameDir}" -p "${escPatchDir}"${encOptions} generate`;
                exec(cmd, (err) => {
                    if (err) {
                        console.error('[WOLF-EXTRACTOR] rewolf-trans generate failed:', err.message);
                        reject(new Error(`Failed to generate patches: ${err.message}`));
                    } else {
                        console.log('[WOLF-EXTRACTOR] rewolf-trans generate completed successfully.');
                        resolve();
                    }
                });
            });
        } finally {
            // Restore compressed files right away so the game directory remains intact!
            await this.compressDatFiles(gameDir, decompressedFiles);
            // Clean up temporary Game.exe if created
            if (tempGameExeCreated) {
                console.log('[WOLF-EXTRACTOR] Cleaning up temporary "Game.exe"...');
                await fs.unlink(path.join(gameDir, 'Game.exe')).catch(() => {});
            }
        }

        // Parse generated patches
        const strings = new Set<string>();
        const actualPatchDir = path.join(patchDir, 'rewt-patch');
        console.log(`[WOLF-EXTRACTOR] Parsing patch files in "${actualPatchDir}"...`);
        if (fsSync.existsSync(actualPatchDir)) {
            const files = await this.getFilesRecursive(actualPatchDir);
            for (const file of files) {
                if (file.endsWith('.txt')) {
                    const content = await fs.readFile(file, 'utf8');
                    this.parsePatchBlocks(content, strings);
                }
            }
        }

        console.log(`[WOLF-EXTRACTOR] Successfully extracted ${strings.size} translatable Japanese strings.`);
        return Array.from(strings);
    }

    async applyTranslations(gameDir: string, translations: Map<string, string>): Promise<void> {
        await this.patchRewolfTrans();
        const patchDir = this.getPatchDir();
        const actualPatchDir = path.join(patchDir, 'rewt-patch');
        console.log(`[WOLF-EXTRACTOR] Starting applyTranslations for gameDir: "${gameDir}". Translations map size: ${translations.size}`);
        if (!fsSync.existsSync(actualPatchDir)) {
            console.error(`[WOLF-EXTRACTOR] Apply failed: patch directory "${actualPatchDir}" does not exist.`);
            throw new Error('Patch directory not found. Did you run extract first?');
        }

        // Update patch files with translations
        console.log('[WOLF-EXTRACTOR] Writing translations back into block-based patch files...');
        const files = await this.getFilesRecursive(actualPatchDir);
        let updatedCount = 0;
        for (const file of files) {
            if (file.endsWith('.txt')) {
                const content = await fs.readFile(file, 'utf8');
                const updatedContent = this.updatePatchBlocks(content, translations);
                await fs.writeFile(file, updatedContent, 'utf8');
                updatedCount++;
            }
        }
        console.log(`[WOLF-EXTRACTOR] Updated ${updatedCount} patch files with translations.`);

        // On Windows, rewolf-trans requires a Game.exe to be present.
        const entries = await fs.readdir(gameDir).catch(() => []);
        const exeFile = entries.find(f => f.toLowerCase().endsWith('.exe') && f.toLowerCase() !== 'config.exe' && f.toLowerCase() !== 'game.exe');
        let tempGameExeCreated = false;
        if (exeFile && !fsSync.existsSync(path.join(gameDir, 'Game.exe'))) {
            try {
                console.log(`[WOLF-EXTRACTOR] Custom exe "${exeFile}" found. Copying to "Game.exe" to satisfy rewolf-trans...`);
                await fs.copyFile(path.join(gameDir, exeFile), path.join(gameDir, 'Game.exe'));
                tempGameExeCreated = true;
            } catch (e) {
                console.warn('[WOLF-EXTRACTOR] Failed to copy custom exe to Game.exe:', e);
            }
        }

        let decompressedFiles: string[] = [];
        try {
            this.isV3Game = false;
            decompressedFiles = await this.decompressDatFiles(gameDir);
            // Run rewolf-trans apply command
            console.log('[WOLF-EXTRACTOR] Spawning rewolf-trans apply command...');
            await new Promise<void>((resolve, reject) => {
                const encOptions = this.isV3Game ? ' --renc utf-8 --wenc utf-8' : '';
                const escGameDir = gameDir.replaceAll('"', String.raw`\\\"`);
                const escPatchDir = patchDir.replaceAll('"', String.raw`\\\"`);
                const cmd = `npx rewolf-trans -r "${escGameDir}" -p "${escPatchDir}"${encOptions} apply`;
                exec(cmd, (err) => {
                    if (err) {
                        console.error('[WOLF-EXTRACTOR] rewolf-trans apply failed:', err.message);
                        reject(new Error(`Failed to apply patches: ${err.message}`));
                    } else {
                        console.log('[WOLF-EXTRACTOR] rewolf-trans apply completed successfully. Game patched!');
                        resolve();
                    }
                });
            });
        } finally {
            // Re-compress the patched uncompressed files!
            await this.compressDatFiles(gameDir, decompressedFiles);
            if (tempGameExeCreated) {
                console.log('[WOLF-EXTRACTOR] Cleaning up temporary "Game.exe"...');
                await fs.unlink(path.join(gameDir, 'Game.exe')).catch(() => {});
            }
        }
    }

    private processPatchLine(line: string, state: { inBlock: boolean; originalText: string; step: number }, strings: Set<string>): boolean {
        if (line.startsWith('> BEGIN STRING')) {
            state.inBlock = true;
            state.originalText = '';
            state.step = 0;
            return true;
        }
        if (line.startsWith('> END STRING')) {
            state.inBlock = false;
            if (state.originalText.trim()) {
                strings.add(this.unescapeString(state.originalText.trim()));
            }
            return true;
        }
        if (state.inBlock) {
            if (line.startsWith('> CONTEXT')) {
                state.step = 2;
                return true;
            }
            if (state.step === 0) {
                state.originalText += (state.originalText ? '\n' : '') + line;
            }
        }
        return false;
    }

    private parsePatchBlocks(content: string, strings: Set<string>): void {
        const lines = content.split(/\r?\n/);
        const state = { inBlock: false, originalText: '', step: 0 };
        for (const line of lines) {
            this.processPatchLine(line, state, strings);
        }
    }

    private processUpdatePatchLine(
        line: string,
        state: { inBlock: boolean; originalText: string; contextLines: string[]; translationText: string; step: number },
        translations: Map<string, string>,
        newLines: string[]
    ): void {
        if (line.startsWith('> BEGIN STRING')) {
            state.inBlock = true;
            state.originalText = '';
            state.contextLines = [];
            state.translationText = '';
            state.step = 0;
            newLines.push(line);
            return;
        }
        if (line.startsWith('> END STRING')) {
            state.inBlock = false;
            const unescapedOrig = this.unescapeString(state.originalText.trim());
            const translated = translations.get(unescapedOrig);
            newLines.push(
                state.originalText,
                ...state.contextLines,
                translated ? this.escapeString(translated) : (state.translationText || state.originalText),
                line
            );
            return;
        }

        if (state.inBlock) {
            if (line.startsWith('> CONTEXT')) {
                state.contextLines.push(line);
                state.step = 2;
                return;
            }
            if (state.step === 0) {
                state.originalText += (state.originalText ? '\n' : '') + line;
            } else if (state.step === 2) {
                state.translationText += (state.translationText ? '\n' : '') + line;
            }
        } else {
            newLines.push(line);
        }
    }

    private updatePatchBlocks(content: string, translations: Map<string, string>): string {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];
        const state = { inBlock: false, originalText: '', contextLines: [] as string[], translationText: '', step: 0 };
        for (const line of lines) {
            this.processUpdatePatchLine(line, state, translations, newLines);
        }
        return newLines.join('\n');
    }

    private unescapeString(str: string): string {
        return str.replaceAll(String.raw`\n`, '\n');
    }

    private escapeString(str: string): string {
        return str.replaceAll('\n', String.raw`\n`);
    }

    private async getFilesRecursive(dir: string): Promise<string[]> {
        const subdirs = await fs.readdir(dir);
        const files = await Promise.all(subdirs.map(async (subdir) => {
            const res = path.resolve(dir, subdir);
            return (await fs.stat(res)).isDirectory() ? this.getFilesRecursive(res) : [res];
        }));
        return files.flat();
    }

    private async patchJsFile(filePath: string, includeCheck: string, logMsg: string, patches: { target: string, replacement: string }[]): Promise<void> {
        if (fsSync.existsSync(filePath)) {
            let content = await fs.readFile(filePath, 'utf8');
            content = content.replaceAll('\r\n', '\n');
            if (!content.includes(includeCheck)) {
                console.log(logMsg);
                let isPatched = false;
                for (const p of patches) {
                    if (content.includes(p.target)) {
                        content = content.replace(p.target, p.replacement);
                        isPatched = true;
                    }
                }
                if (isPatched) {
                    await fs.writeFile(filePath, content, 'utf8');
                }
            }
        }
    }

    private async patchFileCoder(nodeModulesDir: string): Promise<void> {
        const fileCoderPath = path.join(nodeModulesDir, 'dist', 'src', 'archive', 'file-coder.js');
        await this.patchJsFile(fileCoderPath, 'toleration for WOLF RPG 3.x empty strings', '[WOLF-EXTRACTOR] Patching file-coder.js expect and readString methods...', [
            {
                target: `    expect(expected) {
        this.assertLength(expected.length);
        for (let i = 0; i < expected.length; i++) {
            this.assert(this.buffer_[this.offset_ + i] === expected[i], \`Expected [\${expected.join(',')}] but got [\${this.buffer_
                .slice(this.offset_, this.offset_ + expected.length)
                .join(',')}]\`);
        }
        this.offset_ += expected.length;
    }`,
                replacement: `    expect(expected) {
        this.assertLength(expected.length);
        let match = true;
        for (let i = 0; i < expected.length; i++) {
            if (this.buffer_[this.offset_ + i] !== expected[i]) {
                match = false;
                break;
            }
        }
        if (!match) {
            // toleration for WOLF RPG 3.x header signatures:
            const actual = this.buffer_.slice(this.offset_, this.offset_ + expected.length);
            if (expected.length === 11 &&
                actual[0] === 0 && actual[1] === 87 && actual[2] === 0 && actual[3] === 0 &&
                actual[4] === 79 && actual[5] === 76 && actual[6] === 85 && actual[7] === 70 &&
                actual[9] === 0) {
                match = true;
            }
        }
        this.assert(match, 'Expected [' + expected.join(',') + '] but got [' + this.buffer_.slice(this.offset_, this.offset_ + expected.length).join(',') + ']');
        this.offset_ += expected.length;
    }`
            },
            {
                target: `    readString(readLenFn = DefaultReadValueFn, encoding = options_1.GlobalOptions.readEncoding) {
        const len = readLenFn(this);
        this.assert(len > 0, \`Unexpected string length \${len}\`);
        const bytes = this.readBytes(len - 1);
        this.expectByte(0);
        const str = iconv.decode(bytes, encoding);
        return str;
    }`,
                replacement: `    readString(readLenFn = DefaultReadValueFn, encoding = options_1.GlobalOptions.readEncoding) {
        const len = readLenFn(this);
        if (len === 0) {
            return '';
        }
        this.assert(len > 0, \`Unexpected string length \${len}\`);
        const bytes = this.readBytes(len - 1);
        this.expectByte(0);
        const str = iconv.decode(bytes, encoding);
        return str;
    }`
            }
        ]);
    }

    private async patchUtil(nodeModulesDir: string): Promise<void> {
        const utilPath = path.join(nodeModulesDir, 'dist', 'src', 'util.js');
        await this.patchJsFile(utilPath, 'toleration for WOLF RPG 3.x', '[WOLF-EXTRACTOR] Patching util.js bufferStartsWith method...', [
            {
                target: `function bufferStartsWith(buffer, start) {
    if (buffer.length < start.length) {
        return false;
    }
    for (let i = 0; i < start.length; i++) {
        if (buffer[i] !== start[i]) {
            return false;
        }
    }
    return true;
}`,
                replacement: `function bufferStartsWith(buffer, start) {
    if (buffer.length < start.length) {
        return false;
    }
    let match = true;
    for (let i = 0; i < start.length; i++) {
        if (buffer[i] !== start[i]) {
            match = false;
            break;
        }
    }
    if (!match) {
        // toleration for WOLF RPG 3.x header signatures:
        if (start.length === 11 &&
            buffer[0] === 0 && buffer[1] === 87 && buffer[2] === 0 && buffer[3] === 0 &&
            buffer[4] === 79 && buffer[5] === 76 && buffer[6] === 85 && buffer[7] === 70 &&
            buffer[9] === 0) {
            match = true;
        }
    }
    return match;
}`
            }
        ]);
    }

    private async patchWolfDatabase(nodeModulesDir: string): Promise<void> {
        const dbPath = path.join(nodeModulesDir, 'dist', 'src', 'wolf', 'wolf-database.js');
        await this.patchJsFile(dbPath, 'toleration for WOLF RPG 3.x', '[WOLF-EXTRACTOR] Patching wolf-database.js parse and serializeData methods...', [
            {
                target: `    parse() {
        const projTypesCount = this.project_.readUIntLE();
        this.types_ = [];
        for (let i = 0; i < projTypesCount; i++) {
            this.types_.push(new wolf_type_1.WolfType(this.project_));
        }
        if (this.isEncrypted) {
            this.unknownEncrypted1_ = this.file_.readByte();
        }
        else {
            this.file_.expect(constants_1.WOLF_DAT.HEADER);
        }`,
                replacement: `    parse() {
        const projTypesCount = this.project_.readUIntLE();
        this.types_ = [];
        for (let i = 0; i < projTypesCount; i++) {
            this.types_.push(new wolf_type_1.WolfType(this.project_));
        }
        if (this.isEncrypted) {
            this.unknownEncrypted1_ = this.file_.readByte();
        }
        else {
            // toleration for WOLF RPG 3.x header signatures:
            const startOffset = this.file_.offset;
            this.file_.expect(constants_1.WOLF_DAT.HEADER);
            this.header_ = this.file_.buffer.slice(startOffset, this.file_.offset);
        }`
            },
            {
                target: `    serializeData(stream) {
        if (this.isEncrypted) {
            stream.appendByte(this.unknownEncrypted1_);
        }
        else {
            stream.appendBytes(constants_1.WOLF_DAT.HEADER);
        }
        stream.appendCustomArray(this.types_, (s, type) => type.serializeData(s));
        stream.appendByte(constants_1.WOLF_DAT.END);
    }`,
                replacement: `    serializeData(stream) {
        if (this.isEncrypted) {
            stream.appendByte(this.unknownEncrypted1_);
        }
        else {
            // toleration for WOLF RPG 3.x header signatures:
            stream.appendBytes(this.header_ || constants_1.WOLF_DAT.HEADER);
        }
        stream.appendCustomArray(this.types_, (s, type) => type.serializeData(s));
        // toleration for WOLF RPG 3.x header signatures:
        stream.appendByte((this.header_ && this.header_[10]) || constants_1.WOLF_DAT.END);
    }`
            }
        ]);
    }

    private async patchWolfCe(nodeModulesDir: string): Promise<void> {
        const cePath = path.join(nodeModulesDir, 'dist', 'src', 'wolf', 'wolf-ce.js');
        await this.patchJsFile(cePath, 'toleration for WOLF RPG 3.x', '[WOLF-EXTRACTOR] Patching wolf-ce.js parse and serialize methods...', [
            {
                target: `    parse() {
        this.file_.expect(constants_1.WOLF_CE.HEADER);`,
                replacement: `    parse() {
        // toleration for WOLF RPG 3.x header signatures:
        const startOffset = this.file_.offset;
        this.file_.expect(constants_1.WOLF_CE.HEADER);
        this.header_ = this.file_.buffer.slice(startOffset, this.file_.offset);`
            },
            {
                target: `    serialize(stream) {
        stream.appendBytes(constants_1.WOLF_CE.HEADER);`,
                replacement: `    serialize(stream) {
        // toleration for WOLF RPG 3.x header signatures:
        stream.appendBytes(this.header_ || constants_1.WOLF_CE.HEADER);`
            }
        ]);
    }

    private async patchRewtGame(nodeModulesDir: string): Promise<void> {
        const gamePath = path.join(nodeModulesDir, 'dist', 'src', 'archive', 'rewt-game.js');
        await this.patchJsFile(gamePath, 'archive is not parseable', '[WOLF-EXTRACTOR] Patching rewt-game.js parse method...', [
            {
                target: `    parse() {
        for (const archive of this.archives_) {
            archive.parse();
        }
    }`,
                replacement: `    parse() {
        for (const archive of this.archives_) {
            if (typeof archive.parse !== 'function') {
                console.error('[WOLF-DEBUG] archive is not parseable!', archive.filename, archive.constructor ? archive.constructor.name : 'no constructor', Object.keys(archive));
            }
            archive.parse();
        }
    }`
            }
        ]);
    }

    private async patchWolfCommand(nodeModulesDir: string): Promise<void> {
        const cmdPath = path.join(nodeModulesDir, 'dist', 'src', 'wolf', 'wolf-command.js');
        if (fsSync.existsSync(cmdPath)) {
            let content = await fs.readFile(cmdPath, 'utf8');
            content = content.replaceAll('\r\n', '\n');
            
            // Un-patch old createCommand and writeTeminator if present to start from a clean state
            const oldCreate = `// toleration for WOLF RPG 3.x command structures:
    const options_1 = require("../operation/options");
    const isV3 = options_1.GlobalOptions.readEncoding?.toLowerCase() === 'utf-8';
    const terminator = isV3 ? file.readUShortLE() : file.readByte();`;
            if (content.includes(oldCreate)) {
                content = content.replace(oldCreate, 'const terminator = file.readByte();');
            }
            
            const oldWrite = `    writeTeminator(stream) {
        // toleration for WOLF RPG 3.x command structures:
        const options_1 = require("../operation/options");
        const isV3 = options_1.GlobalOptions.readEncoding?.toLowerCase() === 'utf-8';
        if (isV3) {
            stream.appendShortLE(0);
        } else {
            stream.appendByte(0);
        }
    }`;
            if (content.includes(oldWrite)) {
                content = content.replace(oldWrite, `    writeTeminator(stream) {
        stream.appendByte(0);
    }`);
            }

            if (!content.includes('dynamic lookahead command boundary finder')) {
                console.log('[WOLF-EXTRACTOR] Patching wolf-command.js with lookahead command boundary finder...');
                
                const targetCreate = `function createCommand(file) {
    const argCount = file.readByte();
    const cid = file.readUIntLE();
    const args = file.readUIntLEArray(() => argCount - 1);
    const indent = file.readByte();
    const stringArgs = file.readTStringArray((f) => f.readByte());
    const terminator = file.readByte();
    if (terminator === constants_1.WOLF_MAP.MOVE_COMMAND_TERMINATOR) {
        return new MoveCommand(cid, args, stringArgs, indent, file);
    }
    else if (terminator === constants_1.WOLF_MAP.COMMAND_TERMINATOR) {
        let commandClass = exports.CID_TO_CLASS[cid];
        if (!commandClass) {
            file.info(\`Unknown command: \${cid}\`);
            commandClass = WolfCommand;
        }
        return new commandClass(cid, args, stringArgs, indent);
    }
}`;
                
                const replacementCreate = `function createCommand(file) {
    const argCount = file.readByte();
    const cid = file.readUIntLE();
    const args = file.readUIntLEArray(() => argCount - 1);
    const indent = file.readByte();
    const stringArgs = file.readTStringArray((f) => f.readByte());
    
    // toleration for WOLF RPG 3.x command structures (dynamic lookahead command boundary finder):
    const options_1 = require("../operation/options");
    const isV3 = options_1.GlobalOptions.readEncoding?.toLowerCase() === 'utf-8';
    
    let terminator;
    let terminatorBytes;
    if (isV3) {
        const VALID_CIDS = new Set([
            0, 99, 101, 102, 103, 105, 106, 107, 111, 112, 121, 122, 123, 124, 125, 126,
            130, 140, 150, 151, 160, 161, 162, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180,
            201, 202, 210, 211, 212, 213, 220, 221, 222, 230, 231, 240, 241, 242, 250, 251, 270, 280, 281, 290,
            300, 401, 402, 420, 421, 498, 499
        ]);
        const termStart = file.offset;
        let nextCmdOffset = -1;
        
        // Refinement: Limit the search depth or be more strict if we know the current CID context.
        // For block commands like 102, 111, 112: terminator is standard 3 bytes.
        // For CID 201: terminator is standard 1 byte, routes, 1 byte.
        // For standard commands: standard 2 bytes.
        // We only scan ahead up to 12 bytes if we don't have absolute layout indicators.
        const maxScanOffset = Math.min(file.offset + 12, file.buffer.length);
        for (let k = file.offset + 1; k < maxScanOffset; k++) {
            if (k + 5 <= file.buffer.length) {
                const tempCid = file.buffer.readUInt32LE(k + 1);
                if (VALID_CIDS.has(tempCid)) {
                    const tempArgCount = file.buffer[k];
                    if (tempArgCount >= 1 && tempArgCount <= 50) {
                        // Let's verify that the next command's indent is reasonable:
                        // Indent is located after the args (which has length tempArgCount - 1 UInt32s)
                        const indentOffset = k + 5 + (tempArgCount - 1) * 4;
                        if (indentOffset < file.buffer.length) {
                            const tempIndent = file.buffer[indentOffset];
                            if (tempIndent <= indent + 5) { // indent should be close to current indent
                                nextCmdOffset = k;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (nextCmdOffset !== -1) {
            terminatorBytes = file.readBytes(nextCmdOffset - termStart);
        } else {
            if (cid === 201) {
                terminatorBytes = file.readBytes(1);
            } else if (cid === 102 || cid === 111 || cid === 112) {
                terminatorBytes = file.readBytes(3);
            } else {
                terminatorBytes = file.readBytes(2);
            }
        }
        terminator = (terminatorBytes.length === 1 && terminatorBytes[0] === 1) ? 1 : 0;
    } else {
        terminator = file.readByte();
    }
    
    if (terminator === constants_1.WOLF_MAP.MOVE_COMMAND_TERMINATOR) {
        const cmd = new MoveCommand(cid, args, stringArgs, indent, file);
        if (isV3) cmd.terminatorBytes_ = terminatorBytes;
        return cmd;
    }
    else if (terminator === constants_1.WOLF_MAP.COMMAND_TERMINATOR) {
        let commandClass = exports.CID_TO_CLASS[cid];
        if (!commandClass) {
            file.info(\`Unknown command: \${cid}\`);
            commandClass = WolfCommand;
        }
        const cmd = new commandClass(cid, args, stringArgs, indent);
        if (isV3) cmd.terminatorBytes_ = terminatorBytes;
        return cmd;
    }
}`;
                
                const targetWrite = `    writeTeminator(stream) {
        stream.appendByte(0);
    }`;
                
                const replacementWrite = `    writeTeminator(stream) {
        // toleration for WOLF RPG 3.x command structures:
        const options_1 = require("../operation/options");
        const isV3 = options_1.GlobalOptions.readEncoding?.toLowerCase() === 'utf-8';
        if (isV3) {
            stream.appendBytes(this.terminatorBytes_ || Buffer.from([0, 0]));
        } else {
            stream.appendByte(0);
        }
    }`;

                const targetMoveWrite = `class MoveCommand extends WolfCommand {
    constructor(cid, args, stringArgs, indent, file) {
        super(cid, args, stringArgs, indent);
        this.unknown = file.readBytes(5);
        this.flags = file.readByte();
        this.routes = file.readArray((f) => new route_command_1.RouteCommand(f));
    }
    writeTeminator(stream) {
        stream.appendByte(constants_1.WOLF_MAP.MOVE_COMMAND_TERMINATOR);
        stream.appendBytes(this.unknown);
        stream.appendByte(this.flags);
        stream.appendSerializableArray(this.routes);
    }
}`;

                const replacementMoveWrite = `class MoveCommand extends WolfCommand {
    constructor(cid, args, stringArgs, indent, file) {
        super(cid, args, stringArgs, indent);
        this.unknown = file.readBytes(5);
        this.flags = file.readByte();
        this.routes = file.readArray((f) => new route_command_1.RouteCommand(f));
    }
    writeTeminator(stream) {
        stream.appendByte(constants_1.WOLF_MAP.MOVE_COMMAND_TERMINATOR);
        stream.appendBytes(this.unknown);
        stream.appendByte(this.flags);
        stream.appendSerializableArray(this.routes);
        // toleration for WOLF RPG 3.x trailing terminator:
        const options_1 = require("../operation/options");
        const isV3 = options_1.GlobalOptions.readEncoding?.toLowerCase() === 'utf-8';
        if (isV3) {
            stream.appendByte(0);
        }
    }
}`;

                if (content.includes(targetCreate) && content.includes(targetWrite) && content.includes(targetMoveWrite)) {
                    content = content.replace(targetCreate, replacementCreate);
                    content = content.replace(targetWrite, replacementWrite);
                    content = content.replace(targetMoveWrite, replacementMoveWrite);
                    await fs.writeFile(cmdPath, content, 'utf8');
                    console.log('[WOLF-EXTRACTOR] wolf-command.js patched successfully with lookahead parser.');
                } else {
                    console.warn('[WOLF-EXTRACTOR] wolf-command.js targets not found for lookahead patching.');
                }
            }
        }
    }

    private async patchRewolfTrans(): Promise<void> {
        try {
            const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
            const nodeModulesDir = path.join(rootDir, 'node_modules', 'rewolf-trans');
            
            if (!fsSync.existsSync(nodeModulesDir)) {
                console.log(`[WOLF-EXTRACTOR] rewolf-trans node_modules not found at ${nodeModulesDir}. Skipping automatic patch.`);
                return;
            }

            console.log('[WOLF-EXTRACTOR] Checking and patching rewolf-trans for WOLF RPG v3.x signature support...');

            await this.patchFileCoder(nodeModulesDir);
            await this.patchUtil(nodeModulesDir);
            await this.patchWolfDatabase(nodeModulesDir);
            await this.patchWolfCe(nodeModulesDir);
            await this.patchRewtGame(nodeModulesDir);
            await this.patchWolfCommand(nodeModulesDir);

        } catch (e: any) {
            console.error('[WOLF-EXTRACTOR] Error patching rewolf-trans:', e.message);
        }
    }


    private async decompressSingleDatFile(filePath: string, buf: Buffer, decompressedFiles: string[]): Promise<void> {
        const isCompressed = buf.length >= 19 &&
                             buf[0] === 0 && buf[1] === 87 && buf[2] === 0 && buf[3] === 0 &&
                             buf[4] === 79 && buf[5] === 76 && buf[6] === 85; // 'U'
        
        if (!isCompressed) return;

        const fileBasename = path.basename(filePath);
        console.log(`[WOLF-EXTRACTOR] Auto-decompressing Wolf RPG 3.50+ compressed file: "${fileBasename}"...`);
        const uncompressedSize = buf.readUInt32LE(11);
        const compressedData = buf.slice(19);

        try {
            const outputBuf = Buffer.alloc(uncompressedSize);
            lz4.decodeBlock(compressedData, outputBuf);
            
            let header: Buffer;
            if (buf[8] === 67) { // 'C' -> CE
                header = Buffer.from([0x00, 0x57, 0x00, 0x00, 0x4f, 0x4c, 0x00, 0x46, 0x43, 0x00, 0x8f]); // WOLF_CE.HEADER
            } else { // WOLF DAT
                header = Buffer.from([0x00, 0x57, 0x00, 0x00, 0x4f, 0x4c, 0x00, 0x46, 0x4d, 0x00, 0xc1]); // WOLF_DAT.HEADER
            }

            const finalUncompressed = Buffer.concat([header, outputBuf]);
            
            // Backup original compressed file
            const backupPath = filePath + '.compressed.bak';
            await fs.writeFile(backupPath, buf);
            
            // Save decompressed file in-place
            await fs.writeFile(filePath, finalUncompressed);
            console.log(`[WOLF-EXTRACTOR] Successfully decompressed "${fileBasename}" (size: ${buf.length} -> ${finalUncompressed.length} bytes)`);
            decompressedFiles.push(filePath);
            this.isV3Game = true;
        } catch (e: any) {
            console.error(`[WOLF-EXTRACTOR] Failed to decompress compressed file "${fileBasename}":`, e.message);
        }
    }

    private async decompressDatFiles(gameDir: string): Promise<string[]> {
        const dataDir = path.join(gameDir, 'Data');
        const searchDirs = [path.join(dataDir, 'BasicData'), path.join(dataDir, 'MapData')];
        const decompressedFiles: string[] = [];

        for (const dir of searchDirs) {
            if (!fsSync.existsSync(dir)) continue;
            const files = await this.getFilesRecursive(dir);
            for (const filePath of files) {
                if (filePath.toLowerCase().endsWith('.dat')) {
                    const buf = await fs.readFile(filePath);
                    await this.decompressSingleDatFile(filePath, buf, decompressedFiles);
                }
            }
        }
        return decompressedFiles;
    }

    private async compressDatFiles(gameDir: string, decompressedFiles: string[]): Promise<void> {
        if (decompressedFiles.length === 0) return;

        for (const filePath of decompressedFiles) {
            const backupPath = filePath + '.compressed.bak';
            if (!fsSync.existsSync(backupPath)) continue;

            const fileBasename = path.basename(filePath);
            console.log(`[WOLF-EXTRACTOR] Re-compressing translated file to Wolf RPG 3.50+ format: "${fileBasename}"...`);
            try {
                const uncompressedBuf = await fs.readFile(filePath);
                const originalCompressedBuf = await fs.readFile(backupPath);
                
                // Read original v3 header signature to preserve it exactly
                const headerV3 = originalCompressedBuf.slice(0, 11);
                
                // Strip the 11-byte v2 header signature that we prepended during decompression
                const payloadToCompress = uncompressedBuf.slice(11);
                
                // Compress payload using LZ4 raw block compression
                const outputBuf = Buffer.alloc(payloadToCompress.length);
                const compressedLength = lz4.encodeBlock(payloadToCompress, outputBuf);
                const compressedPayload = outputBuf.slice(0, compressedLength);
                
                // Construct v3 compressed file format:
                // Header (11 bytes) + Uncompressed Size (4 bytes) + Compressed Size (4 bytes) + Compressed Payload
                const sizeBuf = Buffer.alloc(8);
                sizeBuf.writeUInt32LE(payloadToCompress.length, 0);
                sizeBuf.writeUInt32LE(compressedLength, 4);
                
                const finalCompressed = Buffer.concat([headerV3, sizeBuf, compressedPayload]);
                
                // Overwrite with the compressed file
                await fs.writeFile(filePath, finalCompressed);
                
                // Clean up backup file
                await fs.unlink(backupPath).catch(() => {});
                console.log(`[WOLF-EXTRACTOR] Successfully re-compressed and saved "${fileBasename}" (size: ${uncompressedBuf.length} -> ${finalCompressed.length} bytes)`);
            } catch (e: any) {
                console.error(`[WOLF-EXTRACTOR] Failed to re-compress file "${fileBasename}":`, e.message);
            }
        }
    }
}
