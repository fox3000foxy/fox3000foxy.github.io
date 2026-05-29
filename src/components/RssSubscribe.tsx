import { useState } from "react";

const RSS_URL = "https://fox3000foxy.com/feed.xml";

export default function RssSubscribe() {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(RSS_URL);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// fallback
		}
	};

	return (
		<div className="rss-subscribe">
			<a
				href={RSS_URL}
				type="application/rss+xml"
				className="rss-btn"
				title="Subscribe with your RSS reader"
			>
				📡 RSS
			</a>
			<button type="button" className="rss-copy-btn" onClick={handleCopy}>
				{copied ? "Copied!" : "Copy feed URL"}
			</button>
		</div>
	);
}
