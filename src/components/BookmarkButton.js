import { jsx as _jsx } from "react/jsx-runtime";
import { useBookmarks } from "../hooks/useBookmarks";
export default function BookmarkButton({ slug, onClick, }) {
    const { toggle, isBookmarked } = useBookmarks();
    const active = isBookmarked(slug);
    function handleClick(e) {
        e.stopPropagation();
        e.preventDefault();
        toggle(slug);
        onClick?.(e);
    }
    return (_jsx("button", { type: "button", className: `bookmark-btn${active ? " active" : ""}`, onClick: handleClick, "aria-label": active ? "Remove bookmark" : "Add bookmark", children: active ? "★" : "☆" }));
}
