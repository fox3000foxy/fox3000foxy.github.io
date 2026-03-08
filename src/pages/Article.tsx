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

export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/articles/${slug}.md`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Not found');
        }
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return <NotFound message={`Article "${slug}" not found`} />;
  }

  if (content === null) {
    return <p>Loading…</p>;
  }

  return (
    <article>
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