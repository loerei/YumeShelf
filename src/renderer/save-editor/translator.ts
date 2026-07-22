// @ts-nocheck

/**
 * Save Editor Translator
 * Handles translation of the save editor's static UI and dynamic game labels.
 */
export class Translator {
    /**
     * @param {import('../../shared/types/ipc').ElectronAPI} api
     */
    constructor(api) {
        /** @type {import('../../shared/types/ipc').ElectronAPI} */
        this.api = api;
        /** @type {Record<string, string>} */
        this.translationCache = {};
        /** @type {boolean} */
        this.isTranslating = false;
        /** @type {boolean} */
        this.isInitialized = false;
        /** @type {Record<string, string>} */
        this.uiStrings = {};
        /** @type {string | undefined} */
        this.resolvedBcp47 = undefined;
        /** @type {string | undefined} */
        this.targetLang = undefined;
    }

    async initialize() {
        if (this.isInitialized) return;

        // Try to fetch UI strings for the current language
        try {
            if (this.api && typeof this.api.getLanguageState === 'function') {
                const langState = await this.api.getLanguageState();
                const currentLang = localStorage.getItem('yumeshelf_lang') || 'en';
                const englishStrings = langState?.locales?.en || {};
                const localStrings = langState?.locales?.[currentLang] || {};
                this.uiStrings = {
                    ...englishStrings,
                    ...localStrings
                };
                // Find active language pack metadata to resolve the BCP-47 target language
                /** @type {any[]} */
                const builtIn = langState?.builtIn || [];
                /** @type {any[]} */
                const installed = langState?.installed || [];
                const activeMeta = [...builtIn, ...installed]
                    .find(p => p.code === currentLang);
                
                let resolved = null;
                if (activeMeta?.bcp47 && /^[a-zA-Z0-9-]+$/.test(activeMeta.bcp47)) {
                    resolved = activeMeta.bcp47;
                } else if (currentLang && /^[a-zA-Z0-9-]+$/.test(currentLang)) {
                    resolved = currentLang;
                }

                if (!resolved) {
                    throw new Error("Could not resolve a valid target translation language (both bcp47 and currentLang are empty or invalid).");
                }
                
                this.resolvedBcp47 = resolved;
                console.log(`[SAVE-EDITOR-TRANSLATOR] Resolved BCP-47 target language: ${this.resolvedBcp47}`);
                // Expose globally so components can access it
                /** @type {any} */ (window).currentUIStrings = this.uiStrings;
                console.log(`[SAVE-EDITOR-TRANSLATOR] UI strings loaded for language: ${currentLang}`);
            }
        } catch (e) {
            console.error('[SAVE-EDITOR-TRANSLATOR] Failed to load UI strings:', e);
        }

        try {
            const currentLang = localStorage.getItem('yumeshelf_lang') || 'en';
            this.targetLang = currentLang;

            // First try to load from AppData via IPC
            if (this.api && typeof this.api.loadTranslations === 'function') {
                console.log(`[SAVE-EDITOR] Fetching persisted translations from AppData for language: ${currentLang}...`);
                const persisted = await this.api.loadTranslations(currentLang);
                if (persisted && typeof persisted === 'object') {
                    this.translationCache = persisted;
                    console.log(`[SAVE-EDITOR] Successfully loaded ${Object.keys(this.translationCache).length} translations from AppData.`);
                    this.isInitialized = true;
                    return;
                }
            }
        } catch (e) {
            console.warn('[SAVE-EDITOR] Failed to load translations from AppData IPC, falling back to LocalStorage:', e);
        }

        // Fallback to LocalStorage
        try {
            this.translationCache = JSON.parse(localStorage.getItem('yumeshelf_translation_cache') || '{}') || {};
            console.log(`[SAVE-EDITOR] Loaded ${Object.keys(this.translationCache).length} translations from LocalStorage.`);
        } catch {
            this.translationCache = {};
        }
        this.isInitialized = true;
    }

    async saveTranslations() {
        const currentLang = localStorage.getItem('yumeshelf_lang') || 'en';

        // Save to LocalStorage (with identical results stripped)
        try {
            /** @type {Record<string, string>} */
            const stripped = {};
            for (const [k, v] of Object.entries(this.translationCache)) {
                if (k !== v) {
                    stripped[k] = v;
                }
            }
            localStorage.setItem('yumeshelf_translation_cache', JSON.stringify(stripped));
        } catch (e) {
            console.error('[SAVE-EDITOR] LocalStorage save failed:', e);
        }

        // Save to AppData via IPC (with identical results stripped)
        try {
            if (this.api && typeof this.api.saveTranslations === 'function') {
                console.log(`[SAVE-EDITOR] Persisting translations to AppData for language: ${currentLang}...`);
                await this.api.saveTranslations(currentLang, this.translationCache);
            }
        } catch (e) {
            console.error('[SAVE-EDITOR] IPC AppData save failed:', e);
        }
    }

    /**
     * Applies translations to elements with data-i18n attributes
     * @param {Document | HTMLElement} [container]
     */
    async applyTranslations(container = document) {
        const strings = /** @type {any} */ (window).currentUIStrings || this.uiStrings || {};
        const elements = container.querySelectorAll('[data-i18n]');
        for (const el of elements) {
            const key = el.getAttribute('data-i18n');
            if (key) {
                const translation = strings[key];
                if (translation && translation !== key) {
                    el.textContent = translation;
                }
            }
        }

        // Handle placeholders
        const placeholders = container.querySelectorAll('[data-i18n-placeholder]');
        for (const el of placeholders) {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                const translation = strings[key];
                if (translation && translation !== key) {
                    /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el).placeholder = translation;
                }
            }
        }
    }

    /**
     * Applies cached translations for labels (.data-label)
     * @param {Document | HTMLElement} container
     */
    applyCachedLabels(container) {
        const labels = container.querySelectorAll('.data-label');
        labels.forEach(label => {
            const fullText = label.getAttribute('title') || label.textContent || '';
            if (this.translationCache[fullText]) {
                label.textContent = this.translationCache[fullText];
                label.classList.add('is-translated');
            }
        });
    }

    /**
     * Google Translate batch translation for dynamic labels
     * @param {NodeListOf<Element> | Element[]} labels
     * @param {string} targetLang
     * @param {((progress: number) => void) | null} [onProgressChange]
     */
    async translateLabels(labels, targetLang, onProgressChange) {
        if (this.isTranslating) return;

        const resolvedTarget = this.resolvedBcp47 || targetLang;
        if (!resolvedTarget || !/^[a-zA-Z0-9-]+$/.test(resolvedTarget)) {
            console.error('[SAVE-EDITOR] Translation aborted: No valid BCP-47 or target language resolved.');
            if (typeof onProgressChange === 'function') {
                onProgressChange(100);
            }
            return;
        }
        /** @type {string[]} */
        const textsToTranslate = [];


        labels.forEach(label => {
            const originalName = label.getAttribute('title') || label.textContent || '';
            if (!originalName || /^\d+$/.test(originalName)) return;

            const isASCII = /^[\x00-\x7F]+$/.test(originalName);
            // Skip single-character ASCII terms to avoid rate-limiting on empty placeholder keys
            if (isASCII && originalName.length < 2) return;

            // Skip pure punctuation/symbol rows
            const isPunctuation = /^[ \t\r\n+=!@#$%^&*(){}[\]:;"'<>,.?/\\|~`_-]*$/.test(originalName);
            if (isPunctuation) return;

            if (this.translationCache[originalName]) {
                label.textContent = this.translationCache[originalName];
                label.classList.add('is-translated');
            } else {
                textsToTranslate.push(originalName);
            }
        });

        const uniqueTexts = [...new Set(textsToTranslate)];
        console.log(`[SAVE-EDITOR] ${uniqueTexts.length} unique labels require external translation.`);

        if (uniqueTexts.length === 0) {
            return;
        }

        this.isTranslating = true;
        try {
            const batchSize = 15;
            for (let i = 0; i < uniqueTexts.length; i += batchSize) {
                // EDGE CASE 2: API Rate-Limit protection for large sets.
                // If this is not the first batch, wait 600ms before triggering the next API fetch.
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 600));
                }

                const chunk = uniqueTexts.slice(i, i + batchSize);
                const combined = chunk.join('\n');
                console.log(`[SAVE-EDITOR] Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueTexts.length / batchSize)}...`);

                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${resolvedTarget}&dt=t&q=${encodeURIComponent(combined)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`[SAVE-EDITOR] Translation API error: ${response.status} ${response.statusText}`);
                    continue;
                }
                const result = await response.json();

                if (result?.[0]) {
                    let translatedFull = "";
                    result[0].forEach((/** @type {any[]} */ part) => {
                        if (part[0]) translatedFull += part[0];
                    });

                    const translatedLines = translatedFull.split('\n');

                    // EDGE CASE 3: Index/Line mismatch protection.
                    // If Google Translate merged or split lines, the counts won't match, which would cause index drift.
                    if (translatedLines.length !== chunk.length) {
                        console.warn(`[SAVE-EDITOR] Translation batch mismatch! Expected ${chunk.length} lines, got ${translatedLines.length}. Falling back to line-by-line validation.`);
                        
                        // Clean lines: remove empty lines or trim to match sizes
                        const validLines = translatedLines.filter(line => line.trim().length > 0);
                        if (validLines.length === chunk.length) {
                            // Perfect fit after cleanup
                            let changed = false;
                            chunk.forEach((original, idx) => {
                                const translatedText = validLines[idx].trim();
                                if (original !== translatedText) {
                                    if (this.translationCache[original] !== translatedText) {
                                        this.translationCache[original] = translatedText;
                                        changed = true;
                                    }
                                } else if (this.translationCache[original] !== original) {
                                    // Memory-only identical caching to prevent future re-translation in this session
                                    this.translationCache[original] = original;
                                    changed = true;
                                }
                            });
                            if (changed) await this.saveTranslations();
                        } else {
                            console.warn(`[SAVE-EDITOR] Mismatch cannot be resolved safely. Falling back to translating individual labels in this batch.`);
                            let changed = false;
                            for (const original of chunk) {
                                try {
                                    const singleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${resolvedTarget}&dt=t&q=${encodeURIComponent(original)}`;
                                    const res = await fetch(singleUrl);
                                    if (res.ok) {
                                        const singleResult = await res.json();
                                        if (singleResult?.[0]?.[0]?.[0]) {
                                            const translatedText = singleResult[0][0][0].trim();
                                            if (original !== translatedText) {
                                                if (this.translationCache[original] !== translatedText) {
                                                    this.translationCache[original] = translatedText;
                                                    changed = true;
                                                    console.log(`[SAVE-EDITOR] Individual Fallback Translated: "${original}" -> "${translatedText}"`);
                                                }
                                             } else if (this.translationCache[original] !== original) {
                                                 this.translationCache[original] = original;
                                                 changed = true;
                                             }
                                        }
                                    }
                                    // Small delay to prevent rate limit
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                } catch (singleErr) {
                                    console.error(`[SAVE-EDITOR] Individual fallback failed for "${original}":`, singleErr);
                                }
                            }
                            if (changed) {
                                await this.saveTranslations();
                            }
                        }
                    } else {
                        // Standard matching mapping
                        let changed = false;
                        chunk.forEach((original, idx) => {
                            if (translatedLines[idx]) {
                                const translatedText = translatedLines[idx].trim();
                                if (original !== translatedText) {
                                    if (this.translationCache[original] !== translatedText) {
                                        this.translationCache[original] = translatedText;
                                        changed = true;
                                        console.log(`[SAVE-EDITOR] Translated: "${original}" -> "${translatedText}"`);
                                    }
                                } else if (this.translationCache[original] !== original) {
                                    // Memory-only identical caching to prevent future re-translation in this session
                                    this.translationCache[original] = original;
                                    changed = true;
                                }
                            }
                        });

                        if (changed) {
                            await this.saveTranslations();
                        }
                    }

                    // Immediately update any matching labels currently visible in the DOM
                    const activeLabels = document.querySelectorAll('.data-label');
                    activeLabels.forEach(label => {
                        const originalName = label.getAttribute('title') || label.textContent || '';
                        if (this.translationCache[originalName]) {
                            label.textContent = this.translationCache[originalName];
                            label.classList.add('is-translated');
                        }
                    });
                }

                if (typeof onProgressChange === 'function') {
                    const progress = Math.round(((i + chunk.length) / uniqueTexts.length) * 100);
                    onProgressChange(progress);
                }
            }
            console.log('[SAVE-EDITOR] Translation complete.');
        } finally {
            this.isTranslating = false;
        }
    }
}

