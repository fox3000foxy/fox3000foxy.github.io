import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
const USERNAME = "fox3000foxy";
function processEvent(event) {
    const repo = event.repo.name.replace(`${USERNAME}/`, "");
    const key = `${event.repo.name}-${event.created_at}`;
    const base = `https://github.com/${event.repo.name}`;
    switch (event.type) {
        case "PushEvent": {
            const count = event.payload.commits?.length ?? 0;
            const msg = event.payload.commits?.[0]?.message ?? "";
            const sha = event.payload.commits?.[0]?.sha;
            const short = msg.length > 60 ? `${msg.slice(0, 60)}…` : msg;
            const url = sha ? `${base}/commit/${sha}` : base;
            if (count > 0 && msg) {
                return {
                    icon: "📝",
                    description: `${count} commit${count > 1 ? "s" : ""} → ${repo}: ${short}`,
                    time: timeAgo(event.created_at),
                    key,
                    url,
                };
            }
            return {
                icon: "📝",
                description: `Pushed to → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url,
            };
        }
        case "CreateEvent":
            return {
                icon: "🎉",
                description: `Created ${event.payload.ref_type ?? ""} → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
        case "DeleteEvent":
            return {
                icon: "🗑️",
                description: `Deleted ${event.payload.ref_type ?? ""} → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
        case "IssuesEvent":
            return {
                icon: "🔧",
                description: `${event.payload.action === "opened" ? "Opened" : "Closed"} issue → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.issue?.html_url ?? base,
            };
        case "IssueCommentEvent":
            return {
                icon: "💬",
                description: `${event.payload.action === "created" ? "Commented" : event.payload.action} on → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.comment?.html_url ??
                    event.payload.issue?.html_url ??
                    base,
            };
        case "WatchEvent":
            return {
                icon: "⭐",
                description: `Starred → ${event.repo.name}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
        case "ForkEvent":
            return {
                icon: "🍴",
                description: `Forked → ${event.repo.name}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.forkee?.html_url ?? base,
            };
        case "PullRequestEvent":
            return {
                icon: "🔀",
                description: `${event.payload.action === "opened" ? "Opened" : event.payload.action} PR → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.pull_request?.html_url ?? base,
            };
        case "PullRequestReviewEvent":
            return {
                icon: "📌",
                description: `${event.payload.action === "submitted" ? "Reviewed" : event.payload.action} PR → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.review?.html_url ??
                    event.payload.pull_request?.html_url ??
                    base,
            };
        case "ReleaseEvent":
            return {
                icon: "🏷️",
                description: `Released → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: event.payload.release?.html_url ?? base,
            };
        case "PublicEvent":
            return {
                icon: "🌍",
                description: `Made public → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
        case "GollumEvent":
            return {
                icon: "📖",
                description: `Updated wiki → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: `${base}/wiki`,
            };
        case "MemberEvent":
            return {
                icon: "👥",
                description: `${event.payload.action ?? "Changed"} collaborator → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
        default:
            return {
                icon: "📌",
                description: `${event.type} → ${repo}`,
                time: timeAgo(event.created_at),
                key,
                url: base,
            };
    }
}
function timeAgo(date) {
    const sec = (Date.now() - new Date(date).getTime()) / 1000;
    if (sec < 60) {
        return "just now";
    }
    if (sec < 3600) {
        return `${Math.floor(sec / 60)}m ago`;
    }
    if (sec < 86400) {
        return `${Math.floor(sec / 3600)}h ago`;
    }
    return `${Math.floor(sec / 86400)}d ago`;
}
export default function GitHubActivity() {
    const [events, setEvents] = useState(null);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`https://api.github.com/users/${USERNAME}/events?per_page=10`, {
            signal: controller.signal,
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
            if (!controller.signal.aborted) {
                setEvents(Array.isArray(data) ? data : []);
            }
        })
            .catch(() => {
            if (!controller.signal.aborted) {
                setEvents([]);
            }
        });
        return () => controller.abort();
    }, []);
    const processed = useMemo(() => events?.slice(0, 5).map(processEvent) ?? null, [events]);
    if (processed === null) {
        return (_jsxs("div", { className: "github-activity", children: [_jsx("h3", { children: "Recent GitHub Activity" }), _jsx("p", { className: "github-loading", children: "Loading\u2026" })] }));
    }
    if (processed.length === 0) {
        return null;
    }
    return (_jsxs("div", { className: "github-activity", children: [_jsx("h3", { children: "Recent GitHub Activity" }), _jsx("ul", { className: "github-events", children: processed.map((event) => (_jsxs("li", { className: "github-event", children: [_jsx("span", { className: "github-event-icon", children: event.icon }), _jsx("a", { href: event.url, target: "_blank", rel: "noopener noreferrer", className: "github-event-desc", children: event.description }), _jsx("span", { className: "github-event-time", children: event.time })] }, event.key))) }), _jsx("a", { href: `https://github.com/${USERNAME}`, target: "_blank", rel: "noopener noreferrer", className: "github-view-all", children: "View all \u2192" })] }));
}
