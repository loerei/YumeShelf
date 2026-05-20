// @ts-nocheck
const { nativeImage } = require('electron');

function summarizeNativeImageForDebug(image) {
    if (!image || image.isEmpty()) {
        return {
            empty: true
        };
    }

    const size = image.getSize();
    const summary = {
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
    } catch (error) {
        summary.bitmapError = String((error && error.message) || error);
    }

    return summary;
}

function cropTransparentPaddingFromDataUrl(dataUrl, options = {}) {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return { dataUrl, cropped: false, summary: null };
    }

    let image;
    try {
        image = nativeImage.createFromDataURL(dataUrl);
    } catch (error) {
        return {
            dataUrl,
            cropped: false,
            summary: {
                error: String((error && error.message) || error)
            }
        };
    }

    const summary = summarizeNativeImageForDebug(image);
    const bounds = summary && summary.opaqueBounds;
    if (!bounds || !summary || summary.empty) {
        return { dataUrl, cropped: false, summary };
    }

    const fullWidth = summary.width || 0;
    const fullHeight = summary.height || 0;
    const contentWidth = bounds.width || 0;
    const contentHeight = bounds.height || 0;
    if (!fullWidth || !fullHeight || !contentWidth || !contentHeight) {
        return { dataUrl, cropped: false, summary };
    }

    const widthRatio = contentWidth / fullWidth;
    const heightRatio = contentHeight / fullHeight;
    const shouldCrop = widthRatio < 0.82 || heightRatio < 0.82;
    if (!shouldCrop) {
        return { dataUrl, cropped: false, summary };
    }

    const padding = Math.max(2, Math.round(Math.min(fullWidth, fullHeight) * 0.02));
    const cropLeft = Math.max(0, bounds.left - padding);
    const cropTop = Math.max(0, bounds.top - padding);
    const cropRight = Math.min(fullWidth, bounds.right + padding + 1);
    const cropBottom = Math.min(fullHeight, bounds.bottom + padding + 1);
    const cropWidth = Math.max(1, cropRight - cropLeft);
    const cropHeight = Math.max(1, cropBottom - cropTop);

    try {
        const croppedImage = image.crop({
            x: cropLeft,
            y: cropTop,
            width: cropWidth,
            height: cropHeight
        });
        const croppedDataUrl = croppedImage.toDataURL();
        return {
            dataUrl: croppedDataUrl,
            cropped: true,
            summary: {
                ...summary,
                cropRect: {
                    left: cropLeft,
                    top: cropTop,
                    width: cropWidth,
                    height: cropHeight
                }
            }
        };
    } catch (error) {
        return {
            dataUrl,
            cropped: false,
            summary: {
                ...summary,
                cropError: String((error && error.message) || error)
            }
        };
    }
}

module.exports = {
    summarizeNativeImageForDebug,
    cropTransparentPaddingFromDataUrl
};
