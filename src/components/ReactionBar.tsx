import { useCallback, useEffect, useState } from "react";

const EMOJIS = ["🔥", "💩", "🤯", "❤️", "xD"];
const STORAGE_PREFIX = "reaction-";

function loadReactions(slug: string): Record<string, number> {
	try {
		const data = localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
		return data ? JSON.parse(data) : {};
	} catch {
		return {};
	}
}

function saveReactions(slug: string, reactions: Record<string, number>) {
	localStorage.setItem(`${STORAGE_PREFIX}${slug}`, JSON.stringify(reactions));
}

function loadUserReaction(slug: string): string | null {
	try {
		return localStorage.getItem(`${STORAGE_PREFIX}user-${slug}`);
	} catch {
		return null;
	}
}

function saveUserReaction(slug: string, emoji: string | null) {
	if (emoji) {
		localStorage.setItem(`${STORAGE_PREFIX}user-${slug}`, emoji);
	} else {
		localStorage.removeItem(`${STORAGE_PREFIX}user-${slug}`);
	}
}

export default function ReactionBar({ slug }: { slug: string }) {
	const [reactions, setReactions] = useState<Record<string, number>>(() =>
		loadReactions(slug)
	);
	const [userEmoji, setUserEmoji] = useState<string | null>(() =>
		loadUserReaction(slug)
	);

	useEffect(() => {
		saveReactions(slug, reactions);
	}, [reactions, slug]);

	const handleReact = useCallback(
		(emoji: string) => {
			setReactions((prev) => {
				const next = { ...prev };
				if (userEmoji === emoji) {
					next[emoji] = Math.max(0, (next[emoji] || 0) - 1);
					setUserEmoji(null);
					saveUserReaction(slug, null);
				} else {
					if (userEmoji) {
						next[userEmoji] = Math.max(0, (next[userEmoji] || 0) - 1);
					}
					next[emoji] = (next[emoji] || 0) + 1;
					setUserEmoji(emoji);
					saveUserReaction(slug, emoji);
				}
				return next;
			});
		},
		[userEmoji, slug]
	);

	return (
		<div className="reaction-bar">
			<span className="reaction-label">Reactions</span>
			{EMOJIS.map((emoji) => (
				<button
					key={emoji}
					type="button"
					className={`reaction-btn${userEmoji === emoji ? " active" : ""}`}
					onClick={() => handleReact(emoji)}
					aria-label={`React with ${emoji}`}
				>
					<span className="reaction-emoji">{emoji}</span>
					{(reactions[emoji] ?? 0) > 0 && (
						<span className="reaction-count">{reactions[emoji]}</span>
					)}
				</button>
			))}
		</div>
	);
}
