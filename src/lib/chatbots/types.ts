export interface ChatMessage {
	role: "user" | "bot";
	text: string;
}

export interface ChatBot {
	name: string;
	description: string;
	greeting(): string;
	response(input: string): string;
	reset(): void;
}

export interface TranscriptLine {
	id: number;
	speaker: "human" | "bot";
	text: string;
	respondsTo: number | null;
	createdAt: number;
	sessionId: string;
}

export interface Candidate {
	line: TranscriptLine;
	reply: TranscriptLine;
	score: number;
}

export interface BotConfig {
	contextWindow: number;
	topK: number;
	minScore: number;
}
