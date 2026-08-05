import type { ChatBot } from "./types";
import { findCandidates, pickReply } from "./matcher";
import { TranscriptStore } from "./transcript-store";
import { SEED_CONVERSATIONS } from "./jabberwacky-seed";
import type { BotConfig, TranscriptLine } from "./types";

const CONFIG: BotConfig = {
	contextWindow: 2,
	topK: 5,
	minScore: 0.1,
};

const FALLBACKS = [
	"I'm not sure what to say to that yet.",
	"That's a new one for me.",
	"I don't have a good answer for that.",
	"Can you rephrase that?",
	"I'm still learning, give me something else.",
];

export function createJabberwackyBot(): ChatBot {
	const store = new TranscriptStore();
	store.loadSeed(SEED_CONVERSATIONS);
	const sessionId = `session-${Date.now()}`;
	let context: string[] = [];
	let lastBotLine: TranscriptLine | null = null;

	return {
		name: "Jabberwacky",
		description: "Transcript-based chatbot — learns from conversations.",
		greeting() {
			return "Hello there. I'm Jabberwacky. Talk to me and I'll get smarter over time.";
		},
		response(input: string) {
			const userLine = store.append(
				"human",
				input,
				lastBotLine?.id ?? null,
				sessionId
			);
			store.save();

			const candidates = findCandidates(store, input, context, CONFIG);
			const picked = pickReply(candidates);

			let reply: string;
			if (picked) {
				reply = picked.reply.text;
			} else {
				reply = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
			}

			const botLine = store.append("bot", reply, userLine.id, sessionId);
			store.save();
			lastBotLine = botLine;

			context.push(input, reply);
			if (context.length > 6) {
				context = context.slice(-6);
			}

			return reply;
		},
		reset() {
			context = [];
			lastBotLine = null;
		},
	};
}
