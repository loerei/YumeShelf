// Standard LZString implementation for RPG Maker MV/MZ save files.
// Pre-packaged version compatible with standard pieroxy lz-string (v1.3.x / v1.4.x).
// This ensures 100% byte-for-byte compatibility with standard RPG Maker save files.

const f = String.fromCharCode;
const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export const LZString = {
    _keyStr: keyStrBase64,
    _f: f,

    compressToBase64(input: string | null | undefined): string {
        if (input == null) return "";
        let t = "";
        let n: number, r: number, i: number, s: number, o: number, u: number, a: number;
        let fIdx = 0;
        const e = LZString.compress(input);
        while (fIdx < e.length * 2) {
            if (fIdx % 2 == 0) {
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
            if (Number.isNaN(r)) {
                u = a = 64;
            } else if (Number.isNaN(i)) {
                a = 64;
            }
            t = t + LZString._keyStr.charAt(s) + LZString._keyStr.charAt(o) + LZString._keyStr.charAt(u) + LZString._keyStr.charAt(a);
        }
        return t;
    },

    decompressFromBase64(input: string | null | undefined): string | null {
        if (input == null) return "";
        if (input === "") return null;
        let t = "", n = 0, r = 0, i = 0, s = 0, o = 0, u = 0, a = 0, fVal = 0, l = 0, c = 0, h = LZString._f;
        const cleanedInput = input.replace(/[^A-Za-z0-9+/=]/g, "");
        while (c < cleanedInput.length) {
            u = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
            a = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
            fVal = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
            l = LZString._keyStr.indexOf(cleanedInput.charAt(c++));
            i = (u << 2) | (a >> 4);
            s = ((a & 15) << 4) | (fVal >> 2);
            o = ((fVal & 3) << 6) | l;
            if (n % 2 == 0) {
                r = i << 8;
                if (fVal != 64) {
                    t += h(r | s);
                }
                if (l != 64) {
                    r = o << 8;
                }
            } else {
                t = t + h(r | i);
                if (fVal != 64) {
                    r = s << 8;
                }
                if (l != 64) {
                    t += h(r | o);
                }
            }
            n += 3;
        }
        return LZString.decompress(t);
    },

    compressToUTF16(input: string | null | undefined): string {
        if (input == null) return "";
        let t = "", n: number, r: number, i = 0, s = 0, o = LZString._f;
        const e = LZString.compress(input);
        for (n = 0; n < e.length; n++) {
            r = e.charCodeAt(n);
            switch (s++) {
                case 0:
                    t += o((r >> 1) + 32);
                    i = (r & 1) << 14;
                    break;
                case 1:
                    t += o(i + (r >> 2) + 32);
                    i = (r & 3) << 13;
                    break;
                case 2:
                    t += o(i + (r >> 3) + 32);
                    i = (r & 7) << 12;
                    break;
                case 3:
                    t += o(i + (r >> 4) + 32);
                    i = (r & 15) << 11;
                    break;
                case 4:
                    t += o(i + (r >> 5) + 32);
                    i = (r & 31) << 10;
                    break;
                case 5:
                    t += o(i + (r >> 6) + 32);
                    i = (r & 63) << 9;
                    break;
                case 6:
                    t += o(i + (r >> 7) + 32);
                    i = (r & 127) << 8;
                    break;
                case 7:
                    t += o(i + (r >> 8) + 32);
                    i = (r & 255) << 7;
                    break;
                case 8:
                    t += o(i + (r >> 9) + 32);
                    i = (r & 511) << 6;
                    break;
                case 9:
                    t += o(i + (r >> 10) + 32);
                    i = (r & 1023) << 5;
                    break;
                case 10:
                    t += o(i + (r >> 11) + 32);
                    i = (r & 2047) << 4;
                    break;
                case 11:
                    t += o(i + (r >> 12) + 32);
                    i = (r & 4095) << 3;
                    break;
                case 12:
                    t += o(i + (r >> 13) + 32);
                    i = (r & 8191) << 2;
                    break;
                case 13:
                    t += o(i + (r >> 14) + 32);
                    i = (r & 16383) << 1;
                    break;
                case 14:
                    t += o(i + (r >> 15) + 32, (r & 32767) + 32);
                    s = 0;
                    break;
            }
        }
        return t + o(i + 32);
    },

    decompressFromUTF16(input: string | null | undefined): string | null {
        if (input == null) return "";
        if (input === "") return null;
        let t = "", n = 0, r = 0, i = 0, s = 0, o = LZString._f;
        while (s < input.length) {
            r = input.charCodeAt(s) - 32;
            switch (i++) {
                case 0:
                    n = r << 1;
                    break;
                case 1:
                    t += o(n | (r >> 14));
                    n = (r & 16383) << 2;
                    break;
                case 2:
                    t += o(n | (r >> 13));
                    n = (r & 8191) << 3;
                    break;
                case 3:
                    t += o(n | (r >> 12));
                    n = (r & 4095) << 4;
                    break;
                case 4:
                    t += o(n | (r >> 11));
                    n = (r & 2047) << 5;
                    break;
                case 5:
                    t += o(n | (r >> 10));
                    n = (r & 1023) << 6;
                    break;
                case 6:
                    t += o(n | (r >> 9));
                    n = (r & 511) << 7;
                    break;
                case 7:
                    t += o(n | (r >> 8));
                    n = (r & 255) << 8;
                    break;
                case 8:
                    t += o(n | (r >> 7));
                    n = (r & 127) << 9;
                    break;
                case 9:
                    t += o(n | (r >> 6));
                    n = (r & 63) << 10;
                    break;
                case 10:
                    t += o(n | (r >> 5));
                    n = (r & 31) << 11;
                    break;
                case 11:
                    t += o(n | (r >> 4));
                    n = (r & 15) << 12;
                    break;
                case 12:
                    t += o(n | (r >> 3));
                    n = (r & 7) << 13;
                    break;
                case 13:
                    t += o(n | (r >> 2));
                    n = (r & 3) << 14;
                    break;
                case 14:
                    t += o(n | (r >> 1));
                    n = (r & 1) << 15;
                    break;
                case 15:
                    t += o(n | r);
                    i = 0;
                    break;
            }
            s++;
        }
        return LZString.decompress(t);
    },

    compressToUint8Array(input: string | null | undefined): Uint8Array {
        const t = LZString.compress(input);
        const n = new Uint8Array(t.length * 2);
        for (let r = 0, i = t.length; r < i; r++) {
            const s = t.charCodeAt(r);
            n[r * 2] = s >>> 8;
            n[r * 2 + 1] = s % 256;
        }
        return n;
    },

    decompressFromUint8Array(input: Uint8Array | null | undefined): string | null {
        if (input === null || input === undefined) {
            return LZString.decompress(input as any);
        } else {
            const t = new Array(input.length / 2);
            for (let n = 0, r = t.length; n < r; n++) {
                t[n] = input[n * 2] * 256 + input[n * 2 + 1];
            }
            return LZString.decompress(String.fromCharCode.apply(null, t));
        }
    },

    compressToEncodedURIComponent(input: string | null | undefined): string {
        if (input == null) return "";
        return LZString.compressToBase64(input).replaceAll("=", "$").replaceAll("/", "-");
    },

    decompressFromEncodedURIComponent(input: string | null | undefined): string | null {
        if (input == null) return "";
        if (input === "") return null;
        const cleaned = input.replaceAll("$", "=").replaceAll("-", "/");
        return LZString.decompressFromBase64(cleaned);
    },

    compress(input: string | null | undefined): string {
        if (input == null) return "";
        let t: number, n: number, r: Record<string, number> = {}, i: Record<string, boolean> = {}, s = "", o = "", u = "", a = 2, fVal = 3, l = 2, c = "", h = 0, p = 0, d: number, v = LZString._f;
        for (d = 0; d < input.length; d += 1) {
            s = input.charAt(d);
            if (!Object.hasOwn(r, s)) {
                r[s] = fVal++;
                i[s] = true;
            }
            o = u + s;
            if (Object.hasOwn(r, o)) {
                u = o;
            } else {
                if (Object.hasOwn(i, u)) {
                    if (u.charCodeAt(0) < 256) {
                        for (t = 0; t < l; t++) {
                            h = h << 1;
                            if (p == 15) {
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
                            if (p == 15) {
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
                            if (p == 15) {
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
                            if (p == 15) {
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
                    if (a == 0) {
                        a = Math.pow(2, l);
                        l++;
                    }
                    delete i[u];
                } else {
                    n = r[u];
                    for (t = 0; t < l; t++) {
                        h = (h << 1) | (n & 1);
                        if (p == 15) {
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
                if (a == 0) {
                    a = Math.pow(2, l);
                    l++;
                }
                r[o] = fVal++;
                u = String(s);
            }
        }
        if (u !== "") {
            if (Object.hasOwn(i, u)) {
                if (u.charCodeAt(0) < 256) {
                    for (t = 0; t < l; t++) {
                        h = h << 1;
                        if (p == 15) {
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
                        if (p == 15) {
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
                        if (p == 15) {
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
                        if (p == 15) {
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
                if (a == 0) {
                    a = Math.pow(2, l);
                    l++;
                }
                delete i[u];
            } else {
                n = r[u];
                for (t = 0; t < l; t++) {
                    h = (h << 1) | (n & 1);
                    if (p == 15) {
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
            if (a == 0) {
                a = Math.pow(2, l);
                l++;
            }
        }
        n = 2;
        for (t = 0; t < l; t++) {
            h = (h << 1) | (n & 1);
            if (p == 15) {
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
            if (p == 15) {
                c += v(h);
                break;
            } else {
                p++;
            }
        }
        return c;
    },

    decompress(input: string | null | undefined): string | null {
        if (input == null) return "";
        if (input === "") return null;
        let t: any[] = [], n: number, r = 4, i = 4, s = 3, o = "", u = "", a: number, fVal: string, l: number, c: number, h: number, p: number, d: any, v = LZString._f;
        const m = { string: input, val: input.charCodeAt(0), position: 32768, index: 1 };
        for (a = 0; a < 3; a += 1) {
            t[a] = a;
        }
        l = 0;
        h = Math.pow(2, 2);
        p = 1;
        while (p != h) {
            c = m.val & m.position;
            m.position >>= 1;
            if (m.position == 0) {
                m.position = 32768;
                m.val = m.string.charCodeAt(m.index++);
            }
            l |= (c > 0 ? 1 : 0) * p;
            p <<= 1;
        }
        switch (n = l) {
            case 0:
                l = 0;
                h = Math.pow(2, 8);
                p = 1;
                while (p != h) {
                    c = m.val & m.position;
                    m.position >>= 1;
                    if (m.position == 0) {
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
                while (p != h) {
                    c = m.val & m.position;
                    m.position >>= 1;
                    if (m.position == 0) {
                        m.position = 32768;
                        m.val = m.string.charCodeAt(m.index++);
                    }
                    l |= (c > 0 ? 1 : 0) * p;
                    p <<= 1;
                }
                d = v(l);
                break;
            case 2:
                return "";
        }
        t[3] = d;
        fVal = u = d;
        while (true) {
            if (m.index > m.string.length) {
                return "";
            }
            l = 0;
            h = Math.pow(2, s);
            p = 1;
            while (p != h) {
                c = m.val & m.position;
                m.position >>= 1;
                if (m.position == 0) {
                    m.position = 32768;
                    m.val = m.string.charCodeAt(m.index++);
                }
                l |= (c > 0 ? 1 : 0) * p;
                p <<= 1;
            }
            switch (d = l) {
                case 0:
                    l = 0;
                    h = Math.pow(2, 8);
                    p = 1;
                    while (p != h) {
                        c = m.val & m.position;
                        m.position >>= 1;
                        if (m.position == 0) {
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
                    while (p != h) {
                        c = m.val & m.position;
                        m.position >>= 1;
                        if (m.position == 0) {
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
            if (r == 0) {
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
            if (r == 0) {
                r = Math.pow(2, s);
                s++;
            }
        }
    }
};

export default LZString;
