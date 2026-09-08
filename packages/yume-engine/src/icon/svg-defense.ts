/// <reference types="node" />

/**
 * Self-contained XML character entity decoder.
 * Handles decimal (&#dddd;), hexadecimal (&#xhhhh; / &#Xhhhh;), and predefined XML entities.
 * Decodes &amp; last to defeat double-decoding entity unmasking attacks.
 */
export function decodeXmlEntities(raw: string): string {
  if (typeof raw !== 'string') {
    return '';
  }
  try {
    return raw
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  } catch {
    return '';
  }
}

/**
 * Pure in-memory SVG active content validation.
 * Inspects SVG markup against 7 threat vector categories.
 */
export function validateSvgContent(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  const decoded = decodeXmlEntities(content);
  if (!decoded || decoded.includes('\0')) return false;

  // 1. Active element tags with optional XML namespace prefix and whitespace
  if (/<\s*([a-zA-Z0-9_-]+:)?(script|foreignobject|iframe|embed|object|animate|set)\b/i.test(decoded)) {
    return false;
  }

  // 2. Inline event handler attributes
  if (/\bon[a-z]+\s*=/i.test(decoded)) {
    return false;
  }

  // 3. JavaScript pseudo-protocol execution (including schemes with interleaved whitespace/control characters in attributes and CSS url(...))
  if (/\b(?:href|xlink:href|src)\s*=\s*["']?\s*j[\s\x00-\x1f]*a[\s\x00-\x1f]*v[\s\x00-\x1f]*a[\s\x00-\x1f]*s[\s\x00-\x1f]*c[\s\x00-\x1f]*r[\s\x00-\x1f]*i[\s\x00-\x1f]*p[\s\x00-\x1f]*t[\s\x00-\x1f]*:/i.test(decoded)) {
    return false;
  }
  if (/\burl\s*\(\s*["']?\s*j[\s\x00-\x1f]*a[\s\x00-\x1f]*v[\s\x00-\x1f]*a[\s\x00-\x1f]*s[\s\x00-\x1f]*c[\s\x00-\x1f]*r[\s\x00-\x1f]*i[\s\x00-\x1f]*p[\s\x00-\x1f]*t[\s\x00-\x1f]*:/i.test(decoded)) {
    return false;
  }

  // 4. XML base redirection (SSRF / IP tracking)
  if (/\bxml:base\s*=/i.test(decoded)) {
    return false;
  }

  // 5. External network, local file, and blob resource loading (LFI / SSRF defense)
  if (/\b(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:|file:|blob:|\/\/|\\\\)/i.test(decoded)) {
    return false;
  }
  if (/\burl\s*\(\s*["']?\s*(?:https?:|file:|blob:|\/\/|\\\\)/i.test(decoded)) {
    return false;
  }
  if (/@import\b/i.test(decoded)) {
    return false;
  }

  // 6. Scriptable data: URI schemes (exhaustive document-wide validation across attributes and CSS url(...), accounting for whitespace-fragmented scheme keywords)
  const dataUriRegex = /\b(?:href|xlink:href|src)\s*=\s*["']?\s*(d[\s\x00-\x1f]*a[\s\x00-\x1f]*t[\s\x00-\x1f]*a[\s\x00-\x1f]*:[^"'\s>]+)|\burl\s*\(\s*["']?\s*(d[\s\x00-\x1f]*a[\s\x00-\x1f]*t[\s\x00-\x1f]*a[\s\x00-\x1f]*:[^"')\s]+)/gi;
  let dataUriMatch: RegExpExecArray | null;
  while ((dataUriMatch = dataUriRegex.exec(decoded)) !== null) {
    const rawUri = dataUriMatch[1] || dataUriMatch[2];
    const uri = rawUri.replace(/^d[\s\x00-\x1f]*a[\s\x00-\x1f]*t[\s\x00-\x1f]*a[\s\x00-\x1f]*:/i, 'data:');
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(uri)) {
      return false;
    }
  }

  // 7. XML DOCTYPE and entity declarations
  if (/<!\s*(ENTITY|DOCTYPE)\b/i.test(decoded)) {
    return false;
  }

  return true;
}

/**
 * Validates an SVG Buffer against active content injection attacks.
 * Rejects buffers containing null bytes (0x00) or UTF-16 Byte Order Marks (BOM) prior to UTF-8 decoding.
 */
export function isSafeSvgBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  // Reject null bytes and UTF-16 Byte Order Marks (BOM) prior to UTF-8 decoding to prevent encoding evasion
  if (buffer.includes(0x00)) return false;
  if (
    buffer.length >= 2 &&
    ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))
  ) {
    return false;
  }
  try {
    const content = buffer.toString('utf8');
    return validateSvgContent(content);
  } catch {
    return false;
  }
}
