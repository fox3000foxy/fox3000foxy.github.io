import { useEffect, useRef, useState } from "react";
import { parseHeadings } from "../utils/headings";
import "./TableOfContents.css";

interface TableOfContentsProps {
	content: string;
}

export default function TableOfContents({ content }: TableOfContentsProps) {
	const headings = parseHeadings(content);
	const [activeId, setActiveId] = useState<string | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		if (headings.length === 0) {
			return;
		}

		const ids = headings.map((h) => h.id);
		observerRef.current = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((e) => e.isIntersecting);
				if (visible.length > 0) {
					setActiveId(visible[0].target.id);
				}
			},
			{ rootMargin: "-80px 0px -70% 0px" }
		);

		for (const id of ids) {
			const el = document.getElementById(id);
			if (el) {
				observerRef.current.observe(el);
			}
		}

		return () => observerRef.current?.disconnect();
	}, [headings]);

	useEffect(() => {
		if (!activeId || !listRef.current) {
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

	return (
		<nav className="toc">
			<h4 className="toc-title">Contents</h4>
			<ul className="toc-list" ref={listRef}>
				{headings.map((h) => (
					<li
						key={h.id}
						className={`toc-item toc-level-${h.level}${activeId === h.id ? " toc-active" : ""}`}
					>
						<a href={`#${h.id}`} className="toc-link">
							{h.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
