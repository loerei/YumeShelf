import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  StandardEnvironmentPaths,
  NodeFileSystemProvider,
  YumeEngine,
} from '../dist/index.js';
// @ts-ignore
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

test('StandardEnvironmentPaths: Default instantiation on current host', () => {
  const envPaths = new StandardEnvironmentPaths();
  assert.ok(typeof envPaths.getHomeDir() === 'string');
  assert.ok(typeof envPaths.getAppData() === 'string');
  assert.ok(typeof envPaths.getLocalAppData() === 'string');
  assert.ok(typeof envPaths.getDocuments() === 'string');
  assert.ok(typeof envPaths.getSavedGames() === 'string');
  assert.ok(typeof envPaths.getAppSupportDir() === 'string');
  assert.ok(typeof envPaths.getCachesDir() === 'string');
  assert.ok(typeof envPaths.getPreferencesDir() === 'string');
});

test('StandardEnvironmentPaths: macOS environment paths and empty home safety', () => {
  const home = '/Users/TestMacUser';
  const macPaths = new StandardEnvironmentPaths({
    platform: 'darwin',
    homeDir: home,
    env: {},
  });

  assert.strictEqual(macPaths.getHomeDir(), home);
  assert.strictEqual(macPaths.getAppSupportDir(), path.join(home, 'Library', 'Application Support'));
  assert.strictEqual(macPaths.getCachesDir(), path.join(home, 'Library', 'Caches'));
  assert.strictEqual(macPaths.getPreferencesDir(), path.join(home, 'Library', 'Preferences'));
  assert.strictEqual(macPaths.getAppData(), path.join(home, 'Library', 'Application Support'));
  assert.strictEqual(macPaths.getLocalAppData(), path.join(home, 'Library', 'Caches'));
  assert.strictEqual(macPaths.getMacApplicationSupportHome(), path.join(home, 'Library', 'Application Support'));
  assert.strictEqual(macPaths.getMacPreferencesHome(), path.join(home, 'Library', 'Preferences'));

  // Empty home safety: must return empty string to prevent relative path fallback
  const emptyMacPaths = new StandardEnvironmentPaths({
    platform: 'darwin',
    homeDir: '',
    env: { HOME: '', USERPROFILE: '' },
  });

  assert.strictEqual(emptyMacPaths.getHomeDir(), '');
  assert.strictEqual(emptyMacPaths.getAppSupportDir(), '');
  assert.strictEqual(emptyMacPaths.getCachesDir(), '');
  assert.strictEqual(emptyMacPaths.getPreferencesDir(), '');
  assert.strictEqual(emptyMacPaths.getAppData(), '');
  assert.strictEqual(emptyMacPaths.getLocalAppData(), '');
  assert.strictEqual(emptyMacPaths.getMacApplicationSupportHome(), '');
  assert.strictEqual(emptyMacPaths.getMacPreferencesHome(), '');
});

test('StandardEnvironmentPaths: Windows environment paths and empty home safety', () => {
  const home = 'C:\\Users\\TestWinUser';
  const winPaths = new StandardEnvironmentPaths({
    platform: 'win32',
    homeDir: home,
    env: {
      APPDATA: 'C:\\Users\\TestWinUser\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\TestWinUser\\AppData\\Local',
    },
  });

  assert.strictEqual(winPaths.getHomeDir(), home);
  assert.strictEqual(winPaths.getAppData(), 'C:\\Users\\TestWinUser\\AppData\\Roaming');
  assert.strictEqual(winPaths.getLocalAppData(), 'C:\\Users\\TestWinUser\\AppData\\Local');
  assert.strictEqual(winPaths.getDocuments(), path.join(home, 'Documents'));
  assert.strictEqual(winPaths.getSavedGames(), path.join(home, 'Saved Games'));
  assert.strictEqual(winPaths.getAppDataPath(), 'C:\\Users\\TestWinUser\\AppData\\Roaming');
  assert.strictEqual(winPaths.getLocalAppDataPath(), 'C:\\Users\\TestWinUser\\AppData\\Local');
  assert.strictEqual(winPaths.getDocumentsPath(), path.join(home, 'Documents'));
  assert.strictEqual(winPaths.getSavedGamesPath(), path.join(home, 'Saved Games'));

  // Fallback when env vars are missing
  const winPathsFallback = new StandardEnvironmentPaths({
    platform: 'win32',
    homeDir: home,
    env: {},
  });
  assert.strictEqual(winPathsFallback.getAppData(), path.join(home, 'AppData', 'Roaming'));
  assert.strictEqual(winPathsFallback.getLocalAppData(), path.join(home, 'AppData', 'Local'));

  // Empty home safety
  const emptyWinPaths = new StandardEnvironmentPaths({
    platform: 'win32',
    homeDir: '',
    env: { HOME: '', USERPROFILE: '', APPDATA: '', LOCALAPPDATA: '' },
  });
  assert.strictEqual(emptyWinPaths.getHomeDir(), '');
  assert.strictEqual(emptyWinPaths.getAppData(), '');
  assert.strictEqual(emptyWinPaths.getLocalAppData(), '');
  assert.strictEqual(emptyWinPaths.getDocuments(), '');
  assert.strictEqual(emptyWinPaths.getSavedGames(), '');
});

test('StandardEnvironmentPaths: Linux environment paths and XDG resolution', () => {
  const home = '/home/testlinuxuser';
  const linuxPaths = new StandardEnvironmentPaths({
    platform: 'linux',
    homeDir: home,
    env: {
      XDG_CONFIG_HOME: '/custom/config',
      XDG_DATA_HOME: '/custom/share',
    },
  });

  assert.strictEqual(linuxPaths.getHomeDir(), home);
  assert.strictEqual(linuxPaths.getAppData(), '/custom/config');
  assert.strictEqual(linuxPaths.getLocalAppData(), '/custom/share');
  assert.strictEqual(linuxPaths.getXdgConfigHome(), '/custom/config');
  assert.strictEqual(linuxPaths.getXdgDataHome(), '/custom/share');

  // Fallback when XDG vars are unset
  const linuxFallback = new StandardEnvironmentPaths({
    platform: 'linux',
    homeDir: home,
    env: {},
  });
  assert.strictEqual(linuxFallback.getAppData(), path.join(home, '.config'));
  assert.strictEqual(linuxFallback.getLocalAppData(), path.join(home, '.local', 'share'));

  // Empty home safety
  const emptyLinuxPaths = new StandardEnvironmentPaths({
    platform: 'linux',
    homeDir: '',
    env: { HOME: '', USERPROFILE: '', XDG_CONFIG_HOME: '', XDG_DATA_HOME: '' },
  });
  assert.strictEqual(emptyLinuxPaths.getAppData(), '');
  assert.strictEqual(emptyLinuxPaths.getLocalAppData(), '');
});

test('StandardEnvironmentPaths: Wine prefixes resolution and alias parity', async () => {
  const envPaths = new StandardEnvironmentPaths({
    env: { WINEPREFIX: '/custom/wine/prefix' },
    homeDir: '/mock/home',
  });

  const prefixes = await envPaths.getWinePrefixes();
  const roots = await envPaths.getWinePrefixRoots?.();
  assert.deepStrictEqual(prefixes, roots);
  assert.strictEqual(envPaths.getUserProfilePath(), envPaths.getHomeDir());
});

test('NodeFileSystemProvider: implements MultiOS environment path methods', () => {
  const nodeFs = new NodeFileSystemProvider();
  assert.strictEqual(typeof nodeFs.getHomeDir, 'function');
  assert.strictEqual(typeof nodeFs.getAppData, 'function');
  assert.strictEqual(typeof nodeFs.getLocalAppData, 'function');
  assert.strictEqual(typeof nodeFs.getDocuments, 'function');
  assert.strictEqual(typeof nodeFs.getSavedGames, 'function');
  assert.strictEqual(typeof nodeFs.getWinePrefixes, 'function');
  assert.strictEqual(typeof nodeFs.getMacApplicationSupportHome, 'function');
  assert.strictEqual(typeof nodeFs.getMacPreferencesHome, 'function');
  assert.strictEqual(typeof nodeFs.getAppSupportDir, 'function');
  assert.strictEqual(typeof nodeFs.getCachesDir, 'function');
  assert.strictEqual(typeof nodeFs.getPreferencesDir, 'function');

  assert.strictEqual(nodeFs.getAppData(), nodeFs.getAppDataPath());
  assert.strictEqual(nodeFs.getLocalAppData(), nodeFs.getLocalAppDataPath());
  assert.strictEqual(nodeFs.getDocuments(), nodeFs.getDocumentsPath());
  assert.strictEqual(nodeFs.getSavedGames(), nodeFs.getSavedGamesPath());
  assert.strictEqual(nodeFs.getAppSupportDir(), nodeFs.getMacApplicationSupportHome());
  assert.strictEqual(nodeFs.getPreferencesDir(), nodeFs.getMacPreferencesHome());
});

test('MockFileSystemProvider: implements macOS paths and customization options', () => {
  const defaultMock = new MockFileSystemProvider();
  assert.strictEqual(
    defaultMock.getMacApplicationSupportHome(),
    '/Users/MockUser/Library/Application Support'
  );
  assert.strictEqual(
    defaultMock.getMacPreferencesHome(),
    '/Users/MockUser/Library/Preferences'
  );
  assert.strictEqual(
    defaultMock.getAppSupportDir(),
    '/Users/MockUser/Library/Application Support'
  );
  assert.strictEqual(
    defaultMock.getPreferencesDir(),
    '/Users/MockUser/Library/Preferences'
  );

  const customMock = new MockFileSystemProvider({
    macApplicationSupportHome: '/Custom/Mac/AppSupport',
    macPreferencesHome: '/Custom/Mac/Preferences',
  });
  assert.strictEqual(customMock.getMacApplicationSupportHome(), '/Custom/Mac/AppSupport');
  assert.strictEqual(customMock.getMacPreferencesHome(), '/Custom/Mac/Preferences');

  customMock.setMacApplicationSupportHome('/Updated/AppSupport');
  customMock.setMacPreferencesHome('/Updated/Preferences');
  assert.strictEqual(customMock.getMacApplicationSupportHome(), '/Updated/AppSupport');
  assert.strictEqual(customMock.getMacPreferencesHome(), '/Updated/Preferences');
});

test('YumeEngine exports StandardEnvironmentPaths class and types', () => {
  assert.ok(StandardEnvironmentPaths, 'StandardEnvironmentPaths should be exported');
  assert.strictEqual(typeof StandardEnvironmentPaths, 'function');
});
