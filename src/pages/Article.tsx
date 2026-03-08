import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';

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
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}