/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEngineName, YumeEngine } from '../dist/index.js';
import type { GameEngineProfile } from '../dist/types.d.ts';

test('formatEngineName: RPG Maker variants', () => {
  const mzProfile: GameEngineProfile = {
    tag: 'RPGM',
    family: 'rpg-maker',
    variant: 'mz',
    arch: 'x64',
    runtime: 'nwjs',
    saveStrategy: 'rpg-maker-mv-mz',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(mzProfile), 'RPG Maker MZ');
  assert.strictEqual(YumeEngine.formatEngineName(mzProfile), 'RPG Maker MZ');

  const mvProfile: GameEngineProfile = { ...mzProfile, variant: 'mv' };
  assert.strictEqual(formatEngineName(mvProfile), 'RPG Maker MV');

  const vxAceProfile: GameEngineProfile = { ...mzProfile, variant: 'vx-ace', runtime: 'native', saveStrategy: 'rpg-maker-rgss' };
  assert.strictEqual(formatEngineName(vxAceProfile), 'RPG Maker VX Ace');

  const vxProfile: GameEngineProfile = { ...mzProfile, variant: 'vx', runtime: 'native', saveStrategy: 'rpg-maker-rgss' };
  assert.strictEqual(formatEngineName(vxProfile), 'RPG Maker VX');

  const xpProfile: GameEngineProfile = { ...mzProfile, variant: 'xp', runtime: 'native', saveStrategy: 'rpg-maker-rgss' };
  assert.strictEqual(formatEngineName(xpProfile), 'RPG Maker XP');

  const r2kProfile: GameEngineProfile = { ...mzProfile, variant: '2000-2003', runtime: 'native', saveStrategy: 'rpg-maker-rgss' };
  assert.strictEqual(formatEngineName(r2kProfile), 'RPG Maker 2000/2003');

  const genericRpgm: GameEngineProfile = { ...mzProfile, variant: undefined };
  assert.strictEqual(formatEngineName(genericRpgm), 'RPG Maker');
});

test('formatEngineName: Engine families', () => {
  const unityProfile: GameEngineProfile = {
    tag: 'Unity',
    family: 'unity',
    variant: 'il2cpp',
    arch: 'x64',
    runtime: 'native',
    saveStrategy: 'custom',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(unityProfile), 'Unity');

  const wolfProfile: GameEngineProfile = {
    tag: 'Wolf RPG',
    family: 'wolf-rpg',
    variant: 'standard',
    arch: 'x86',
    runtime: 'native',
    saveStrategy: 'wolf-sav',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(wolfProfile), 'Wolf RPG');

  const renpyProfile: GameEngineProfile = {
    tag: "Ren'Py",
    family: 'renpy',
    variant: 'standard',
    arch: 'x64',
    runtime: 'python',
    saveStrategy: 'renpy-pickle',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(renpyProfile), "Ren'Py");

  const godotProfile: GameEngineProfile = {
    tag: 'Godot',
    family: 'godot',
    arch: 'x64',
    runtime: 'native',
    saveStrategy: 'godot',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(godotProfile), 'Godot');

  const unrealProfile: GameEngineProfile = {
    tag: 'Unreal Engine',
    family: 'unreal',
    arch: 'x64',
    runtime: 'native',
    saveStrategy: 'unreal-sav',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(unrealProfile), 'Unreal Engine');
});

test('formatEngineName: Native and unclassified fallback', () => {
  assert.strictEqual(formatEngineName(null), undefined);
  assert.strictEqual(formatEngineName(undefined), undefined);

  const nativeProfile: GameEngineProfile = {
    tag: 'Others',
    family: 'native',
    arch: 'x64',
    runtime: 'native',
    saveStrategy: 'custom',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(nativeProfile), undefined);

  const unknownProfile: GameEngineProfile = {
    tag: 'Others',
    family: 'unknown',
    arch: 'unknown',
    runtime: 'native',
    saveStrategy: 'custom',
    detectedBy: 'rule',
  };
  assert.strictEqual(formatEngineName(unknownProfile), undefined);
});
