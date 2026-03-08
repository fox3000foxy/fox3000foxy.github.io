import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface Props {
  message?: string;
}

// extend default schema to allow class/style (used elsewhere)
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class', 'style'],
  },
};

export default function NotFound({ message }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/404.md')
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.text();
      })
      .then((text) => setMarkdown(text))
      .catch(() => setMarkdown(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p>Loading…</p>;
  }

  if (markdown) {
    return (
      <article>
        <ReactMarkdown
          rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    );
  }

  // fallback to hard‑coded content
  return (
    <div>
      <h2>404</h2>
      <p>{message || 'Page not found.'}</p>
      <p>
        <Link to="/">Return home</Link>
      </p>
    </div>
  );
}