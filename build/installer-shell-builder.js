module.exports = {
  productName: 'YumeShelf Installer Shell',
  appId: 'com.loerei.yumeshelf.installer-shell',
  publish: null,
  directories: {
    output: 'build/installer-shell-dist'
  },
  files: [
    'src/installer-shell/**/*',
    { from: 'dist/shared', to: 'src/shared' },
    'src/styles/theme.css',
    'src/locales/builtins/*.json',
    'language-packs/packs/*.json',
    'assets/yumeshelf_icon_highres_4096.png',
    'package.json'
  ],
  extraResources: [],
  extraMetadata: {
    main: 'src/installer-shell/main.js'
  },
  win: {
    target: ['portable'],
    icon: 'assets/yumeshelf_icon_highres_4096.png',
    artifactName: 'YumeShelfInstallerShell.${ext}'
  }
};
