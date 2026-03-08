import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/ProjectList.css';

interface Repo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  html_url: string;
  updated_at: string;
}

async function fetchAllRepos(username: string): Promise<Repo[]> {
  const repos: Repo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&page=${page}&sort=updated`
    );
    if (!res.ok) break;
    const data: Repo[] = await res.json();
    if (data.length === 0) break;
    repos.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  return repos;
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Shell: '#89e051',
  Lua: '#000080',
  Dart: '#00B4AB',
  Vue: '#41b883',
};

export default function ProjectList() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllRepos('fox3000foxy')
      .then((data) => {
        const nonFork = data.filter((r) => !r.fork);
        setRepos(nonFork);
      })
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p>Loading projects…</p>;
  }

  return (
    <div className="project-list">
      <h2>Projects</h2>
      <p className="project-subtitle">
        {repos.length} public repositories fetched from GitHub
      </p>
      {repos.length > 0 ? (
        <div className="project-grid">
          {repos.map((repo) => (
            <Link
              to={`/projects/${repo.name}`}
              key={repo.name}
              className="project-card"
            >
              <div className="project-card-body">
                <h3 className="project-card-title">{repo.name}</h3>
                {repo.description && (
                  <p className="project-card-desc">{repo.description}</p>
                )}
              </div>
              <div className="project-card-footer">
                {repo.language && (
                  <span className="project-lang">
                    <span
                      className="lang-dot"
                      style={{
                        backgroundColor:
                          LANGUAGE_COLORS[repo.language] ?? '#ccc',
                      }}
                    />
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && (
                  <span className="project-stars">
                    ⭐ {repo.stargazers_count}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p>No projects found.</p>
      )}
    </div>
  );
}
