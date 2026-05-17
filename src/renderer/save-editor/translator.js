/**
 * Save Editor Translator
 * Handles translation of the save editor's static UI and dynamic game labels.
 */

export class Translator {
    constructor(api) {
        this.api = api;
        this.translationCache = {};
        this.isTranslating = false;

        try {
            this.translationCache = JSON.parse(localStorage.getItem('yumeshelf_translation_cache') || '{}') || {};
        } catch (e) {
            this.translationCache = {};
        }
    }

    saveTranslations() {
        localStorage.setItem('yumeshelf_translation_cache', JSON.stringify(this.translationCache));
    }

    /**
     * Applies translations to elements with data-i18n attributes
     */
    async applyTranslations(container = document) {
        const elements = container.querySelectorAll('[data-i18n]');
        for (const el of elements) {
            const key = el.getAttribute('data-i18n');
            const translation = await this.api.translate(key);
            if (translation && translation !== key) {
                el.textContent = translation;
            }
        }

        // Handle placeholders
        const placeholders = container.querySelectorAll('[data-i18n-placeholder]');
        for (const el of placeholders) {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = await this.api.translate(key);
            if (translation && translation !== key) {
                el.placeholder = translation;
            }
        }
    }

    /**
     * Applies cached translations for labels (.data-label)
     */
    applyCachedLabels(container) {
        const labels = container.querySelectorAll('.data-label');
        labels.forEach(label => {
            const fullText = label.getAttribute('title') || label.textContent;
            if (this.translationCache[fullText]) {
                label.textContent = this.translationCache[fullText];
                label.classList.add('is-translated');
            }
        });
    }

    /**
     * Google Translate batch translation for dynamic labels
     */
    async translateLabels(labels, targetLang, onProgressChange) {
        if (this.isTranslating) return;

        const textsToTranslate = [];
        const labelMap = [];

        labels.forEach(label => {
            const originalName = label.getAttribute('title') || label.textContent;
            if (!originalName || /^\d+$/.test(originalName) || originalName.length < 2) return;

            if (this.translationCache[originalName]) {
                label.textContent = this.translationCache[originalName];
                label.classList.add('is-translated');
            } else {
                textsToTranslate.push(originalName);
                labelMap.push({ el: label, original: originalName });
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
                const chunk = uniqueTexts.slice(i, i + batchSize);
                const combined = chunk.join('\n');
                console.log(`[SAVE-EDITOR] Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueTexts.length / batchSize)}...`);

                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combined)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`[SAVE-EDITOR] Translation API error: ${response.status} ${response.statusText}`);
                    continue;
                }
                const result = await response.json();

                if (result && result[0]) {
                    let translatedFull = "";
                    result[0].forEach(part => {
                        if (part[0]) translatedFull += part[0];
                    });

                    const translatedLines = translatedFull.split('\n');
                    chunk.forEach((original, idx) => {
                        if (translatedLines[idx]) {
                            const translatedText = translatedLines[idx].trim();
                            this.translationCache[original] = translatedText;
                            console.log(`[SAVE-EDITOR] Translated: "${original}" -> "${translatedText}"`);
                        }
                    });
                }

                if (typeof onProgressChange === 'function') {
                    const progress = Math.round(((i + chunk.length) / uniqueTexts.length) * 100);
                    onProgressChange(progress);
                }
            }
            this.saveTranslations();

            labelMap.forEach(item => {
                if (this.translationCache[item.original]) {
                    item.el.textContent = this.translationCache[item.original];
                    item.el.classList.add('is-translated');
                }
            });
            console.log('[SAVE-EDITOR] Translation complete.');
        } finally {
            this.isTranslating = false;
        }
    }
}
