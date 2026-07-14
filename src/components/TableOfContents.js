import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { parseHeadings } from "../utils/headings";
import "./TableOfContents.css";
export default function TableOfContents({ content }) {
    const headings = parseHeadings(content);
    const [activeId, setActiveId] = useState(null);
    const observerRef = useRef(null);
    const listRef = useRef(null);
    useEffect(() => {
        if (headings.length === 0) {
            return;
        }
        const ids = headings.map((h) => h.id);
        observerRef.current = new IntersectionObserver((entries) => {
            const visible = entries.filter((e) => e.isIntersecting);
            if (visible.length > 0) {
                setActiveId(visible[0].target.id);
            }
        }, { rootMargin: "-80px 0px -70% 0px" });
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) {
                observerRef.current.observe(el);
            }
        }
        return () => observerRef.current?.disconnect();
    }, [headings]);
    useEffect(() => {
        if (!(activeId && listRef.current)) {
            return;
        }
        const link = listRef.current.querySelector(`[href="#${activeId}"]`);
        if (link) {
            link.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [activeId]);
    if (headings.length < 2) {
        return null;
    }
    return (_jsxs("nav", { className: "toc", children: [_jsx("h4", { className: "toc-title", children: "Contents" }), _jsx("ul", { className: "toc-list", ref: listRef, children: headings.map((h) => (_jsx("li", { className: `toc-item toc-level-${h.level}${activeId === h.id ? " toc-active" : ""}`, children: _jsx("a", { href: `#${h.id}`, className: "toc-link", children: h.text }) }, h.id))) })] }));
}
