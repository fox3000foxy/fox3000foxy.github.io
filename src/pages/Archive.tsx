import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";

interface Group {
	label: string;
	articles: ArticleMeta[];
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

export default function Archive() {
	const { t, lang } = useLang();
	const [groups, setGroups] = useState<Group[]>([]);

	useEffect(() => {
		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";

		async function load() {
			let res = await fetch(indexUrl);
			if (!res.ok && fallbackUrl) {
				res = await fetch(fallbackUrl);
			}
			if (!res.ok) {
				setGroups([]);
				return;
			}

			const data: unknown = await res.json();
			if (Array.isArray(data)) {
				// biome-ignore lint/suspicious/noExplicitAny: legacy string format
				const normalized: ArticleMeta[] = (data as any[]).map((item) =>
					typeof item === "string" ? { slug: item } : item
				);
				setGroups(groupByYearMonth(normalized, lang));
			}
		}
		void load();
	}, [lang]);

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
