// src/lib/chatbots/similarity.ts
var STOPWORDS = /* @__PURE__ */ new Set([
	"the",
	"a",
	"an",
	"of",
	"to",
	"and",
	"is",
	"it",
	"in",
	"that",
	"this",
	"i",
	"you",
	"he",
	"she",
	"we",
	"they",
	"was",
	"were",
	"be",
	"been",
	"am",
	"are",
	"do",
	"does",
	"did",
	"on",
	"for",
	"with",
	"as",
	"at",
	"le",
	"la",
	"les",
	"un",
	"une",
	"de",
	"du",
	"des",
	"et",
	"est",
	"ce",
	"que",
	"qui",
	"je",
	"tu",
	"il",
	"elle",
	"nous",
	"vous",
	"ils",
	"elles"
]);
function tokenize(text) {
	return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}
function contentTokens(text) {
	return tokenize(text).filter((t) => !STOPWORDS.has(t));
}
function bigrams(tokens) {
	const out = [];
	for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
	return out;
}
function jaccard(a, b) {
	if (a.size === 0 && b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}
function similarity(a, b) {
	const ta = contentTokens(a);
	const tb = contentTokens(b);
	if (ta.length === 0 || tb.length === 0) return 0;
	const uniScore = jaccard(new Set(ta), new Set(tb));
	const biScore = jaccard(new Set(bigrams(ta)), new Set(bigrams(tb)));
	const lenScore = 1 - Math.abs(ta.length - tb.length) / Math.max(ta.length, tb.length, 1);
	return .6 * uniScore + .3 * biScore + .1 * lenScore;
}
// src/lib/chatbots/matcher.ts
function findCandidates(store, userInput, recentContext, config) {
	const pairs = store.withReplies();
	const now = Date.now();
	const scored = [];
	for (const { line, reply } of pairs) {
		if (line.text.trim().toLowerCase() === userInput.trim().toLowerCase()) continue;
		const relevance = similarity(userInput, line.text);
		if (relevance < config.minScore) continue;
		const contextFit = scoreContextFit(store, line, recentContext, config.contextWindow);
		const recencyBonus = 1 / (1 + (now - line.createdAt) / 864e5 / 30);
		const score = .65 * relevance + .25 * contextFit + .1 * recencyBonus;
		scored.push({
			line,
			reply,
			score
		});
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, config.topK);
}
function scoreContextFit(store, line, recentContext, windowSize) {
	if (recentContext.length === 0) return 0;
	const all = store.all();
	const idx = all.findIndex((l) => l.id === line.id);
	if (idx === -1) return 0;
	const priorTexts = [];
	for (let i = idx - 1; i >= 0 && priorTexts.length < windowSize; i--) {
		if (all[i].sessionId !== line.sessionId) break;
		priorTexts.unshift(all[i].text);
	}
	if (priorTexts.length === 0) return 0;
	return similarity(recentContext.join(" "), priorTexts.join(" "));
}
function pickReply(candidates) {
	if (candidates.length === 0) return null;
	const weights = candidates.map((c) => Math.max(c.score, 1e-4));
	const total = weights.reduce((s, w) => s + w, 0);
	let r = Math.random() * total;
	for (let i = 0; i < candidates.length; i++) {
		r -= weights[i];
		if (r <= 0) return candidates[i];
	}
	return candidates[candidates.length - 1];
}
export { pickReply as n, similarity as r, findCandidates as t };
