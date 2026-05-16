export function timeSince(date, getStrings) {
    const d = getStrings();
    if (!date || date === 0) return d.status_never;
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return d.status_recent;
    let interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + d.status_hours;
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + d.status_mins;
    return d.status_recent;
}

export function formatPlaytime(ms) {
    if (!ms || ms < 60000) return '0m';
    const totalMins = Math.floor(ms / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}
