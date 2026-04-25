const { app } = require('electron');
app.whenReady().then(() => {
    try {
        const ext = require('extract-file-icon');
        const exe = 'D:\\Games\\H Games\\YumeShelf\\YumeShelf\\A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win\\A Simple Life with My Unobtrusive Sister v1.00 rev1-win\\Game.exe';
        const buf = ext(exe, 256);
        console.log('ELECTRON_SUCCESS', buf.length);
    } catch (e) {
        console.error('ELECTRON_FAIL:', e.message);
    }
    app.quit();
});
