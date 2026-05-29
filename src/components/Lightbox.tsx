import { useEffect, useState } from "react";

export default function Lightbox() {
	const [src, setSrc] = useState<string | null>(null);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			const img = (e.target as HTMLElement).closest("img");
			if (!img?.src) {
				return;
			}
			if (
				img.closest(".author-bio-top") ||
				img.closest(".author-bio") ||
				img.closest(".blog-card-authors")
			) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setSrc(img.src);
		}

		document.addEventListener("click", handleClick);
		return () => document.removeEventListener("click", handleClick);
	}, []);

	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setSrc(null);
			}
		}
		if (!src) {
			return;
		}
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [src]);

	if (!src) {
		return null;
	}

	return (
		<button
			type="button"
			className="lightbox-overlay"
			onClick={() => setSrc(null)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					setSrc(null);
				}
			}}
		>
			<img src={src} alt="" className="lightbox-image" />
		</button>
	);
}
