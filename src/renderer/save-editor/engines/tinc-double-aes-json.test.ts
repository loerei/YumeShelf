// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { TincDoubleAesJsonEngine } from './tinc-double-aes-json';

describe('TincDoubleAesJsonEngine', () => {
    const engine = new TincDoubleAesJsonEngine();

    it('detects TincDoubleAesJsonSave accurately via $type', () => {
        expect(engine.detect({ $type: 'TincDoubleAesJsonSave' })).toBe(true);
        expect(engine.detect({ $type: 'PureJsonSave' })).toBe(false);
        expect(engine.detect({ $type: 'RenpySave' })).toBe(false);
        expect(engine.detect(null)).toBe(false);
        expect(engine.detect(undefined)).toBe(false);
        expect(engine.detect({})).toBe(false);
    });

    it('implements contractual methods inherited from PureJsonEngine without error', () => {
        const mockSave = {
            $type: 'TincDoubleAesJsonSave',
            data_test: '123'
        };

        expect(typeof engine.extractRoot).toBe('function');
        expect(engine.extractRoot(mockSave)).toBe(mockSave);

        expect(typeof engine.findGold).toBe('function');
        expect(engine.findGold(mockSave)).toBeNull();

        expect(typeof engine.extractData).toBe('function');
        expect(engine.extractData(mockSave)).toBe(mockSave);
    });

    it('_getDeepPaths lists only paths under data_* properties and excludes root metadata', () => {
        const sampleSave = {
            $type: 'TincDoubleAesJsonSave',
            _userMappings: { customVar: 'data_resource_money' },
            creationDate: '2026-09-23T12:00:00Z',
            creationUpdate: '1.0.0',
            data_resource_money: '60',
            data_playerName: 'Hero',
            data_items: ['potion', 'elixir'],
            data_nested: {
                flag: true,
                innerStr: 'nested_val'
            },
            otherMeta: 'some_string'
        };

        const paths = engine._getDeepPaths(sampleSave);

        // Must include data_* paths
        expect(paths).toContain('data_resource_money');
        expect(paths).toContain('data_playerName');
        expect(paths).toContain('data_items.0');
        expect(paths).toContain('data_items.1');
        expect(paths).toContain('data_nested.flag');
        expect(paths).toContain('data_nested.innerStr');

        // Must strictly exclude root metadata, $type, _userMappings, and non-data_* root fields
        expect(paths).not.toContain('$type');
        expect(paths).not.toContain('_userMappings');
        expect(paths).not.toContain('creationDate');
        expect(paths).not.toContain('creationUpdate');
        expect(paths).not.toContain('otherMeta');
    });

    it('getTabs correctly discovers variables and switches based on data_* properties', () => {
        const dict = {
            save_editor_variables: 'Variables',
            save_editor_switches: 'Switches'
        };

        // Data with both variables and switches
        const saveWithBoth = {
            creationDate: '2026-09-23T12:00:00Z',
            data_resource_money: '60',
            data_switch_active: true
        };
        const tabsBoth = engine.getTabs(saveWithBoth, dict);
        expect(tabsBoth.map(t => t.id)).toEqual(['variables', 'switches']);

        // Data with only variables
        const saveWithVarsOnly = {
            creationDate: '2026-09-23T12:00:00Z',
            data_resource_money: '60'
        };
        const tabsVars = engine.getTabs(saveWithVarsOnly, dict);
        expect(tabsVars.map(t => t.id)).toEqual(['variables']);

        // Data with only switches
        const saveWithSwitchesOnly = {
            creationDate: '2026-09-23T12:00:00Z',
            data_switch_active: false
        };
        const tabsSwitches = engine.getTabs(saveWithSwitchesOnly, dict);
        expect(tabsSwitches.map(t => t.id)).toEqual(['switches']);
    });

    it('getProp provides proxy view for data_* properties and prevents overwriting root metadata', () => {
        const sampleSave = {
            $type: 'TincDoubleAesJsonSave',
            creationDate: '2026-09-23T12:00:00Z',
            data_resource_money: '60',
            data_nested: {
                level: 10
            }
        };

        const varsProxy = engine.getProp(sampleSave, 'variables');
        expect(varsProxy).toBeDefined();

        // Own keys only lists data_* paths
        const keys = Object.keys(varsProxy);
        expect(keys).toContain('data_resource_money');
        expect(keys).toContain('data_nested.level');
        expect(keys).not.toContain('creationDate');
        expect(keys).not.toContain('$type');

        // Reading values
        expect(varsProxy['data_resource_money']).toBe('60');
        expect(varsProxy['data_nested.level']).toBe(10);

        // Writing values through proxy
        varsProxy['data_resource_money'] = '75';
        expect(sampleSave.data_resource_money).toBe('75');

        varsProxy['data_nested.level'] = 11;
        expect(sampleSave.data_nested.level).toBe(11);

        // Root metadata remains untampered
        expect(sampleSave.creationDate).toBe('2026-09-23T12:00:00Z');
        expect(sampleSave.$type).toBe('TincDoubleAesJsonSave');
    });
});
