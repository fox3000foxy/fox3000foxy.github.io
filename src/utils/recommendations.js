const STOP_WORDS = new Set([
    "the",
    "and",
    "for",
    "are",
    "not",
    "but",
    "you",
    "all",
    "can",
    "had",
    "her",
    "was",
    "one",
    "our",
    "out",
    "has",
    "have",
    "been",
    "some",
    "them",
    "than",
    "its",
    "over",
    "such",
    "that",
    "with",
    "each",
    "from",
    "this",
    "they",
    "will",
    "would",
    "about",
    "into",
    "like",
    "more",
    "also",
    "other",
    "then",
    "your",
    "just",
    "make",
    "than",
    "them",
    "well",
    "these",
    "those",
    "being",
    "done",
    "many",
    "some",
    "their",
    "what",
    "when",
    "which",
    "while",
    "does",
    "down",
    "back",
    "here",
    "very",
    "after",
    "before",
    "between",
    "both",
    "under",
    "where",
    "why",
    "how",
    "much",
    "still",
    "only",
    "own",
    "same",
    "too",
    "any",
    "every",
    "new",
    "now",
    "old",
    "way",
    "who",
    "may",
    "could",
    "should",
    "need",
    "set",
    "get",
    "use",
    "used",
    "using",
    "make",
    "made",
    "take",
    "know",
    "see",
    "work",
    "look",
    "first",
    "left",
    "right",
    "without",
    "because",
    "already",
    "around",
    "always",
    "never",
    "really",
    "thing",
    "things",
    "something",
    "nothing",
    "everything",
    "part",
    "place",
    "long",
    "last",
    "next",
    "ever",
    "even",
    "yet",
    "still",
    "most",
    "much",
    "however",
    "though",
    "although",
    "since",
    "until",
    "during",
    "before",
    "after",
    "above",
    "below",
    "again",
    "further",
    "once",
    "almost",
    "enough",
    "quite",
    "rather",
    "whether",
    "either",
    "neither",
    "another",
    "else",
    "elsewhere",
    "there",
    "here",
    "where",
    "everywhere",
    "nowhere",
    "somewhere",
    "then",
    "than",
    "so",
    "as",
    "if",
    "or",
    "but",
    "nor",
    "off",
    "up",
    "on",
    "in",
    "at",
    "to",
    "by",
    "of",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "from",
    "up",
    "down",
    "out",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "also",
    "because",
    "but",
    "and",
    "or",
    "if",
    "as",
    "until",
    "while",
    "of",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "can",
    "will",
    "just",
    "should",
    "now",
]);
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]+`/g, " ")
        .replace(/https?:\/\/\S+/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
function termFrequency(tokens) {
    const tf = new Map();
    for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    const len = tokens.length;
    if (len === 0) {
        return tf;
    }
    for (const [k, v] of tf) {
        tf.set(k, v / len);
    }
    return tf;
}
function inverseDocumentFrequency(docs) {
    const df = new Map();
    const N = docs.length;
    for (const doc of docs) {
        const unique = new Set(doc);
        for (const term of unique) {
            df.set(term, (df.get(term) ?? 0) + 1);
        }
    }
    for (const [k, v] of df) {
        df.set(k, Math.log(N / v) + 1);
    }
    return df;
}
function buildVector(tokens, idf) {
    const tf = termFrequency(tokens);
    const vec = new Map();
    for (const [term, freq] of tf) {
        const idfVal = idf.get(term) ?? 0;
        if (idfVal > 0) {
            vec.set(term, freq * idfVal);
        }
    }
    return vec;
}
function cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [k, v] of a) {
        const bv = b.get(k) ?? 0;
        dot += v * bv;
        normA += v * v;
    }
    for (const [, v] of b) {
        normB += v * v;
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
export function computeRecommendations(contents, currentSlug) {
    const docs = contents.map((c) => ({
        slug: c.slug,
        tokens: tokenize(c.text),
    }));
    const corpus = docs.map((d) => d.tokens);
    const idf = inverseDocumentFrequency(corpus);
    const vectors = new Map();
    for (const doc of docs) {
        vectors.set(doc.slug, buildVector(doc.tokens, idf));
    }
    const currentVec = vectors.get(currentSlug);
    if (!currentVec) {
        return [];
    }
    const scored = [];
    for (const doc of docs) {
        if (doc.slug === currentSlug) {
            continue;
        }
        const vec = vectors.get(doc.slug);
        if (!vec) {
            continue;
        }
        const score = cosineSimilarity(currentVec, vec);
        if (score > 0) {
            scored.push({ slug: doc.slug, score });
        }
    }
    return scored.sort((a, b) => b.score - a.score);
}
