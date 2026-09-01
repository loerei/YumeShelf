"use strict";

// src/preload.ts
const import_electron = require("electron");
const api = {
  bootstrapApp: (options) => import_electron.ipcRenderer.invoke("bootstrap-app", options),
  checkConfig: () => import_electron.ipcRenderer.invoke("check-config"),
  setupLibrary: (type) => import_electron.ipcRenderer.invoke("setup-library", type),
  updateLibraryConfig: (updates) => import_electron.ipcRenderer.invoke("update-library-config", updates),
  getGames: () => import_electron.ipcRenderer.invoke("get-games"),
  getCategoryTree: () => import_electron.ipcRenderer.invoke("get-category-tree"),
  createCategory: (payload) => import_electron.ipcRenderer.invoke("create-category", payload),
  renameCategory: (payload) => import_electron.ipcRenderer.invoke("rename-category", payload),
  deleteCategory: (categoryId) => import_electron.ipcRenderer.invoke("delete-category", categoryId),
  assignGameCategories: (payload) => import_electron.ipcRenderer.invoke("assign-game-categories", payload),
  removeGameCategory: (payload) => import_electron.ipcRenderer.invoke("remove-game-category", payload),
  launchYume: (data) => import_electron.ipcRenderer.send("launch-yume", data),
  renameGame: (data) => import_electron.ipcRenderer.invoke("rename-game", data),
  revealGame: (path) => import_electron.ipcRenderer.send("reveal-game", path),
  openPath: (path) => import_electron.ipcRenderer.send("open-path", path),
  deleteGame: (path) => import_electron.ipcRenderer.invoke("delete-game", path),
  getSaveFolder: (gameKey) => import_electron.ipcRenderer.invoke("get-save-folder", gameKey),
  setSaveFolderOverride: (data) => import_electron.ipcRenderer.invoke("set-save-folder-override", data),
  toggleFavorite: (gameKey) => import_electron.ipcRenderer.invoke("toggle-favorite", gameKey),
  toggleRunInBackground: (gameKey) => import_electron.ipcRenderer.invoke("toggle-run-in-background", gameKey),
  openFolder: () => import_electron.ipcRenderer.send("open-folder"),
  getDefaultPath: () => import_electron.ipcRenderer.invoke("get-default-path"),
  getIcon: (path) => import_electron.ipcRenderer.invoke("get-icon", path),
  getAppVersion: () => import_electron.ipcRenderer.invoke("get-app-version"),
  openExternalUrl: (url) => import_electron.ipcRenderer.invoke("open-external-url", url),
  logAppUpdateDebug: (message) => import_electron.ipcRenderer.invoke("log-app-update-debug", message),
  startAppUpdateDownload: () => import_electron.ipcRenderer.invoke("start-app-update-download"),
  restartAndInstallAppUpdate: () => import_electron.ipcRenderer.invoke("restart-and-install-app-update"),
  scheduleAppUpdateNextLaunch: () => import_electron.ipcRenderer.invoke("schedule-app-update-next-launch"),
  beginDeferredAppUpdateInstall: () => import_electron.ipcRenderer.invoke("begin-deferred-app-update-install"),
  openAppUpdateDownloadPage: () => import_electron.ipcRenderer.invoke("open-app-update-download-page"),
  getLanguageState: () => import_electron.ipcRenderer.invoke("get-language-state"),
  getLanguagePackManifest: () => import_electron.ipcRenderer.invoke("get-language-pack-manifest"),
  installLanguagePack: (code) => import_electron.ipcRenderer.invoke("install-language-pack", code),
  onBootStatus: (callback) => {
    import_electron.ipcRenderer.on("boot-status", (_event, payload) => callback(payload));
  },
  onAppUpdateStatus: (callback) => {
    import_electron.ipcRenderer.on("app-update-status", (_event, payload) => callback(payload));
  },
  onGameStopped: (callback) => {
    import_electron.ipcRenderer.on("game-stopped", (_event, payload) => {
      console.log(`[PRELOAD] Received game-stopped IPC for ${payload ? payload.gameKey : "unknown"}`);
      callback(payload);
    });
  },
  onGamePlaytimeUpdated: (callback) => {
    import_electron.ipcRenderer.on("game-playtime-updated", (_event, payload) => callback(payload));
  },
  // Save Editor
  listSaveFiles: (gameKey) => import_electron.ipcRenderer.invoke("save-editor:list-files", gameKey),
  loadSaveData: (data) => import_electron.ipcRenderer.invoke("save-editor:load-data", data),
  writeSaveData: (data) => import_electron.ipcRenderer.invoke("save-editor:write-data", data),
  renameSaveFile: (data) => import_electron.ipcRenderer.invoke("save-editor:rename-file", data),
  deleteSaveFile: (data) => import_electron.ipcRenderer.invoke("save-editor:delete-file", data),
  updateMapping: (data) => import_electron.ipcRenderer.invoke("save-editor:update-mapping", data),
  openSaveEditorWindow: (gameKey) => import_electron.ipcRenderer.send("open-save-editor-window", gameKey),
  loadTranslations: (lang) => import_electron.ipcRenderer.invoke("save-editor:load-translations", lang),
  saveTranslations: (lang, translations) => import_electron.ipcRenderer.invoke("save-editor:save-translations", { lang, translations }),
  // System Startup & Tray Settings
  isDev: () => import_electron.ipcRenderer.invoke("is-dev"),
  setAutoLaunch: (enabled) => import_electron.ipcRenderer.invoke("set-auto-launch", enabled),
  getAutoLaunch: () => import_electron.ipcRenderer.invoke("get-auto-launch"),
  setMinimizeToTray: (enabled) => import_electron.ipcRenderer.send("set-minimize-to-tray", enabled)
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", api);
