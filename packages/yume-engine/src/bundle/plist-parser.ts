/// <reference types="node" />
/**
 * Unified Property List Parser Facade (@yumeshelf/engine)
 *
 * Automatically detects binary property list (bplist00) vs XML property list
 * and dispatches to the appropriate parser.
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

import { BPlistParser, type BPlistParseOptions } from './bplist-parser.js';
import { parseXmlPlist, type XmlPlistParserOptions } from './xml-plist-parser.js';

export interface PlistParseOptions extends BPlistParseOptions, XmlPlistParserOptions {}

export class PlistParser {
  /**
   * Parses an arbitrary property list (binary bplist00 or XML) into JavaScript data structures.
   *
   * @param input Raw content as string, Buffer, or Uint8Array
   * @param options Parser configuration options
   * @returns Deserialized property list root value
   */
  public static parse(input: string | Buffer | Uint8Array, options?: PlistParseOptions): any {
    return parsePlist(input, options);
  }
}

/**
 * Parses an arbitrary property list (binary bplist00 or XML) into JavaScript data structures.
 *
 * @param input Raw content as string, Buffer, or Uint8Array
 * @param options Parser configuration options
 * @returns Deserialized property list root value
 */
export function parsePlist(
  input: string | Buffer | Uint8Array,
  options?: PlistParseOptions
): any {
  if (input === null || input === undefined) {
    throw new TypeError('Expected property list input to be a string, Buffer, or Uint8Array');
  }

  if (typeof input === 'string') {
    if (input.startsWith('bplist00')) {
      const buf = Buffer.from(input, 'binary');
      return BPlistParser.parse(buf, options);
    }
    return parseXmlPlist(input, options);
  }

  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  if (buf.length >= 8 && buf.subarray(0, 8).toString('ascii') === 'bplist00') {
    return BPlistParser.parse(buf, options);
  }

  // Not binary plist magic, treat as UTF-8 XML plist
  const xmlString = buf.toString('utf8');
  return parseXmlPlist(xmlString, options);
}
