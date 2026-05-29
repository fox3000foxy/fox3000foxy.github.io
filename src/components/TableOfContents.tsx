import { parseHeadings } from "../utils/headings";

interface TableOfContentsProps {
	content: string;
}

export default function TableOfContents({ content }: TableOfContentsProps) {
	const headings = parseHeadings(content);
	if (headings.length < 2) { return null; }

	return (
		<nav className="toc">
			<h4 className="toc-title">Table of Contents</h4>
			<ul className="toc-list">
				{headings.map((h) => (
					<li key={h.id} className={`toc-item toc-level-${h.level}`}>
						<a href={`#${h.id}`} className="toc-link">{h.text}</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
