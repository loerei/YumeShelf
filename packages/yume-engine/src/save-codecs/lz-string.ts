/**
 * LZString implementation for RPG Maker MV save files
 * Fully self-contained pure TypeScript module
 */

const f = String.fromCharCode;
const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export const LZString = {
  _keyStr: keyStrBase64,
  _f: f,

  compressToBase64(input: string | null | undefined): string {
    if (input == null) return '';
    let t = '';
    let n: number, r: number, i: number, s: number, o: number, u: number, a: number;
    let fIdx = 0;
    const e = LZString.compress(input);
    while (fIdx < e.length * 2) {
      if (fIdx % 2 === 0) {
        n = e.charCodeAt(fIdx / 2) >> 8;
        r = e.charCodeAt(fIdx / 2) & 255;
        if (fIdx / 2 + 1 < e.length) {
          i = e.charCodeAt(fIdx / 2 + 1) >> 8;
        } else {
          i = NaN;
        }
      } else {
        n = e.charCodeAt((fIdx - 1) / 2) & 255;
        if ((fIdx + 1) / 2 < e.length) {
          r = e.charCodeAt((fIdx + 1) / 2) >> 8;
          i = e.charCodeAt((fIdx + 1) / 2) & 255;
        } else {
          r = i = NaN;
        }
      }
      fIdx += 3;
      s = n >> 2;
      o = ((n & 3) << 4) | (r >> 4);
      u = ((r & 15) << 2) | (i >> 6);
      a = i & 63;
      if (isNaN(r)) {
        u = a = 64;
      } else if (isNaN(i)) {
        a = 64;
      }
      t =
        t +
        LZString._keyStr.charAt(s) +
        LZString._keyStr.charAt(o) +
        LZString._keyStr.charAt(u) +
        LZString._keyStr.charAt(a);
    }
    return t;
  },

  decompressFromBase64(input: string | null | undefined): string | null {
    if (input == null) return '';
    if (input === '') return null;
    let t = '',
      n = 0,
      r = 0,
      i = 0,
      s = 0,
      o = 0,
      u = 0,
      a = 0,
      fVal = 0,
      l = 0,
      c = 0;
    const h = LZString._f;
    const cleanedInput = input.replace(/[^A-Za-z0-9+/=]/g, '');
    while (c < cleanedInput.length) {
      u = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
      a = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
      fVal = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
      l = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
      i = (u << 2) | (a >> 4);
      s = ((a & 15) << 4) | (fVal >> 2);
      o = ((fVal & 3) << 6) | l;
      if (n % 2 === 0) {
        r = i << 8;
        if (fVal !== 64) {
          t += h(r | s);
        }
        if (l !== 64) {
          r = o << 8;
        }
      } else {
        t = t + h(r | i);
        if (fVal !== 64) {
          r = s << 8;
        }
        if (l !== 64) {
          t += h(r | o);
        }
      }
      n += 3;
    }
    return LZString.decompress(t);
  },

  compress(input: string | null | undefined): string {
    if (input == null) return '';
    let t: number,
      n: number,
      r: Record<string, number> = {},
      i: Record<string, boolean> = {},
      s = '',
      o = '',
      u = '',
      a = 2,
      fVal = 3,
      l = 2,
      c = '',
      h = 0,
      p = 0,
      d: number;
    const v = LZString._f;
    for (d = 0; d < input.length; d += 1) {
      s = input.charAt(d);
      if (!Object.prototype.hasOwnProperty.call(r, s)) {
        r[s] = fVal++;
        i[s] = true;
      }
      o = u + s;
      if (Object.prototype.hasOwnProperty.call(r, o)) {
        u = o;
      } else {
        if (Object.prototype.hasOwnProperty.call(i, u)) {
          if (u.charCodeAt(0) < 256) {
            for (t = 0; t < l; t++) {
              h = h << 1;
              if (p === 15) {
                p = 0;
                c += v(h);
                h = 0;
              } else {
                p++;
              }
            }
            n = u.charCodeAt(0);
            for (t = 0; t < 8; t++) {
              h = (h << 1) | (n & 1);
              if (p === 15) {
                p = 0;
                c += v(h);
                h = 0;
              } else {
                p++;
              }
              n = n >> 1;
            }
          } else {
            n = 1;
            for (t = 0; t < l; t++) {
              h = (h << 1) | n;
              if (p === 15) {
                p = 0;
                c += v(h);
                h = 0;
              } else {
                p++;
              }
              n = 0;
            }
            n = u.charCodeAt(0);
            for (t = 0; t < 16; t++) {
              h = (h << 1) | (n & 1);
              if (p === 15) {
                p = 0;
                c += v(h);
                h = 0;
              } else {
                p++;
              }
              n = n >> 1;
            }
          }
          a--;
          if (a === 0) {
            a = Math.pow(2, l);
            l++;
          }
          delete i[u];
        } else {
          n = r[u];
          for (t = 0; t < l; t++) {
            h = (h << 1) | (n & 1);
            if (p === 15) {
              p = 0;
              c += v(h);
              h = 0;
            } else {
              p++;
            }
            n = n >> 1;
          }
        }
        a--;
        if (a === 0) {
          a = Math.pow(2, l);
          l++;
        }
        r[o] = fVal++;
        u = String(s);
      }
    }
    if (u !== '') {
      if (Object.prototype.hasOwnProperty.call(i, u)) {
        if (u.charCodeAt(0) < 256) {
          for (t = 0; t < l; t++) {
            h = h << 1;
            if (p === 15) {
              p = 0;
              c += v(h);
              h = 0;
            } else {
              p++;
            }
          }
          n = u.charCodeAt(0);
          for (t = 0; t < 8; t++) {
            h = (h << 1) | (n & 1);
            if (p === 15) {
              p = 0;
              c += v(h);
              h = 0;
            } else {
              p++;
            }
            n = n >> 1;
          }
        } else {
          n = 1;
          for (t = 0; t < l; t++) {
            h = (h << 1) | n;
            if (p === 15) {
              p = 0;
              c += v(h);
              h = 0;
            } else {
              p++;
            }
            n = 0;
          }
          n = u.charCodeAt(0);
          for (t = 0; t < 16; t++) {
            h = (h << 1) | (n & 1);
            if (p === 15) {
              p = 0;
              c += v(h);
              h = 0;
            } else {
              p++;
            }
            n = n >> 1;
          }
        }
        a--;
        if (a === 0) {
          a = Math.pow(2, l);
          l++;
        }
        delete i[u];
      } else {
        n = r[u];
        for (t = 0; t < l; t++) {
          h = (h << 1) | (n & 1);
          if (p === 15) {
            p = 0;
            c += v(h);
            h = 0;
          } else {
            p++;
          }
          n = n >> 1;
        }
      }
      a--;
      if (a === 0) {
        a = Math.pow(2, l);
        l++;
      }
    }
    n = 2;
    for (t = 0; t < l; t++) {
      h = (h << 1) | (n & 1);
      if (p === 15) {
        p = 0;
        c += v(h);
        h = 0;
      } else {
        p++;
      }
      n = n >> 1;
    }
    while (true) {
      h = h << 1;
      if (p === 15) {
        c += v(h);
        break;
      } else {
        p++;
      }
    }
    return c;
  },

  decompress(input: string | null | undefined): string | null {
    if (input == null) return '';
    if (input === '') return null;
    let t: any[] = [],
      n: number,
      r = 4,
      i = 4,
      s = 3,
      o = '',
      u = '',
      a: number,
      fVal: string,
      l: number,
      c: number,
      h: number,
      p: number,
      d: any;
    const v = LZString._f;
    const m = { string: input, val: input.charCodeAt(0), position: 32768, index: 1 };
    for (a = 0; a < 3; a += 1) {
      t[a] = a;
    }
    l = 0;
    h = Math.pow(2, 2);
    p = 1;
    while (p !== h) {
      c = m.val & m.position;
      m.position >>= 1;
      if (m.position === 0) {
        m.position = 32768;
        m.val = m.string.charCodeAt(m.index++);
      }
      l |= (c > 0 ? 1 : 0) * p;
      p <<= 1;
    }
    switch ((n = l)) {
      case 0:
        l = 0;
        h = Math.pow(2, 8);
        p = 1;
        while (p !== h) {
          c = m.val & m.position;
          m.position >>= 1;
          if (m.position === 0) {
            m.position = 32768;
            m.val = m.string.charCodeAt(m.index++);
          }
          l |= (c > 0 ? 1 : 0) * p;
          p <<= 1;
        }
        d = v(l);
        break;
      case 1:
        l = 0;
        h = Math.pow(2, 16);
        p = 1;
        while (p !== h) {
          c = m.val & m.position;
          m.position >>= 1;
          if (m.position === 0) {
            m.position = 32768;
            m.val = m.string.charCodeAt(m.index++);
          }
          l |= (c > 0 ? 1 : 0) * p;
          p <<= 1;
        }
        d = v(l);
        break;
      case 2:
        return '';
    }
    t[3] = d;
    fVal = u = d;
    while (true) {
      if (m.index > m.string.length) {
        return '';
      }
      l = 0;
      h = Math.pow(2, s);
      p = 1;
      while (p !== h) {
        c = m.val & m.position;
        m.position >>= 1;
        if (m.position === 0) {
          m.position = 32768;
          m.val = m.string.charCodeAt(m.index++);
        }
        l |= (c > 0 ? 1 : 0) * p;
        p <<= 1;
      }
      switch ((d = l)) {
        case 0:
          l = 0;
          h = Math.pow(2, 8);
          p = 1;
          while (p !== h) {
            c = m.val & m.position;
            m.position >>= 1;
            if (m.position === 0) {
              m.position = 32768;
              m.val = m.string.charCodeAt(m.index++);
            }
            l |= (c > 0 ? 1 : 0) * p;
            p <<= 1;
          }
          t[i++] = v(l);
          d = i - 1;
          r--;
          break;
        case 1:
          l = 0;
          h = Math.pow(2, 16);
          p = 1;
          while (p !== h) {
            c = m.val & m.position;
            m.position >>= 1;
            if (m.position === 0) {
              m.position = 32768;
              m.val = m.string.charCodeAt(m.index++);
            }
            l |= (c > 0 ? 1 : 0) * p;
            p <<= 1;
          }
          t[i++] = v(l);
          d = i - 1;
          r--;
          break;
        case 2:
          return u;
      }
      if (r === 0) {
        r = Math.pow(2, s);
        s++;
      }
      if (t[d]) {
        o = t[d];
      } else {
        if (d === i) {
          o = fVal + fVal.charAt(0);
        } else {
          return null;
        }
      }
      u += o;
      t[i++] = fVal + o.charAt(0);
      r--;
      fVal = o;
      if (r === 0) {
        r = Math.pow(2, s);
        s++;
      }
    }
  },
};

export default LZString;
