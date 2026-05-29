import { useEffect, useState } from "react";

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

const USERNAME = "fox3000foxy";

function formatEvent(event: GitHubEvent) {
	const repo = event.repo.name.replace(`${USERNAME}/`, "");

	switch (event.type) {
		case "PushEvent": {
			const count = event.payload.commits?.length ?? 0;
			const msg = event.payload.commits?.[0]?.message ?? "";
			const short = msg.length > 60 ? `${msg.slice(0, 60)}…` : msg;
			if (count > 0 && msg) {
				return `${count} commit${count > 1 ? "s" : ""} → ${repo}: ${short}`;
			}
			return `Pushed to → ${repo}`;
		}
		case "CreateEvent":
			return `Created ${event.payload.ref_type ?? ""} → ${repo}`;
		case "IssuesEvent":
			return `${event.payload.action === "opened" ? "Opened" : "Closed"} issue → ${repo}`;
		case "WatchEvent":
			return `Starred → ${event.repo.name}`;
		case "ForkEvent":
			return `Forked → ${event.repo.name}`;
		case "PullRequestEvent":
			return `${event.payload.action === "opened" ? "Opened" : event.payload.action} PR → ${repo}`;
		default:
			return `${event.type} → ${repo}`;
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

	if (events === null) {
		return (
			<div className="github-activity">
				<h3>Recent GitHub Activity</h3>
				<p className="github-loading">Loading…</p>
			</div>
		);
	}

	if (events.length === 0) {
		return null;
	}

	return (
		<div className="github-activity">
			<h3>Recent GitHub Activity</h3>
			<ul className="github-events">
				{events.slice(0, 5).map((event) => (
					<li
						key={`${event.repo.name}-${event.created_at}`}
						className="github-event"
					>
						<span className="github-event-icon">
							{event.type === "PushEvent"
								? "📝"
								: event.type === "WatchEvent"
									? "⭐"
									: event.type === "ForkEvent"
										? "🍴"
										: event.type === "IssuesEvent"
											? "🔧"
											: event.type === "PullRequestEvent"
												? "🔀"
												: event.type === "CreateEvent"
													? "🎉"
													: "📌"}
						</span>
						<span className="github-event-desc">{formatEvent(event)}</span>
						<span className="github-event-time">
							{timeAgo(event.created_at)}
						</span>
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
