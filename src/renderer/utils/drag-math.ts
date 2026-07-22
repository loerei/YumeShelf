// @ts-nocheck
export function getPointerDistanceToRect(pointerX, pointerY, rect, slop) {
    const left = rect.left - slop;
    const right = rect.right + slop;
    const top = rect.top - slop;
    const bottom = rect.bottom + slop;
    let dx = 0;
    if (pointerX < left) {
        dx = left - pointerX;
    } else if (pointerX > right) {
        dx = pointerX - right;
    }
    let dy = 0;
    if (pointerY < top) {
        dy = top - pointerY;
    } else if (pointerY > bottom) {
        dy = pointerY - bottom;
    }
    return Math.hypot(dx, dy);
}

export function isSameDragRow(leftRect, rightRect, dragRowTolerance) {
    return Math.abs(leftRect.top - rightRect.top) <= dragRowTolerance;
}
