/**
 * Synthetic PE Binary Builder
 * Generates valid minimal in-memory PE32 / PE32+ header buffers, Section Tables,
 * Import Tables, and Resource Directory trees for test fixtures.
 */

export interface SyntheticPEImport {
  dllName: string;
  functions?: string[];
}

export interface SyntheticPESection {
  name: string;
  virtualSize: number;
  data: Buffer;
  characteristics?: number;
}

export interface SyntheticPEOptions {
  arch?: 'x86' | 'x64';
  sections?: SyntheticPESection[];
  imports?: SyntheticPEImport[];
  versionInfo?: Record<string, string>;
  subsystem?: number;
  characteristics?: number;
}

export class SyntheticPEBuilder {
  private arch: 'x86' | 'x64' = 'x64';
  private sections: SyntheticPESection[] = [];
  private imports: SyntheticPEImport[] = [];
  private versionInfo: Record<string, string> | null = null;
  private subsystem: number = 2; // IMAGE_SUBSYSTEM_WINDOWS_GUI
  private characteristics: number = 0x0022; // EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  constructor(options?: SyntheticPEOptions) {
    if (options) {
      if (options.arch) this.arch = options.arch;
      if (options.sections) this.sections = [...options.sections];
      if (options.imports) this.imports = [...options.imports];
      if (options.versionInfo) this.versionInfo = { ...options.versionInfo };
      if (options.subsystem !== undefined) this.subsystem = options.subsystem;
      if (options.characteristics !== undefined) this.characteristics = options.characteristics;
    }
  }

  public setArch(arch: 'x86' | 'x64'): this {
    this.arch = arch;
    return this;
  }

  public addSection(name: string, virtualSize: number, data?: Buffer, characteristics?: number): this {
    this.sections.push({
      name: name.padEnd(8, '\0').slice(0, 8),
      virtualSize,
      data: data ?? Buffer.alloc(virtualSize),
      characteristics: characteristics ?? 0x60000020, // CODE | EXECUTE | READ
    });
    return this;
  }

  public addImport(dllName: string, functions: string[] = []): this {
    this.imports.push({ dllName, functions });
    return this;
  }

  public setVersionInfo(info: Record<string, string>): this {
    this.versionInfo = { ...info };
    return this;
  }

  /**
   * Helper to write a UTF-16LE string with null terminator and 4-byte padding alignment.
   */
  private static encodeUtf16LE(str: string): Buffer {
    return Buffer.from(str + '\0', 'utf16le');
  }

  private static align4(offset: number): number {
    return (offset + 3) & ~3;
  }

  private static align(val: number, alignment: number): number {
    return (val + alignment - 1) & ~(alignment - 1);
  }

  /**
   * Builds a VS_VERSIONINFO binary structure from key-value pairs.
   */
  public static buildVersionInfoBuffer(
    stringInfo: Record<string, string>,
    langId: string = '040904B0'
  ): Buffer {
    // Construct individual String entries
    const stringBuffers: Buffer[] = [];
    for (const [key, value] of Object.entries(stringInfo)) {
      const keyBuf = SyntheticPEBuilder.encodeUtf16LE(key);
      const valBuf = SyntheticPEBuilder.encodeUtf16LE(value);

      // Structure:
      // wLength: uint16
      // wValueLength: uint16 (characters in value including null)
      // wType: uint16 (1 = text)
      // szKey: UTF-16LE
      // [padding to 4-byte boundary]
      // Value: UTF-16LE
      const headerPartSize = 6 + keyBuf.length;
      const paddedHeaderPartSize = SyntheticPEBuilder.align4(headerPartSize);
      const totalLen = paddedHeaderPartSize + valBuf.length;
      const paddedTotalLen = SyntheticPEBuilder.align4(totalLen);

      const strEntryBuf = Buffer.alloc(paddedTotalLen);
      strEntryBuf.writeUInt16LE(totalLen, 0);
      strEntryBuf.writeUInt16LE(valBuf.length / 2, 2); // character count
      strEntryBuf.writeUInt16LE(1, 4); // text type
      keyBuf.copy(strEntryBuf, 6);
      valBuf.copy(strEntryBuf, paddedHeaderPartSize);

      stringBuffers.push(strEntryBuf);
    }

    const stringTableChildren = Buffer.concat(stringBuffers);

    // StringTable structure
    const stKeyBuf = SyntheticPEBuilder.encodeUtf16LE(langId);
    const stHeaderPart = 6 + stKeyBuf.length;
    const stPaddedHeader = SyntheticPEBuilder.align4(stHeaderPart);
    const stTotalLen = stPaddedHeader + stringTableChildren.length;
    const stPaddedTotal = SyntheticPEBuilder.align4(stTotalLen);

    const stBuf = Buffer.alloc(stPaddedTotal);
    stBuf.writeUInt16LE(stTotalLen, 0);
    stBuf.writeUInt16LE(0, 2); // wValueLength for StringTable is 0
    stBuf.writeUInt16LE(1, 4); // wType = 1
    stKeyBuf.copy(stBuf, 6);
    stringTableChildren.copy(stBuf, stPaddedHeader);

    // StringFileInfo structure
    const sfiKeyBuf = SyntheticPEBuilder.encodeUtf16LE('StringFileInfo');
    const sfiHeaderPart = 6 + sfiKeyBuf.length;
    const sfiPaddedHeader = SyntheticPEBuilder.align4(sfiHeaderPart);
    const sfiTotalLen = sfiPaddedHeader + stBuf.length;
    const sfiPaddedTotal = SyntheticPEBuilder.align4(sfiTotalLen);

    const sfiBuf = Buffer.alloc(sfiPaddedTotal);
    sfiBuf.writeUInt16LE(sfiTotalLen, 0);
    sfiBuf.writeUInt16LE(0, 2); // wValueLength is 0
    sfiBuf.writeUInt16LE(1, 4); // wType = 1
    sfiKeyBuf.copy(sfiBuf, 6);
    stBuf.copy(sfiBuf, sfiPaddedHeader);

    // VS_FIXEDFILEINFO (52 bytes)
    const ffiBuf = Buffer.alloc(52);
    ffiBuf.writeUInt32LE(0xFEEF04BD, 0); // dwSignature
    ffiBuf.writeUInt32LE(0x00010000, 4); // dwStrucVersion
    ffiBuf.writeUInt32LE(0x00010000, 8); // dwFileVersionMS
    ffiBuf.writeUInt32LE(0x00000000, 12); // dwFileVersionLS
    ffiBuf.writeUInt32LE(0x00010000, 16); // dwProductVersionMS
    ffiBuf.writeUInt32LE(0x00000000, 20); // dwProductVersionLS
    ffiBuf.writeUInt32LE(0x0000003F, 24); // dwFileFlagsMask
    ffiBuf.writeUInt32LE(0x00000000, 28); // dwFileFlags
    ffiBuf.writeUInt32LE(0x00000004, 32); // dwFileOS (VOS_NT_WINDOWS32)
    ffiBuf.writeUInt32LE(0x00000001, 36); // dwFileType (VFT_APP)
    ffiBuf.writeUInt32LE(0x00000000, 40); // dwFileSubtype

    // Root VS_VERSION_INFO
    const rootKeyBuf = SyntheticPEBuilder.encodeUtf16LE('VS_VERSION_INFO');
    const rootHeaderPart = 6 + rootKeyBuf.length;
    const rootPaddedHeader = SyntheticPEBuilder.align4(rootHeaderPart);
    const rootTotalLen = rootPaddedHeader + ffiBuf.length + sfiBuf.length;
    const rootPaddedTotal = SyntheticPEBuilder.align4(rootTotalLen);

    const rootBuf = Buffer.alloc(rootPaddedTotal);
    rootBuf.writeUInt16LE(rootTotalLen, 0);
    rootBuf.writeUInt16LE(ffiBuf.length, 2); // wValueLength = sizeof(VS_FIXEDFILEINFO)
    rootBuf.writeUInt16LE(0, 4); // wType = 0 (binary)
    rootKeyBuf.copy(rootBuf, 6);
    ffiBuf.copy(rootBuf, rootPaddedHeader);
    sfiBuf.copy(rootBuf, rootPaddedHeader + ffiBuf.length);

    return rootBuf;
  }

  /**
   * Constructs the full in-memory PE buffer.
   */
  public build(): Buffer {
    const is64 = this.arch === 'x64';
    const fileAlignment = 0x200;
    const sectionAlignment = 0x1000;

    // We'll organize sections:
    // If user provided custom sections, start with those.
    // If imports present, we'll append/generate an .rdata section for Import Table.
    // If versionInfo present, we'll append/generate an .rsrc section for Resource Table.

    const generatedSections: Array<{
      name: string;
      rawBuffer: Buffer;
      virtualSize: number;
      characteristics: number;
      isImport?: boolean;
      isResource?: boolean;
    }> = [];

    // Add user sections
    for (const sec of this.sections) {
      generatedSections.push({
        name: sec.name,
        rawBuffer: sec.data,
        virtualSize: Math.max(sec.virtualSize, sec.data.length),
        characteristics: sec.characteristics ?? 0x60000020,
      });
    }

    if (generatedSections.length === 0 && this.imports.length === 0 && !this.versionInfo) {
      // Default minimal .text section
      const dummyCode = Buffer.alloc(0x200, 0x90); // NOPs
      generatedSections.push({
        name: '.text\0\0\0',
        rawBuffer: dummyCode,
        virtualSize: 0x1000,
        characteristics: 0x60000020,
      });
    }

    // Build Import Directory payload if needed
    let importDirectoryRVA = 0;
    let importDirectorySize = 0;

    if (this.imports.length > 0) {
      // We will place import table into .rdata section
      // Calculate layout:
      // Section Base RVA will be assigned after placing preceding sections.
      // Layout inside section:
      // [IMAGE_IMPORT_DESCRIPTOR array: (count + 1) * 20 bytes]
      // [Thunk Tables (OriginalFirstThunk & FirstThunk arrays)]
      // [DLL Name strings + Hint/Name entries]
      const numDescriptors = this.imports.length + 1; // null terminated
      const descTableSize = numDescriptors * 20;

      // Temporary offset tracker inside import section data
      let currentOffset = descTableSize;
      const thunkPtrSize = is64 ? 8 : 4;

      const descriptorData: Array<{
        dllNameOffset: number;
        originalThunkOffset: number;
        firstThunkOffset: number;
      }> = [];

      // Pre-calculate positions
      for (const imp of this.imports) {
        const numThunks = (imp.functions && imp.functions.length > 0 ? imp.functions.length : 1) + 1;
        const thunkTableSize = numThunks * thunkPtrSize;

        const origThunkOff = currentOffset;
        currentOffset += thunkTableSize;

        const firstThunkOff = currentOffset;
        currentOffset += thunkTableSize;

        descriptorData.push({
          dllNameOffset: 0, // will assign next
          originalThunkOffset: origThunkOff,
          firstThunkOffset: firstThunkOff,
        });
      }

      // Assign strings and hints
      const stringsAndHints: Array<{ offset: number; buf: Buffer }> = [];
      for (let i = 0; i < this.imports.length; i++) {
        const imp = this.imports[i];
        const dllNameBuf = Buffer.from(imp.dllName + '\0', 'ascii');
        descriptorData[i].dllNameOffset = currentOffset;
        stringsAndHints.push({ offset: currentOffset, buf: dllNameBuf });
        currentOffset += dllNameBuf.length;
        if (currentOffset % 2 !== 0) currentOffset++; // word align hints

        const funcs = imp.functions && imp.functions.length > 0 ? imp.functions : ['DummyExport'];
        // For each function, create IMAGE_IMPORT_BY_NAME [Hint uint16, Name ascii\0]
        for (const fn of funcs) {
          const hintNameBuf = Buffer.alloc(2 + fn.length + 1);
          hintNameBuf.writeUInt16LE(0, 0); // hint = 0
          hintNameBuf.write(fn + '\0', 2, 'ascii');
          stringsAndHints.push({ offset: currentOffset, buf: hintNameBuf });
          currentOffset += hintNameBuf.length;
          if (currentOffset % 2 !== 0) currentOffset++;
        }
      }

      const totalImportSectionRawSize = SyntheticPEBuilder.align(currentOffset, fileAlignment);
      const importSectionBuf = Buffer.alloc(totalImportSectionRawSize);

      generatedSections.push({
        name: '.rdata\0\0',
        rawBuffer: importSectionBuf,
        virtualSize: SyntheticPEBuilder.align(currentOffset, sectionAlignment),
        characteristics: 0x40000040, // INITIALIZED_DATA | READ
        isImport: true,
      });
    }

    // Build Resource Directory payload if needed
    let resourceDirectoryRVA = 0;
    let resourceDirectorySize = 0;

    if (this.versionInfo) {
      const vinfoBuf = SyntheticPEBuilder.buildVersionInfoBuffer(this.versionInfo);

      // We will build a 3-level resource tree:
      // Root (IMAGE_RESOURCE_DIRECTORY + 1 Entry for RT_VERSION = 16)
      // Level 2 (IMAGE_RESOURCE_DIRECTORY + 1 Entry for Name/ID = 1)
      // Level 3 (IMAGE_RESOURCE_DIRECTORY + 1 Entry for Language = 1033 / 0x0409)
      // Leaf: IMAGE_RESOURCE_DATA_ENTRY (16 bytes: OffsetToData RVA, Size, CodePage, Reserved)
      // Followed by raw vinfoBuf

      // Size calculation:
      // Root dir: 16 bytes header + 8 bytes entry = 24 bytes (offset 0)
      // L2 dir:   16 bytes header + 8 bytes entry = 24 bytes (offset 24)
      // L3 dir:   16 bytes header + 8 bytes entry = 24 bytes (offset 48)
      // Data entry: 16 bytes (offset 72)
      // Raw data: offset 88
      const headerSize = 88;
      const totalRsrcSize = SyntheticPEBuilder.align(headerSize + vinfoBuf.length, fileAlignment);
      const rsrcBuf = Buffer.alloc(totalRsrcSize);

      // Root Directory at offset 0
      rsrcBuf.writeUInt32LE(0, 0); // Characteristics & TimeDateStamp
      rsrcBuf.writeUInt16LE(0, 12); // NumberOfNamedEntries
      rsrcBuf.writeUInt16LE(1, 14); // NumberOfIdEntries = 1
      // Root Entry 0 (Type 16 = RT_VERSION)
      rsrcBuf.writeUInt32LE(16, 16); // Integer ID: 16 (RT_VERSION)
      rsrcBuf.writeUInt32LE(0x80000018, 20); // High bit set (subdirectory) at offset 24 (0x18)

      // Level 2 Directory at offset 24 (0x18)
      rsrcBuf.writeUInt32LE(0, 24);
      rsrcBuf.writeUInt16LE(0, 36); // NumberOfNamedEntries
      rsrcBuf.writeUInt16LE(1, 38); // NumberOfIdEntries = 1
      // Level 2 Entry 0 (Resource ID 1)
      rsrcBuf.writeUInt32LE(1, 40); // Resource ID: 1
      rsrcBuf.writeUInt32LE(0x80000030, 44); // Subdirectory at offset 48 (0x30)

      // Level 3 Directory at offset 48 (0x30)
      rsrcBuf.writeUInt32LE(0, 48);
      rsrcBuf.writeUInt16LE(0, 60); // NumberOfNamedEntries
      rsrcBuf.writeUInt16LE(1, 62); // NumberOfIdEntries = 1
      // Level 3 Entry 0 (Language 1033 / 0x0409)
      rsrcBuf.writeUInt32LE(1033, 64); // Lang ID 1033
      rsrcBuf.writeUInt32LE(72, 68); // Leaf Data Entry at offset 72 (high bit 0)

      // Leaf Data Entry at offset 72
      // OffsetToData RVA will be filled once RVA of .rsrc section is known
      rsrcBuf.writeUInt32LE(0, 72); // placeholder OffsetToData RVA
      rsrcBuf.writeUInt32LE(vinfoBuf.length, 76); // Size
      rsrcBuf.writeUInt32LE(0, 80); // CodePage
      rsrcBuf.writeUInt32LE(0, 84); // Reserved

      // Copy version info bytes at offset 88
      vinfoBuf.copy(rsrcBuf, 88);

      generatedSections.push({
        name: '.rsrc\0\0\0',
        rawBuffer: rsrcBuf,
        virtualSize: SyntheticPEBuilder.align(headerSize + vinfoBuf.length, sectionAlignment),
        characteristics: 0x40000040, // INITIALIZED_DATA | READ
        isResource: true,
      });
    }

    // Now calculate section virtual RVAs and raw file offsets
    const dosHeaderSize = 64;
    const peHeaderOffset = 0x80; // Standard e_lfanew
    const coffHeaderSize = 20;
    const optHeaderSize = is64 ? 240 : 224;
    const numSections = generatedSections.length;
    const sectionHeadersSize = numSections * 40;

    const totalHeaderSize = SyntheticPEBuilder.align(
      peHeaderOffset + 4 + coffHeaderSize + optHeaderSize + sectionHeadersSize,
      fileAlignment
    );

    let currentRVA = SyntheticPEBuilder.align(totalHeaderSize, sectionAlignment);
    let currentRawOffset = totalHeaderSize;

    const finalSectionDescriptors: Array<{
      name: string;
      virtualSize: number;
      virtualAddress: number;
      rawSize: number;
      rawOffset: number;
      characteristics: number;
      rawBuffer: Buffer;
    }> = [];

    for (const sec of generatedSections) {
      const rawSize = SyntheticPEBuilder.align(sec.rawBuffer.length, fileAlignment);
      const virtSize = sec.virtualSize;
      const virtAddress = currentRVA;
      const rawOffset = currentRawOffset;

      if (sec.isImport) {
        importDirectoryRVA = virtAddress;
        importDirectorySize = sec.rawBuffer.length;

        // Fill in Import Table references using section's virtAddress
        const thunkPtrSize = is64 ? 8 : 4;
        let descOffset = 0;
        let runningThunkOffset = (this.imports.length + 1) * 20;

        for (let i = 0; i < this.imports.length; i++) {
          const imp = this.imports[i];
          const funcs = imp.functions && imp.functions.length > 0 ? imp.functions : ['DummyExport'];
          const numThunks = funcs.length + 1;
          const thunkTableBytes = numThunks * thunkPtrSize;

          const origThunkRVA = virtAddress + runningThunkOffset;
          runningThunkOffset += thunkTableBytes;

          const firstThunkRVA = virtAddress + runningThunkOffset;
          runningThunkOffset += thunkTableBytes;

          // DLL name and hints are placed after all thunk tables
          // Let's compute DLL name RVA
          // We can find where DLL name was placed in sec.rawBuffer
          // For simplicity in this layout, calculate exact RVAs:
          // Write IMAGE_IMPORT_DESCRIPTOR:
          // +0 OriginalFirstThunk (RVA)
          // +4 TimeDateStamp (0)
          // +8 ForwarderChain (0)
          // +12 Name (RVA)
          // +16 FirstThunk (RVA)
          sec.rawBuffer.writeUInt32LE(origThunkRVA, descOffset + 0);
          sec.rawBuffer.writeUInt32LE(0, descOffset + 4);
          sec.rawBuffer.writeUInt32LE(0, descOffset + 8);
          // Name RVA will be filled below
          sec.rawBuffer.writeUInt32LE(firstThunkRVA, descOffset + 16);

          descOffset += 20;
        }

        // Write null terminator descriptor (already 0-filled)

        // Write DLL names, hints and fill thunks
        let strOffset = runningThunkOffset;
        descOffset = 0;
        let thunkWalkOffset = (this.imports.length + 1) * 20;

        for (let i = 0; i < this.imports.length; i++) {
          const imp = this.imports[i];
          const dllNameRVA = virtAddress + strOffset;
          sec.rawBuffer.writeUInt32LE(dllNameRVA, descOffset + 12);
          const dllNameBuf = Buffer.from(imp.dllName + '\0', 'ascii');
          dllNameBuf.copy(sec.rawBuffer, strOffset);
          strOffset += dllNameBuf.length;
          if (strOffset % 2 !== 0) strOffset++;

          const funcs = imp.functions && imp.functions.length > 0 ? imp.functions : ['DummyExport'];
          const origThunkStart = thunkWalkOffset;
          thunkWalkOffset += (funcs.length + 1) * thunkPtrSize;
          const firstThunkStart = thunkWalkOffset;
          thunkWalkOffset += (funcs.length + 1) * thunkPtrSize;

          for (let f = 0; f < funcs.length; f++) {
            const fn = funcs[f];
            const hintNameRVA = virtAddress + strOffset;
            const hintBuf = Buffer.alloc(2 + fn.length + 1);
            hintBuf.writeUInt16LE(f, 0);
            hintBuf.write(fn + '\0', 2, 'ascii');
            hintBuf.copy(sec.rawBuffer, strOffset);
            strOffset += hintBuf.length;
            if (strOffset % 2 !== 0) strOffset++;

            if (is64) {
              sec.rawBuffer.writeBigUInt64LE(BigInt(hintNameRVA), origThunkStart + f * 8);
              sec.rawBuffer.writeBigUInt64LE(BigInt(hintNameRVA), firstThunkStart + f * 8);
            } else {
              sec.rawBuffer.writeUInt32LE(hintNameRVA, origThunkStart + f * 4);
              sec.rawBuffer.writeUInt32LE(hintNameRVA, firstThunkStart + f * 4);
            }
          }
          descOffset += 20;
        }
      }

      if (sec.isResource) {
        resourceDirectoryRVA = virtAddress;
        resourceDirectorySize = sec.rawBuffer.length;
        // Fix up leaf OffsetToData RVA at offset 72 inside .rsrc section
        const dataRVA = virtAddress + 88;
        sec.rawBuffer.writeUInt32LE(dataRVA, 72);
      }

      finalSectionDescriptors.push({
        name: sec.name,
        virtualSize: virtSize,
        virtualAddress: virtAddress,
        rawSize: rawSize,
        rawOffset: rawOffset,
        characteristics: sec.characteristics,
        rawBuffer: sec.rawBuffer,
      });

      currentRVA = SyntheticPEBuilder.align(currentRVA + virtSize, sectionAlignment);
      currentRawOffset += rawSize;
    }

    const totalFileSize = currentRawOffset;
    const outBuffer = Buffer.alloc(totalFileSize);

    // 1. DOS Header
    outBuffer.write('MZ', 0, 'ascii');
    outBuffer.writeUInt16LE(0x0090, 2); // e_cblp
    outBuffer.writeUInt16LE(0x0003, 4); // e_cp
    outBuffer.writeUInt16LE(0x0004, 8); // e_cparhdr
    outBuffer.writeUInt16LE(0xFFFF, 10); // e_maxalloc
    outBuffer.writeUInt16LE(0x0040, 14); // e_sp
    outBuffer.writeUInt16LE(0x00B8, 60); // e_lfarlc
    outBuffer.writeUInt32LE(peHeaderOffset, 0x3C); // e_lfanew

    // 2. NT Signature
    outBuffer.write('PE\0\0', peHeaderOffset, 'ascii');

    // 3. COFF File Header
    const coffOff = peHeaderOffset + 4;
    const machine = is64 ? 0x8664 : 0x014C;
    outBuffer.writeUInt16LE(machine, coffOff + 0);
    outBuffer.writeUInt16LE(numSections, coffOff + 2);
    outBuffer.writeUInt32LE(0x60000000, coffOff + 4); // TimeDateStamp
    outBuffer.writeUInt32LE(0, coffOff + 8); // PointerToSymbolTable
    outBuffer.writeUInt32LE(0, coffOff + 12); // NumberOfSymbols
    outBuffer.writeUInt16LE(optHeaderSize, coffOff + 16); // SizeOfOptionalHeader
    outBuffer.writeUInt16LE(this.characteristics, coffOff + 18); // Characteristics

    // 4. Optional Header
    const optOff = coffOff + coffHeaderSize;
    const magic = is64 ? 0x020B : 0x010B;
    outBuffer.writeUInt16LE(magic, optOff + 0);
    outBuffer.writeUInt8(14, optOff + 2); // MajorLinkerVersion
    outBuffer.writeUInt8(0, optOff + 3); // MinorLinkerVersion
    outBuffer.writeUInt32LE(0x1000, optOff + 4); // SizeOfCode
    outBuffer.writeUInt32LE(0x1000, optOff + 8); // SizeOfInitializedData
    outBuffer.writeUInt32LE(0, optOff + 12); // SizeOfUninitializedData
    outBuffer.writeUInt32LE(0x1000, optOff + 16); // AddressOfEntryPoint
    outBuffer.writeUInt32LE(0x1000, optOff + 20); // BaseOfCode

    let dataDirOffset = 0;
    if (is64) {
      outBuffer.writeBigUInt64LE(BigInt(0x140000000), optOff + 24); // ImageBase (64-bit)
      outBuffer.writeUInt32LE(sectionAlignment, optOff + 32);
      outBuffer.writeUInt32LE(fileAlignment, optOff + 36);
      outBuffer.writeUInt16LE(6, optOff + 40); // MajorOSVersion
      outBuffer.writeUInt16LE(0, optOff + 42); // MinorOSVersion
      outBuffer.writeUInt16LE(0, optOff + 44); // MajorImageVersion
      outBuffer.writeUInt16LE(0, optOff + 46); // MinorImageVersion
      outBuffer.writeUInt16LE(6, optOff + 48); // MajorSubsystemVersion
      outBuffer.writeUInt16LE(0, optOff + 50); // MinorSubsystemVersion
      outBuffer.writeUInt32LE(0, optOff + 52); // Win32VersionValue
      outBuffer.writeUInt32LE(currentRVA, optOff + 56); // SizeOfImage
      outBuffer.writeUInt32LE(totalHeaderSize, optOff + 60); // SizeOfHeaders
      outBuffer.writeUInt32LE(0, optOff + 64); // CheckSum
      outBuffer.writeUInt16LE(this.subsystem, optOff + 68); // Subsystem
      outBuffer.writeUInt16LE(0x8160, optOff + 70); // DllCharacteristics
      outBuffer.writeBigUInt64LE(BigInt(0x100000), optOff + 72); // SizeOfStackReserve
      outBuffer.writeBigUInt64LE(BigInt(0x1000), optOff + 80); // SizeOfStackCommit
      outBuffer.writeBigUInt64LE(BigInt(0x100000), optOff + 88); // SizeOfHeapReserve
      outBuffer.writeBigUInt64LE(BigInt(0x1000), optOff + 96); // SizeOfHeapCommit
      outBuffer.writeUInt32LE(0, optOff + 104); // LoaderFlags
      outBuffer.writeUInt32LE(16, optOff + 108); // NumberOfRvaAndSizes
      dataDirOffset = optOff + 112;
    } else {
      outBuffer.writeUInt32LE(0x1000, optOff + 24); // BaseOfData
      outBuffer.writeUInt32LE(0x00400000, optOff + 28); // ImageBase (32-bit)
      outBuffer.writeUInt32LE(sectionAlignment, optOff + 32);
      outBuffer.writeUInt32LE(fileAlignment, optOff + 36);
      outBuffer.writeUInt16LE(6, optOff + 40);
      outBuffer.writeUInt16LE(0, optOff + 42);
      outBuffer.writeUInt16LE(0, optOff + 44);
      outBuffer.writeUInt16LE(0, optOff + 46);
      outBuffer.writeUInt16LE(6, optOff + 48);
      outBuffer.writeUInt16LE(0, optOff + 50);
      outBuffer.writeUInt32LE(0, optOff + 52);
      outBuffer.writeUInt32LE(currentRVA, optOff + 56);
      outBuffer.writeUInt32LE(totalHeaderSize, optOff + 60);
      outBuffer.writeUInt32LE(0, optOff + 64);
      outBuffer.writeUInt16LE(this.subsystem, optOff + 68);
      outBuffer.writeUInt16LE(0x8160, optOff + 70);
      outBuffer.writeUInt32LE(0x100000, optOff + 72);
      outBuffer.writeUInt32LE(0x1000, optOff + 76);
      outBuffer.writeUInt32LE(0x100000, optOff + 80);
      outBuffer.writeUInt32LE(0x1000, optOff + 84);
      outBuffer.writeUInt32LE(0, optOff + 88);
      outBuffer.writeUInt32LE(16, optOff + 92);
      dataDirOffset = optOff + 96;
    }

    // Write Data Directories (16 entries: [RVA: uint32, Size: uint32])
    // Directory 1: Import Table
    outBuffer.writeUInt32LE(importDirectoryRVA, dataDirOffset + 1 * 8);
    outBuffer.writeUInt32LE(importDirectorySize, dataDirOffset + 1 * 8 + 4);

    // Directory 2: Resource Table
    outBuffer.writeUInt32LE(resourceDirectoryRVA, dataDirOffset + 2 * 8);
    outBuffer.writeUInt32LE(resourceDirectorySize, dataDirOffset + 2 * 8 + 4);

    // 5. Section Table
    const secTableOff = optOff + optHeaderSize;
    for (let i = 0; i < finalSectionDescriptors.length; i++) {
      const desc = finalSectionDescriptors[i];
      const entryOff = secTableOff + i * 40;

      outBuffer.write(desc.name, entryOff, 8, 'ascii');
      outBuffer.writeUInt32LE(desc.virtualSize, entryOff + 8);
      outBuffer.writeUInt32LE(desc.virtualAddress, entryOff + 12);
      outBuffer.writeUInt32LE(desc.rawSize, entryOff + 16);
      outBuffer.writeUInt32LE(desc.rawOffset, entryOff + 20);
      outBuffer.writeUInt32LE(0, entryOff + 24); // PointerToRelocations
      outBuffer.writeUInt32LE(0, entryOff + 28); // PointerToLinenumbers
      outBuffer.writeUInt16LE(0, entryOff + 32); // NumberOfRelocations
      outBuffer.writeUInt16LE(0, entryOff + 34); // NumberOfLinenumbers
      outBuffer.writeUInt32LE(desc.characteristics, entryOff + 36);

      // Copy raw section content to file offset
      desc.rawBuffer.copy(outBuffer, desc.rawOffset);
    }

    return outBuffer;
  }
}
