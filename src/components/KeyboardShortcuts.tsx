import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function KeyboardShortcuts() {
	const navigate = useNavigate();
	const [showHelp, setShowHelp] = useState(false);

	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}

			switch (e.key) {
				case "?":
					e.preventDefault();
					setShowHelp((v) => !v);
					break;
				case "/":
					e.preventDefault();
					document
						.querySelector<HTMLInputElement>('.search-bar input[type="search"]')
						?.focus();
					break;
				case "t": {
					e.preventDefault();
					const toc = document.querySelector<HTMLElement>(".toc");
					if (toc) {
						toc.scrollIntoView({ behavior: "smooth", block: "nearest" });
						(toc.querySelector("a") as HTMLElement)?.focus();
					}
					break;
				}
				case "Escape":
					setShowHelp(false);
					(document.activeElement as HTMLElement)?.blur();
					break;
				case "h":
					if (!(e.ctrlKey || e.metaKey)) {
						break;
					}
					void navigate("/");
					break;
				default:
					break;
			}
		}

		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [navigate]);

	if (!showHelp) {
		return null;
	}

	return (
		<button
			type="button"
			className="shortcuts-overlay"
			onClick={() => setShowHelp(false)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					setShowHelp(false);
				}
			}}
		>
			<div
				className="shortcuts-modal"
				role="dialog"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<h3>Keyboard Shortcuts</h3>
				<dl>
					<dt>
						<kbd>?</kbd>
					</dt>{" "}
					<dd>Toggle this help</dd>
					<dt>
						<kbd>/</kbd>
					</dt>{" "}
					<dd>Focus search</dd>
					<dt>
						<kbd>t</kbd>
					</dt>{" "}
					<dd>Focus table of contents</dd>
					<dt>
						<kbd>Esc</kbd>
					</dt>{" "}
					<dd>Close / blur</dd>
					<dt>
						<kbd>Ctrl+H</kbd>
					</dt>{" "}
					<dd>Go home</dd>
				</dl>
				<button
					type="button"
					className="shortcuts-close"
					onClick={() => setShowHelp(false)}
				>
					Close
				</button>
			</div>
		</button>
	);
}
