import { similarity } from "./similarity";
import type { TranscriptLine, Candidate, BotConfig } from "./types";

interface TranscriptStore {
	all(): TranscriptLine[];
	withReplies(): { line: TranscriptLine; reply: TranscriptLine }[];
}

export function findCandidates(
	store: TranscriptStore,
	userInput: string,
	recentContext: string[],
	config: BotConfig
): Candidate[] {
	const pairs = store.withReplies();
	const now = Date.now();
	const scored: Candidate[] = [];

	for (const { line, reply } of pairs) {
		if (line.text.trim().toLowerCase() === userInput.trim().toLowerCase()) {
			continue;
		}

		const relevance = similarity(userInput, line.text);
		if (relevance < config.minScore) {
			continue;
		}

		const contextFit = scoreContextFit(
			store,
			line,
			recentContext,
			config.contextWindow
		);

		const ageMs = now - line.createdAt;
		const ageDays = ageMs / (1000 * 60 * 60 * 24);
		const recencyBonus = 1 / (1 + ageDays / 30);

		const score = 0.65 * relevance + 0.25 * contextFit + 0.1 * recencyBonus;
		scored.push({ line, reply, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, config.topK);
}

function scoreContextFit(
	store: TranscriptStore,
	line: TranscriptLine,
	recentContext: string[],
	windowSize: number
): number {
	if (recentContext.length === 0) {
		return 0;
	}

	const all = store.all();
	const idx = all.findIndex((l) => l.id === line.id);
	if (idx === -1) {
		return 0;
	}

	const priorTexts: string[] = [];
	for (let i = idx - 1; i >= 0 && priorTexts.length < windowSize; i--) {
		if (all[i].sessionId !== line.sessionId) {
			break;
		}
		priorTexts.unshift(all[i].text);
	}
	if (priorTexts.length === 0) {
		return 0;
	}

	const a = recentContext.join(" ");
	const b = priorTexts.join(" ");
	return similarity(a, b);
}

export function pickReply(candidates: Candidate[]): Candidate | null {
	if (candidates.length === 0) {
		return null;
	}
	const weights = candidates.map((c) => Math.max(c.score, 0.0001));
	const total = weights.reduce((s, w) => s + w, 0);
	let r = Math.random() * total;
	for (let i = 0; i < candidates.length; i++) {
		r -= weights[i];
		if (r <= 0) {
			return candidates[i];
		}
	}
	return candidates[candidates.length - 1];
}
