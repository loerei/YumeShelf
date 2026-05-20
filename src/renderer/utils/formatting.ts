// @ts-nocheck
export function timeSince(date, getStrings) {
    const d = getStrings();
    if (!date || date === 0) return d.status_never;
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return d.status_recent;
    
    const past = new Date(date);
    const diffYears = now.getFullYear() - past.getFullYear();
    const diffMonths = (now.getMonth() + diffYears * 12) - past.getMonth();
    
    if (diffMonths >= 12) {
        const years = Math.floor(diffMonths / 12);
        return years + d.status_years;
    }
    if (diffMonths >= 1) {
        return diffMonths + d.status_months;
    }
    
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + d.status_days;
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + d.status_hours;
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + d.status_mins;
    return d.status_recent;
}

export function formatPlaytime(ms) {
    if (!ms || ms < 60000) return '0m';
    const totalMins = Math.floor(ms / 60000);
    let hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        hours = hours % 24;
        return `${days}d ${hours}h ${mins}m`;
    }
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}
