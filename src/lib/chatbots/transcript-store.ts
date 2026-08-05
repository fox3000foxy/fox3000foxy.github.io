import type { TranscriptLine } from "./types";

const STORAGE_KEY = "fox-chatbot-transcript";

export class TranscriptStore {
	private lines: TranscriptLine[] = [];
	private nextId = 1;

	constructor() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				this.lines = JSON.parse(raw) as TranscriptLine[];
				this.nextId = this.lines.length
					? Math.max(...this.lines.map((l) => l.id)) + 1
					: 1;
			}
		} catch {
			this.lines = [];
		}
	}

	all(): TranscriptLine[] {
		return this.lines;
	}

	withReplies(): { line: TranscriptLine; reply: TranscriptLine }[] {
		const byRespondsTo = new Map<number, TranscriptLine>();
		for (const l of this.lines) {
			if (l.respondsTo !== null) {
				byRespondsTo.set(l.respondsTo, l);
			}
		}
		const out: { line: TranscriptLine; reply: TranscriptLine }[] = [];
		for (const l of this.lines) {
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
		sessionId: string
	): TranscriptLine {
		const line: TranscriptLine = {
			id: this.nextId++,
			speaker,
			text,
			respondsTo,
			createdAt: Date.now(),
			sessionId,
		};
		this.lines.push(line);
		return line;
	}

	save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lines));
		} catch {
			// localStorage full or unavailable
		}
	}

	loadSeed(seedConversations: string[][]) {
		if (this.lines.length > 0) {
			return;
		}
		const sessionId = "seed";
		for (const conv of seedConversations) {
			let prevId: number | null = null;
			for (let i = 0; i < conv.length; i++) {
				const speaker = i % 2 === 0 ? "human" : "bot";
				const line = this.append(speaker, conv[i], prevId, sessionId);
				prevId = line.id;
			}
		}
		this.save();
	}

	size(): number {
		return this.lines.length;
	}
}
