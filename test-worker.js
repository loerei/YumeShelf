const { app } = require('electron');
const { Worker } = require('worker_threads');

app.whenReady().then(() => {
    const worker = new Worker(`
        const ext = require('extract-file-icon');
        const exe = 'D:\\\\Games\\\\H Games\\\\YumeShelf\\\\YumeShelf\\\\A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win\\\\A Simple Life with My Unobtrusive Sister v1.00 rev1-win\\\\Game.exe';
        const buf = ext(exe, 256);
        require('worker_threads').parentPort.postMessage(buf.length);
    `, {eval: true});
    
    worker.on('message', m => {
        console.log('WORKER_SUCCESS', m);
        app.quit();
    });
    
    worker.on('error', e => {
        console.error('WORKER_FAIL', e);
        app.quit();
    });
});
