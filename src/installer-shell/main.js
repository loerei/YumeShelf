const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { readInstallerContract, writeInstallerContract } = require('../shared/installer-contract');

const HANDSHAKE_FLAG = '--installer-handshake';

function getArgValue(flagName) {
    const argv = process.argv.slice(1);
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === flagName) {
            return argv[index + 1] || '';
        }
        if (token.startsWith(`${flagName}=`)) {
            return token.slice(flagName.length + 1);
        }
    }
    return '';
}

function normalizeLocaleCode(value) {
    return String(value || '')
        .trim()
        .replace(/_/g, '-')
        .toLowerCase();
}

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}

function matchLocale(locales, requestedCode) {
    const normalizedRequestedCode = normalizeLocaleCode(requestedCode);
    const normalizedBaseCode = normalizedRequestedCode.split('-')[0];
    return locales.find((locale) => {
        const candidates = [
            locale.code,
            ...(Array.isArray(locale.aliases) ? locale.aliases : [])
        ]
            .map(normalizeLocaleCode)
            .filter(Boolean);
        return candidates.includes(normalizedRequestedCode) || candidates.includes(normalizedBaseCode);
    }) || null;
}

async function readLocaleFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
        aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
        code: String(parsed.code || '').trim(),
        englishName: String(parsed.englishName || parsed.code || '').trim(),
        nativeName: String(parsed.nativeName || parsed.englishName || parsed.code || '').trim(),
        strings: parsed.strings && typeof parsed.strings === 'object' ? parsed.strings : {}
    };
}

async function loadLocales() {
    const localeDirs = [
        path.join(__dirname, '..', 'locales', 'builtins'),
        path.join(__dirname, '..', '..', 'language-packs', 'packs')
    ];
    const localeMap = new Map();

    for (const dirPath of localeDirs) {
        let entries = [];
        try {
            entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
            entries = [];
        }

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
                continue;
            }
            try {
                const locale = await readLocaleFile(path.join(dirPath, entry.name));
                if (locale.code && !localeMap.has(locale.code)) {
                    localeMap.set(locale.code, locale);
                }
            } catch (error) {
                console.warn(`[INSTALLER-SHELL] failed to load locale ${entry.name}: ${String((error && error.message) || error || '')}`);
            }
        }
    }

    return Array.from(localeMap.values()).sort((left, right) => left.nativeName.localeCompare(right.nativeName));
}

function buildLocaleStrings(locales, localeCode) {
    const englishLocale = matchLocale(locales, 'en') || locales[0] || { strings: {} };
    const selectedLocale = matchLocale(locales, localeCode) || englishLocale;
    return {
        localeCode: selectedLocale.code,
        strings: {
            ...englishLocale.strings,
            ...selectedLocale.strings
        }
    };
}

async function createInstallerShellRuntime() {
    const handshakePath = path.resolve(getArgValue(HANDSHAKE_FLAG));
    if (!handshakePath) {
        throw new Error('Missing installer handshake file path.');
    }

    const handshakeData = await readInstallerContract(handshakePath);
    const input = handshakeData.input || {};
    const locales = await loadLocales();
    const systemLocale = app.getLocale();
    const preferredLocale = input.locale || input.systemLocale || systemLocale || 'en';
    const { localeCode, strings } = buildLocaleStrings(locales, preferredLocale);
    const localeMaps = Object.fromEntries(locales.map((locale) => [locale.code, locale.strings]));

    let settled = false;
    let mainWindow = null;

    async function settle(result) {
        if (settled) return;
        settled = true;
        await writeInstallerContract(handshakePath, {
            input,
            result: {
                action: String(result.action || 'cancel'),
                deleteSetupFile: result.deleteSetupFile ? 'true' : 'false',
                installDir: String(result.installDir || ''),
                locale: String(result.locale || localeCode || 'en')
            }
        });
    }

    ipcMain.handle('installer-shell:get-bootstrap', async () => ({
        defaultInstallDir: String(input.defaultInstallDir || '').trim(),
        installerPath: String(input.installerPath || '').trim(),
        localeCode,
        localeMaps,
        localeOptions: locales.map((locale) => ({
            code: locale.code,
            englishName: locale.englishName,
            nativeName: locale.nativeName
        })),
        strings,
        systemLocale
    }));

    ipcMain.handle('installer-shell:pick-install-dir', async (_event, currentPath) => {
        const result = await dialog.showOpenDialog({
            defaultPath: String(currentPath || input.defaultInstallDir || '').trim() || undefined,
            properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
            return { canceled: true, path: String(currentPath || '').trim() };
        }
        return {
            canceled: false,
            path: String(result.filePaths[0] || '').trim()
        };
    });

    ipcMain.handle('installer-shell:submit', async (_event, payload = {}) => {
        await settle({
            action: 'continue',
            deleteSetupFile: toBoolean(payload.deleteSetupFile, true),
            installDir: payload.installDir,
            locale: payload.locale || localeCode
        });
        app.quit();
        return { ok: true };
    });

    ipcMain.handle('installer-shell:cancel', async () => {
        await settle({
            action: 'cancel',
            deleteSetupFile: false,
            installDir: '',
            locale: localeCode
        });
        app.quit();
        return { ok: true };
    });

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 980,
            height: 720,
            minWidth: 900,
            minHeight: 680,
            backgroundColor: '#121212',
            autoHideMenuBar: true,
            icon: path.join(__dirname, '..', '..', 'assets', 'yumeshelf_icon_highres_4096.png'),
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        mainWindow.removeMenu();
        mainWindow.setMenuBarVisibility(false);
        mainWindow.loadFile(path.join(__dirname, 'index.html'));
        mainWindow.on('close', (event) => {
            if (settled) return;
            event.preventDefault();
            void settle({
                action: 'cancel',
                deleteSetupFile: false,
                installDir: '',
                locale: localeCode
            }).finally(() => app.quit());
        });
    }

    app.whenReady().then(createWindow);
}

void createInstallerShellRuntime().catch((error) => {
    console.error(`[INSTALLER-SHELL] fatal ${String((error && error.stack) || error || '')}`);
    app.exit(1);
});
