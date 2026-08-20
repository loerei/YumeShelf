const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function build() {
    console.log('[BUILD-CONVERTER] Starting ModernSaveConverter build...');
    
    const csprojPath = path.resolve(__dirname, 'ModernSaveConverter', 'ModernSaveConverter.csproj');
    const binSourceDir = path.resolve(__dirname, 'ModernSaveConverter', 'bin', 'Release', 'net8.0');
    const destDir = path.resolve(__dirname, '..', '..', 'src', 'main', 'save-editor', 'bin');
    
    try {
        // Run dotnet build in Release mode
        console.log(`[BUILD-CONVERTER] Building project: ${csprojPath}`);
        execSync(`dotnet build "${csprojPath}" -c Release`, { stdio: 'inherit' });
        console.log('[BUILD-CONVERTER] dotnet build completed successfully.');
        
        // Ensure destination directory exists
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        // Copy build output to src/main/save-editor/bin
        const filesToCopy = [
            'ModernSaveConverter.dll',
            'ModernSaveConverter.deps.json',
            'ModernSaveConverter.runtimeconfig.json',
            'ModernSaveConverter.exe',
            'ModernSaveConverter',
            'ICSharpCode.Decompiler.dll',
            'System.Collections.Immutable.dll',
            'System.Reflection.Metadata.dll'
        ];
        
        console.log(`[BUILD-CONVERTER] Installing binaries to: ${destDir}`);
        for (const file of filesToCopy) {
            const srcFile = path.join(binSourceDir, file);
            const destFile = path.join(destDir, file);
            
            if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, destFile);
                if (process.platform !== 'win32') {
                    try {
                        fs.chmodSync(destFile, 0o755);
                    } catch {}
                }
                console.log(`- Copied ${file}`);
            }
        }
        
        console.log('[BUILD-CONVERTER] Installation complete!');
    } catch (err) {
        console.error('[BUILD-CONVERTER] Build failed:', err.message);
        process.exit(1);
    }
}

build();
