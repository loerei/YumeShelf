/// <reference types="node" />
/**
 * Headless XML Info.plist Parser (@yumeshelf/engine)
 *
 * Implements an in-memory XML property list parser conforming to Apple's standard plist DTD.
 * Provides defense against XXE, entity expansion DoS bombs, buffer exhaustion (5 MB),
 * and prototype pollution.
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

export interface XmlPlistParserOptions {
  /**
   * If true, dictionaries are created using Object.create(null).
   * Defaults to false (plain objects with dangerous prototype keys stripped).
   */
  nullProto?: boolean;
}

const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_RECURSION_DEPTH = 64;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface TagInfo {
  type: 'open' | 'close';
  name: string;
  selfClosing: boolean;
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&([^;]+);/g, (_match, entity) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        // Decode numeric character references: &#dddd; or &#xhhhh;
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const codePoint = parseInt(entity.slice(2), 16);
          if (!isNaN(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
            return String.fromCodePoint(codePoint);
          }
        } else if (entity.startsWith('#')) {
          const codePoint = parseInt(entity.slice(1), 10);
          if (!isNaN(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
            return String.fromCodePoint(codePoint);
          }
        }
        throw new Error(`Prohibited or unrecognized XML entity: &${entity};`);
    }
  });
}

export class XmlPlistParser {
  private readonly text: string;
  private readonly options?: XmlPlistParserOptions;
  private pos: number = 0;
  private depth: number = 0;

  constructor(text: string, options?: XmlPlistParserOptions) {
    this.text = text;
    this.options = options;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      const code = this.text.charCodeAt(this.pos);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  private skipIgnored(): void {
    while (this.pos < this.text.length) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) {
        break;
      }

      // XML Comments <!-- ... -->
      if (this.text.startsWith('<!--', this.pos)) {
        const end = this.text.indexOf('-->', this.pos + 4);
        if (end === -1) {
          throw new Error('Unterminated XML comment');
        }
        this.pos = end + 3;
        continue;
      }

      // Processing instructions <? ... ?>
      if (this.text.startsWith('<?', this.pos)) {
        const end = this.text.indexOf('?>', this.pos + 2);
        if (end === -1) {
          throw new Error('Unterminated XML processing instruction');
        }
        this.pos = end + 2;
        continue;
      }

      // DOCTYPE declaration <!DOCTYPE ... >
      if (
        this.text.startsWith('<!DOCTYPE', this.pos) ||
        this.text.startsWith('<!doctype', this.pos)
      ) {
        let p = this.pos + 9;
        let inSubset = false;
        let inQuote: string | null = null;
        while (p < this.text.length) {
          const char = this.text[p];
          if (inQuote) {
            if (char === inQuote) {
              inQuote = null;
            }
          } else if (char === '"' || char === "'") {
            inQuote = char;
          } else if (char === '[') {
            inSubset = true;
          } else if (char === ']') {
            inSubset = false;
          } else if (char === '>' && !inSubset) {
            p++;
            break;
          }
          p++;
        }
        if (p > this.text.length && this.text[p - 1] !== '>') {
          throw new Error('Unterminated DOCTYPE declaration');
        }
        this.pos = p;
        continue;
      }

      break;
    }
  }

  private readTag(): TagInfo {
    if (this.text[this.pos] !== '<') {
      throw new Error(
        `Unexpected character '${this.text[this.pos]}' at position ${this.pos}, expected '<'`
      );
    }

    if (this.text[this.pos + 1] === '/') {
      // Closing tag
      this.pos += 2;
      const closeEnd = this.text.indexOf('>', this.pos);
      if (closeEnd === -1) {
        throw new Error('Unterminated closing tag');
      }
      const name = this.text.slice(this.pos, closeEnd).trim().toLowerCase();
      this.pos = closeEnd + 1;
      return { type: 'close', name, selfClosing: false };
    }

    // Opening or self-closing tag
    this.pos += 1;
    let inQuote: string | null = null;
    let end = this.pos;
    while (end < this.text.length) {
      const char = this.text[end];
      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        }
      } else if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === '>') {
        break;
      }
      end++;
    }

    if (end >= this.text.length) {
      throw new Error('Unterminated XML tag');
    }

    const rawTag = this.text.slice(this.pos, end).trim();
    this.pos = end + 1;

    let selfClosing = false;
    let tagContent = rawTag;
    if (tagContent.endsWith('/')) {
      selfClosing = true;
      tagContent = tagContent.slice(0, -1).trim();
    }

    const spaceIdx = tagContent.search(/\s/);
    const name = (spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx)).toLowerCase();
    if (!name) {
      throw new Error('Invalid empty tag name');
    }

    return { type: 'open', name, selfClosing };
  }

  private expectCloseTag(expectedTagName: string): void {
    this.skipIgnored();
    if (this.pos >= this.text.length) {
      throw new Error(`Unexpected end of input, expected closing </${expectedTagName}>`);
    }
    const tag = this.readTag();
    if (tag.type !== 'close' || tag.name !== expectedTagName) {
      throw new Error(`Expected closing </${expectedTagName}>, found </${tag.name}>`);
    }
  }

  private readTextUntilCloseTag(expectedTagName: string): string {
    let result = '';
    while (this.pos < this.text.length) {
      // CDATA block <![CDATA[ ... ]]>
      if (this.text.startsWith('<![CDATA[', this.pos)) {
        const cdataStart = this.pos + 9;
        const cdataEnd = this.text.indexOf(']]>', cdataStart);
        if (cdataEnd === -1) {
          throw new Error('Unterminated CDATA block');
        }
        result += this.text.slice(cdataStart, cdataEnd);
        this.pos = cdataEnd + 3;
        continue;
      }

      // XML comments <!-- ... -->
      if (this.text.startsWith('<!--', this.pos)) {
        const commentEnd = this.text.indexOf('-->', this.pos + 4);
        if (commentEnd === -1) {
          throw new Error('Unterminated XML comment');
        }
        this.pos = commentEnd + 3;
        continue;
      }

      // Closing tag </... >
      if (this.text.startsWith('</', this.pos)) {
        const tag = this.readTag();
        if (tag.type !== 'close' || tag.name !== expectedTagName) {
          throw new Error(`Expected closing </${expectedTagName}>, found </${tag.name}>`);
        }
        return result;
      }

      // Opening tag is not permitted inside primitive text node
      if (this.text[this.pos] === '<') {
        throw new Error(`Unexpected opening tag inside <${expectedTagName}>`);
      }

      const nextLt = this.text.indexOf('<', this.pos);
      const chunk =
        nextLt === -1 ? this.text.slice(this.pos) : this.text.slice(this.pos, nextLt);
      result += decodeXmlEntities(chunk);
      this.pos = nextLt === -1 ? this.text.length : nextLt;
    }

    throw new Error(`Unexpected end of input, expected closing </${expectedTagName}>`);
  }

  private parseInteger(): number | bigint {
    const raw = this.readTextUntilCloseTag('integer').trim();
    if (!raw) {
      return 0;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid integer value: "${raw}"`);
    }
    if (/^-?\d+$/.test(raw)) {
      const n = Number(raw);
      if (n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) {
        return n;
      }
      try {
        return BigInt(raw);
      } catch {
        return n;
      }
    }
    return num;
  }

  private parseReal(): number {
    const raw = this.readTextUntilCloseTag('real').trim();
    if (!raw) {
      return 0;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) {
      throw new Error(`Invalid real value: "${raw}"`);
    }
    return num;
  }

  private parseDate(): Date {
    const raw = this.readTextUntilCloseTag('date').trim();
    if (!raw) {
      throw new Error('Empty <date> value is invalid');
    }
    const date = new Date(raw);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date string in <date>: "${raw}"`);
    }
    return date;
  }

  private parseData(): Buffer {
    const raw = this.readTextUntilCloseTag('data');
    const cleaned = raw.replace(/\s+/g, '');
    return Buffer.from(cleaned, 'base64');
  }

  private parseArray(selfClosing: boolean): any[] {
    if (selfClosing) {
      return [];
    }

    if (this.depth >= MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth of ${MAX_RECURSION_DEPTH} exceeded`);
    }

    this.depth++;
    const arr: any[] = [];

    while (true) {
      this.skipIgnored();
      if (this.pos >= this.text.length) {
        throw new Error('Unexpected end of input inside <array>');
      }

      if (this.text.startsWith('</', this.pos)) {
        const closeTag = this.readTag();
        if (closeTag.type !== 'close' || closeTag.name !== 'array') {
          throw new Error(`Expected closing </array>, found </${closeTag.name}>`);
        }
        this.depth--;
        return arr;
      }

      const val = this.parseValue();
      arr.push(val);
    }
  }

  private parseDict(selfClosing: boolean): Record<string, any> {
    if (selfClosing) {
      return this.options?.nullProto ? Object.create(null) : {};
    }

    if (this.depth >= MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth of ${MAX_RECURSION_DEPTH} exceeded`);
    }

    this.depth++;
    const dict: Record<string, any> = this.options?.nullProto ? Object.create(null) : {};

    while (true) {
      this.skipIgnored();
      if (this.pos >= this.text.length) {
        throw new Error('Unexpected end of input inside <dict>');
      }

      if (this.text.startsWith('</', this.pos)) {
        const closeTag = this.readTag();
        if (closeTag.type !== 'close' || closeTag.name !== 'dict') {
          throw new Error(`Expected closing </dict>, found </${closeTag.name}>`);
        }
        this.depth--;
        return dict;
      }

      if (this.text[this.pos] !== '<') {
        throw new Error(
          `Unexpected character '${this.text[this.pos]}' inside <dict>, expected <key>`
        );
      }

      const keyTag = this.readTag();
      if (keyTag.type !== 'open' || keyTag.name !== 'key') {
        throw new Error(`Expected <key> tag inside <dict>, found <${keyTag.name}>`);
      }
      if (keyTag.selfClosing) {
        throw new Error('Empty self-closing <key/> tag inside <dict> is invalid');
      }

      const key = this.readTextUntilCloseTag('key');

      this.skipIgnored();
      if (this.pos >= this.text.length) {
        throw new Error(`Missing value for key "${key}" at end of input inside <dict>`);
      }
      if (this.text.startsWith('</', this.pos)) {
        throw new Error(`Missing value for key "${key}" before closing tag inside <dict>`);
      }

      const val = this.parseValue();

      // Prototype pollution defense: strip unsafe keys
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }

      dict[key] = val;
    }
  }

  private parseValue(): any {
    this.skipIgnored();
    if (this.pos >= this.text.length) {
      throw new Error('Unexpected end of input, expected plist value');
    }
    if (this.text[this.pos] !== '<') {
      throw new Error(
        `Unexpected character '${this.text[this.pos]}' at position ${this.pos}, expected tag`
      );
    }

    const tag = this.readTag();
    if (tag.type !== 'open') {
      throw new Error(`Unexpected closing tag </${tag.name}> where value was expected`);
    }

    switch (tag.name) {
      case 'string':
        return tag.selfClosing ? '' : this.readTextUntilCloseTag('string');
      case 'integer':
        if (tag.selfClosing) {
          return 0;
        }
        return this.parseInteger();
      case 'real':
        if (tag.selfClosing) {
          return 0;
        }
        return this.parseReal();
      case 'true':
        if (!tag.selfClosing) {
          this.expectCloseTag('true');
        }
        return true;
      case 'false':
        if (!tag.selfClosing) {
          this.expectCloseTag('false');
        }
        return false;
      case 'date':
        if (tag.selfClosing) {
          throw new Error('Empty <date/> tag is invalid');
        }
        return this.parseDate();
      case 'data':
        if (tag.selfClosing) {
          return Buffer.alloc(0);
        }
        return this.parseData();
      case 'array':
        return this.parseArray(tag.selfClosing);
      case 'dict':
        return this.parseDict(tag.selfClosing);
      default:
        throw new Error(`Unrecognized plist tag: <${tag.name}>`);
    }
  }

  public parse(): any {
    this.skipIgnored();
    if (this.pos >= this.text.length) {
      throw new Error('Empty XML plist content');
    }

    const tag = this.readTag();
    if (tag.type !== 'open') {
      throw new Error(`Unexpected closing tag </${tag.name}> at root`);
    }

    let result: any;
    if (tag.name === 'plist') {
      if (tag.selfClosing) {
        result = null;
      } else {
        this.skipIgnored();
        if (this.pos < this.text.length && this.text.startsWith('</', this.pos)) {
          const closeTag = this.readTag();
          if (closeTag.type !== 'close' || closeTag.name !== 'plist') {
            throw new Error(`Expected closing </plist>, found </${closeTag.name}>`);
          }
          result = null;
        } else {
          result = this.parseValue();
          this.skipIgnored();
          this.expectCloseTag('plist');
        }
      }
    } else {
      // Direct root value without <plist> wrapper
      switch (tag.name) {
        case 'dict':
          result = this.parseDict(tag.selfClosing);
          break;
        case 'array':
          result = this.parseArray(tag.selfClosing);
          break;
        case 'string':
          result = tag.selfClosing ? '' : this.readTextUntilCloseTag('string');
          break;
        case 'integer':
          result = tag.selfClosing ? 0 : this.parseInteger();
          break;
        case 'real':
          result = tag.selfClosing ? 0 : this.parseReal();
          break;
        case 'true':
          if (!tag.selfClosing) {
            this.expectCloseTag('true');
          }
          result = true;
          break;
        case 'false':
          if (!tag.selfClosing) {
            this.expectCloseTag('false');
          }
          result = false;
          break;
        case 'date':
          if (tag.selfClosing) {
            throw new Error('Empty <date/> tag is invalid');
          }
          result = this.parseDate();
          break;
        case 'data':
          result = tag.selfClosing ? Buffer.alloc(0) : this.parseData();
          break;
        default:
          throw new Error(`Unrecognized root tag: <${tag.name}>`);
      }
    }

    this.skipIgnored();
    if (this.pos < this.text.length) {
      throw new Error(
        `Unexpected trailing content at position ${this.pos}: "${this.text.slice(this.pos, this.pos + 30)}"`
      );
    }

    return result;
  }
}

/**
 * Headless XML Info.plist Parser
 *
 * @param xmlString Raw XML string of property list
 * @param options Optional parser configurations
 * @returns Parsed JavaScript object, array, or primitive
 */
export function parseXmlPlist(xmlString: string, options?: XmlPlistParserOptions): any {
  if (typeof xmlString !== 'string') {
    throw new TypeError('Expected xmlString to be a string');
  }

  const byteLength = Buffer.byteLength(xmlString, 'utf8');
  if (byteLength > MAX_BUFFER_SIZE) {
    throw new Error(`XML plist exceeds maximum supported size of 5 MB (${byteLength} bytes)`);
  }

  if (xmlString.trim().length === 0) {
    throw new Error('Empty XML plist string');
  }

  // Strip leading UTF-8 Byte Order Mark (\uFEFF)
  let cleanXml = xmlString;
  if (cleanXml.charCodeAt(0) === 0xfeff) {
    cleanXml = cleanXml.slice(1);
  }

  // Prohibit external DTD loading and external entity expansion (<!ENTITY ...>)
  if (/<!entity/i.test(cleanXml)) {
    throw new Error('Entity expansion and external DTDs are prohibited');
  }

  const parser = new XmlPlistParser(cleanXml, options);
  return parser.parse();
}
