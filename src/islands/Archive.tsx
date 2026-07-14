import { useMemo } from "react";
import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";
import type { ArticleMeta } from "../types";

interface Group {
	label: string;
	articles: ArticleMeta[];
}

interface ArchiveProps {
	allIndexes?: Record<string, unknown[]>;
}

function groupByYearMonth(articles: ArticleMeta[], locale: string): Group[] {
	const map = new Map<string, ArticleMeta[]>();
	for (const a of articles) {
		if (!a.date) {
			continue;
		}
		const d = new Date(`${a.date}T00:00:00`);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		if (!map.has(key)) {
			map.set(key, []);
		}
		map.get(key)!.push(a);
	}
	const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
	return sorted.map(([key, arts]) => {
		const [year, month] = key.split("-");
		const label = new Date(Number(year), Number(month) - 1).toLocaleDateString(
			locale,
			{
				year: "numeric",
				month: "long",
			}
		);
		return { label, articles: arts };
	});
}

export default function Archive({ allIndexes }: ArchiveProps) {
	const { t, lang } = useLang();

	const groups = useMemo(() => {
		const data = allIndexes?.[lang] ?? allIndexes?.en ?? [];
		const normalized = (data as { slug?: string }[]).map((item) =>
			typeof item === "string" ? { slug: item } : item
		) as ArticleMeta[];
		return groupByYearMonth(normalized, lang);
	}, [allIndexes, lang]);

	if (groups.length === 0) {
		return <p>{t("archive.loading")}</p>;
	}

	return (
		<div className="archive">
			<h2>{t("archive.title")}</h2>
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
