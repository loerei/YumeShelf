/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeXmlEntities,
  validateSvgContent,
  isSafeSvgBuffer,
} from '../dist/index.js';

describe('Active SVG Content Defense (@yumeshelf/engine)', () => {
  describe('decodeXmlEntities', () => {
    it('decodes decimal character entities correctly', () => {
      assert.strictEqual(decodeXmlEntities('&#106;&#97;&#118;&#97;'), 'java');
    });

    it('decodes hexadecimal character entities case-insensitively', () => {
      assert.strictEqual(decodeXmlEntities('&#x6a;&#x61;&#x76;&#x61;'), 'java');
      assert.strictEqual(decodeXmlEntities('&#X6A;&#X61;&#X76;&#X61;'), 'java');
      assert.strictEqual(decodeXmlEntities('&#x3c;script&#x3e;'), '<script>');
    });

    it('decodes predefined XML entities (&quot;, &apos;, &lt;, &gt;, &amp;)', () => {
      const raw = '&lt;svg attr=&quot;val&quot; note=&apos;quote&apos;&gt;&amp;copy;&lt;/svg&gt;';
      assert.strictEqual(decodeXmlEntities(raw), '<svg attr="val" note=\'quote\'>&copy;</svg>');
    });

    it('prevents double-decoding entity unmasking attacks by replacing &amp; last', () => {
      assert.strictEqual(decodeXmlEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
    });

    it('decodes entity-encoded null bytes into \\0 character', () => {
      assert.strictEqual(decodeXmlEntities('&#0;'), '\0');
      assert.strictEqual(decodeXmlEntities('&#x0;'), '\0');
      assert.strictEqual(decodeXmlEntities('&#x00;'), '\0');
      assert.strictEqual(decodeXmlEntities('test&#0;split'), 'test\0split');
    });

    it('suppresses exceptions gracefully on invalid inputs', () => {
      assert.strictEqual(decodeXmlEntities(null as any), '');
      assert.strictEqual(decodeXmlEntities(undefined as any), '');
      assert.strictEqual(decodeXmlEntities(123 as any), '');
    });
  });

  describe('validateSvgContent', () => {
    it('1. accepts benign safe SVGs with shapes, paths, and local fragment identifiers', () => {
      const safeSvg = `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="localGradient">
              <stop offset="0%" stop-color="#ff0000"/>
              <stop offset="100%" stop-color="#0000ff"/>
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="40" fill="url(#localGradient)" />
          <path d="M10 10 H 90 V 90 H 10 Z" fill="#00ff00"/>
          <a href="#localAnchor">Local Link</a>
        </svg>
      `;
      assert.strictEqual(validateSvgContent(safeSvg), true);
    });

    it('1b. accepts safe embedded raster images (png, jpeg, jpg, webp) in attributes and CSS url(...)', () => {
      const safeRasterSvg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" width="10" height="10"/>
          <image xlink:href="data:image/jpeg;base64,/9j/4AAQSkZJRg==" width="10" height="10"/>
          <image src="data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=" width="10" height="10"/>
          <style>
            .banner { background-image: url(data:image/jpg;base64,/9j/4AAQSkZJRg==); }
          </style>
        </svg>
      `;
      assert.strictEqual(validateSvgContent(safeRasterSvg), true);
    });

    it('2. rejects active element tags (<script>, <foreignObject>, <iframe>, <embed>, <object>, <animate>, <set>)', () => {
      assert.strictEqual(validateSvgContent('<svg><script>alert(1)</script></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><   script>alert(1)</script></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><SCRIPT>alert(1)</SCRIPT></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><foreignObject><body>evil</body></foreignObject></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><foreignobject>evil</foreignobject></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><iframe src="evil.html"></iframe></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><embed src="evil.swf"></embed></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><object data="evil.swf"></object></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><set attributeName="onmouseover" to="alert(1)"/></svg>'), false);
    });

    it('2b. rejects active element tags with XML namespace prefixes (<html:script>, <svg:script>, <s:set>)', () => {
      assert.strictEqual(validateSvgContent('<svg><html:script>alert(1)</html:script></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><svg:script>alert(1)</svg:script></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><s:set attributeName="x" to="y"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><custom-ns:animate/></svg>'), false);
    });

    it('3. rejects inline event handler attributes (onload, onerror, onclick, etc.)', () => {
      assert.strictEqual(validateSvgContent('<svg onload="alert(1)"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg ONLOAD="alert(1)"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg onerror = "alert(1)"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><circle onclick="alert(1)"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg onmouseover="fetch(\'http://evil.com\')"></svg>'), false);
    });

    it('4. rejects javascript: links in href, xlink:href, src, and CSS url(...)', () => {
      assert.strictEqual(validateSvgContent('<svg><a href="javascript:alert(1)">click</a></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><a xlink:href="javascript:alert(1)">click</a></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image src="javascript:alert(1)"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image href=\'javascript:alert(1)\'/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>circle { fill: url(javascript:alert(1)); }</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>circle { fill: url(\'javascript:alert(1)\'); }</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>circle { fill: url("javascript:alert(1)"); }</style></svg>'), false);
    });

    it('4b. rejects javascript: pseudo-protocol with interleaved whitespace and control characters', () => {
      assert.strictEqual(validateSvgContent('<svg><a href="j a v a s c r i p t :alert(1)">click</a></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><a href="j\ta\nva\rscript:alert(1)">click</a></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><a href="j\x01a\x08va\x1bscript:alert(1)">click</a></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(j a v a s c r i p t :alert(1)); }</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url("j\ta\nva\rscript:alert(1)"); }</style></svg>'), false);
    });

    it('5. rejects xml:base SSRF redirects', () => {
      assert.strictEqual(validateSvgContent('<svg xml:base="http://evil.com/"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg xml:base = "//evil.com/"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg XML:BASE="http://169.254.169.254/"></svg>'), false);
    });

    it('6. rejects external network, local file, blob, and UNC URLs in attributes and CSS url(...) / @import', () => {
      // http / https
      assert.strictEqual(validateSvgContent('<svg><image href="http://evil.com/pic.png"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image href="https://evil.com/pic.png"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(https://evil.com/pic.png); }</style></svg>'), false);

      // file:
      assert.strictEqual(validateSvgContent('<svg><image src="file:///etc/passwd"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(\'file:///C:/Windows/win.ini\'); }</style></svg>'), false);

      // blob:
      assert.strictEqual(validateSvgContent('<svg><image xlink:href="blob:https://evil.com/1234"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(blob:evil); }</style></svg>'), false);

      // Protocol-relative //
      assert.strictEqual(validateSvgContent('<svg><image href="//evil.com/pic.png"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(//evil.com/pic.png); }</style></svg>'), false);

      // UNC path \\
      assert.strictEqual(validateSvgContent('<svg><image href="\\\\evil.com\\share\\pic.png"/></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(\\\\evil.com\\share\\pic.png); }</style></svg>'), false);

      // @import
      assert.strictEqual(validateSvgContent('<svg><style>@import "styles.css";</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>@import url(http://evil.com/styles.css);</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>@IMPORT "evil.css";</style></svg>'), false);
    });

    it('7. rejects scriptable data: URIs (data:image/svg+xml, data:text/html) and validates all data: occurrences document-wide', () => {
      assert.strictEqual(validateSvgContent('<svg><image href="data:image/svg+xml;base64,PHN2Zz4=" /></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image src="data:text/html;base64,PHNjcmlwdD4=" /></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(data:image/svg+xml;utf8,<svg></svg>); }</style></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image href="data:application/javascript;base64,YWxlcnQoMSk=" /></svg>'), false);

      // Exhaustive multi-match: first is safe raster, second is malicious svg+xml
      const multiMatch = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" width="10" height="10"/>
          <image xlink:href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+" width="10" height="10"/>
        </svg>
      `;
      assert.strictEqual(validateSvgContent(multiMatch), false);
    });

    it('7b. rejects data: URIs with whitespace or control-character fragmentation in scheme keyword', () => {
      assert.strictEqual(validateSvgContent('<svg><image href="d a t a :image/svg+xml;base64,PHN2Zz4=" /></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image href="d\ta\nta:image/svg+xml" /></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><image href="d\x01a\x02t\x03a:text/html;base64,PHNjcmlwdD4=" /></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><style>rect { fill: url(d a t a :text/html;base64,xyz); }</style></svg>'), false);
    });

    it('8. rejects <!ENTITY and <!DOCTYPE declarations (XXE defense)', () => {
      assert.strictEqual(validateSvgContent('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg></svg>'), false);
      assert.strictEqual(validateSvgContent('<!  DOCTYPE svg SYSTEM "http://evil.com/xxe"><svg></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><!ENTITY xxe SYSTEM "file:///etc/passwd"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><!  ENTITY xxe SYSTEM "file:///etc/passwd"></svg>'), false);
    });

    it('9. prevents entity decoding evasion: decimal and hex-encoded payloads decoded and rejected', () => {
      // Decimal encoded javascript:
      const decimalJs = '<svg><a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">click</a></svg>';
      assert.strictEqual(validateSvgContent(decimalJs), false);

      // Hex encoded javascript:
      const hexJs = '<svg><a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3a;alert(1)">click</a></svg>';
      assert.strictEqual(validateSvgContent(hexJs), false);

      // Uppercase hex encoded javascript:
      const upperHexJs = '<svg><a href="&#X6A;&#X61;&#X76;&#X61;&#X73;&#X63;&#X72;&#X69;&#X70;&#X74;&#X3A;alert(1)">click</a></svg>';
      assert.strictEqual(validateSvgContent(upperHexJs), false);

      // Entity encoded <script> tag:
      const entityScript = '&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;';
      assert.strictEqual(validateSvgContent(entityScript), false);
    });

    it('12. rejects entity-encoded null-byte payloads (&#0;, &#x0;, &#x00;) defeating regex token-splitting evasion', () => {
      assert.strictEqual(validateSvgContent('<scr&#0;ipt>alert(1)</script>'), false);
      assert.strictEqual(validateSvgContent('<scr&#x0;ipt>alert(1)</script>'), false);
      assert.strictEqual(validateSvgContent('<scr&#x00;ipt>alert(1)</script>'), false);
      assert.strictEqual(validateSvgContent('<svg on&#0;load="alert(1)"></svg>'), false);
      assert.strictEqual(validateSvgContent('<svg><a href="java&#0;script:alert(1)">click</a></svg>'), false);
    });

    it('returns false for null, undefined, empty, or non-string inputs', () => {
      assert.strictEqual(validateSvgContent(''), false);
      assert.strictEqual(validateSvgContent(null as any), false);
      assert.strictEqual(validateSvgContent(undefined as any), false);
      assert.strictEqual(validateSvgContent(123 as any), false);
      assert.strictEqual(validateSvgContent({} as any), false);
    });
  });

  describe('isSafeSvgBuffer', () => {
    it('returns false for empty, null, or undefined buffers', () => {
      assert.strictEqual(isSafeSvgBuffer(Buffer.alloc(0)), false);
      assert.strictEqual(isSafeSvgBuffer(null as any), false);
      assert.strictEqual(isSafeSvgBuffer(undefined as any), false);
    });

    it('10. rejects buffers containing null bytes (0x00) prior to UTF-8 decoding', () => {
      const bufferWithNull = Buffer.from('<svg><circle r="10"/></svg>\0');
      assert.strictEqual(isSafeSvgBuffer(bufferWithNull), false);

      const nullSplitBuffer = Buffer.from('<scr\0ipt>alert(1)</script>');
      assert.strictEqual(isSafeSvgBuffer(nullSplitBuffer), false);
    });

    it('10b. rejects buffers starting with UTF-16 Little-Endian or Big-Endian BOM', () => {
      // UTF-16LE BOM: 0xFF, 0xFE
      const utf16leBom = Buffer.from([0xff, 0xfe, 0x3c, 0x00, 0x73, 0x00, 0x76, 0x00, 0x67, 0x00]);
      assert.strictEqual(isSafeSvgBuffer(utf16leBom), false);

      // UTF-16BE BOM: 0xFE, 0xFF
      const utf16beBom = Buffer.from([0xfe, 0xff, 0x00, 0x3c, 0x00, 0x73, 0x00, 0x76, 0x00, 0x67]);
      assert.strictEqual(isSafeSvgBuffer(utf16beBom), false);
    });

    it('accepts safe SVG buffers and rejects malicious SVG buffers', () => {
      const safeBuffer = Buffer.from('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>', 'utf8');
      assert.strictEqual(isSafeSvgBuffer(safeBuffer), true);

      const scriptBuffer = Buffer.from('<svg><script>alert(1)</script></svg>', 'utf8');
      assert.strictEqual(isSafeSvgBuffer(scriptBuffer), false);
    });
  });
});
