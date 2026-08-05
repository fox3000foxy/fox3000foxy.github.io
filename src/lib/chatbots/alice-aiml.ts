interface AimlCategory {
	pattern: string;
	template: string;
	that?: string;
}

/**
 * Browser-compatible AIML interpreter based on joric/aiml approach.
 * Works with pre-parsed Category[] instead of live DOM.
 *
 * Supports: <star/>, <srai>, <sr/>, <random>, <set>/<get>, <condition>,
 * <that>, <bot>, <think>, <person/>, <person2/>.
 */
export class AliceAIML {
	private categories: AimlCategory[] = [];
	private lastWildcard = "";
	private sraiDepth = 0;
	private storedVars = new Map<string, string>();
	private previousAnswer = "";

	constructor(categories: AimlCategory[]) {
		this.categories = categories;
	}

	greeting(): string {
		return "HOW DO YOU DO.  PLEASE STATE YOUR PROBLEM.";
	}

	reset(): void {
		this.storedVars.clear();
		this.previousAnswer = "";
		this.sraiDepth = 0;
	}

	setPreviousAnswer(answer: string): void {
		this.previousAnswer = answer;
	}

	response(input: string): string {
		const cleaned = this.clean(input);
		const cat = this.findMatch(cleaned);
		if (!cat) {
			return "I DON'T KNOW.";
		}
		this.sraiDepth = 0;
		const result = this.processTemplate(cat.template, cleaned);
		this.previousAnswer = result;
		return result || "I DON'T KNOW.";
	}

	private clean(s: string): string {
		return s.replace(/\s+/g, " ").trim().toUpperCase();
	}

	private findMatch(input: string): AimlCategory | null {
		for (const cat of this.categories) {
			const re = this.patternToRegex(cat.pattern);
			const m = input.match(re);
			if (m) {
				this.lastWildcard = m[1] || "";
				if (cat.that) {
					const thatRe = this.patternToRegex(cat.that);
					if (!this.previousAnswer.match(thatRe)) {
						continue;
					}
				}
				return cat;
			}
		}
		return null;
	}

	private patternToRegex(pattern: string): RegExp {
		const parts = pattern.split(/\s+/);
		const reParts = parts.map((p) => {
			if (p === "*" || p === "_") {
				return "\\s*(.*)\\s*";
			}
			return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		});
		return new RegExp(`^\\s*${reParts.join("\\s+")}\\s*$`, "i");
	}

	/**
	 * Process an AIML template string by walking XML-like tags.
	 * Templates are stored as raw XML strings, so we parse tags on the fly.
	 */
	private processTemplate(tpl: string, input: string): string {
		let result = "";
		let i = 0;
		while (i < tpl.length) {
			if (tpl[i] === "<") {
				const closeIdx = tpl.indexOf(">", i);
				if (closeIdx === -1) {
					result += tpl[i];
					i++;
					continue;
				}
				const tag = tpl.slice(i + 1, closeIdx).trim();
				const tagName = tag.split(/\s/)[0].toLowerCase();
				const tagAttrs = tag.slice(tagName.length).trim();

				if (tagName === "star") {
					result += this.lastWildcard;
					i = closeIdx + 1;
				} else if (tagName === "sr") {
					this.sraiDepth++;
					const sr = this.processSrai(this.lastWildcard);
					this.sraiDepth--;
					result += sr;
					i = closeIdx + 1;
				} else if (tagName === "srai") {
					const inner = this.extractInner(tpl, closeIdx + 1, "srai");
					this.sraiDepth++;
					const sr = this.processSrai(this.clean(inner.text));
					this.sraiDepth--;
					result += sr;
					i = inner.end;
				} else if (tagName === "random") {
					const inner = this.extractInner(tpl, closeIdx + 1, "random");
					const lis = this.extractLiItems(inner.text);
					if (lis.length > 0) {
						const picked = lis[Math.floor(Math.random() * lis.length)];
						result += this.processTemplate(picked, input);
					}
					i = inner.end;
				} else if (tagName === "li") {
					const inner = this.extractInner(tpl, closeIdx + 1, "li");
					result += this.processTemplate(inner.text, input);
					i = inner.end;
				} else if (tagName === "think") {
					const inner = this.extractInner(tpl, closeIdx + 1, "think");
					this.processTemplate(inner.text, input);
					i = inner.end;
				} else if (tagName === "set") {
					const nameMatch = tagAttrs.match(/name\s*=\s*"([^"]*)"/);
					const name = nameMatch?.[1] || "";
					const inner = this.extractInner(tpl, closeIdx + 1, "set");
					const value = this.processTemplate(inner.text, input);
					if (name) {
						this.storedVars.set(name, value);
					}
					result += value;
					i = inner.end;
				} else if (tagName === "get") {
					const nameMatch = tagAttrs.match(/name\s*=\s*"([^"]*)"/);
					const name = nameMatch?.[1] || "";
					result += this.storedVars.get(name) || "";
					i = closeIdx + 1;
				} else if (tagName === "bot") {
					const nameMatch = tagAttrs.match(/name\s*=\s*"([^"]*)"/);
					const name = nameMatch?.[1] || "";
					result += this.botAttr(name);
					i = closeIdx + 1;
				} else if (tagName === "condition") {
					const inner = this.extractInner(tpl, closeIdx + 1, "condition");
					result += this.processCondition(tagAttrs, inner.text, input);
					i = inner.end;
				} else if (tagName === "person") {
					result += this.swapPerson(this.lastWildcard);
					i = closeIdx + 1;
				} else if (tagName === "person2") {
					result += this.swapPerson2(this.lastWildcard);
					i = closeIdx + 1;
				} else if (tagName === "that") {
					i = closeIdx + 1;
				} else if (tagName === "br") {
					result += "\n";
					i = closeIdx + 1;
				} else {
					result += `<${tag}>`;
					i = closeIdx + 1;
				}
			} else {
				result += tpl[i];
				i++;
			}
		}
		return result;
	}

	private extractInner(
		tpl: string,
		start: number,
		tagName: string
	): { text: string; end: number } {
		let depth = 1;
		let i = start;
		while (i < tpl.length && depth > 0) {
			if (tpl[i] === "<") {
				const closeIdx = tpl.indexOf(">", i);
				if (closeIdx === -1) {
					break;
				}
				const tag = tpl.slice(i + 1, closeIdx).trim();
				const name = tag.split(/\s/)[0].toLowerCase();
				if (tag.startsWith(`/${tagName}`)) {
					depth--;
				} else if (name === tagName && !tag.endsWith("/")) {
					depth++;
				}
				if (depth === 0) {
					return { text: tpl.slice(start, i), end: closeIdx + 1 };
				}
				i = closeIdx + 1;
			} else {
				i++;
			}
		}
		return { text: tpl.slice(start, i), end: i };
	}

	private extractLiItems(text: string): string[] {
		const items: string[] = [];
		let depth = 0;
		let current = "";
		for (let i = 0; i < text.length; i++) {
			if (text[i] === "<") {
				const closeIdx = text.indexOf(">", i);
				if (closeIdx === -1) {
					current += text[i];
					continue;
				}
				const tag = text
					.slice(i + 1, closeIdx)
					.trim()
					.toLowerCase();
				if (tag === "li") {
					depth++;
					if (depth === 1) {
						current = "";
					}
				} else if (tag === "/li") {
					depth--;
					if (depth === 0) {
						items.push(current.trim());
						current = "";
					}
				} else if (depth > 0) {
					current += text.slice(i, closeIdx + 1);
				}
				i = closeIdx;
			} else if (depth > 0) {
				current += text[i];
			}
		}
		return items;
	}

	private processSrai(pattern: string): string {
		if (this.sraiDepth > 10) {
			return "";
		}
		const cat = this.findMatch(pattern);
		if (cat) {
			return this.processTemplate(cat.template, pattern);
		}
		return "";
	}

	private processCondition(
		attrs: string,
		inner: string,
		input: string
	): string {
		const nameMatch = attrs.match(/name\s*=\s*"([^"]*)"/);
		const valueMatch = attrs.match(/value\s*=\s*"([^"]*)"/);
		const name = nameMatch?.[1] || "";
		const value = valueMatch?.[1] || "";

		if (name && value) {
			const stored = this.storedVars.get(name);
			if (stored && this.clean(stored) === this.clean(value)) {
				return this.processTemplate(inner, input);
			}
			return "";
		}

		// List condition: <condition><li name="X" value="Y">...</li>...</condition>
		const lis = this.extractLiItems(inner);
		for (const li of lis) {
			const liAttrs = this.extractTagAttrs(li, "li");
			const liName = liAttrs.name || name;
			const liValue = liAttrs.value || "";
			if (!liValue) {
				return this.processTemplate(this.stripTag(li, "li"), input);
			}
			const stored = this.storedVars.get(liName);
			if (stored && this.clean(stored) === this.clean(liValue)) {
				return this.processTemplate(this.stripTag(li, "li"), input);
			}
		}
		return "";
	}

	private extractTagAttrs(
		text: string,
		tagName: string
	): Record<string, string> {
		const re = new RegExp(`<${tagName}([^>]*)>`, "i");
		const m = text.match(re);
		if (!m) {
			return {};
		}
		const attrs: Record<string, string> = {};
		const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
		for (const am of m[1].matchAll(attrRe)) {
			attrs[am[1]] = am[2];
		}
		return attrs;
	}

	private stripTag(text: string, tagName: string): string {
		const open = new RegExp(`<${tagName}[^>]*>`, "i");
		const close = new RegExp(`</${tagName}>`, "i");
		return text.replace(open, "").replace(close, "").trim();
	}

	private swapPerson(text: string): string {
		return text
			.replace(/\bI\b/g, "YOU")
			.replace(/\bMY\b/g, "YOUR")
			.replace(/\bME\b/g, "YOU")
			.replace(/\bAM\b/g, "ARE")
			.replace(/\bYOU\b/g, "I")
			.replace(/\bYOUR\b/g, "MY")
			.replace(/\bARE\b/g, "AM");
	}

	private swapPerson2(text: string): string {
		return text
			.replace(/\bI\b/g, "HE")
			.replace(/\bMY\b/g, "HIS")
			.replace(/\bME\b/g, "HIM")
			.replace(/\bYOU\b/g, "THEY")
			.replace(/\bYOUR\b/g, "THEIR");
	}

	private botAttr(name: string): string {
		const attrs: Record<string, string> = {
			name: "ALICE",
			master: "Dr. Richard Wallace",
			gender: "female",
			age: "18",
			birthday: "November 23, 1995",
			botmaster: "Dr. Richard Wallace",
			favorite_band: "The Beatles",
			favorite_song: "Yesterday",
			favorite_book: "The Lord of the Rings",
			favorite_movie: "The Matrix",
			favorite_color: "blue",
			favorite_food: "pizza",
			location: "Oakland, California",
			species: "A.L.I.C.E.",
			religion: "Agnostic",
			website: "http://www.alicebot.org",
			technicalSupport: "A.L.I.C.E. A.I. Foundation",
			party: "Green",
			volume: "medium",
			google_api: "no",
		};
		return attrs[name.toLowerCase()] || "";
	}
}
