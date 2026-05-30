export function isNew(dateStr?: string): boolean {
	if (!dateStr) {
		return false;
	}
	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	return new Date(`${dateStr}T12:00:00Z`).getTime() > sevenDaysAgo;
}
