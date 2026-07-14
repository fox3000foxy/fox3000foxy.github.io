import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/ProjectList.css";
import { useLang } from "../hooks/useLang";
const USERNAME = "fox3000foxy";
const CACHE_KEY = "fox3000foxy-projects-v2";
const INITIAL_DISPLAY_COUNT = 6;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
async function fetchPaginatedRepos(url) {
    const repos = [];
    let page = 1;
    const perPage = 100;
    while (true) {
        const separator = url.includes("?") ? "&" : "?";
        const res = await fetch(`${url}${separator}per_page=${perPage}&page=${page}`);
        if (!res.ok) {
            break;
        }
        const data = await res.json();
        if (data.length === 0) {
            break;
        }
        repos.push(...data);
        if (data.length < perPage) {
            break;
        }
        page++;
    }
    return repos;
}
function fetchAllRepos(username) {
    return fetchPaginatedRepos(`https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner`);
}
function fetchMemberRepos(username) {
    return fetchPaginatedRepos(`https://api.github.com/users/${encodeURIComponent(username)}/repos?type=member`);
}
async function fetchOrgs(username) {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/orgs`);
    if (!res.ok) {
        return [];
    }
    return (await res.json());
}
function fetchOrgRepos(org) {
    return fetchPaginatedRepos(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?type=public`);
}
async function fetchAllGists(username) {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/gists?per_page=100`);
    if (!res.ok) {
        return [];
    }
    return (await res.json());
}
const LANGUAGE_COLORS = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Java: "#b07219",
    "C#": "#178600",
    "C++": "#f34b7d",
    C: "#555555",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Rust: "#dea584",
    Go: "#00ADD8",
    Kotlin: "#A97BFF",
    Swift: "#F05138",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Shell: "#89e051",
    Lua: "#000080",
    Dart: "#00B4AB",
    Vue: "#41b883",
};
const LANGUAGE_PRIORITY = [
    "TypeScript",
    "JavaScript",
    "Python",
    "Java",
    "C#",
    "C++",
    "C",
    "Kotlin",
    "Rust",
    "Go",
    "Swift",
    "Ruby",
    "PHP",
    "Shell",
    "Lua",
    "Dart",
    "HTML",
    "CSS",
    "Vue",
];
function sortRepos(repos) {
    return [...repos].sort((a, b) => {
        const langA = LANGUAGE_PRIORITY.indexOf(a.language ?? "");
        const langB = LANGUAGE_PRIORITY.indexOf(b.language ?? "");
        const priorityA = langA === -1 ? LANGUAGE_PRIORITY.length : langA;
        const priorityB = langB === -1 ? LANGUAGE_PRIORITY.length : langB;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}
function formatRelativeDate(dateString) {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const divisions = [
        { amount: 60, name: "seconds" },
        { amount: 60, name: "minutes" },
        { amount: 24, name: "hours" },
        { amount: 7, name: "days" },
        { amount: 4.34524, name: "weeks" },
        { amount: 12, name: "months" },
        { amount: Number.POSITIVE_INFINITY, name: "years" },
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
function RepoCard({ repo, internal }) {
    const card = (_jsxs(_Fragment, { children: [_jsxs("div", { className: "project-card-body", children: [_jsx("h3", { className: "project-card-title", children: repo.name }), _jsx("p", { className: "project-card-desc", children: repo.description ?? _jsx("em", { children: "No description provided." }) })] }), _jsx("div", { className: "project-card-footer", children: _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { display: "flex" }, children: [repo.language && (_jsxs("span", { className: "project-lang", children: [_jsx("span", { className: "lang-dot", style: {
                                                backgroundColor: LANGUAGE_COLORS[repo.language] ?? "#ccc",
                                            } }), repo.language] })), repo.stargazers_count > 0 && (_jsxs("span", { className: "project-stars", children: ["\u2B50 ", repo.stargazers_count] }))] }), _jsx("span", { className: "repo-updated", children: formatRelativeDate(repo.updated_at) })] }) })] }));
    if (internal) {
        return (_jsx(Link, { to: `/projects/${repo.name}`, className: "project-card", children: card }, repo.name));
    }
    return (_jsx("a", { href: repo.html_url, className: "project-card", target: "_blank", rel: "noreferrer", children: card }, repo.html_url));
}
export default function ProjectList() {
    const { t } = useLang();
    const cachedData = useMemo(() => {
        if (typeof localStorage === "undefined") {
            return null;
        }
        const cache = localStorage.getItem(CACHE_KEY);
        if (!cache) {
            return null;
        }
        try {
            const parsed = JSON.parse(cache);
            if (Array.isArray(parsed.ownerRepos) &&
                Array.isArray(parsed.memberRepos) &&
                Array.isArray(parsed.orgs) &&
                parsed.orgRepos &&
                Array.isArray(parsed.gists)) {
                return parsed;
            }
        }
        catch {
            // ignore
        }
        return null;
    }, []);
    const [ownerRepos, setOwnerRepos] = useState(cachedData?.ownerRepos ?? []);
    const [memberRepos, setMemberRepos] = useState(cachedData?.memberRepos ?? []);
    const [orgs, setOrgs] = useState(cachedData?.orgs ?? []);
    const [orgRepos, setOrgRepos] = useState(cachedData?.orgRepos ?? {});
    const [gists, setGists] = useState(cachedData?.gists ?? []);
    const [loading, setLoading] = useState(!cachedData?.ownerRepos?.length);
    const [showAllLessActive, setShowAllLessActive] = useState(false);
    useEffect(() => {
        const refreshData = async () => {
            try {
                const [repoData, memberData, orgData, gistData] = await Promise.all([
                    fetchAllRepos(USERNAME),
                    fetchMemberRepos(USERNAME),
                    fetchOrgs(USERNAME),
                    fetchAllGists(USERNAME),
                ]);
                const orgReposMap = {};
                if (orgData.length > 0) {
                    const results = await Promise.all(orgData.map((org) => fetchOrgRepos(org.login)));
                    for (let i = 0; i < orgData.length; i++) {
                        orgReposMap[orgData[i].login] = results[i];
                    }
                }
                setOwnerRepos(sortRepos(repoData));
                setMemberRepos(sortRepos(memberData));
                setOrgs(orgData);
                setOrgRepos(orgReposMap);
                setGists(gistData);
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    ownerRepos: sortRepos(repoData),
                    memberRepos: sortRepos(memberData),
                    orgs: orgData,
                    orgRepos: orgReposMap,
                    gists: gistData,
                    fetchedAt: Date.now(),
                }));
            }
            catch {
                if (!cachedData?.ownerRepos?.length) {
                    setOwnerRepos([]);
                }
                if (!cachedData?.gists?.length) {
                    setGists([]);
                }
            }
            finally {
                setLoading(false);
            }
        };
        refreshData().catch(() => { });
    }, [cachedData]);
    const cutoff = useMemo(() => Date.now() - ONE_YEAR_MS, []);
    const activeRepos = useMemo(() => ownerRepos.filter((r) => !r.archived && new Date(r.pushed_at).getTime() > cutoff), [ownerRepos, cutoff]);
    const lessActiveRepos = useMemo(() => ownerRepos.filter((r) => !r.archived && new Date(r.pushed_at).getTime() <= cutoff), [ownerRepos, cutoff]);
    const archivedRepos = useMemo(() => ownerRepos.filter((r) => r.archived), [ownerRepos]);
    const displayedLessActive = useMemo(() => showAllLessActive
        ? lessActiveRepos
        : lessActiveRepos.slice(0, INITIAL_DISPLAY_COUNT), [lessActiveRepos, showAllLessActive]);
    const handleToggleLessActive = useCallback(() => {
        setShowAllLessActive((prev) => !prev);
    }, []);
    if (loading) {
        return _jsx("p", { children: t("project.loading") });
    }
    return (_jsxs("div", { className: "project-list", children: [_jsx("h2", { children: "Projects" }), _jsx("p", { className: "project-subtitle", children: t("project.repoCount", { n: ownerRepos.length }) }), activeRepos.length > 0 && (_jsxs("section", { className: "project-section", children: [_jsx("h3", { className: "project-section-title", children: t("project.section.active") }), _jsx("div", { className: "project-grid", children: activeRepos.map((repo) => (_jsx(RepoCard, { repo: repo, internal: true }, repo.name))) })] })), lessActiveRepos.length > 0 && (_jsxs("section", { className: "project-section", children: [_jsx("h3", { className: "project-section-title", children: t("project.section.lessActive") }), _jsx("div", { className: "project-grid", children: displayedLessActive.map((repo) => (_jsx(RepoCard, { repo: repo, internal: true }, repo.name))) }), lessActiveRepos.length > INITIAL_DISPLAY_COUNT && (_jsx("button", { type: "button", className: "see-more-btn", onClick: handleToggleLessActive, children: showAllLessActive ? t("project.seeLess") : t("project.seeMore") }))] })), memberRepos.length > 0 && (_jsxs("section", { className: "project-section", children: [_jsx("h3", { className: "project-section-title", children: t("project.section.contributed") }), _jsx("div", { className: "project-grid", children: memberRepos.map((repo) => (_jsx(RepoCard, { repo: repo, internal: false }, repo.html_url))) })] })), orgs.length > 0 && (_jsxs("section", { className: "project-section", children: [_jsx("h3", { className: "project-section-title", children: t("project.section.organizations") }), orgs.map((org) => {
                        const repos = orgRepos[org.login] ?? [];
                        if (repos.length === 0) {
                            return null;
                        }
                        return (_jsxs("div", { className: "org-section", children: [_jsxs("div", { className: "org-header", children: [_jsx("img", { src: org.avatar_url, alt: org.login, className: "org-avatar" }), _jsx("a", { href: org.html_url, target: "_blank", rel: "noreferrer", className: "org-name", children: org.login })] }), _jsx("div", { className: "project-grid", children: repos.map((repo) => (_jsx(RepoCard, { repo: repo, internal: false }, repo.html_url))) })] }, org.login));
                    })] })), archivedRepos.length > 0 && (_jsxs("section", { className: "project-section", children: [_jsx("h3", { className: "project-section-title", children: t("project.section.archived") }), _jsx("div", { className: "project-grid", children: archivedRepos.map((repo) => (_jsx(RepoCard, { repo: repo, internal: true }, repo.name))) })] })), _jsxs("section", { className: "gist-list", children: [_jsx("h2", { children: "Gists" }), _jsx("p", { className: "project-subtitle", children: t("project.gistCount", { n: gists.length }) }), gists.length > 0 ? (_jsx("div", { className: "project-grid", children: gists.map((gist) => {
                            const firstFile = Object.values(gist.files)[0];
                            const filename = firstFile?.filename ?? "Unknown file";
                            const language = firstFile?.language ?? "Unknown language";
                            return (_jsxs("a", { href: gist.html_url, className: "project-card", target: "_blank", rel: "noreferrer", children: [_jsxs("div", { className: "project-card-body", children: [_jsx("h3", { className: "project-card-title", children: filename }), _jsxs("p", { className: "project-card-desc", children: [_jsx("span", { className: "lang-dot", style: {
                                                            backgroundColor: LANGUAGE_COLORS[language] ?? "#ccc",
                                                            marginRight: "5px",
                                                        } }), " ", language] })] }), _jsx("div", { className: "project-card-footer", children: _jsx("span", { className: "repo-updated", children: formatRelativeDate(gist.updated_at) }) })] }, gist.id));
                        }) })) : (_jsx("p", { children: "No gists found." }))] })] }));
}
