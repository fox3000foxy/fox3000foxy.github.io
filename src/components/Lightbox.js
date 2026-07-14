import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export default function Lightbox() {
    const [src, setSrc] = useState(null);
    useEffect(() => {
        function handleClick(e) {
            const img = e.target.closest("img");
            if (!img?.src) {
                return;
            }
            if (img.closest(".author-bio-top") ||
                img.closest(".author-bio") ||
                img.closest(".blog-card-authors")) {
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
        function handleKey(e) {
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
    return (_jsx("button", { type: "button", className: "lightbox-overlay", onClick: () => setSrc(null), onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
                setSrc(null);
            }
        }, children: _jsx("img", { src: src, alt: "", className: "lightbox-image" }) }));
}
