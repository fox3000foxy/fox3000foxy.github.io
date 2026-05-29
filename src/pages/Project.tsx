import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarkdownContent from "../components/MarkdownContent";
import NotFound from "./NotFound";

interface RepoMeta {
	name: string;
	description: string | null;
	language: string | null;
	stargazers_count: number;
	html_url: string;
	default_branch: string;
}

export default function Project() {
	const { slug } = useParams<{ slug: string }>();
	const [content, setContent] = useState<string | null>(null);
	const [repo, setRepo] = useState<RepoMeta | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!slug) { return; }

		fetch(
			`https://api.github.com/repos/fox3000foxy/${encodeURIComponent(slug)}`
		)
			.then((res) => {
				if (!res.ok) { throw new Error("Not found"); }
				return res.json();
			})
			.then((data: RepoMeta) => {
				setRepo(data);
				return fetch(
					`https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug)}/${data.default_branch}/README.md`
				);
			})
			.then((res) => {
				if (!res.ok) {
					setContent("");
					return;
				}
				return res.text().then((text) => setContent(text));
			})
			.catch(() => setError(true));
	}, [slug]);

	if (error) {
		return <NotFound message={`Project "${slug}" not found`} />;
	}

	if (content === null) {
		return <p>Loading…</p>;
	}

	return (
		<article>
			<p className="project-back">
				<Link to="/projects">← Back to projects</Link>
			</p>
			{repo && (
				<div className="project-header-meta">
					{repo.description && (
						<p className="article-description">{repo.description}</p>
					)}
					<p className="project-meta-links">
						<a href={repo.html_url} target="_blank" rel="noopener noreferrer">
							View on GitHub ↗
						</a>
						{repo.language && (
							<span className="project-meta-lang">{repo.language}</span>
						)}
						{repo.stargazers_count > 0 && (
							<span>⭐ {repo.stargazers_count}</span>
						)}
					</p>
				</div>
			)}
			<MarkdownContent
				content={content || "*This project does not have a README.*"}
				urlTransform={(url) => {
					if (
						repo &&
						url &&
						!url.startsWith("http") &&
						!url.startsWith("#") &&
						!url.startsWith("mailto:")
					) {
						return `https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug!)}/${repo.default_branch}/${url}`;
					}
					return url;
				}}
			/>
		</article>
	);
}
