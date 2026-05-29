import { useState } from "react";

export default function NewsletterSignup() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			return;
		}
		setStatus("loading");

		try {
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			if (res.ok) {
				setStatus("success");
				setEmail("");
			} else {
				setStatus("error");
			}
		} catch {
			setStatus("error");
		}
	};

	return (
		<div className="newsletter-signup">
			<h3>Stay updated</h3>
			<p>
				Get notified when I publish new articles. No spam, unsubscribe anytime.
			</p>
			<form className="newsletter-form" onSubmit={handleSubmit}>
				<input
					type="email"
					placeholder="your@email.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					disabled={status === "loading"}
					className="newsletter-input"
				/>
				<button
					type="submit"
					className="newsletter-btn"
					disabled={status === "loading"}
				>
					{status === "loading" ? "..." : "Subscribe"}
				</button>
			</form>
			{status === "success" && (
				<p className="newsletter-success">Subscribed!</p>
			)}
			{status === "error" && (
				<p className="newsletter-error">
					Something went wrong. Try again later.
				</p>
			)}
		</div>
	);
}
