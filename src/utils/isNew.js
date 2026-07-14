export function isNew(dateStr) {
    if (!dateStr) {
        return false;
    }
    const now = Date.now();
    const articleTime = new Date(`${dateStr}T00:00:00Z`).getTime();
    if (Number.isNaN(articleTime)) {
        return false;
    }
    const diffMs = now - articleTime;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7;
}
