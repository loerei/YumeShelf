// @ts-nocheck
const POST_UPDATE_NOTICE_SUPPRESSED_KEY = 'yumeshelf_post_update_notice_suppressed';

export function isPostUpdateNoticeSuppressed() {
    try {
        return localStorage.getItem(POST_UPDATE_NOTICE_SUPPRESSED_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setPostUpdateNoticeSuppressed(value) {
    try {
        localStorage.setItem(POST_UPDATE_NOTICE_SUPPRESSED_KEY, value ? 'true' : 'false');
    } catch {}
}
