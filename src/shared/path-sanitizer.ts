const winUserDirRegex = /(?:[a-zA-Z]:(?:\\\\|\\|\/)(?:Users|Documents and Settings)(?:\\\\|\\|\/)[^\\\/":,;*?<>|\r\n]+)(?=(?:\\\\|\\|\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
const macUserDirRegex = /(?:\/Users\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
const linuxUserDirRegex = /(?:\/home\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/g;

export function sanitizeUserPaths(text: unknown): string {
  let str: string;
  if (typeof text === 'string') {
    str = text;
  } else if (text === null || text === undefined) {
    return '';
  } else {
    try {
      str = String(text);
    } catch {
      return '';
    }
  }
  return str
    .replace(winUserDirRegex, '<USER_DIR>')
    .replace(macUserDirRegex, '<USER_DIR>')
    .replace(linuxUserDirRegex, '<USER_DIR>');
}

export function sanitizeLoneSurrogates(input: string): string {
  return input.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD'
  );
}
