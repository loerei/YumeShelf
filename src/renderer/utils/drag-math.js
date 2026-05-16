export function getPointerDistanceToRect(pointerX, pointerY, rect, slop) {
    const left = rect.left - slop;
    const right = rect.right + slop;
    const top = rect.top - slop;
    const bottom = rect.bottom + slop;
    const dx = pointerX < left ? left - pointerX : (pointerX > right ? pointerX - right : 0);
    const dy = pointerY < top ? top - pointerY : (pointerY > bottom ? pointerY - bottom : 0);
    return Math.hypot(dx, dy);
}

export function isSameDragRow(leftRect, rightRect, dragRowTolerance) {
    return Math.abs(leftRect.top - rightRect.top) <= dragRowTolerance;
}
