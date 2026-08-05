import type { ChatBot } from "./types";
import { AliceAIML } from "./alice-aiml";

interface AimlCategory {
	pattern: string;
	template: string;
	that?: string;
}

let cached: AliceAIML | null = null;

async function loadAlice(): Promise<AliceAIML> {
	if (cached) {
		return cached;
	}
	const res = await fetch("/chatbots/alice/aiml.json");
	const categories: AimlCategory[] = await res.json();
	cached = new AliceAIML(categories);
	return cached;
}

export async function createAliceBot(): Promise<ChatBot> {
	const alice = await loadAlice();

	return {
		name: "A.L.I.C.E.",
		description: "Simulateur AIML — 3× vainqueur du Loebner Prize.",
		greeting() {
			return alice.greeting();
		},
		response(input: string) {
			return alice.response(input);
		},
		reset() {
			alice.reset();
		},
	};
}
