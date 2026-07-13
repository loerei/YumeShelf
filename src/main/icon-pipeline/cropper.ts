import { nativeImage } from 'electron';

export interface NativeImageSummary {
    empty: boolean;
    width?: number;
    height?: number;
    opaquePixels?: number;
    opaqueBounds?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
    } | null;
    bitmapError?: string;
    error?: string;
    cropRect?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    cropError?: string;
}

interface OpaqueBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    opaquePixels: number;
}

function scanBitmapOpaqueBounds(bitmap: Buffer, width: number, height: number): OpaqueBounds {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let opaquePixels = 0;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = bitmap[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                opaquePixels += 1;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    return { minX, minY, maxX, maxY, opaquePixels };
}

export function summarizeNativeImageForDebug(image: any): NativeImageSummary {
    if (!image || image.isEmpty()) {
        return {
            empty: true
        };
    }

    const size = image.getSize();
    const summary: NativeImageSummary = {
        empty: false,
        width: size.width,
        height: size.height
    };

    try {
        const bitmap = image.toBitmap();
        if (!bitmap || !size.width || !size.height) {
            return summary;
        }

        const bounds = scanBitmapOpaqueBounds(bitmap, size.width, size.height);
        summary.opaquePixels = bounds.opaquePixels;
        if (bounds.opaquePixels > 0) {
            summary.opaqueBounds = {
                left: bounds.minX,
                top: bounds.minY,
                right: bounds.maxX,
                bottom: bounds.maxY,
                width: bounds.maxX - bounds.minX + 1,
                height: bounds.maxY - bounds.minY + 1
            };
        } else {
            summary.opaqueBounds = null;
        }
    } catch (error: any) {
        summary.bitmapError = String((error?.message) || error);
    }

    return summary;
}

export interface CropResult {
    dataUrl: string;
    cropped: boolean;
    summary: NativeImageSummary | null;
}

interface CropRect { left: number; top: number; width: number; height: number; }

function computeCropRect(bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number }, fullWidth: number, fullHeight: number): CropRect | null {
    const widthRatio = (bounds.width || 0) / fullWidth;
    const heightRatio = (bounds.height || 0) / fullHeight;
    if (widthRatio >= 0.82 && heightRatio >= 0.82) return null;
    const padding = Math.max(2, Math.round(Math.min(fullWidth, fullHeight) * 0.02));
    const left = Math.max(0, bounds.left - padding);
    const top = Math.max(0, bounds.top - padding);
    const right = Math.min(fullWidth, bounds.right + padding + 1);
    const bottom = Math.min(fullHeight, bounds.bottom + padding + 1);
    return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function cropTransparentPaddingFromDataUrl(dataUrl: string, options: any = {}): CropResult {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return { dataUrl, cropped: false, summary: null };
    }

    let image: any;
    try {
        image = nativeImage.createFromDataURL(dataUrl);
    } catch (error: any) {
        return {
            dataUrl,
            cropped: false,
            summary: {
                empty: true,
                error: String((error?.message) || error)
            }
        };
    }

    const summary = summarizeNativeImageForDebug(image);
    const bounds = summary?.opaqueBounds;
    if (!bounds || !summary || summary.empty) {
        return { dataUrl, cropped: false, summary };
    }

    const fullWidth = summary.width || 0;
    const fullHeight = summary.height || 0;
    if (!fullWidth || !fullHeight) {
        return { dataUrl, cropped: false, summary };
    }
    const cropRect = computeCropRect(bounds, fullWidth, fullHeight);
    if (!cropRect) {
        return { dataUrl, cropped: false, summary };
    }

    try {
        const croppedImage = image.crop({
            x: cropRect.left,
            y: cropRect.top,
            width: cropRect.width,
            height: cropRect.height
        });
        const croppedDataUrl = croppedImage.toDataURL();
        return {
            dataUrl: croppedDataUrl,
            cropped: true,
            summary: {
                ...summary,
                cropRect
            }
        };
    } catch (error: any) {
        return {
            dataUrl,
            cropped: false,
            summary: {
                ...summary,
                cropError: String((error?.message) || error)
            }
        };
    }
}
