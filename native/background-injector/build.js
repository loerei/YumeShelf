const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BUILD_DIR = path.join(__dirname, 'build');
const PAYLOAD_SRC = path.join(__dirname, 'payload.cpp');
const INJECTOR_SRC = path.join(__dirname, 'injector.cpp');

if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
}

const PAYLOAD_OUT = path.join(BUILD_DIR, 'payload.dll');
const INJECTOR_OUT = path.join(BUILD_DIR, 'injector.exe');

try {
    console.log('Compiling payload.dll...');
    execSync(`g++ -std=c++20 -shared -o "${PAYLOAD_OUT}" "${PAYLOAD_SRC}" -Wl,--kill-at`, { stdio: 'inherit' });

    console.log('Compiling injector.exe...');
    // We statically link standard libraries to avoid needing MinGW DLLs on the target system
    execSync(`g++ -std=c++20 -o "${INJECTOR_OUT}" "${INJECTOR_SRC}" -static-libgcc -static-libstdc++ -Wl,-Bstatic -lstdc++ -lpthread -Wl,-Bdynamic`, { stdio: 'inherit' });

    console.log('Build successful!');
} catch (e) {
    console.error('Build failed!', e.message);
    process.exit(1);
}
