const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { TranslationService } = require('../dist/main/translation/translation-service');
const { profileToEngineType } = require('../dist/main/save-folder-resolver');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-trans-test-'));
}

/**
 * Builds a minimal valid PE executable with specified machine arch and imports.
 */
function createMinimalPeWithImports(options = {}) {
    const is64Bit = options.is64Bit !== undefined ? options.is64Bit : true;
    const imports = options.imports || []; // e.g. ['UnityPlayer.dll'] or ['GameAssembly.dll']

    const peOffset = 0x80;
    const optHeaderSize = is64Bit ? 240 : 224;
    const sectionTableOffset = peOffset + 24 + optHeaderSize;

    const idataRawOffset = 0x200;
    const idataRva = 0x2000;

    // Build .idata payload
    const idataBuf = Buffer.alloc(2048);
    let idataPos = 0;

    if (imports.length > 0) {
        // IMAGE_IMPORT_DESCRIPTOR array (20 bytes each, plus 20 zero bytes terminator)
        const numDescriptors = imports.length;
        const descriptorsSize = (numDescriptors + 1) * 20;

        let curStringOffset = descriptorsSize + numDescriptors * 16; // after descriptors and ILT/IAT
        let curThunkOffset = descriptorsSize;

        for (let i = 0; i < imports.length; i++) {
            const dllName = imports[i];
            const descOffset = i * 20;
            const iltRva = idataRva + curThunkOffset;
            const nameRva = idataRva + curStringOffset;

            // OriginalFirstThunk (ILT)
            idataBuf.writeUInt32LE(iltRva, descOffset);
            // TimeDateStamp
            idataBuf.writeUInt32LE(0, descOffset + 4);
            // ForwarderChain
            idataBuf.writeUInt32LE(0, descOffset + 8);
            // Name RVA
            idataBuf.writeUInt32LE(nameRva, descOffset + 12);
            // FirstThunk (IAT)
            idataBuf.writeUInt32LE(iltRva, descOffset + 16);

            // Write DLL name string
            idataBuf.write(dllName + '\0', curStringOffset, 'utf8');
            curStringOffset += dllName.length + 1;

            // Write 1 mock thunk + 1 null terminator thunk
            if (is64Bit) {
                idataBuf.writeBigUInt64LE(0x8000000000000001n, curThunkOffset); // Ordinal import
                idataBuf.writeBigUInt64LE(0n, curThunkOffset + 8);
                curThunkOffset += 16;
            } else {
                idataBuf.writeUInt32LE(0x80000001, curThunkOffset);
                idataBuf.writeUInt32LE(0, curThunkOffset + 4);
                curThunkOffset += 8;
            }
        }
        idataPos = Math.max(curStringOffset, curThunkOffset);
    }

    const idataSize = Math.max(512, (idataPos + 511) & ~511);
    const fullPe = Buffer.alloc(idataRawOffset + idataSize);

    // DOS Header
    fullPe.writeUInt16LE(0x5a4d, 0); // MZ
    fullPe.writeUInt32LE(peOffset, 0x3c); // e_lfanew

    // PE Signature
    fullPe.writeUInt32LE(0x00004550, peOffset); // PE\0\0

    // COFF Header
    fullPe.writeUInt16LE(is64Bit ? 0x8664 : 0x014c, peOffset + 4); // Machine (0x8664 = x64, 0x014c = x86)
    fullPe.writeUInt16LE(1, peOffset + 6); // NumberOfSections = 1
    fullPe.writeUInt32LE(0, peOffset + 8);
    fullPe.writeUInt32LE(0, peOffset + 12);
    fullPe.writeUInt32LE(0, peOffset + 16);
    fullPe.writeUInt16LE(optHeaderSize, peOffset + 20); // SizeOfOptionalHeader
    fullPe.writeUInt16LE(0x0002, peOffset + 22); // Characteristics

    // Optional Header
    const optOffset = peOffset + 24;
    fullPe.writeUInt16LE(is64Bit ? 0x20b : 0x10b, optOffset); // Magic PE32+ / PE32

    // numberOfRvaAndSizes (16)
    if (is64Bit) {
        fullPe.writeUInt32LE(16, optOffset + 108);
    } else {
        fullPe.writeUInt32LE(16, optOffset + 92);
    }

    // Data Directory (Imports is directory index 1)
    const importDirOffset = optOffset + (is64Bit ? 112 : 96) + 1 * 8;
    if (imports.length > 0) {
        fullPe.writeUInt32LE(idataRva, importDirOffset); // Import Directory RVA
        fullPe.writeUInt32LE((imports.length + 1) * 20, importDirOffset + 4); // Import Directory Size
    }

    // Section Table Header (.idata)
    fullPe.write('.idata\0\0', sectionTableOffset, 'utf8');
    fullPe.writeUInt32LE(idataSize, sectionTableOffset + 8); // VirtualSize
    fullPe.writeUInt32LE(idataRva, sectionTableOffset + 12); // VirtualAddress
    fullPe.writeUInt32LE(idataSize, sectionTableOffset + 16); // SizeOfRawData
    fullPe.writeUInt32LE(idataRawOffset, sectionTableOffset + 20); // PointerToRawData
    fullPe.writeUInt32LE(0xc0000040, sectionTableOffset + 36); // Characteristics

    // Copy .idata section content
    idataBuf.copy(fullPe, idataRawOffset);

    return fullPe;
}

test('TranslationService - Engine Detection via YumeEngine.inspectExecutable', async (t) => {
    let tempDir;

    t.beforeEach(async () => {
        tempDir = await makeTempDir();
    });

    t.afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
    });

    await t.test('detectEngineSupport correctly identifies Unity games (Mono and IL2CPP)', async () => {
        const service = new TranslationService({
            translatorsDir: tempDir,
            appVersion: '1.0.0',
            broadcastStatus: () => {}
        });

        // 1. Unity Mono x64
        const monoExePath = path.join(tempDir, 'UnityMonoGame.exe');
        const monoPe = createMinimalPeWithImports({ is64Bit: true, imports: ['UnityPlayer.dll'] });
        await fs.writeFile(monoExePath, monoPe);

        const monoSupport = await service.detectEngineSupport(monoExePath);
        assert.equal(monoSupport, 'unity');

        // 2. Unity IL2CPP x86
        const il2cppExePath = path.join(tempDir, 'UnityIl2CppGame.exe');
        const il2cppPe = createMinimalPeWithImports({ is64Bit: false, imports: ['GameAssembly.dll'] });
        await fs.writeFile(il2cppExePath, il2cppPe);

        const il2cppSupport = await service.detectEngineSupport(il2cppExePath);
        assert.equal(il2cppSupport, 'unity');
    });

    await t.test('detectEngineSupport correctly identifies RPG Maker games', async () => {
        const service = new TranslationService({
            translatorsDir: tempDir,
            appVersion: '1.0.0',
            broadcastStatus: () => {}
        });

        // 1. RPG Maker VX Ace (RGSS301.dll import)
        const rgssExePath = path.join(tempDir, 'Game_VXAce.exe');
        const rgssPe = createMinimalPeWithImports({ is64Bit: false, imports: ['RGSS301.dll'] });
        await fs.writeFile(rgssExePath, rgssPe);

        const rgssSupport = await service.detectEngineSupport(rgssExePath);
        assert.equal(rgssSupport, 'rpg-maker');

        // 2. RPG Maker MZ / MV (NW.js with System.json / js markers)
        const mzDir = path.join(tempDir, 'MZGame');
        await fs.mkdir(path.join(mzDir, 'js'), { recursive: true });
        await fs.writeFile(path.join(mzDir, 'js', 'rmmz_core.js'), '// mock rmmz_core');
        const mzExePath = path.join(mzDir, 'Game.exe');
        const mzPe = createMinimalPeWithImports({ is64Bit: true, imports: ['nw.dll'] });
        await fs.writeFile(mzExePath, mzPe);

        const mzSupport = await service.detectEngineSupport(mzExePath);
        assert.equal(mzSupport, 'rpg-maker');
    });

    await t.test('detectEngineSupport returns null for non-supported binaries', async () => {
        const service = new TranslationService({
            translatorsDir: tempDir,
            appVersion: '1.0.0',
            broadcastStatus: () => {}
        });

        const nativeExePath = path.join(tempDir, 'NativeWin32.exe');
        const nativePe = createMinimalPeWithImports({ is64Bit: true, imports: ['user32.dll', 'kernel32.dll'] });
        await fs.writeFile(nativeExePath, nativePe);

        const support = await service.detectEngineSupport(nativeExePath);
        assert.equal(support, null);
    });

    await t.test('detectUnityType returns accurate architecture and variant', async () => {
        const service = new TranslationService({
            translatorsDir: tempDir,
            appVersion: '1.0.0',
            broadcastStatus: () => {}
        });

        // 64-bit Unity Mono
        const monoExePath = path.join(tempDir, 'Unity64.exe');
        await fs.writeFile(monoExePath, createMinimalPeWithImports({ is64Bit: true, imports: ['UnityPlayer.dll'] }));
        const monoRes = await service.detectUnityType(monoExePath);
        assert.deepEqual(monoRes, { type: 'mono', arch: 'x64' });

        // 32-bit Unity IL2CPP
        const il2cppExePath = path.join(tempDir, 'Unity32.exe');
        await fs.writeFile(il2cppExePath, createMinimalPeWithImports({ is64Bit: false, imports: ['GameAssembly.dll'] }));
        const il2cppRes = await service.detectUnityType(il2cppExePath);
        assert.deepEqual(il2cppRes, { type: 'il2cpp', arch: 'x86' });

        // Non-Unity
        const otherExePath = path.join(tempDir, 'Other.exe');
        await fs.writeFile(otherExePath, createMinimalPeWithImports({ is64Bit: true, imports: ['kernel32.dll'] }));
        const otherRes = await service.detectUnityType(otherExePath);
        assert.equal(otherRes, null);
    });
});

test('profileToEngineType maps GameEngineProfile to GameEngineType correctly', () => {
    assert.equal(profileToEngineType({ family: 'unity', variant: 'mono', arch: 'x64', tag: 'Unity', runtime: 'mono', saveStrategy: 'custom', detectedBy: 'test' }), 'unity');
    assert.equal(profileToEngineType({ family: 'rpg-maker', variant: 'mv', arch: 'x64', tag: 'RPGM', runtime: 'nwjs', saveStrategy: 'rpg-maker-mv-mz', detectedBy: 'test' }), 'rpg-mv-mz');
    assert.equal(profileToEngineType({ family: 'rpg-maker', variant: 'vx-ace', arch: 'x86', tag: 'RPGM', runtime: 'native', saveStrategy: 'rpg-maker-rgss', detectedBy: 'test' }), 'rpg-vxace');
    assert.equal(profileToEngineType({ family: 'renpy', variant: 'standard', arch: 'x64', tag: "Ren'Py", runtime: 'python', saveStrategy: 'renpy-pickle', detectedBy: 'test' }), 'renpy');
    assert.equal(profileToEngineType({ family: 'wolf-rpg', variant: 'standard', arch: 'x86', tag: 'Wolf RPG', runtime: 'native', saveStrategy: 'wolf-sav', detectedBy: 'test' }), 'wolf-rpg');
    assert.equal(profileToEngineType({ family: 'unreal', variant: 'ue4-ue5', arch: 'x64', tag: 'Unreal Engine', runtime: 'native', saveStrategy: 'unreal-sav', detectedBy: 'test' }), 'unreal');
    assert.equal(profileToEngineType({ family: 'godot', variant: 'standard', arch: 'x64', tag: 'Godot', runtime: 'native', saveStrategy: 'godot', detectedBy: 'test' }), 'godot');
    assert.equal(profileToEngineType({ family: 'flash', variant: 'swf', arch: 'x86', tag: 'Flash', runtime: 'flash', saveStrategy: 'custom', detectedBy: 'test' }), 'flash');
    assert.equal(profileToEngineType({ family: 'gamemaker', variant: 'studio', arch: 'x86', tag: 'Others', runtime: 'native', saveStrategy: 'gamemaker-appdata', detectedBy: 'test' }), 'gamemaker');
    assert.equal(profileToEngineType({ family: 'tyranobuilder', variant: 'standard', arch: 'x64', tag: 'Others', runtime: 'nwjs', saveStrategy: 'custom', detectedBy: 'test' }), 'tyranobuilder');
    assert.equal(profileToEngineType({ family: 'native', variant: 'standard', arch: 'x64', tag: 'Others', runtime: 'native', saveStrategy: 'unknown', detectedBy: 'test' }), null);
    assert.equal(profileToEngineType(null), null);
});
