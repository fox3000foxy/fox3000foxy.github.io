import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams } from 'react-router-dom';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import NotFound from './NotFound';

// extend the default schema to permit class and style on all elements
// this allows authors to write inline styles in markdown HTML
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class', 'style'],
  },
};

interface ArticleMeta {
  slug: string;
  title?: string;
  description?: string;
  date?: string;
}

export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState<ArticleMeta | null>(null);

  useEffect(() => {
    if (!slug) return;

    // fetch markdown content
    fetch(`/articles/${slug}.md`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Not found');
        }
        return res.text();
      })
      .then((text) => {
        // Treating assets link
        const processed = text.replaceAll("assets/", "/articles/assets/");
        setContent(processed);
      })
      .catch(() => setError(true));

    // fetch metadata from index.json (if available)
    fetch('/articles/index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normalized: ArticleMeta[] = data.map((item: any) =>
            typeof item === 'string' ? { slug: item } : item
          );
          const found = normalized.find((a) => a.slug === slug);
          setMeta(found || null);
        }
      })
      .catch(() => { });
  }, [slug]);

  if (error) {
    return <NotFound message={`Article "${slug}" not found`} />;
  }

  if (content === null) {
    return <p>Loading…</p>;
  }

  return (
    <article>
      {/* display metadata if available */}
      {meta?.date && <p className="article-date">{meta.date}</p>}
      {meta?.description && (
        <p className="article-description">{meta.description}</p>
      )}
      <ReactMarkdown
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
        ]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}