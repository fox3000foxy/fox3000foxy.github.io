// src/utils/isNew.ts
function isNew(dateStr) {
	if (!dateStr) return false;
	const now = Date.now();
	const articleTime = (/* @__PURE__ */ new Date(`${dateStr}T00:00:00Z`)).getTime();
	if (Number.isNaN(articleTime)) return false;
	const diffDays = (now - articleTime) / 864e5;
	return diffDays >= 0 && diffDays < 7;
}
export { isNew as t };
