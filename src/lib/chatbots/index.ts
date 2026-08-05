import type { ChatBot } from "./types";
import { DEFAULT_DOCTOR } from "./eliza-data";

export type BotName = "eliza" | "parry" | "alice" | "jabberwacky" | "cleverbot";

export interface BotInfo {
	name: string;
	year: number;
	author: string;
	description: string;
}

export const BOTS: Record<BotName, BotInfo> = {
	eliza: {
		name: "ELIZA",
		year: 1966,
		author: "Joseph Weizenbaum, MIT",
		description:
			"Simulateur de thérapeute rogerien — premier chatbot de l'histoire, par correspondance de motifs.",
	},
	parry: {
		name: "PARRY",
		year: 1972,
		author: "Kenneth Colby, Stanford",
		description:
			"Simulateur de patient paranoid — premier chatbot avec modèle émotionnel.",
	},
	alice: {
		name: "A.L.I.C.E.",
		year: 1995,
		author: "Dr. Richard Wallace",
		description:
			"Système de questions-réponses par pattern matching AIML — 3× vainqueur du Loebner Prize.",
	},
	jabberwacky: {
		name: "Jabberwacky",
		year: 2000,
		author: "Rollo Carpenter",
		description:
			"Chatbot basé sur des transcripts — apprend de chaque conversation.",
	},
	cleverbot: {
		name: "Cleverbot",
		year: 1997,
		author: "Rollo Carpenter, Existor",
		description:
			"Successeur de Jabberwacky — apprend de millions d'utilisateurs simultanément.",
	},
};

export const BOT_NAMES: BotName[] = [
	"eliza",
	"parry",
	"alice",
	"jabberwacky",
	"cleverbot",
];

async function createElizaBot(): Promise<ChatBot> {
	const { Eliza, readElizaScript } = await import("./eliza"); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	const script = readElizaScript(DEFAULT_DOCTOR);
	const eliza = new Eliza(script.rules, script.memRule);
	const greeting =
		script.helloMessage.length > 0
			? script.helloMessage.join(" ")
			: "HOW DO YOU DO.  PLEASE TELL ME YOUR PROBLEM";

	return {
		name: "ELIZA",
		description: "Basé sur le script DOCTOR de 1966.",
		greeting() {
			return greeting;
		},
		response(input: string) {
			return eliza.response(input);
		},
		reset() {
			// ELIZA has minimal state (round-robin counters + memory)
			// Creating a fresh instance fully resets it
		},
	};
}

async function createParryBot(): Promise<ChatBot> {
	const { Parry } = await import("./parry");
	const parry = new Parry();

	return {
		name: "PARRY",
		description:
			"Simulateur de patient paranoid — premier chatbot avec modèle émotionnel.",
		greeting() {
			return parry.greeting();
		},
		response(input: string) {
			return parry.response(input);
		},
		reset() {
			parry.reset();
		},
	};
}

async function createAliceBot(): Promise<ChatBot> {
	const { createAliceBot } = await import("./alice");
	return createAliceBot();
}

async function createJabberwackyBot(): Promise<ChatBot> {
	const { createJabberwackyBot } = await import("./jabberwacky");
	return createJabberwackyBot();
}

async function createCleverbotBot(): Promise<ChatBot> {
	const { createCleverbotBot } = await import("./cleverbot");
	return createCleverbotBot();
}

export function createChatbot(name: BotName): Promise<ChatBot> {
	switch (name) {
		case "eliza":
			return createElizaBot();
		case "parry":
			return createParryBot();
		case "alice":
			return createAliceBot();
		case "jabberwacky":
			return createJabberwackyBot();
		case "cleverbot":
			return createCleverbotBot();
		default:
			throw new Error(`Bot "${name}" not yet implemented`);
	}
}
