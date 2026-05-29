import { useState } from "react";
import { useLang } from "../hooks/useLang";

export default function ShareButtons({
	url,
	title,
}: {
	url: string;
	title: string;
}) {
	const { t } = useLang();
	const [copied, setCopied] = useState(false);

	const encodedUrl = encodeURIComponent(url);
	const encodedTitle = encodeURIComponent(title);

	function handleCopy() {
		void navigator.clipboard.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<>
			<a
				href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
				target="_blank"
				rel="noopener noreferrer"
				className="share-btn"
				aria-label="Share on Twitter"
			>
				𝕏
			</a>
			<a
				href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
				target="_blank"
				rel="noopener noreferrer"
				className="share-btn"
				aria-label="Share on LinkedIn"
			>
				in
			</a>
			<button
				type="button"
				className="share-btn"
				onClick={handleCopy}
				aria-label={t("code.copy")}
			>
				{copied ? t("code.copied") : "🔗"}
			</button>
		</>
	);
}
