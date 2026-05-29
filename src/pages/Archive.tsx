import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";

interface Group {
	label: string;
	articles: ArticleMeta[];
}

function groupByYearMonth(articles: ArticleMeta[]): Group[] {
	const map = new Map<string, ArticleMeta[]>();

	for (const a of articles) {
		if (!a.date) { continue; }
		const d = new Date(`${a.date}T00:00:00`);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		if (!map.has(key)) { map.set(key, []); }
		map.get(key)!.push(a);
	}

	const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
	return sorted.map(([key, arts]) => {
		const [year, month] = key.split("-");
		const label = new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
		});
		return { label, articles: arts };
	});
}

export default function Archive() {
	const [groups, setGroups] = useState<Group[]>([]);

	useEffect(() => {
		fetch("/articles/index.json")
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => {
				if (Array.isArray(data)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const normalized: ArticleMeta[] = (data as any[]).map((item) =>
						typeof item === "string" ? { slug: item } : item
					);
					setGroups(groupByYearMonth(normalized));
				}
			})
			.catch(() => setGroups([]));
	}, []);

	if (groups.length === 0) {
		return <p>Loading archive…</p>;
	}

	return (
		<div className="archive">
			<h2>Archive</h2>
			{groups.map((group) => (
				<section key={group.label} className="archive-group">
					<h3 className="archive-month">{group.label}</h3>
					<ul className="archive-list">
						{group.articles.map((a) => (
							<li key={a.slug} className="archive-item">
								<time className="archive-day" dateTime={a.date}>
									{a.date ? new Date(`${a.date}T00:00:00`).getDate() : "??"}
								</time>
								<Link to={`/blog/${a.slug}`} className="archive-link">
									{a.title ?? a.slug.replace(/-/g, " ")}
								</Link>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
