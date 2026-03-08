import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import './Home.css';

// reuse the same schema as Home so that authors can add classes and styles
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class', 'style'],
  },
};

export default function Portfolio() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/portfolio.md')
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <p>Unable to load portfolio page.</p>;
  }
  if (content === null) {
    return <p>Loading…</p>;
  }

  return (
    <article className="home">
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
