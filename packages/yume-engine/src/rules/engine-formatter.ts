import type { GameEngineProfile } from '../types.js';

/**
 * Authoritative formatter converting GameEngineProfile into a human-readable display label.
 * Returns undefined for native binaries or unclassified profiles to prevent generic noise.
 */
export function formatEngineName(profile?: GameEngineProfile | null): string | undefined {
  if (!profile || profile.family === 'native' || profile.family === 'unknown') {
    return undefined;
  }

  if (profile.family === 'rpg-maker') {
    switch (profile.variant) {
      case 'mz':
        return 'RPG Maker MZ';
      case 'mv':
        return 'RPG Maker MV';
      case 'vx-ace':
        return 'RPG Maker VX Ace';
      case 'vx':
        return 'RPG Maker VX';
      case 'xp':
        return 'RPG Maker XP';
      case '2000-2003':
        return 'RPG Maker 2000/2003';
      default:
        return 'RPG Maker';
    }
  }

  switch (profile.family) {
    case 'unity':
      return 'Unity';
    case 'wolf-rpg':
      return 'Wolf RPG';
    case 'renpy':
      return "Ren'Py";
    case 'godot':
      return 'Godot';
    case 'unreal':
      return 'Unreal Engine';
    case 'flash':
      return 'Adobe Flash';
    case 'java':
      return 'Java';
    case 'qsp':
      return 'QSP';
    case 'rags':
      return 'RAGS';
    case 'adrift':
      return 'ADRIFT';
    case 'tads':
      return 'Tads';
    case 'html-webgl':
      return 'HTML / WebGL';
    case 'gamemaker':
      return 'GameMaker';
    case 'kirikiri':
      return 'KiriKiri';
    case 'tyranobuilder':
      return 'TyranoBuilder';
    case 'bgi-ethornell':
      return 'BGI / Ethornell';
    case 'catsystem':
      return 'CatSystem 2';
    case 'siglus-reallive':
      return 'Siglus / RealLive';
    case 'nitroplus':
      return 'Nitro+';
    case 'majiro':
      return 'Majiro';
    case 'nscripter':
      return 'NScripter';
    case 'artemis':
      return 'Artemis';
    case 'lilim':
      return 'LiLiM';
    case 'livemaker':
      return 'LiveMaker';
    case 'advplayer':
      return 'AdvPlayer';
    case 'silky':
      return 'Silky';
    case 'system-nnn':
      return 'SystemNNN';
    case 'circus':
      return 'Circus';
    case 'emote':
      return 'E-mote';
    default:
      return profile.tag && profile.tag !== 'Others' ? profile.tag : undefined;
  }
}
