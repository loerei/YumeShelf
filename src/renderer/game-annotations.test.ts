import { describe, it, expect } from 'vitest';
import {
  LOCATION_DISPLAY_MODES,
  annotateGamesForDisplay,
  buildDuplicateChipLabel,
  buildDuplicateSignature,
  buildPathSubtitle,
} from './game-annotations';
import type { GameEntry } from './types/game';

describe('game-annotations', () => {
  it('buildDuplicateChipLabel formats duplicate counts > 1', () => {
    expect(buildDuplicateChipLabel(undefined)).toBeNull();
    expect(buildDuplicateChipLabel(0)).toBeNull();
    expect(buildDuplicateChipLabel(1)).toBeNull();
    expect(buildDuplicateChipLabel(2)).toBe('2x');
    expect(buildDuplicateChipLabel(4)).toBe('4x');
  });

  it('buildPathSubtitle returns relativePathDisplay or empty string', () => {
    expect(buildPathSubtitle({ gameKey: 'g1', name: 'G1', relativePathDisplay: 'Games/G1' })).toBe('Games/G1');
    expect(buildPathSubtitle({ gameKey: 'g2', name: 'G2' })).toBe('');
  });

  it('buildDuplicateSignature extracts RJ/numeric IDs or normalized name+exe', () => {
    expect(buildDuplicateSignature({ name: 'Game [RJ123456]', exePath: 'game.exe' })).toBe('id:RJ123456');
    expect(buildDuplicateSignature({ name: 'My Cool Game v1.2', exePath: 'C:\\Games\\CoolGame.exe' })).toBe(
      'name:my cool game|exe:coolgame'
    );
    expect(buildDuplicateSignature({ name: 'ab', exePath: 'a.exe' })).toBeNull();
  });

  it('annotateGamesForDisplay computes parent and full location labels', () => {
    const games: GameEntry[] = [
      {
        gameKey: 'Action/MyGame',
        name: 'MyGame',
        folderPath: 'D:\\Games\\Action\\MyGame',
        relativePath: 'Action/MyGame',
      },
    ];

    const parentAnnotated = annotateGamesForDisplay(games, 'D:\\Games', LOCATION_DISPLAY_MODES.PARENT);
    expect(parentAnnotated[0].relativePathDisplay).toBe('/Games/Action');
    expect(parentAnnotated[0].fullLocationLabel).toBe('Games/Action/MyGame');

    const fullAnnotated = annotateGamesForDisplay(games, ['D:\\Games'], LOCATION_DISPLAY_MODES.FULL);
    expect(fullAnnotated[0].relativePathDisplay).toBe('/Games/Action/MyGame');
  });
});
