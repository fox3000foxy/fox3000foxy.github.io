import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const RSS_URL = "https://fox3000foxy.com/feed.xml";
export default function RssSubscribe() {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) {
            return;
        }
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(RSS_URL);
            setCopied(true);
        }
        catch {
            // fallback
        }
    };
    return (_jsxs("div", { className: "rss-subscribe", children: [_jsx("a", { href: RSS_URL, type: "application/rss+xml", className: "rss-btn", title: "Subscribe with your RSS reader", children: "\uD83D\uDCE1 RSS" }), _jsx("button", { type: "button", className: "rss-copy-btn", onClick: handleCopy, children: copied ? "Copied!" : "Copy feed URL" })] }));
}
