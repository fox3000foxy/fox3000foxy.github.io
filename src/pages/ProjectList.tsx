import { useEffect, useMemo, useState } from 'react';
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

interface GistFile {
  filename: string;
  type?: string;
  language?: string | null;
}

interface Gist {
  id: string;
  description: string | null;
  html_url: string;
  updated_at: string;
  files: Record<string, GistFile>;
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

async function fetchAllGists(username: string): Promise<Gist[]> {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/gists?per_page=100`
  );

  if (!res.ok) {
    return [];
  }

  return (await res.json()) as Gist[];
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

const LANGUAGE_PRIORITY: string[] = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'C#',
  'C++',
  'C',
  'Kotlin',
  'Rust',
  'Go',
  'Swift',
  'Ruby',
  'PHP',
  'Shell',
  'Lua',
  'Dart',
  'HTML',
  'CSS',
  'Vue',
];

interface RepoCache {
  repos: Repo[];
  fetchedAt: number;
}

const CACHE_KEY = 'fox3000foxy-project-list';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const divisions: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, name: 'seconds' },
    { amount: 60, name: 'minutes' },
    { amount: 24, name: 'hours' },
    { amount: 7, name: 'days' },
    { amount: 4.34524, name: 'weeks' },
    { amount: 12, name: 'months' },
    { amount: Number.POSITIVE_INFINITY, name: 'years' },
  ];

  let duration = diffMs / 1000;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(-duration), division.name);
    }
    duration /= division.amount;
  }

  return date.toLocaleDateString();
}

export default function ProjectList() {
  const cachedData = useMemo(() => {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const cache = localStorage.getItem(CACHE_KEY);
    if (!cache) return null;

    try {
      const parsed: RepoCache = JSON.parse(cache);
      if (Array.isArray(parsed.repos)) {
        return parsed;
      }
    } catch {
      // ignore parse errors
    }

    return null;
  }, []);

  const [repos, setRepos] = useState<Repo[]>(cachedData?.repos ?? []);
  const [loading, setLoading] = useState<boolean>(!cachedData?.repos?.length);

  const [gists, setGists] = useState<Gist[]>([]);

  useEffect(() => {
    const needFetch = !cachedData || Date.now() - cachedData.fetchedAt >= CACHE_TTL_MS;
    if (!needFetch) {
      return;
    }

    Promise.all([fetchAllRepos('fox3000foxy'), fetchAllGists('fox3000foxy')])
      .then(([repoData, gistData]) => {
        const filtered = repoData
          .filter((r) => !r.fork && r.language)
          .sort((a, b) => {
            const langA = LANGUAGE_PRIORITY.indexOf(a.language!);
            const langB = LANGUAGE_PRIORITY.indexOf(b.language!);
            const priorityA = langA === -1 ? LANGUAGE_PRIORITY.length : langA;
            const priorityB = langB === -1 ? LANGUAGE_PRIORITY.length : langB;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          });

        setRepos(filtered);
        setGists(gistData);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ repos: filtered, gists: gistData, fetchedAt: Date.now() })
        );
      })
      .catch(() => {
        if (!cachedData?.repos?.length) {
          setRepos([]);
        }
      })
      .finally(() => setLoading(false));
  }, [cachedData]);

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
                <p className="project-card-desc">
                  {repo.description ?? <em>No description provided.</em>}
                </p>
              </div>
              <div className="project-card-footer">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex' }}>
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
                  <span className="repo-updated">{formatRelativeDate(repo.updated_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p>No projects found.</p>
      )}

      <section className="gist-list">
        <h2>Gists</h2>
        <p className="project-subtitle">{gists.length} public gists fetched from GitHub</p>
        {gists.length > 0 ? (
          <div className="project-grid">
            {gists.map((gist) => {
              const firstFile = Object.values(gist.files)[0];
              const filename = firstFile?.filename ?? 'Unknown file';
              const language = firstFile?.language ?? 'Unknown language';

              return (
                <a
                  href={gist.html_url}
                  key={gist.id}
                  className="project-card"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="project-card-body">
                    <h3 className="project-card-title">{filename}</h3>
                    <p className="project-card-desc">
                      <span
                        className="lang-dot"
                        style={{
                          backgroundColor:
                            LANGUAGE_COLORS[language as string] ?? '#ccc',
                            marginRight: '5px',
                        }}
                      />  {language}
                    </p>
                  </div>
                  <div className="project-card-footer">
                    <span className="repo-updated">
                      {formatRelativeDate(gist.updated_at)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p>No gists found.</p>
        )}
      </section>
    </div>
  );
}
