/**
 * ============================================================================
 * ELIZA / DOCTOR -- TypeScript port
 * ============================================================================
 *
 * Faithful reimplementation of Joseph Weizenbaum's 1966 ELIZA program,
 * based on github.com/fox3000foxy/chatbots (anthay/ELIZA C++ reconstruction).
 */

type StringList = string[];

function split(s: string): StringList {
	const result: StringList = [];
	let word = "";
	for (const ch of s) {
		if (ch === " ") {
			if (word) {
				result.push(word);
				word = "";
			}
		} else {
			word += ch;
		}
	}
	if (word) {
		result.push(word);
	}
	return result;
}

function join(words: StringList): string {
	return words.filter((w) => w).join(" ");
}

function toInt(s: string): number {
	if (/^\d+$/.test(s)) {
		return Number.parseInt(s, 10);
	}
	return -1;
}

const HOLLERITH_UNDEFINED = 0xff;
const HOLLERITH_ENCODING: Uint8Array = (() => {
	const bcd = [
		"0",
		"1",
		"2",
		"3",
		"4",
		"5",
		"6",
		"7",
		"8",
		"9",
		null,
		"=",
		"'",
		null,
		null,
		null,
		"+",
		"A",
		"B",
		"C",
		"D",
		"E",
		"F",
		"G",
		"H",
		"I",
		null,
		".",
		")",
		null,
		null,
		null,
		"-",
		"J",
		"K",
		"L",
		"M",
		"N",
		"O",
		"P",
		"Q",
		"R",
		null,
		"$",
		"*",
		null,
		null,
		null,
		" ",
		"/",
		"S",
		"T",
		"U",
		"V",
		"W",
		"X",
		"Y",
		"Z",
		null,
		",",
		"(",
		null,
		null,
		null,
	];
	const arr = new Uint8Array(256);
	arr.fill(HOLLERITH_UNDEFINED);
	for (let i = 0; i < 64; i++) {
		if (bcd[i]) {
			arr[bcd[i]!.charCodeAt(0)] = i;
		}
	}
	return arr;
})();

function hollerithDefined(c: string): boolean {
	const code = c.charCodeAt(0);
	return code < 256 && HOLLERITH_ENCODING[code] !== HOLLERITH_UNDEFINED;
}

function elizaUppercase(utf8String: string): string {
	let result = "";
	for (const ch of utf8String) {
		const cp = ch.codePointAt(0)!;
		switch (cp) {
			case 0x2019:
				result += "'";
				break;
			case 0x2018:
			case 0x0060:
			case 0x0022:
			case 0x00ab:
			case 0x00bb:
			case 0x201a:
			case 0x201b:
			case 0x201c:
			case 0x201d:
			case 0x201e:
			case 0x201f:
			case 0x2039:
			case 0x203a:
				result += " ";
				break;
			case 0x0021:
			case 0x003f:
				result += ".";
				break;
			case 0x00a1:
			case 0x00bf:
				result += " ";
				break;
			case 0x003a:
			case 0x003b:
			case 0x2013:
			case 0x2014:
				result += ",";
				break;
			default:
				result += ch.toUpperCase();
				break;
		}
	}
	return result;
}

function splitUserInput(s: string, punctuation: string): StringList {
	const result: StringList = [];
	let word = "";
	for (const ch of s) {
		if (ch === " " || punctuation.includes(ch)) {
			if (word) {
				result.push(word);
				word = "";
			}
			if (ch !== " ") {
				result.push(ch);
			}
		} else {
			word += ch;
		}
	}
	if (word) {
		result.push(word);
	}
	return result;
}

function lastChunkAsBcd(s: string): number {
	let result = 0;
	const append = (c: string) => {
		result <<= 6;
		if (hollerithDefined(c)) {
			result |= HOLLERITH_ENCODING[c.charCodeAt(0)];
		} else {
			result |= c.charCodeAt(0) & 0x3f;
		}
	};
	let count = 0;
	if (s.length > 0) {
		const start = Math.floor((s.length - 1) / 6) * 6;
		for (let i = start; i < s.length; i++, count++) {
			append(s[i]);
		}
	}
	while (count++ < 6) {
		append(" ");
	}
	return result >>> 0;
}

function hash(d: number, n: number): number {
	d &= 0x7ffffffff;
	d = Math.imul(d, d);
	const shift = 35 - Math.floor(n / 2);
	const dBig = BigInt(d);
	const squared = dBig * dBig;
	const shifted = squared >> BigInt(shift);
	const mask = (BigInt(1) << BigInt(n)) - BigInt(1);
	// biome-ignore lint/nursery/noUselessTypeConversion: BigInt → number conversion is needed
	return Number(shifted & mask);
}

type TagMap = Map<string, StringList>;

const TAG_SIX_CHAR = "USE_SIX_CHAR_MATCHING_BEHAVIOR";

function inlist(word: string, wordlist: string, tags: TagMap): boolean {
	let wl = wordlist;
	if (wl.endsWith(")")) {
		wl = wl.slice(0, -1);
	}
	let cp = wl.startsWith("(") ? wl.slice(1) : wl;
	cp = cp.trimStart();

	const sixCharBehavior = () => {
		const t = tags.get(TAG_SIX_CHAR);
		return t !== undefined && t[0] === TAG_SIX_CHAR;
	};

	if (cp.startsWith("*")) {
		cp = cp.slice(1).trim();
		const items = split(cp);
		if (sixCharBehavior()) {
			const word6 = word.slice(0, 6);
			for (const w of items) {
				for (let i = 0; i < w.length; i += 6) {
					if (w.slice(i, i + 6) === word6) {
						return true;
					}
				}
			}
			return false;
		}
		return items.includes(word);
	}
	if (cp.startsWith("/")) {
		cp = cp.slice(1).trim();
		const tagNames = split(cp);
		for (const tag of tagNames) {
			const t = tags.get(tag);
			if (t?.includes(word)) {
				return true;
			}
		}
	}
	return false;
}

function match(
	tags: TagMap,
	pattern: StringList,
	words: StringList
): StringList | null {
	const patArray = [...pattern];
	const wordArray = [...words];
	const matches = new Array<string>(patArray.length);

	function xmatch(
		pBegin: number,
		pEnd: number,
		wBegin: number,
		fixedLen: number
	): { wEnd: number } | null {
		if (wordArray.length - wBegin < fixedLen) {
			return null;
		}

		const hasWildcard =
			pBegin < patArray.length && toInt(patArray[pBegin]) === 0;
		let wildcardLen: number;
		let wildcardEnd: number;

		if (hasWildcard) {
			if (pEnd === patArray.length) {
				wildcardLen = wordArray.length - wBegin - fixedLen;
				wildcardEnd = wildcardLen;
			} else {
				wildcardLen = 0;
				wildcardEnd = wordArray.length - wBegin - fixedLen;
			}
		} else {
			wildcardLen = 0;
			wildcardEnd = 0;
		}

		for (; wildcardLen <= wildcardEnd; wildcardLen++) {
			let p = pBegin + (hasWildcard ? 1 : 0);
			let w = wBegin + wildcardLen;
			let ok = true;
			for (; p < pEnd; p++) {
				const n = toInt(patArray[p]);
				if (n > 0) {
					if (w + n > wordArray.length) {
						ok = false;
						break;
					}
					const part: StringList = [];
					for (let i = 0; i < n; i++) {
						part.push(wordArray[w++]);
					}
					matches[p] = join(part);
				} else {
					if (w >= wordArray.length) {
						ok = false;
						break;
					}
					if (patArray[p].startsWith("(")) {
						if (inlist(wordArray[w], patArray[p], tags)) {
							matches[p] = wordArray[w++];
						} else {
							ok = false;
							break;
						}
					} else if (patArray[p] === wordArray[w]) {
						matches[p] = wordArray[w++];
					} else {
						ok = false;
						break;
					}
				}
			}
			if (ok) {
				if (hasWildcard) {
					const part: StringList = [];
					for (let i = 0; i < wildcardLen; i++) {
						part.push(wordArray[wBegin + i]);
					}
					matches[pBegin] = join(part);
				}
				return { wEnd: w };
			}
			if (wildcardLen === wildcardEnd) {
				break;
			}
		}
		return null;
	}

	let w = 0;
	let pSegEnd = 0;
	while (pSegEnd < patArray.length) {
		let fixedLen = 0;
		const p = pSegEnd;
		for (; pSegEnd < patArray.length; pSegEnd++) {
			const n = toInt(patArray[pSegEnd]);
			if (n === 0) {
				if (pSegEnd > p) {
					break;
				}
			} else if (n > 0) {
				fixedLen += n;
			} else {
				fixedLen++;
			}
		}
		const result = xmatch(p, pSegEnd, w, fixedLen);
		if (!result) {
			return null;
		}
		w = result.wEnd;
	}
	if (w < wordArray.length) {
		return null;
	}

	const result: StringList = [];
	for (const m of matches) {
		result.push(m);
	}
	return result;
}

function reassemble(
	reassemblyRule: StringList,
	components: StringList
): StringList {
	const result: StringList = [];
	for (const r of reassemblyRule) {
		const n = toInt(r);
		if (n < 0) {
			result.push(r);
		} else if (n === 0 || n > components.length) {
			result.push("HMMM");
		} else {
			const expanded = split(components[n - 1]);
			result.push(...expanded);
		}
	}
	return result;
}

namespace TokenType {
	export const EOF = "eof";
	export const SYMBOL = "symbol";
	export const NUMBER = "number";
	export const OPEN = "open";
	export const CLOSE = "close";
}
interface Token {
	type: string;
	value: string;
}

class Tokenizer {
	private pos = 0;
	private lineNumber = 1;
	private peeked: Token | null = null;
	private src: string;

	constructor(source: string) {
		this.src = source;
	}

	peektok(): Token {
		if (!this.peeked) {
			this.peeked = this.readtok();
		}
		return this.peeked;
	}

	nexttok(): Token {
		if (this.peeked) {
			const t = this.peeked;
			this.peeked = null;
			return t;
		}
		return this.readtok();
	}

	line(): number {
		return this.lineNumber;
	}

	private isWhitespace(ch: string): boolean {
		return ch <= " " || ch === "\x7f";
	}

	private isNewline(ch: string): boolean {
		return ch === "\x0a" || ch === "\x0b" || ch === "\x0c" || ch === "\x0d";
	}

	private readtok(): Token {
		while (this.pos < this.src.length) {
			let ch = this.src[this.pos];
			while (this.pos < this.src.length && this.isWhitespace(ch)) {
				if (this.isNewline(ch)) {
					this.lineNumber++;
					if (
						ch === "\x0d" &&
						this.pos + 1 < this.src.length &&
						this.src[this.pos + 1] === "\x0a"
					) {
						this.pos++;
					}
				}
				this.pos++;
				ch = this.pos < this.src.length ? this.src[this.pos] : "";
			}
			if (this.pos >= this.src.length) {
				return { type: TokenType.EOF, value: "" };
			}
			ch = this.src[this.pos];
			if (ch === ";") {
				while (
					this.pos < this.src.length &&
					!this.isNewline(this.src[this.pos])
				) {
					this.pos++;
				}
				continue;
			}
			break;
		}
		if (this.pos >= this.src.length) {
			return { type: TokenType.EOF, value: "" };
		}
		const ch = this.src[this.pos];
		if (ch === "(") {
			this.pos++;
			return { type: TokenType.OPEN, value: "(" };
		}
		if (ch === ")") {
			this.pos++;
			return { type: TokenType.CLOSE, value: ")" };
		}
		if (ch === "=") {
			this.pos++;
			return { type: TokenType.SYMBOL, value: "=" };
		}

		if (ch >= "0" && ch <= "9") {
			let value = "";
			while (
				this.pos < this.src.length &&
				this.src[this.pos] >= "0" &&
				this.src[this.pos] <= "9"
			) {
				value += this.src[this.pos++];
			}
			return { type: TokenType.NUMBER, value };
		}

		let value = "";
		while (this.pos < this.src.length) {
			const c = this.src[this.pos];
			if (
				c === "(" ||
				c === ")" ||
				c === ";" ||
				c === "=" ||
				this.isWhitespace(c)
			) {
				break;
			}
			value += c;
			this.pos++;
		}
		return { type: TokenType.SYMBOL, value: elizaUppercase(value) };
	}
}

interface ITransform {
	decomposition: StringList;
	reassemblyRules: StringList[];
	nextReassemblyRule: number;
}

enum Action {
	Inapplicable = 0,
	Complete = 1,
	Newkey = 2,
	Linkkey = 3,
}

abstract class RuleBase {
	keyword: string;
	wordSubstitution: string;
	precedence: number;

	constructor(keyword: string, substitute: string, prec: number) {
		this.keyword = keyword;
		this.wordSubstitution = substitute;
		this.precedence = prec;
	}

	applyWordSubstitution(word: string): string | null {
		if (!this.wordSubstitution || word !== this.keyword) {
			return null;
		}
		return this.wordSubstitution;
	}

	abstract hasTransformation(): boolean;
	abstract applyTransformation(
		words: StringList,
		tags: TagMap,
		linkKeyword: { value: string }
	): Action;
}

class RuleKeyword extends RuleBase {
	private tags: StringList = [];
	private linkKeyword = "";
	private transforms: ITransform[] = [];

	constructor(
		keyword: string,
		substitute: string,
		prec: number,
		tags: StringList,
		linkKw: string
	) {
		super(keyword, substitute, prec);
		this.tags = tags;
		this.linkKeyword = linkKw;
	}

	get dlistTags(): StringList {
		return this.tags;
	}

	hasTransformation(): boolean {
		return this.transforms.length > 0 || Boolean(this.linkKeyword);
	}

	addTransform(decomp: StringList, reassembly: StringList[]) {
		this.transforms.push({
			decomposition: decomp,
			reassemblyRules: reassembly,
			nextReassemblyRule: 0,
		});
	}

	applyTransformation(
		words: StringList,
		tags: TagMap,
		linkKw: { value: string }
	): Action {
		let constituents: StringList | null = null;
		let rule: ITransform | undefined;
		for (const t of this.transforms) {
			const result = match(tags, t.decomposition, words);
			if (result !== null) {
				constituents = result;
				rule = t;
				break;
			}
		}
		if (!rule) {
			if (this.linkKeyword) {
				linkKw.value = this.linkKeyword;
				return Action.Linkkey;
			}
			return Action.Inapplicable;
		}

		const reassemblyRule = rule.reassemblyRules[rule.nextReassemblyRule];
		rule.nextReassemblyRule =
			(rule.nextReassemblyRule + 1) % rule.reassemblyRules.length;

		if (reassemblyRule.length === 1 && reassemblyRule[0] === "NEWKEY") {
			return Action.Newkey;
		}

		if (reassemblyRule.length === 2 && reassemblyRule[0].startsWith("=")) {
			linkKw.value = reassemblyRule[1];
			return Action.Linkkey;
		}

		if (reassemblyRule.length > 0 && reassemblyRule[0] === "(") {
			const preEnd = reassemblyRule.indexOf(")", 2);
			const reassem = reassemblyRule.slice(3, preEnd);
			linkKw.value = reassemblyRule[reassemblyRule.length - 2];
			words.length = 0;
			words.push(...reassemble(reassem, constituents!));
			return Action.Linkkey;
		}

		const result = reassemble(reassemblyRule, constituents!);
		words.length = 0;
		words.push(...result);
		return Action.Complete;
	}
}

class RuleMemory extends RuleBase {
	static readonly NUM_TRANSFORMS = 4;
	private memories: StringList = [];
	private transforms: ITransform[] = [];

	constructor(keyword: string) {
		super(keyword, "", 0);
	}

	isEmpty(): boolean {
		return !this.keyword || this.transforms.length === 0;
	}

	addTransform(decomp: StringList, reassembly: StringList[]) {
		this.transforms.push({
			decomposition: decomp,
			reassemblyRules: reassembly,
			nextReassemblyRule: 0,
		});
	}

	hasTransformation(): boolean {
		return false;
	}

	applyTransformation(
		_words: StringList,
		_tags: TagMap,
		_linkKw: { value: string }
	): Action {
		return Action.Inapplicable;
	}

	createMemory(keyword: string, words: StringList, tags: TagMap) {
		if (keyword !== this.keyword || words.length === 0) {
			return;
		}
		if (this.transforms.length !== RuleMemory.NUM_TRANSFORMS) {
			return;
		}

		const idx = hash(lastChunkAsBcd(words[words.length - 1]), 2);
		const trans = this.transforms[idx];
		if (!trans) {
			return;
		}

		const constituents = match(tags, trans.decomposition, words);
		if (!constituents) {
			return;
		}

		const newMem = join(reassemble(trans.reassemblyRules[0], constituents));
		this.memories.push(newMem);
	}

	memoryExists(): boolean {
		return this.memories.length > 0;
	}

	recallMemory(): string {
		return this.memories.shift() || "";
	}
}

const NOMATCH_MSGS = ["PLEASE CONTINUE", "HMMM", "GO ON , PLEASE", "I SEE"];
const SPECIAL_NONE = "zNONE";

function collectTags(rules: Map<string, RuleBase>): TagMap {
	const tags: TagMap = new Map();
	for (const rule of rules.values()) {
		if (rule instanceof RuleKeyword) {
			for (let t of rule.dlistTags) {
				if (t === "/") {
					continue;
				}
				if (t.startsWith("/")) {
					t = t.slice(1);
				}
				if (!tags.has(t)) {
					tags.set(t, []);
				}
				tags.get(t)!.push(rule.keyword);
			}
		}
	}
	return tags;
}

class Eliza {
	private rules: Map<string, RuleBase>;
	private memRule: RuleMemory;
	private tags: TagMap;
	private limit = 1;
	private delimiters: StringList = [",", ".", "BUT"];
	private punctuation = ",.";
	private useNomatchMsgs = true;
	private onNewkeyFailUseNone = true;

	constructor(rules: Map<string, RuleBase>, memRule: RuleMemory) {
		this.rules = rules;
		this.memRule = memRule;
		this.tags = collectTags(rules);
	}

	setOnNewkeyFailUseNone(v: boolean) {
		this.onNewkeyFailUseNone = v;
	}

	response(input: string): string {
		const words = splitUserInput(elizaUppercase(input), this.punctuation);

		this.limit = (this.limit % 4) + 1;

		const keystack: StringList = [];
		let topRank = 0;
		for (let i = 0; i < words.length; ) {
			const word = words[i];
			if (this.delimiter(word)) {
				if (keystack.length === 0) {
					i++;
					words.splice(0, i);
					i = 0;
					continue;
				}
				words.splice(i);
				break;
			}
			const rule = this.rules.get(word);
			if (rule) {
				if (rule.hasTransformation()) {
					if (rule.precedence > topRank) {
						keystack.unshift(word);
						topRank = rule.precedence;
					} else {
						keystack.push(word);
					}
				}
				const sub = rule.applyWordSubstitution(word);
				if (sub) {
					words[i] = sub;
				}
			}
			i++;
		}

		if (
			keystack.length === 0 &&
			this.limit === 4 &&
			this.memRule.memoryExists()
		) {
			return this.memRule.recallMemory();
		}

		while (keystack.length > 0) {
			const topKeyword = keystack.shift()!;
			const rule = this.rules.get(topKeyword);
			if (!rule) {
				if (this.useNomatchMsgs) {
					return NOMATCH_MSGS[this.limit - 1];
				}
				break;
			}

			this.memRule.createMemory(topKeyword, words, this.tags);

			const linkKw = { value: "" };
			const act = rule.applyTransformation(words, this.tags, linkKw);

			if (act === Action.Complete) {
				return join(words);
			}
			if (act === Action.Inapplicable) {
				if (this.useNomatchMsgs) {
					return NOMATCH_MSGS[this.limit - 1];
				}
				break;
			}

			if (act === Action.Linkkey) {
				keystack.unshift(linkKw.value);
			} else if (keystack.length === 0) {
				if (!this.onNewkeyFailUseNone && this.useNomatchMsgs) {
					return NOMATCH_MSGS[this.limit - 1];
				}
				break;
			}
		}

		const noneRule = this.rules.get(SPECIAL_NONE) as RuleKeyword;
		if (noneRule) {
			const linkKw = { value: "" };
			noneRule.applyTransformation(words, this.tags, linkKw);
			return join(words);
		}
		return NOMATCH_MSGS[this.limit - 1];
	}

	private delimiter(s: string): boolean {
		return this.delimiters.includes(s);
	}
}

interface ScriptData {
	helloMessage: StringList;
	rules: Map<string, RuleBase>;
	memRule: RuleMemory;
}

function readElizaScript(source: string): ScriptData {
	const tok = new Tokenizer(source);
	const script: ScriptData = {
		helloMessage: [],
		rules: new Map(),
		memRule: new RuleMemory(""),
	};

	const errmsg = (msg: string) => {
		throw new Error(`Script error on line ${tok.line()}: ${msg}`);
	};

	const rdlist = (prior = true): StringList => {
		const s: StringList = [];
		let t = tok.nexttok();
		if (prior) {
			if (t.type !== TokenType.OPEN) {
				errmsg("expected '('");
			}
			t = tok.nexttok();
		}
		while (t.type !== TokenType.CLOSE) {
			if (t.type === TokenType.SYMBOL || t.type === TokenType.NUMBER) {
				s.push(t.value);
			} else if (t.type === TokenType.OPEN) {
				let sub = "";
				t = tok.nexttok();
				while (t.type !== TokenType.CLOSE) {
					if (t.type !== TokenType.SYMBOL && t.type !== TokenType.NUMBER) {
						errmsg("expected symbol or number in sublist");
					}
					if (sub) {
						sub += " ";
					}
					sub += t.value;
					t = tok.nexttok();
				}
				s.push(`(${sub})`);
			} else {
				errmsg("expected ')'");
			}
			t = tok.nexttok();
		}
		return s;
	};

	const readReassembly = (): StringList => {
		const t = tok.nexttok();
		if (t.type !== TokenType.OPEN) {
			errmsg("expected '(' for reassembly");
		}
		if (tok.peektok().value !== "PRE") {
			return rdlist(false);
		}
		tok.nexttok();
		const pre: StringList = ["(", "PRE", "("];
		const recon = rdlist();
		const ref = rdlist();
		if (ref.length !== 2 || ref[0] !== "=") {
			errmsg("expected '(=reference)' in PRE rule");
		}
		pre.push(...recon);
		pre.push(")", "(");
		pre.push(...ref);
		pre.push(")", ")");
		if (tok.nexttok().type !== TokenType.CLOSE) {
			errmsg("expected ')'");
		}
		return pre;
	};

	const readMemoryRule = () => {
		tok.nexttok();
		if (script.memRule.keyword) {
			errmsg("MEMORY rule already specified");
		}
		const kw = tok.nexttok();
		if (kw.type !== TokenType.SYMBOL) {
			errmsg("expected keyword after MEMORY");
		}
		script.memRule = new RuleMemory(kw.value);

		for (let i = 0; i < RuleMemory.NUM_TRANSFORMS; i++) {
			if (tok.nexttok().type !== TokenType.OPEN) {
				errmsg("expected '(' for memory rule");
			}
			const decomp: StringList = [];
			let t2 = tok.nexttok();
			while (t2.value !== "=" && t2.type !== TokenType.EOF) {
				decomp.push(t2.value);
				t2 = tok.nexttok();
			}
			if (decomp.length === 0) {
				errmsg("expected decompose_terms = reassemble_terms");
			}
			if (t2.value !== "=") {
				errmsg("expected '='");
			}
			const reass: StringList = [];
			t2 = tok.nexttok();
			while (t2.type !== TokenType.CLOSE && t2.type !== TokenType.EOF) {
				reass.push(t2.value);
				t2 = tok.nexttok();
			}
			if (reass.length === 0) {
				errmsg("expected decompose_terms = reassemble_terms");
			}
			if (t2.type !== TokenType.CLOSE) {
				errmsg("expected ')'");
			}
			script.memRule.addTransform(decomp, [reass]);
		}
		if (tok.nexttok().type !== TokenType.CLOSE) {
			errmsg("expected ')' after memory rule");
		}
	};

	const readKeywordRule = () => {
		const t = tok.nexttok();
		if (t.type === TokenType.NUMBER) {
			let depth = 1;
			while (depth > 0) {
				const sk = tok.nexttok();
				if (sk.type === TokenType.EOF) {
					return;
				}
				if (sk.type === TokenType.OPEN) {
					depth++;
				}
				if (sk.type === TokenType.CLOSE) {
					depth--;
				}
			}
			return;
		}
		let keyword = t.value;
		let kwSub = "";
		let precedence = 0;
		let tags: StringList = [];
		const transforms: { decomp: StringList; reass: StringList[] }[] = [];
		let className = "";

		if (keyword === "NONE") {
			keyword = SPECIAL_NONE;
		}
		if (keyword.startsWith("DO(")) {
			let depth = 1;
			while (depth > 0) {
				const sk = tok.nexttok();
				if (sk.type === TokenType.EOF) {
					return;
				}
				if (sk.type === TokenType.OPEN) {
					depth++;
				}
				if (sk.type === TokenType.CLOSE) {
					depth--;
				}
			}
			return;
		}
		if (script.rules.has(keyword)) {
			errmsg(`keyword rule already specified for '${keyword}'`);
		}

		if (tok.peektok().type === TokenType.CLOSE) {
			errmsg(`keyword '${keyword}' has no associated body`);
		}

		for (
			let t2 = tok.nexttok();
			t2.type !== TokenType.CLOSE;
			t2 = tok.nexttok()
		) {
			if (t2.value === "=") {
				t2 = tok.nexttok();
				if (t2.type !== TokenType.SYMBOL) {
					errmsg("expected keyword after =");
				}
				kwSub = t2.value;
			} else if (t2.type === TokenType.NUMBER) {
				precedence = Number.parseInt(t2.value, 10);
			} else if (t2.value === "DLIST") {
				tags = rdlist();
			} else if (t2.value === "DO") {
				rdlist();
			} else if (t2.type === TokenType.OPEN) {
				if (tok.peektok().value === "=") {
					tok.nexttok();
					t2 = tok.nexttok();
					if (t2.type !== TokenType.SYMBOL) {
						errmsg("expected equivalence class name");
					}
					className = t2.value;
					tok.nexttok();
				} else {
					const decomp = rdlist();
					const reass: StringList[] = [];
					do {
						reass.push(readReassembly());
					} while (tok.peektok().type === TokenType.OPEN);
					if (tok.nexttok().type !== TokenType.CLOSE) {
						errmsg("expected ')'");
					}
					transforms.push({ decomp, reass });
				}
			} else {
				let depth = 1;
				while (depth > 0) {
					const sk = tok.nexttok();
					if (sk.type === TokenType.EOF) {
						break;
					}
					if (sk.type === TokenType.OPEN) {
						depth++;
					}
					if (sk.type === TokenType.CLOSE) {
						depth--;
					}
				}
				break;
			}
		}

		if (transforms.length > 0 || className) {
			const rule = new RuleKeyword(keyword, kwSub, precedence, tags, className);
			for (const tr of transforms) {
				rule.addTransform(tr.decomp, tr.reass);
			}
			script.rules.set(keyword, rule);
		}
	};

	const readRule = (): boolean => {
		const t = tok.nexttok();
		if (t.type === TokenType.EOF) {
			return false;
		}
		if (t.type !== TokenType.OPEN) {
			errmsg("expected '('");
		}
		if (tok.peektok().type === TokenType.CLOSE) {
			tok.nexttok();
			return true;
		}
		if (tok.peektok().value === "MEMORY") {
			readMemoryRule();
		} else {
			readKeywordRule();
		}
		return true;
	};

	script.helloMessage = rdlist();

	if (tok.peektok().value === "START") {
		tok.nexttok();
	}

	while (readRule()) {
		/* empty */
	}

	if (!script.rules.has(SPECIAL_NONE)) {
		const noneRule = new RuleKeyword(SPECIAL_NONE, "", 0, [], "");
		noneRule.addTransform(
			["0"],
			[
				["PLEASE", "GO", "ON"],
				["I", "AM", "NOT", "SURE", "I", "UNDERSTAND", "YOU", "FULLY"],
				["WHAT", "DOES", "THAT", "SUGGEST", "TO", "YOU"],
				["PLEASE", "CONTINUE"],
			]
		);
		script.rules.set(SPECIAL_NONE, noneRule);
	}
	if (!script.memRule.keyword) {
		const memRule = new RuleMemory("MY");
		const memDecomp = ["0", "YOUR", "0"];
		memRule.addTransform(memDecomp, [
			["LETS", "DISCUSS", "FURTHER", "WHY", "YOUR", "3"],
		]);
		memRule.addTransform(memDecomp, [["EARLIER", "YOU", "SAID", "YOUR", "3"]]);
		memRule.addTransform(memDecomp, [["BUT", "YOUR", "3"]]);
		memRule.addTransform(memDecomp, [
			[
				"DOES",
				"THAT",
				"HAVE",
				"ANYTHING",
				"TO",
				"DO",
				"WITH",
				"THE",
				"FACT",
				"THAT",
				"YOUR",
				"3",
			],
		]);
		script.memRule = memRule;
	}

	return script;
}

export { Eliza, readElizaScript, type StringList, type TagMap };
