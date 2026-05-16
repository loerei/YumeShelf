/**
 * Save Editor Translator
 * Handles translation of the save editor's UI elements.
 */

export class Translator {
    constructor(api) {
        this.api = api;
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
}
