export function createLocaleController({
    applyUIStrings,
    bootController,
    builtInLanguageOrder,
    electronAPI,
    getAllGames,
    langSelect,
    initialLanguage,
    sortGames
}) {
    let currentLang = initialLanguage || 'en';
    let placeholderIndex = 0;
    let localeState = {
        builtIn: [],
        installed: [],
        locales: {},
        repoUrl: 'https://github.com/loerei/YumeShelf/blob/main/TRANSLATION.md',
        manifestUrl: '',
        appVersion: ''
    };

    function getLocaleState() {
        return localeState;
    }

    function setLocaleState(nextState) {
        localeState = nextState;
    }

    function getCurrentLang() {
        return currentLang;
    }

    function getPlaceholderIndex() {
        return placeholderIndex;
    }

    function getEnglishStrings() {
        return localeState.locales.en || {};
    }

    function getLocaleStrings(code = currentLang) {
        const normalizedCode = String(code || '').toLowerCase();
        return {
            ...getEnglishStrings(),
            ...(localeState.locales[normalizedCode] || {})
        };
    }

    function getStrings() {
        return getLocaleStrings(currentLang);
    }

    function getAvailableLanguages() {
        return [...localeState.builtIn, ...localeState.installed];
    }

    function isLanguageAvailable(code) {
        const normalizedCode = String(code || '').toLowerCase();
        return getAvailableLanguages().some(language => language.code === normalizedCode);
    }

    function getLanguageMeta(code) {
        const normalizedCode = String(code || '').toLowerCase();
        return getAvailableLanguages().find(language => language.code === normalizedCode) || null;
    }

    function formatLanguageLabel(meta) {
        if (!meta) return '';
        if (!meta.englishName || meta.englishName === meta.nativeName) return meta.nativeName || meta.code;
        return `${meta.nativeName} (${meta.englishName})`;
    }

    function sortLanguageOptions(languages) {
        return [...languages].sort((left, right) => {
            if (left.source !== right.source) {
                return left.source === 'built-in' ? -1 : 1;
            }
            if (left.source === 'built-in' && right.source === 'built-in') {
                return builtInLanguageOrder.indexOf(left.code) - builtInLanguageOrder.indexOf(right.code);
            }
            return formatLanguageLabel(left).localeCompare(formatLanguageLabel(right));
        });
    }

    function refreshLanguageDropdown() {
        const languages = sortLanguageOptions(getAvailableLanguages());
        langSelect.innerHTML = '';
        languages.forEach((language) => {
            const option = document.createElement('option');
            option.value = language.code;
            option.textContent = formatLanguageLabel(language);
            langSelect.appendChild(option);
        });
        langSelect.value = isLanguageAvailable(currentLang) ? currentLang : 'en';
    }

    async function loadLanguageState(nextState = null) {
        if (!nextState) {
            localeState.appVersion = await electronAPI.getAppVersion();
        }
        const incomingState = nextState || await electronAPI.getLanguageState();
        if (incomingState && incomingState.locales && incomingState.locales.en) {
            localeState = incomingState;
        }
        if (!isLanguageAvailable(currentLang)) {
            currentLang = 'en';
            localStorage.setItem('yumeshelf_lang', currentLang);
        }
        refreshLanguageDropdown();
        const placeholders = getStrings().placeholders || getEnglishStrings().placeholders || ['Search...'];
        placeholderIndex = Math.floor(Math.random() * placeholders.length);
        bootController.render(bootController.getLatestPayload());
    }

    function setCurrentLanguage(nextCode, options = {}) {
        const { persist = true } = options;
        currentLang = isLanguageAvailable(nextCode) ? String(nextCode).toLowerCase() : 'en';
        if (persist) {
            localStorage.setItem('yumeshelf_lang', currentLang);
        }
        refreshLanguageDropdown();
        if (getAllGames().length > 0) {
            sortGames();
        } else {
            applyUIStrings();
        }
    }

    function getPlaceholders() {
        return getStrings().placeholders || getEnglishStrings().placeholders || ['Search...'];
    }

    function advancePlaceholderIndex() {
        const placeholders = getPlaceholders();
        placeholderIndex = (placeholderIndex + 1) % placeholders.length;
        return placeholderIndex;
    }

    return {
        advancePlaceholderIndex,
        formatLanguageLabel,
        getAvailableLanguages,
        getCurrentLang,
        getEnglishStrings,
        getLanguageMeta,
        getLocaleState,
        getLocaleStrings,
        getPlaceholderIndex,
        getPlaceholders,
        getStrings,
        isLanguageAvailable,
        loadLanguageState,
        refreshLanguageDropdown,
        setCurrentLanguage,
        setLocaleState
    };
}
