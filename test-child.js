const { app } = require('electron');
const { spawn } = require('child_process');

app.whenReady().then(async () => {
    try {
        const exe = 'D:\\\\Games\\\\H Games\\\\YumeShelf\\\\YumeShelf\\\\A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win\\\\A Simple Life with My Unobtrusive Sister v1.00 rev1-win\\\\Game.exe';
        
        const b64 = await new Promise((resolve) => {
            const script = `try { const b = require('extract-file-icon')('${exe.replace(/\\/g, '\\\\')}', 256); console.log(b.toString('base64')); } catch(e) { console.log(''); }`;
            const cp = spawn(process.execPath, ['-e', script], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
            });
            let out = '';
            cp.stdout.on('data', d => out += d.toString());
            cp.on('close', () => resolve(out.trim()));
        });
        
        console.log('BASE64 LENGTH:', b64.length);
    } catch (e) {
        console.error(e);
    }
    app.quit();
});
