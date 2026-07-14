import { useRef, useState } from "react";
import { useLang } from "../hooks/useLang";
import { CONFIG } from "../utils/config";
import "../styles/Contact.css";

const SOCIAL_LINKS = [
	{ label: "GitHub", url: "https://github.com/fox3000foxy" },
	{ label: "Twitter / X", url: "https://x.com/fox3000foxy" },
	{ label: "LinkedIn", url: "https://linkedin.com/in/fox3000foxy" },
];

const API_URL = CONFIG.contactApiUrl ?? "/api/contact";

export default function Contact() {
	const { t } = useLang();
	const [form, setForm] = useState({ name: "", email: "", message: "" });
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");
	const turnstileRef = useRef<HTMLDivElement>(null);

	function handleChange(
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) {
		setForm({ ...form, [e.target.name]: e.target.value });
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!(form.name && form.email && form.message)) {
			return;
		}
		setStatus("loading");

		let turnstileToken = "";
		if (turnstileRef.current && "turnstile" in window) {
			const ts = (window as unknown as Record<string, unknown>).turnstile;
			if (typeof ts === "object" && ts && "getResponse" in ts) {
				turnstileToken =
					(ts as { getResponse: (el: HTMLElement) => string }).getResponse(
						turnstileRef.current
					) ?? "";
			}
		}

		try {
			const res = await fetch(API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					"cf-turnstile-response": turnstileToken || undefined,
				}),
			});
			if (res.ok) {
				setStatus("success");
				setForm({ name: "", email: "", message: "" });
				if ("turnstile" in window) {
					const ts = (window as unknown as Record<string, unknown>).turnstile;
					if (typeof ts === "object" && ts && "reset" in ts) {
						(ts as { reset: (el: HTMLElement) => void }).reset(
							turnstileRef.current!
						);
					}
				}
			} else {
				const data = await res.json().catch(() => ({}));
				setStatus(
					(data as Record<string, unknown>).error === "Bot detected"
						? "error"
						: "error"
				);
			}
		} catch {
			setStatus("error");
		}
	}

	return (
		<article className="contact-page">
			<h1>{t("contact.title")}</h1>

			<form className="contact-form" onSubmit={handleSubmit}>
				<label>
					{t("contact.form.name")}
					<input
						type="text"
						name="name"
						value={form.name}
						onChange={handleChange}
						required
						disabled={status === "loading"}
					/>
				</label>
				<label>
					{t("contact.form.email")}
					<input
						type="email"
						name="email"
						value={form.email}
						onChange={handleChange}
						required
						disabled={status === "loading"}
					/>
				</label>
				<label>
					{t("contact.form.message")}
					<textarea
						name="message"
						rows={6}
						value={form.message}
						onChange={handleChange}
						required
						disabled={status === "loading"}
					/>
				</label>

				<div
					ref={turnstileRef}
					className="cf-turnstile"
					data-sitekey={CONFIG.turnstileSiteKey ?? ""}
					data-theme="dark"
					data-size="normal"
				/>

				<button type="submit" disabled={status === "loading"}>
					{status === "loading"
						? t("contact.form.sending")
						: t("contact.form.send")}
				</button>
				{status === "success" && (
					<p className="contact-success">{t("contact.form.success")}</p>
				)}
				{status === "error" && (
					<p className="contact-error">{t("contact.form.error")}</p>
				)}
			</form>

			<section className="contact-social">
				<p>{t("contact.info")}</p>
				<div className="contact-links">
					{SOCIAL_LINKS.map((link) => (
						<a
							key={link.label}
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							className="contact-link"
						>
							{link.label} ↗
						</a>
					))}
				</div>
			</section>
		</article>
	);
}
