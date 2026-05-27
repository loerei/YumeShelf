// @ts-nocheck
import { setupTabs } from './tabs';
import { renderTabContent } from './content';

/**
 * Shared context for modularized grid renderer functions
 */
interface GridContext {
    refs: any;
    state: any;
    engine: any;
    translator: any;
    activeVisibleTabs: any[];
    setupTabs: () => void;
    renderTabContent: () => void;
}

/**
 * Setup grid renderer.
 * @param {any} refs
 * @param {any} state
 * @param {any} engine
 * @param {any} translator
 */
export function setupGridRenderer(refs, state, engine, translator) {
    const context: GridContext = {
        refs,
        state,
        engine,
        translator,
        activeVisibleTabs: [],
        setupTabs: null,
        renderTabContent: null
    };

    context.setupTabs = () => setupTabs(context);
    context.renderTabContent = () => renderTabContent(context);

    return {
        setupTabs: context.setupTabs,
        renderTabContent: context.renderTabContent
    };
}
