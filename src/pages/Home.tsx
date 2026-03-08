import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import '../styles/Home.css';

// extend the default schema to permit `class` and `style` on all elements
// (so markdown authors can add classes or inline styles to wrappers, tables, etc.)
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // allow any tag to have class or style attributes
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class', 'style'],
  },
};

export default function Home() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/home.md')
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <p>Unable to load home page.</p>;
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
          rehypeHighlight,
        ]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}