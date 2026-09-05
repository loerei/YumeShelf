// @ts-ignore
import { describe, it, expect } from 'vitest';
import { getGameIconUrl, renderIconMarkup, normalizeIconPayload, applyIconPayload } from './icon-payload';

describe('icon-payload (Renderer Icon Optimization)', () => {
    it('getGameIconUrl properly formats and encodes game-icon:// URI', () => {
        expect(getGameIconUrl('C:\\Games\\Yume Nikki\\game.exe')).toBe(
            'game-icon://app?path=C%3A%5CGames%5CYume%20Nikki%5Cgame.exe'
        );
        expect(getGameIconUrl('D:/Games/VN/start.sh')).toBe(
            'game-icon://app?path=D%3A%2FGames%2FVN%2Fstart.sh'
        );
        expect(getGameIconUrl('')).toBe('');
        expect(getGameIconUrl(null as any)).toBe('');
        expect(getGameIconUrl(undefined as any)).toBe('');
    });

    it('renderIconMarkup renders img with loading="lazy" and class="fade-in-icon"', () => {
        const markup = renderIconMarkup('game-icon://app?path=test.exe', 'contain', 'game-icon');
        expect(markup).toContain('loading="lazy"');
        expect(markup).toContain('src="game-icon://app?path=test.exe"');
        expect(markup).toContain('class="fade-in-icon"');
        expect(markup).toContain('data-icon-fit="contain"');
        expect(markup).toContain('data-icon-source="game-icon"');
        expect(markup).not.toContain('onload=');
        expect(markup).not.toContain('onerror=');
    });

    it('renderIconMarkup handles cover fit correctly', () => {
        const markup = renderIconMarkup('game-icon://app?path=test.exe', 'cover', 'local-image');
        expect(markup).toContain('object-fit:cover');
        expect(markup).toContain('data-icon-fit="cover"');
        expect(markup).toContain('data-icon-source="local-image"');
    });
});
