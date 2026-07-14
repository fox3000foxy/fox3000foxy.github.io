import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLang } from "../hooks/useLang";
export default function ShareButtons({ url, title, }) {
    const { t } = useLang();
    const [copied, setCopied] = useState(false);
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    useEffect(() => {
        if (!copied) {
            return;
        }
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);
    function handleCopy() {
        void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
        });
    }
    return (_jsxs(_Fragment, { children: [_jsx("a", { href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, target: "_blank", rel: "noopener noreferrer", className: "share-btn", "aria-label": "Share on Twitter", children: "\uD835\uDD4F" }), _jsx("a", { href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, target: "_blank", rel: "noopener noreferrer", className: "share-btn", "aria-label": "Share on LinkedIn", children: "in" }), _jsx("button", { type: "button", className: "share-btn", onClick: handleCopy, "aria-label": t("code.copy"), children: copied ? t("code.copied") : "🔗" })] }));
}
