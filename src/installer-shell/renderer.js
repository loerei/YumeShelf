const state = {
    bootstrap: null,
    currentLocale: 'en',
    currentPath: '',
    submitting: false
};

function getStrings() {
    return state.bootstrap?.strings || {};
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function updateLanguageStrip() {
    const strip = document.getElementById('language-strip');
    strip.innerHTML = '';
    for (const locale of state.bootstrap.localeOptions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `language-link${locale.code === state.currentLocale ? ' active' : ''}`;
        button.textContent = locale.nativeName;
        button.onclick = () => {
            state.currentLocale = locale.code;
            render();
        };
        strip.appendChild(button);
    }
}

function render() {
    const englishStrings = state.bootstrap.englishStrings || {};
    const localizedStrings = state.bootstrap.localizedStrings?.[state.currentLocale] || {};
    state.bootstrap.strings = {
        ...englishStrings,
        ...localizedStrings
    };
    const strings = getStrings();
    document.title = `${strings.title || 'YumeShelf'} ${strings.installer_shell_brand || 'Installer'}`;

    setText('path-title', strings.installer_shell_path_title || 'Choose where YumeShelf lives');
    setText('path-note', strings.installer_shell_path_notice || 'Will not affect your game folder path.');
    setText('delete-setup-label', strings.installer_shell_delete_setup || 'Remove this setup file after YumeShelf launches');
    setText('path-cancel', strings.installer_shell_cancel || 'Cancel');
    setText('path-install', strings.installer_shell_install || 'Install');

    document.getElementById('path-display').textContent = state.currentPath || (strings.installer_shell_path_missing || 'Choose a folder to continue.');

    updateLanguageStrip();
}

async function changePath() {
    const result = await window.installerShellAPI.pickInstallDir(state.currentPath || state.bootstrap.defaultInstallDir);
    if (!result?.canceled && result?.path) {
        state.currentPath = result.path;
        render();
    }
}

async function cancelInstall() {
    if (state.submitting) return;
    state.submitting = true;
    await window.installerShellAPI.cancel();
}

async function submitInstall() {
    if (state.submitting) return;
    if (!state.currentPath) {
        await changePath();
        if (!state.currentPath) return;
    }
    state.submitting = true;
    await window.installerShellAPI.submit({
        deleteSetupFile: document.getElementById('delete-setup-checkbox').checked,
        installDir: state.currentPath,
        locale: state.currentLocale
    });
}

async function bootstrap() {
    const bootstrapData = await window.installerShellAPI.getBootstrap();
    const localizedStrings = {};
    for (const locale of bootstrapData.localeOptions) {
        localizedStrings[locale.code] = bootstrapData.localeMaps[locale.code] || {};
    }
    state.bootstrap = {
        ...bootstrapData,
        englishStrings: bootstrapData.localeMaps.en || bootstrapData.strings || {},
        localizedStrings
    };
    state.currentLocale = bootstrapData.localeCode || 'en';
    state.currentPath = bootstrapData.defaultInstallDir || '';

    document.getElementById('path-display').onclick = changePath;
    document.getElementById('path-cancel').onclick = cancelInstall;
    document.getElementById('path-install').onclick = submitInstall;

    render();
}

void bootstrap();
