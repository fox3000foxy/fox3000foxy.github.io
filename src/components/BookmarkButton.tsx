import type { MouseEvent } from "react";
import { useBookmarks } from "../hooks/useBookmarks";

export default function BookmarkButton({
	slug,
	onClick,
}: {
	slug: string;
	onClick?: (e: MouseEvent) => void;
}) {
	const { toggle, isBookmarked } = useBookmarks();
	const active = isBookmarked(slug);

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		toggle(slug);
		onClick?.(e);
	}

	return (
		<button
			type="button"
			className={`bookmark-btn${active ? " active" : ""}`}
			onClick={handleClick}
			aria-label={active ? "Remove bookmark" : "Add bookmark"}
		>
			{active ? "★" : "☆"}
		</button>
	);
}
