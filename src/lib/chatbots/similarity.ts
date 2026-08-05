const STOPWORDS = new Set([
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
	"elles",
]);

export function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}\s']/gu, " ")
		.split(/\s+/)
		.filter(Boolean);
}

export function contentTokens(text: string): string[] {
	return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

function bigrams(tokens: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < tokens.length - 1; i++) {
		out.push(`${tokens[i]}_${tokens[i + 1]}`);
	}
	return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) {
		return 0;
	}
	let inter = 0;
	for (const x of a) {
		if (b.has(x)) {
			inter++;
		}
	}
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

export function similarity(a: string, b: string): number {
	const ta = contentTokens(a);
	const tb = contentTokens(b);
	if (ta.length === 0 || tb.length === 0) {
		return 0;
	}

	const uniScore = jaccard(new Set(ta), new Set(tb));
	const biScore = jaccard(new Set(bigrams(ta)), new Set(bigrams(tb)));
	const lenScore =
		1 - Math.abs(ta.length - tb.length) / Math.max(ta.length, tb.length, 1);

	return 0.6 * uniScore + 0.3 * biScore + 0.1 * lenScore;
}
