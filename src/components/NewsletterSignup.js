import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { CONFIG } from "../utils/config";
const API_URL = CONFIG.newsletterApiUrl ?? "/api/subscribe";
export default function NewsletterSignup() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState("idle");
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) {
            return;
        }
        setStatus("loading");
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                setStatus("success");
                setEmail("");
            }
            else {
                setStatus("error");
            }
        }
        catch {
            setStatus("error");
        }
    };
    return (_jsxs("div", { className: "newsletter-signup", children: [_jsx("h3", { children: "Stay updated" }), _jsx("p", { children: "Get notified when I publish new articles. No spam, unsubscribe anytime." }), _jsxs("form", { className: "newsletter-form", onSubmit: handleSubmit, children: [_jsx("input", { type: "email", placeholder: "your@email.com", value: email, onChange: (e) => setEmail(e.target.value), required: true, disabled: status === "loading", className: "newsletter-input" }), _jsx("button", { type: "submit", className: "newsletter-btn", disabled: status === "loading", children: status === "loading" ? "..." : "Subscribe" })] }), status === "success" && (_jsx("p", { className: "newsletter-success", children: "Subscribed!" })), status === "error" && (_jsx("p", { className: "newsletter-error", children: "Something went wrong. Try again later." }))] }));
}
