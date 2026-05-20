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
        const version = nextState.appVersion || localeState.appVersion;
        console.log(`[I18N][RENDERER] setLocaleState: updating state. version preserved/set = ${version}`);
        localeState = nextState;
        localeState.appVersion = version;
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

        const welcomePicker = document.getElementById('welcome-lang-picker');
        if (welcomePicker) {
            welcomePicker.innerHTML = '';
            languages.forEach((language, index) => {
                const link = document.createElement('span');
                link.className = 'welcome-lang-link';
                if (language.code === currentLang) {
                    link.classList.add('active');
                }
                link.textContent = language.nativeName || language.englishName || language.code;
                link.onclick = () => {
                    setCurrentLanguage(language.code);
                };
                welcomePicker.appendChild(link);

                if (index < languages.length - 1) {
                    const divider = document.createElement('span');
                    divider.className = 'welcome-lang-divider';
                    divider.textContent = ' | ';
                    welcomePicker.appendChild(divider);
                }
            });
        }
    }

    async function loadLanguageState(nextState = null) {
        const appVersion = await electronAPI.getAppVersion();
        console.log(`[I18N][RENDERER] loadLanguageState: fetched appVersion from Electron = ${appVersion}`);
        const incomingState = nextState || await electronAPI.getLanguageState();
        if (incomingState && incomingState.locales && incomingState.locales.en) {
            console.log(`[I18N][RENDERER] loadLanguageState: overwriting localeState with incomingState.`);
            localeState = incomingState;
        }
        localeState.appVersion = appVersion;
        console.log(`[I18N][RENDERER] loadLanguageState: finalized localeState.appVersion = ${localeState.appVersion}`);
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
        const nextLang = isLanguageAvailable(nextCode) ? String(nextCode).toLowerCase() : 'en';

        const welcomeBox = document.querySelector('.welcome-box');
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && welcomeScreen.style.display === 'flex';

        if (welcomeBox && isWelcomeVisible && currentLang !== nextLang) {
            welcomeBox.classList.remove('reassemble');
            welcomeBox.classList.add('dissolve');

            setTimeout(() => {
                currentLang = nextLang;
                if (persist) {
                    localStorage.setItem('yumeshelf_lang', currentLang);
                }
                refreshLanguageDropdown();
                if (getAllGames().length > 0) {
                    sortGames();
                } else {
                    applyUIStrings();
                }

                welcomeBox.classList.remove('dissolve');
                welcomeBox.classList.add('reassemble');
            }, 400);
        } else {
            currentLang = nextLang;
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
