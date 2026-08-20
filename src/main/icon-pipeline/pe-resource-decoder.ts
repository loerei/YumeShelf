import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';

export interface ExtractedPeIcon {
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
    isPng: boolean;
}

export interface PeVersionMetadata {
    productName?: string;
    fileDescription?: string;
    companyName?: string;
    fileVersion?: string;
    productVersion?: string;
    legalCopyright?: string;
}

interface SectionHeader {
    name: string;
    virtualSize: number;
    virtualAddress: number;
    sizeOfRawData: number;
    pointerToRawData: number;
}

interface ResourceDataEntry {
    offsetToData: number; // RVA
    size: number;
}

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const RT_VERSION = 16;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PeResourceDecoder {
    private readonly buffer: Buffer;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    static async fromFile(filePath: string): Promise<PeResourceDecoder | null> {
        try {
            const buf = await fs.readFile(filePath);
            return new PeResourceDecoder(buf);
        } catch {
            return null;
        }
    }

    static fromFileSync(filePath: string): PeResourceDecoder | null {
        try {
            const buf = fsSync.readFileSync(filePath);
            return new PeResourceDecoder(buf);
        } catch {
            return null;
        }
    }

    private parsePeHeaders(): {
        rvaToOffset: (rva: number) => number | null;
        resourceRva: number;
        resourceSize: number;
    } | null {
        const buf = this.buffer;
        if (!buf || buf.length < 64) return null;

        // 1. DOS Header ('MZ')
        if (buf.readUInt16LE(0) !== 0x5a4d) return null;

        const peOffset = buf.readUInt32LE(0x3c);
        if (peOffset + 24 > buf.length) return null;

        // 2. PE Signature ('PE\0\0')
        if (buf.readUInt32LE(peOffset) !== 0x00004550) return null;

        // 3. COFF File Header
        const numberOfSections = buf.readUInt16LE(peOffset + 6);
        const sizeOfOptionalHeader = buf.readUInt16LE(peOffset + 20);
        const optionalHeaderOffset = peOffset + 24;

        if (optionalHeaderOffset + sizeOfOptionalHeader > buf.length) return null;

        // 4. Optional Header Magic (0x10B = PE32, 0x20B = PE32+)
        const magic = buf.readUInt16LE(optionalHeaderOffset);
        let resourceDataDirOffset = 0;

        if (magic === 0x10b) {
            // PE32: DataDirectory starts at offset 96 in Optional Header
            if (sizeOfOptionalHeader < 120) return null;
            resourceDataDirOffset = optionalHeaderOffset + 96 + 2 * 8; // Entry 2 (Resource)
        } else if (magic === 0x20b) {
            // PE32+: DataDirectory starts at offset 112 in Optional Header
            if (sizeOfOptionalHeader < 136) return null;
            resourceDataDirOffset = optionalHeaderOffset + 112 + 2 * 8; // Entry 2 (Resource)
        } else {
            return null;
        }

        if (resourceDataDirOffset + 8 > buf.length) return null;

        const resourceRva = buf.readUInt32LE(resourceDataDirOffset);
        const resourceSize = buf.readUInt32LE(resourceDataDirOffset + 4);
        if (resourceRva === 0 || resourceSize === 0) return null;

        // 5. Section Table
        const sectionTableOffset = optionalHeaderOffset + sizeOfOptionalHeader;
        const sections: SectionHeader[] = [];

        for (let i = 0; i < numberOfSections; i++) {
            const secOffset = sectionTableOffset + i * 40;
            if (secOffset + 40 > buf.length) break;

            const name = buf.toString('utf8', secOffset, secOffset + 8).split('\0')[0];
            const virtualSize = buf.readUInt32LE(secOffset + 8);
            const virtualAddress = buf.readUInt32LE(secOffset + 12);
            const sizeOfRawData = buf.readUInt32LE(secOffset + 16);
            const pointerToRawData = buf.readUInt32LE(secOffset + 20);

            sections.push({ name, virtualSize, virtualAddress, sizeOfRawData, pointerToRawData });
        }

        const rvaToOffset = (rva: number): number | null => {
            for (const sec of sections) {
                const sectionSpan = Math.max(sec.virtualSize, sec.sizeOfRawData);
                if (rva >= sec.virtualAddress && rva < sec.virtualAddress + sectionSpan) {
                    const fileOffset = sec.pointerToRawData + (rva - sec.virtualAddress);
                    if (fileOffset < buf.length) return fileOffset;
                }
            }
            return null;
        };

        return { rvaToOffset, resourceRva, resourceSize };
    }

    private getResourceDataEntry(
        rsrcBaseOffset: number,
        typeId: number,
        nameOrIdFilter?: number
    ): { dataEntry: ResourceDataEntry; nameId: number } | null {
        const buf = this.buffer;

        // Level 1: Resource Type Directory
        const namedEntries = buf.readUInt16LE(rsrcBaseOffset + 12);
        const idEntries = buf.readUInt16LE(rsrcBaseOffset + 14);
        const totalEntries = namedEntries + idEntries;

        for (let i = 0; i < totalEntries; i++) {
            const entryOffset = rsrcBaseOffset + 16 + i * 8;
            if (entryOffset + 8 > buf.length) return null;

            const id = buf.readUInt32LE(entryOffset);
            const offsetToSubdir = buf.readUInt32LE(entryOffset + 4);

            if (id === typeId && (offsetToSubdir & 0x80000000)) {
                const level2Offset = rsrcBaseOffset + (offsetToSubdir & 0x7fffffff);
                if (level2Offset + 16 > buf.length) return null;

                // Level 2: Resource Name / ID Directory
                const l2Named = buf.readUInt16LE(level2Offset + 12);
                const l2Id = buf.readUInt16LE(level2Offset + 14);
                const l2Total = l2Named + l2Id;

                for (let j = 0; j < l2Total; j++) {
                    const l2EntryOffset = level2Offset + 16 + j * 8;
                    if (l2EntryOffset + 8 > buf.length) continue;

                    const l2IdVal = buf.readUInt32LE(l2EntryOffset);
                    const l2OffsetToSubdir = buf.readUInt32LE(l2EntryOffset + 4);

                    if (nameOrIdFilter !== undefined && l2IdVal !== nameOrIdFilter) {
                        continue;
                    }

                    if (l2OffsetToSubdir & 0x80000000) {
                        const level3Offset = rsrcBaseOffset + (l2OffsetToSubdir & 0x7fffffff);
                        if (level3Offset + 24 > buf.length) continue;

                        // Level 3: Language Directory -> Data Entry
                        const l3DataOffsetRef = buf.readUInt32LE(level3Offset + 16 + 4);
                        if (l3DataOffsetRef & 0x80000000) continue;

                        const dataEntryOffset = rsrcBaseOffset + l3DataOffsetRef;
                        if (dataEntryOffset + 16 > buf.length) continue;

                        const offsetToData = buf.readUInt32LE(dataEntryOffset);
                        const size = buf.readUInt32LE(dataEntryOffset + 4);

                        return { dataEntry: { offsetToData, size }, nameId: l2IdVal };
                    }
                }
            }
        }

        return null;
    }

    private getAllResourceDataEntries(
        rsrcBaseOffset: number,
        typeId: number
    ): Map<number, ResourceDataEntry> {
        const results = new Map<number, ResourceDataEntry>();
        const buf = this.buffer;

        const namedEntries = buf.readUInt16LE(rsrcBaseOffset + 12);
        const idEntries = buf.readUInt16LE(rsrcBaseOffset + 14);
        const totalEntries = namedEntries + idEntries;

        for (let i = 0; i < totalEntries; i++) {
            const entryOffset = rsrcBaseOffset + 16 + i * 8;
            if (entryOffset + 8 > buf.length) break;

            const id = buf.readUInt32LE(entryOffset);
            const offsetToSubdir = buf.readUInt32LE(entryOffset + 4);

            if (id === typeId && (offsetToSubdir & 0x80000000)) {
                const level2Offset = rsrcBaseOffset + (offsetToSubdir & 0x7fffffff);
                if (level2Offset + 16 > buf.length) break;

                const l2Named = buf.readUInt16LE(level2Offset + 12);
                const l2Id = buf.readUInt16LE(level2Offset + 14);
                const l2Total = l2Named + l2Id;

                for (let j = 0; j < l2Total; j++) {
                    const l2EntryOffset = level2Offset + 16 + j * 8;
                    if (l2EntryOffset + 8 > buf.length) continue;

                    const l2IdVal = buf.readUInt32LE(l2EntryOffset);
                    const l2OffsetToSubdir = buf.readUInt32LE(l2EntryOffset + 4);

                    if (l2OffsetToSubdir & 0x80000000) {
                        const level3Offset = rsrcBaseOffset + (l2OffsetToSubdir & 0x7fffffff);
                        if (level3Offset + 24 > buf.length) continue;

                        const l3DataOffsetRef = buf.readUInt32LE(level3Offset + 16 + 4);
                        if (l3DataOffsetRef & 0x80000000) continue;

                        const dataEntryOffset = rsrcBaseOffset + l3DataOffsetRef;
                        if (dataEntryOffset + 16 > buf.length) continue;

                        const offsetToData = buf.readUInt32LE(dataEntryOffset);
                        const size = buf.readUInt32LE(dataEntryOffset + 4);

                        results.set(l2IdVal, { offsetToData, size });
                    }
                }
            }
        }

        return results;
    }

    extractIcon(): ExtractedPeIcon | null {
        try {
            const pe = this.parsePeHeaders();
            if (!pe) return null;

            const rsrcBaseOffset = pe.rvaToOffset(pe.resourceRva);
            if (rsrcBaseOffset === null || rsrcBaseOffset + 16 > this.buffer.length) return null;

            // 1. Locate RT_GROUP_ICON (Type 14)
            const groupIconResult = this.getResourceDataEntry(rsrcBaseOffset, RT_GROUP_ICON);
            if (!groupIconResult) return null;

            const groupDataOffset = pe.rvaToOffset(groupIconResult.dataEntry.offsetToData);
            if (groupDataOffset === null) return null;

            const groupData = this.buffer.subarray(
                groupDataOffset,
                groupDataOffset + groupIconResult.dataEntry.size
            );
            if (groupData.length < 6) return null;

            const idType = groupData.readUInt16LE(2);
            const idCount = groupData.readUInt16LE(4);
            if (idType !== 1 || idCount === 0) return null;

            // 2. Fetch all RT_ICON entries (Type 3)
            const iconEntries = this.getAllResourceDataEntries(rsrcBaseOffset, RT_ICON);
            if (iconEntries.size === 0) return null;

            // 3. Parse GRPICONDIRENTRY array and score each frame
            interface CandidateFrame {
                width: number;
                height: number;
                bitCount: number;
                nID: number;
                bytesInRes: number;
                score: number;
                isPng: boolean;
                rawFrameBuffer: Buffer;
            }

            const candidates: CandidateFrame[] = [];

            for (let i = 0; i < idCount; i++) {
                const entryOffset = 6 + i * 14;
                if (entryOffset + 14 > groupData.length) break;

                const bWidth = groupData.readUInt8(entryOffset);
                const bHeight = groupData.readUInt8(entryOffset + 1);
                // Skip unused bytes: bColorCount (1), bReserved (1), wPlanes (2)
                const wBitCount = groupData.readUInt16LE(entryOffset + 6);
                const dwBytesInRes = groupData.readUInt32LE(entryOffset + 8);
                const nID = groupData.readUInt16LE(entryOffset + 12);

                const iconDataEntry = iconEntries.get(nID);
                if (!iconDataEntry) continue;

                const iconRawOffset = pe.rvaToOffset(iconDataEntry.offsetToData);
                if (iconRawOffset === null) continue;

                const iconRawData = this.buffer.subarray(
                    iconRawOffset,
                    iconRawOffset + Math.min(dwBytesInRes, iconDataEntry.size)
                );
                if (iconRawData.length < 8) continue;

                const isPng =
                    iconRawData.length >= 8 &&
                    iconRawData.subarray(0, 8).equals(PNG_MAGIC);

                let width = bWidth === 0 ? 256 : bWidth;
                let height = bHeight === 0 ? 256 : bHeight;

                if (isPng && iconRawData.length >= 24) {
                    width = iconRawData.readUInt32BE(16);
                    height = iconRawData.readUInt32BE(20);
                }

                const bitCount = wBitCount || (isPng ? 32 : 8);
                const score = width * height * (bitCount >= 24 ? 2 : 1) + (isPng ? 100000 : 0);

                candidates.push({
                    width,
                    height,
                    bitCount,
                    nID,
                    bytesInRes: dwBytesInRes,
                    score,
                    isPng,
                    rawFrameBuffer: iconRawData
                });
            }

            if (candidates.length === 0) return null;

            // Sort by score descending (prefer 256px PNG > 256px DIB > 128px > 48px > 32px > 16px)
            candidates.sort((a, b) => b.score - a.score);
            const best = candidates[0];

            if (best.isPng) {
                return {
                    buffer: best.rawFrameBuffer,
                    mimeType: 'image/png',
                    width: best.width,
                    height: best.height,
                    isPng: true
                };
            }

            // For DIB frames, synthesize standard Windows .ico file structure
            // ICONDIR (6 bytes) + 1 ICONDIRENTRY (16 bytes) + DIB Buffer
            const icoHeader = Buffer.alloc(22);
            icoHeader.writeUInt16LE(0, 0); // Reserved (0)
            icoHeader.writeUInt16LE(1, 2); // Type (1 for ICO)
            icoHeader.writeUInt16LE(1, 4); // Count (1 frame)

            icoHeader.writeUInt8(best.width >= 256 ? 0 : best.width, 6);
            icoHeader.writeUInt8(best.height >= 256 ? 0 : best.height, 7);
            icoHeader.writeUInt8(0, 8); // Color count
            icoHeader.writeUInt8(0, 9); // Reserved
            icoHeader.writeUInt16LE(1, 10); // Planes
            icoHeader.writeUInt16LE(best.bitCount, 12); // Bit count
            icoHeader.writeUInt32LE(best.rawFrameBuffer.length, 14); // Bytes in res
            icoHeader.writeUInt32LE(22, 18); // Image offset (header length = 22)

            const synthesizedIco = Buffer.concat([icoHeader, best.rawFrameBuffer]);
            return {
                buffer: synthesizedIco,
                mimeType: 'image/x-icon',
                width: best.width,
                height: best.height,
                isPng: false
            };
        } catch (error) {
            console.error('[PE-RESOURCE-DECODER] Icon extraction failed:', error);
            return null;
        }
    }

    extractMetadata(): PeVersionMetadata | null {
        try {
            const pe = this.parsePeHeaders();
            if (!pe) return null;

            const rsrcBaseOffset = pe.rvaToOffset(pe.resourceRva);
            if (rsrcBaseOffset === null || rsrcBaseOffset + 16 > this.buffer.length) return null;

            const versionResult = this.getResourceDataEntry(rsrcBaseOffset, RT_VERSION);
            if (!versionResult) return null;

            const versionDataOffset = pe.rvaToOffset(versionResult.dataEntry.offsetToData);
            if (versionDataOffset === null) return null;

            const versionBuffer = this.buffer.subarray(
                versionDataOffset,
                versionDataOffset + versionResult.dataEntry.size
            );
            if (versionBuffer.length < 32) return null;

            const metadata: PeVersionMetadata = {};
            const keyNameMap: Record<string, keyof PeVersionMetadata> = {
                ProductName: 'productName',
                FileDescription: 'fileDescription',
                CompanyName: 'companyName',
                FileVersion: 'fileVersion',
                ProductVersion: 'productVersion',
                LegalCopyright: 'legalCopyright'
            };

            for (const [winKey, prop] of Object.entries(keyNameMap)) {
                const val = this.extractStringFileInfoValue(versionBuffer, winKey);
                if (val) {
                    metadata[prop] = val;
                }
            }

            return Object.keys(metadata).length > 0 ? metadata : null;
        } catch (error) {
            console.error('[PE-RESOURCE-DECODER] Metadata extraction failed:', error);
            return null;
        }
    }

    private extractStringFileInfoValue(versionBuf: Buffer, key: string): string | null {
        const keyU16 = Buffer.from(key + '\0', 'utf16le');
        const keyIdx = versionBuf.indexOf(keyU16);
        if (keyIdx === -1) return null;

        // In String struct:
        // uint16 wLength
        // uint16 wValueLength (length in 16-bit words)
        // uint16 wType (1 = text)
        // szKey (UTF-16LE null terminated)
        // Padding to 32-bit boundary
        // Value (UTF-16LE null terminated)
        if (keyIdx < 6) return null;

        const structStart = keyIdx - 6;
        const wValueLength = versionBuf.readUInt16LE(structStart + 2); // Number of UTF-16 characters
        if (wValueLength === 0) return null;

        const keyEnd = keyIdx + keyU16.length;
        // Align to 4-byte (32-bit) boundary
        const valueStart = (keyEnd + 3) & ~3;
        const valueBytes = wValueLength * 2;

        if (valueStart + valueBytes > versionBuf.length) return null;

        const rawStr = versionBuf.toString('utf16le', valueStart, valueStart + valueBytes);
        return rawStr.split('\0')[0].trim() || null;
    }
}

export function extractPeIcon(bufferOrPath: Buffer | string): ExtractedPeIcon | null {
    if (typeof bufferOrPath === 'string') {
        const decoder = PeResourceDecoder.fromFileSync(bufferOrPath);
        return decoder ? decoder.extractIcon() : null;
    }
    const decoder = new PeResourceDecoder(bufferOrPath);
    return decoder.extractIcon();
}

export function extractPeMetadata(bufferOrPath: Buffer | string): PeVersionMetadata | null {
    if (typeof bufferOrPath === 'string') {
        const decoder = PeResourceDecoder.fromFileSync(bufferOrPath);
        return decoder ? decoder.extractMetadata() : null;
    }
    const decoder = new PeResourceDecoder(bufferOrPath);
    return decoder.extractMetadata();
}
