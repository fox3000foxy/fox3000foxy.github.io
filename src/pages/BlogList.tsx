import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function BlogList() {
  const [articles, setArticles] = useState<string[]>([]);

  useEffect(() => {
    fetch('/articles/index.json')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setArticles(data))
      .catch(() => setArticles([]));
  }, []);

  return (
    <div>
      <h2>Blog Posts</h2>
      {articles.length > 0 ? (
        <ul>
          {articles.map((slug) => (
            <li key={slug}>
              <Link to={`/blog/${slug}`}>{slug.replace(/-/g, ' ')}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No articles found.</p>
      )}
    </div>
  );
}