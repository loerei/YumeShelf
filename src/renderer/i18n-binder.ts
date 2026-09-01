/**
 * Declarative UI i18n DOM Binder.
 * Automatically updates element text, placeholders, and titles based on data-i18n attributes.
 */

export interface I18nBinderOptions {
    dictionary: Record<string, string>;
    fallbackDictionary?: Record<string, string>;
}

export function bindI18nStrings(
    options: I18nBinderOptions,
    root: ParentNode = document
): void {
    const { dictionary, fallbackDictionary } = options;
    if (!dictionary) return;

    // 1. Text content: [data-i18n]
    const textElements = root.querySelectorAll<HTMLElement>('[data-i18n]');
    textElements.forEach((el) => {
        const key = el.dataset.i18n;
        if (!key) return;
        const value = dictionary[key] ?? fallbackDictionary?.[key];
        if (value !== undefined && value !== null) {
            el.textContent = value;
        }
    });

    // 1b. HTML content: [data-i18n-html]
    const htmlElements = root.querySelectorAll<HTMLElement>('[data-i18n-html]');
    htmlElements.forEach((el) => {
        const key = el.dataset.i18nHtml;
        if (!key) return;
        const value = dictionary[key] ?? fallbackDictionary?.[key];
        if (value !== undefined && value !== null) {
            el.innerHTML = value;
        }
    });

    // 2. Placeholders: [data-i18n-placeholder]
    const placeholderElements = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]');
    placeholderElements.forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        if (!key) return;
        const value = dictionary[key] ?? fallbackDictionary?.[key];
        if (value !== undefined && value !== null) {
            el.placeholder = value;
        }
    });

    // 3. Tooltips / Titles: [data-i18n-title]
    const titleElements = root.querySelectorAll<HTMLElement>('[data-i18n-title]');
    titleElements.forEach((el) => {
        const key = el.dataset.i18nTitle;
        if (!key) return;
        const value = dictionary[key] ?? fallbackDictionary?.[key];
        if (value !== undefined && value !== null) {
            el.setAttribute('data-tooltip', value);
            el.removeAttribute('title');
        }
    });
}
