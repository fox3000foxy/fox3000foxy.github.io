import { useState, useRef, useEffect } from "preact/hooks";
import { BOTS, BOT_NAMES, createChatbot } from "../lib/chatbots/index";
import type { ChatBot, ChatMessage } from "../lib/chatbots/types";
import type { BotName } from "../lib/chatbots/index";

export default function ChatApp() {
	const [activeTab, setActiveTab] = useState<BotName>("eliza");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(true);
	const botRef = useRef<ChatBot | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setMessages([]);
		setInput("");
		createChatbot(activeTab)
			.then((bot) => {
				if (cancelled) {
					return;
				}
				botRef.current = bot;
				setMessages([{ role: "bot", text: bot.greeting() }]);
				setLoading(false);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeTab]);

	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	});

	function send() {
		const text = input.trim();
		if (!(text && botRef.current)) {
			return;
		}

		const reply = botRef.current.response(text);
		setMessages((prev) => [
			...prev,
			{ role: "user", text },
			{ role: "bot", text: reply },
		]);
		setInput("");
	}

	function handleKeyDown(e: {
		key: string;
		shiftKey: boolean;
		preventDefault: () => void;
	}) {
		if (e.key === "Enter" && e.shiftKey === false) {
			e.preventDefault();
			send();
		}
	}

	function resetChat() {
		botRef.current?.reset();
		setMessages(
			botRef.current ? [{ role: "bot", text: botRef.current.greeting() }] : []
		);
		setInput("");
	}

	const info = BOTS[activeTab];

	return (
		<div className="chat-app">
			<div className="chat-tabs">
				{BOT_NAMES.map((name) => {
					const b = BOTS[name];
					return (
						<button
							type="button"
							key={`tab-${name}`}
							className={`chat-tab ${activeTab === name ? "active" : ""}`}
							onClick={() => setActiveTab(name)}
							title={b.name}
						>
							{b.name}
						</button>
					);
				})}
			</div>

			<div className="chat-info">
				<h2>
					{info.name} ({info.year})
				</h2>
				<p className="chat-author">{info.author}</p>
				<p className="chat-desc">{info.description}</p>
			</div>

			<div className="chat-messages">
				{loading ? (
					<div className="chat-loading">Chargement du chatbot…</div>
				) : (
					messages.map((msg) => (
						<div
							key={`${activeTab}-${msg.role}-${msg.text}`}
							className={`chat-msg ${msg.role}`}
						>
							<span className="chat-role">
								{msg.role === "bot" ? info.name : "Vous"}
							</span>
							<div className="chat-bubble">{msg.text}</div>
						</div>
					))
				)}
				<div ref={chatEndRef} />
			</div>

			<div className="chat-input-area">
				<button
					type="button"
					className="chat-reset"
					onClick={resetChat}
					title="Recommencer la conversation"
				>
					↺
				</button>
				<input
					className="chat-input"
					type="text"
					value={input}
					onInput={(e) => setInput((e.target as HTMLInputElement).value)}
					onKeyDown={handleKeyDown}
					placeholder={
						activeTab === "jabberwacky" || activeTab === "cleverbot"
							? "Tapez /quit pour quitter…"
							: "Tapez 'goodbye' pour quitter…"
					}
					disabled={loading}
				/>
				<button
					type="button"
					className="chat-send"
					onClick={send}
					disabled={loading || !input.trim()}
				>
					Envoyer
				</button>
			</div>
		</div>
	);
}
