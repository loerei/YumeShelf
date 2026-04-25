const { app } = require('electron');

app.whenReady().then(async () => {
    try {
        const exe = 'D:\\\\Games\\\\H Games\\\\YumeShelf\\\\YumeShelf\\\\A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win\\\\A Simple Life with My Unobtrusive Sister v1.00 rev1-win\\\\Game.exe';
        const img = await app.getFileIcon(exe, { size: 'normal' });
        console.log('NORMAL', img.getSize());
        
        const imgLarge = await app.getFileIcon(exe, { size: 'large' });
        console.log('LARGE', imgLarge.getSize());
    } catch (e) {
        console.error(e);
    }
    app.quit();
});
