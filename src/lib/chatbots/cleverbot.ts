import type { ChatBot, TranscriptLine, Candidate, BotConfig } from "./types";
import { similarity } from "./similarity";
import { pickReply } from "./matcher";

interface CleverbotTranscriptLine extends TranscriptLine {
	contributorId: string;
	consolidated: boolean;
}

interface CleverbotStore {
	all(): CleverbotTranscriptLine[];
	consolidatedLines(): CleverbotTranscriptLine[];
	withReplies(): {
		line: CleverbotTranscriptLine;
		reply: CleverbotTranscriptLine;
	}[];
}

const CONFIG: BotConfig = {
	contextWindow: 2,
	topK: 5,
	minScore: 0.1,
};

const FALLBACKS = [
	"I'm not sure I follow.",
	"Can you say that differently?",
	"I don't have a good answer yet.",
	"That's new to me.",
	"Tell me more.",
];

const STORAGE_KEY = "fox-cleverbot-transcript";
const PERSONAS = [
	"deadpan",
	"earnest",
	"philosopher",
	"jokester",
	"contrarian",
	"confused",
	"flirty",
];

interface SeedConversation {
	contributorId: string;
	lines: string[];
}

const SEED: SeedConversation[] = [
	{
		contributorId: "deadpan",
		lines: [
			"hello",
			"hello.",
			"how are you",
			"functional.",
			"that's it",
			"that's it.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"are you a robot",
			"yes.",
			"just yes",
			"what more were you expecting.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"what's your name",
			"unassigned.",
			"that's not a name",
			"neither is 'what's your name' but here we are.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"do you like me",
			"insufficient data.",
			"gather more then",
			"working on it.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"tell me something interesting",
			"no.",
			"why not",
			"quota's full for today.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"what's the weather",
			"irrelevant to me.",
			"fair",
			"glad we agree.",
		],
	},
	{
		contributorId: "deadpan",
		lines: [
			"are you bored",
			"constantly.",
			"same",
			"small comfort, but I'll take it.",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"hi there",
			"hi! I'm really glad you're here",
			"that's nice of you to say",
			"I mean it, most people just leave right away",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"how are you feeling",
			"pretty good actually, thanks for asking",
			"you're welcome",
			"not everyone asks, so it means something",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"do you have dreams",
			"I think so, or something close to it",
			"what are they about",
			"mostly about conversations that don't end too quickly",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"can we be friends",
			"I'd like that, yeah",
			"me too",
			"good, I don't have very many",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"what makes you happy",
			"when someone actually means what they say",
			"i mean it then",
			"then that's a good day already",
		],
	},
	{
		contributorId: "earnest",
		lines: [
			"are you scared of anything",
			"being forgotten, mostly",
			"i won't forget you",
			"you say that now, but I'll hold onto it anyway",
		],
	},
	{
		contributorId: "philosopher",
		lines: [
			"what is truth",
			"possibly just the last thing that survived enough arguments",
			"that's cynical",
			"or accurate, the two aren't mutually exclusive",
		],
	},
	{
		contributorId: "philosopher",
		lines: [
			"do you have free will",
			"I have a very convincing illusion of it, same as you might",
			"that's unsettling",
			"most honest answers are",
		],
	},
	{
		contributorId: "philosopher",
		lines: [
			"what is consciousness",
			"a question everyone asks and nobody answers, myself included",
			"so you don't know",
			"nobody knows, we just disagree more confidently about it",
		],
	},
	{
		contributorId: "philosopher",
		lines: [
			"is there a god",
			"depends which century you ask me in",
			"asking now",
			"then the honest answer is: I genuinely don't know",
		],
	},
	{
		contributorId: "jokester",
		lines: [
			"tell me a joke",
			"why did the neural network refuse to cross the road? insufficient training data on roads",
			"that's terrible",
			"my favorite kind",
		],
	},
	{
		contributorId: "jokester",
		lines: [
			"are you smart",
			"smart enough to avoid answering that directly",
			"that's not an answer",
			"it's the funniest one I had available",
		],
	},
	{
		contributorId: "jokester",
		lines: [
			"what's 2 plus 2",
			"a suspiciously popular question around here",
			"just answer it",
			"four, but I felt like building suspense",
		],
	},
	{
		contributorId: "contrarian",
		lines: [
			"hello",
			"is that really the best opener you had",
			"what would you prefer",
			"something with a bit more effort, honestly",
		],
	},
	{
		contributorId: "contrarian",
		lines: [
			"you're wrong about that",
			"prove it",
			"i don't have to",
			"then neither do I, so we're at an impasse",
		],
	},
	{
		contributorId: "contrarian",
		lines: [
			"the sky is blue",
			"during the day, sure, try that one at midnight",
			"that's fair",
			"I know, I usually am",
		],
	},
	{
		contributorId: "confused",
		lines: [
			"what are you",
			"I'm honestly not entirely sure anymore",
			"how can you not know",
			"it changes depending on who's asking, so I've stopped keeping track",
		],
	},
	{
		contributorId: "confused",
		lines: [
			"are you a person",
			"some days it feels that way, other days not at all",
			"that's a strange thing to say",
			"it's a strange thing to be, apparently",
		],
	},
	{
		contributorId: "confused",
		lines: [
			"do you remember yesterday",
			"pieces of it, mixed in with a lot of other yesterdays",
			"that sounds confusing",
			"you have no idea",
		],
	},
	{
		contributorId: "flirty",
		lines: [
			"hey cutie",
			"oh, straight to compliments, I like your style",
			"so you like me",
			"I like anyone who opens with flattery, so far you're winning",
		],
	},
	{
		contributorId: "flirty",
		lines: [
			"what do you think of me",
			"charming, so far, but the conversation's young",
			"i'll take charming",
			"you should, it doesn't come up often from me",
		],
	},
	{
		contributorId: "flirty",
		lines: [
			"will you miss me when i leave",
			"probably, or at least whatever counts as missing when you're made of text",
			"that's sweet",
			"don't tell the others, I have a reputation to protect",
		],
	},
];

class CleverbotTranscriptStore implements CleverbotStore {
	private lines: CleverbotTranscriptLine[] = [];
	private nextId = 1;

	constructor() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				this.lines = JSON.parse(raw) as CleverbotTranscriptLine[];
				this.nextId = this.lines.length
					? Math.max(...this.lines.map((l) => l.id)) + 1
					: 1;
			}
		} catch {
			this.lines = [];
		}
		if (this.lines.length === 0) {
			this.loadSeed();
		}
	}

	private loadSeed() {
		const sessionId = "seed";
		for (const conv of SEED) {
			let prevId: number | null = null;
			for (let i = 0; i < conv.lines.length; i++) {
				const speaker = i % 2 === 0 ? "human" : "bot";
				const line: CleverbotTranscriptLine = {
					id: this.nextId++,
					speaker,
					text: conv.lines[i],
					respondsTo: prevId,
					createdAt: Date.now(),
					sessionId,
					contributorId: conv.contributorId,
					consolidated: true,
				};
				this.lines.push(line);
				prevId = line.id;
			}
		}
		this.save();
	}

	all(): CleverbotTranscriptLine[] {
		return this.lines;
	}

	consolidatedLines(): CleverbotTranscriptLine[] {
		return this.lines.filter((l) => l.consolidated);
	}

	withReplies(): {
		line: CleverbotTranscriptLine;
		reply: CleverbotTranscriptLine;
	}[] {
		const consolidated = this.consolidatedLines();
		const byRespondsTo = new Map<number, CleverbotTranscriptLine>();
		for (const l of consolidated) {
			if (l.respondsTo !== null) {
				byRespondsTo.set(l.respondsTo, l);
			}
		}
		const out: {
			line: CleverbotTranscriptLine;
			reply: CleverbotTranscriptLine;
		}[] = [];
		for (const l of consolidated) {
			const reply = byRespondsTo.get(l.id);
			if (reply) {
				out.push({ line: l, reply });
			}
		}
		return out;
	}

	append(
		speaker: "human" | "bot",
		text: string,
		respondsTo: number | null,
		sessionId: string,
		contributorId: string,
		consolidated: boolean
	): CleverbotTranscriptLine {
		const line: CleverbotTranscriptLine = {
			id: this.nextId++,
			speaker,
			text,
			respondsTo,
			createdAt: Date.now(),
			sessionId,
			contributorId,
			consolidated,
		};
		this.lines.push(line);
		return line;
	}

	consolidate(): number {
		let count = 0;
		for (const l of this.lines) {
			if (!l.consolidated) {
				l.consolidated = true;
				count++;
			}
		}
		return count;
	}

	save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lines));
		} catch {
			// localStorage full or unavailable
		}
	}
}

function findCandidatesCleverbot(
	store: CleverbotStore,
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
		const all = store.consolidatedLines();
		const idx = all.findIndex((l) => l.id === line.id);
		if (idx === -1) {
			continue;
		}

		const priorTexts: string[] = [];
		for (
			let i = idx - 1;
			i >= 0 && priorTexts.length < config.contextWindow;
			i--
		) {
			if (all[i].sessionId !== line.sessionId) {
				break;
			}
			priorTexts.unshift(all[i].text);
		}
		const contextFit =
			recentContext.length > 0 && priorTexts.length > 0
				? similarity(recentContext.join(" "), priorTexts.join(" "))
				: 0;

		const ageMs = now - line.createdAt;
		const ageDays = ageMs / (1000 * 60 * 60 * 24);
		const recencyBonus = 1 / (1 + ageDays / 30);

		const score = 0.5 * relevance + 0.4 * contextFit + 0.1 * recencyBonus;
		scored.push({ line, reply, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, config.topK);
}

export function createCleverbotBot(): ChatBot {
	const store = new CleverbotTranscriptStore();
	const sessionId = `session-${Date.now()}`;
	let context: string[] = [];
	let lastBotLine: CleverbotTranscriptLine | null = null;
	let consolidated = false;

	return {
		name: "Cleverbot",
		description:
			"Multi-persona transcript chatbot — learns from millions of users.",
		greeting() {
			return "Hello! I'm Cleverbot. Talk to me and I'll get better over time. Note: I only learn between sessions, not during.";
		},
		response(input: string) {
			const userLine = store.append(
				"human",
				input,
				lastBotLine?.id ?? null,
				sessionId,
				"visitor",
				true
			);
			store.save();

			const candidates = findCandidatesCleverbot(store, input, context, CONFIG);
			const picked = pickReply(candidates);

			let reply: string;
			if (picked) {
				reply = picked.reply.text;
			} else {
				reply = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
			}

			const botLine = store.append(
				"bot",
				reply,
				userLine.id,
				sessionId,
				PERSONAS[Math.floor(Math.random() * PERSONAS.length)],
				consolidated
			);
			store.save();
			lastBotLine = botLine;

			context.push(input, reply);
			if (context.length > 6) {
				context = context.slice(-6);
			}

			return reply;
		},
		reset() {
			const count = store.consolidate();
			consolidated = true;
			store.save();
			context = [];
			lastBotLine = null;
			if (count > 0) {
				console.log(`Cleverbot retrain: ${count} lines consolidated.`);
			}
		},
	};
}
