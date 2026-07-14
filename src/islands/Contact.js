import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    const [status, setStatus] = useState("idle");
    const turnstileRef = useRef(null);
    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!(form.name && form.email && form.message)) {
            return;
        }
        setStatus("loading");
        let turnstileToken = "";
        if (turnstileRef.current && "turnstile" in window) {
            const ts = window.turnstile;
            if (typeof ts === "object" && ts && "getResponse" in ts) {
                turnstileToken =
                    ts.getResponse(turnstileRef.current) ?? "";
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
                    const ts = window.turnstile;
                    if (typeof ts === "object" && ts && "reset" in ts) {
                        ts.reset(turnstileRef.current);
                    }
                }
            }
            else {
                const data = await res.json().catch(() => ({}));
                setStatus(data.error === "Bot detected"
                    ? "error"
                    : "error");
            }
        }
        catch {
            setStatus("error");
        }
    }
    return (_jsxs("article", { className: "contact-page", children: [_jsx("h1", { children: t("contact.title") }), _jsxs("form", { className: "contact-form", onSubmit: handleSubmit, children: [_jsxs("label", { children: [t("contact.form.name"), _jsx("input", { type: "text", name: "name", value: form.name, onChange: handleChange, required: true, disabled: status === "loading" })] }), _jsxs("label", { children: [t("contact.form.email"), _jsx("input", { type: "email", name: "email", value: form.email, onChange: handleChange, required: true, disabled: status === "loading" })] }), _jsxs("label", { children: [t("contact.form.message"), _jsx("textarea", { name: "message", rows: 6, value: form.message, onChange: handleChange, required: true, disabled: status === "loading" })] }), _jsx("div", { ref: turnstileRef, className: "cf-turnstile", "data-sitekey": CONFIG.turnstileSiteKey ?? "", "data-theme": "dark", "data-size": "normal" }), _jsx("button", { type: "submit", disabled: status === "loading", children: status === "loading"
                            ? t("contact.form.sending")
                            : t("contact.form.send") }), status === "success" && (_jsx("p", { className: "contact-success", children: t("contact.form.success") })), status === "error" && (_jsx("p", { className: "contact-error", children: t("contact.form.error") }))] }), _jsxs("section", { className: "contact-social", children: [_jsx("p", { children: t("contact.info") }), _jsx("div", { className: "contact-links", children: SOCIAL_LINKS.map((link) => (_jsxs("a", { href: link.url, target: "_blank", rel: "noopener noreferrer", className: "contact-link", children: [link.label, " \u2197"] }, link.label))) })] })] }));
}
