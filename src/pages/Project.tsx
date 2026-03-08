import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import NotFound from './NotFound';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class', 'style'],
  },
};

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
    if (!slug) return;

    // fetch repo metadata to get default branch
    fetch(`https://api.github.com/repos/fox3000foxy/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: RepoMeta) => {
        setRepo(data);
        // fetch README from the default branch
        return fetch(
          `https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug)}/${data.default_branch}/README.md`
        );
      })
      .then((res) => {
        if (!res.ok) throw new Error('No README');
        return res.text();
      })
      .then((text) => setContent(text))
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
      <ReactMarkdown
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeHighlight,
        ]}
        urlTransform={(url) => {
          // resolve relative image/link URLs against the GitHub raw content
          if (repo && url && !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('mailto:')) {
            return `https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug!)}/${repo.default_branch}/${url}`;
          }
          return url;
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
