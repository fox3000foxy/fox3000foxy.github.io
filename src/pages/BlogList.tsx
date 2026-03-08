import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './BlogList.css';

// article metadata fetched from index.json
interface ArticleMeta {
  slug: string;
  title?: string;
  description?: string;
  date?: string;
}

export default function BlogList() {
  const [articles, setArticles] = useState<ArticleMeta[]>([]);

  useEffect(() => {
    fetch('/articles/index.json')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (Array.isArray(data)) {
          // normalize legacy array of strings
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normalized: ArticleMeta[] = (data as any[]).map((item) =>
            typeof item === 'string' ? { slug: item } : item
          );
          setArticles(normalized);
        } else {
          setArticles([]);
        }
      })
      .catch(() => setArticles([]));
  }, []);

  return (
    <div className="blog-list">
      <h2>Blog Posts</h2>
      {articles.length > 0 ? (
        <div className="blog-grid">
          {articles.map(({ slug, title, description, date }) => (
            <Link to={`/blog/${slug}`} key={slug} className="blog-card">
              <div className="blog-card-body">
                <h3 className="blog-card-title">
                  {title ?? slug.replace(/-/g, ' ')}
                </h3>
                {description && (
                  <p className="blog-card-desc">{description}</p>
                )}
              </div>
              {date && (
                <div className="blog-card-footer">
                  <time dateTime={date}>
                    {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <p>No articles found.</p>
      )}
    </div>
  );
}