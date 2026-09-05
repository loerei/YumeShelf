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

        let minX = size.width;
        let minY = size.height;
        let maxX = -1;
        let maxY = -1;
        let opaquePixels = 0;

        for (let y = 0; y < size.height; y += 1) {
            for (let x = 0; x < size.width; x += 1) {
                const alpha = bitmap[(y * size.width + x) * 4 + 3];
                if (alpha > 0) {
                    opaquePixels += 1;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        summary.opaquePixels = opaquePixels;
        if (opaquePixels > 0) {
            summary.opaqueBounds = {
                left: minX,
                top: minY,
                right: maxX,
                bottom: maxY,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            };
        } else {
            summary.opaqueBounds = null;
        }
    } catch (error: any) {
        summary.bitmapError = String(error?.message || error);
    }

    return summary;
}

export interface CropResult {
    dataUrl: string;
    cropped: boolean;
    summary: NativeImageSummary | null;
}

export interface CropBufferResult {
    buffer: Buffer;
    cropped: boolean;
    summary: NativeImageSummary | null;
}

function calculateCropParameters(image: any): {
    shouldCrop: boolean;
    summary: NativeImageSummary;
    cropRect?: { left: number; top: number; width: number; height: number };
} {
    const summary = summarizeNativeImageForDebug(image);
    const bounds = summary?.opaqueBounds;
    if (!bounds || !summary || summary.empty) {
        return { shouldCrop: false, summary };
    }

    const fullWidth = summary.width || 0;
    const fullHeight = summary.height || 0;
    const contentWidth = bounds.width || 0;
    const contentHeight = bounds.height || 0;
    if (!fullWidth || !fullHeight || !contentWidth || !contentHeight) {
        return { shouldCrop: false, summary };
    }

    const widthRatio = contentWidth / fullWidth;
    const heightRatio = contentHeight / fullHeight;
    const shouldCrop = widthRatio < 0.82 || heightRatio < 0.82;
    if (!shouldCrop) {
        return { shouldCrop: false, summary };
    }

    const padding = Math.max(2, Math.round(Math.min(fullWidth, fullHeight) * 0.02));
    const cropLeft = Math.max(0, bounds.left - padding);
    const cropTop = Math.max(0, bounds.top - padding);
    const cropRight = Math.min(fullWidth, bounds.right + padding + 1);
    const cropBottom = Math.min(fullHeight, bounds.bottom + padding + 1);
    const cropWidth = Math.max(1, cropRight - cropLeft);
    const cropHeight = Math.max(1, cropBottom - cropTop);

    return {
        shouldCrop: true,
        summary,
        cropRect: {
            left: cropLeft,
            top: cropTop,
            width: cropWidth,
            height: cropHeight
        }
    };
}

export function cropTransparentPaddingFromBuffer(buffer: Buffer, options: any = {}): CropBufferResult {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { buffer, cropped: false, summary: null };
    }

    const nativeImageFactory = options?.nativeImage ?? nativeImage ?? null;
    if (!nativeImageFactory || typeof nativeImageFactory.createFromBuffer !== 'function') {
        return { buffer, cropped: false, summary: null };
    }

    let image: any;
    try {
        image = nativeImageFactory.createFromBuffer(buffer);
    } catch (error: any) {
        return {
            buffer,
            cropped: false,
            summary: {
                empty: true,
                error: String(error?.message || error)
            }
        };
    }

    const { shouldCrop, summary, cropRect } = calculateCropParameters(image);
    if (!shouldCrop || !cropRect) {
        return { buffer, cropped: false, summary };
    }

    try {
        const croppedImage = image.crop({
            x: cropRect.left,
            y: cropRect.top,
            width: cropRect.width,
            height: cropRect.height
        });
        const croppedBuffer = croppedImage.toPNG();
        return {
            buffer: croppedBuffer,
            cropped: true,
            summary: {
                ...summary,
                cropRect
            }
        };
    } catch (error: any) {
        return {
            buffer,
            cropped: false,
            summary: {
                ...summary,
                cropError: String(error?.message || error)
            }
        };
    }
}

export function cropTransparentPaddingFromDataUrl(dataUrl: string, options: any = {}): CropResult {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return { dataUrl, cropped: false, summary: null };
    }

    const nativeImageFactory = options?.nativeImage ?? nativeImage ?? null;
    if (!nativeImageFactory || typeof nativeImageFactory.createFromDataURL !== 'function') {
        return { dataUrl, cropped: false, summary: null };
    }

    let image: any;
    try {
        image = nativeImageFactory.createFromDataURL(dataUrl);
    } catch (error: any) {
        return {
            dataUrl,
            cropped: false,
            summary: {
                empty: true,
                error: String(error?.message || error)
            }
        };
    }

    const { shouldCrop, summary, cropRect } = calculateCropParameters(image);
    if (!shouldCrop || !cropRect) {
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
                cropError: String(error?.message || error)
            }
        };
    }
}
