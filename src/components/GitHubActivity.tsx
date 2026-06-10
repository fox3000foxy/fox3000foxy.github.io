import { useEffect, useMemo, useState } from "react";

interface GitHubEvent {
	type: string;
	repo: { name: string };
	created_at: string;
	payload: {
		commits?: { message: string }[];
		action?: string;
		ref_type?: string;
	};
}

interface ProcessedEvent {
	icon: string;
	description: string;
	time: string;
	key: string;
}

const USERNAME = "fox3000foxy";

function processEvent(event: GitHubEvent): ProcessedEvent {
	const repo = event.repo.name.replace(`${USERNAME}/`, "");
	const key = `${event.repo.name}-${event.created_at}`;

	switch (event.type) {
		case "PushEvent": {
			const count = event.payload.commits?.length ?? 0;
			const msg = event.payload.commits?.[0]?.message ?? "";
			const short = msg.length > 60 ? `${msg.slice(0, 60)}…` : msg;
			if (count > 0 && msg) {
				return {
					icon: "📝",
					description: `${count} commit${count > 1 ? "s" : ""} → ${repo}: ${short}`,
					time: timeAgo(event.created_at),
					key,
				};
			}
			return {
				icon: "📝",
				description: `Pushed to → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		}
		case "CreateEvent":
			return {
				icon: "🎉",
				description: `Created ${event.payload.ref_type ?? ""} → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "DeleteEvent":
			return {
				icon: "🗑️",
				description: `Deleted ${event.payload.ref_type ?? ""} → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "IssuesEvent":
			return {
				icon: "🔧",
				description: `${event.payload.action === "opened" ? "Opened" : "Closed"} issue → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "IssueCommentEvent":
			return {
				icon: "💬",
				description: `${event.payload.action === "created" ? "Commented" : event.payload.action} on → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "WatchEvent":
			return {
				icon: "⭐",
				description: `Starred → ${event.repo.name}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "ForkEvent":
			return {
				icon: "🍴",
				description: `Forked → ${event.repo.name}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "PullRequestEvent":
			return {
				icon: "🔀",
				description: `${event.payload.action === "opened" ? "Opened" : event.payload.action} PR → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "PullRequestReviewEvent":
			return {
				icon: "📌",
				description: `${event.payload.action === "submitted" ? "Reviewed" : event.payload.action} PR → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "ReleaseEvent":
			return {
				icon: "🏷️",
				description: `Released → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "PublicEvent":
			return {
				icon: "🌍",
				description: `Made public → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "GollumEvent":
			return {
				icon: "📖",
				description: `Updated wiki → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		case "MemberEvent":
			return {
				icon: "👥",
				description: `${event.payload.action ?? "Changed"} collaborator → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
		default:
			return {
				icon: "📌",
				description: `${event.type} → ${repo}`,
				time: timeAgo(event.created_at),
				key,
			};
	}
}

function timeAgo(date: string): string {
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
	const [events, setEvents] = useState<GitHubEvent[] | null>(null);

	useEffect(() => {
		fetch(`https://api.github.com/users/${USERNAME}/events?per_page=10`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => setEvents(Array.isArray(data) ? data : []))
			.catch(() => setEvents([]));
	}, []);

	const processed = useMemo(
		() => events?.slice(0, 5).map(processEvent) ?? null,
		[events]
	);

	if (processed === null) {
		return (
			<div className="github-activity">
				<h3>Recent GitHub Activity</h3>
				<p className="github-loading">Loading…</p>
			</div>
		);
	}

	if (processed.length === 0) {
		return null;
	}

	return (
		<div className="github-activity">
			<h3>Recent GitHub Activity</h3>
			<ul className="github-events">
				{processed.map((event) => (
					<li key={event.key} className="github-event">
						<span className="github-event-icon">{event.icon}</span>
						<span className="github-event-desc">{event.description}</span>
						<span className="github-event-time">{event.time}</span>
					</li>
				))}
			</ul>
			<a
				href={`https://github.com/${USERNAME}`}
				target="_blank"
				rel="noopener noreferrer"
				className="github-view-all"
			>
				View all →
			</a>
		</div>
	);
}
