import { useEffect } from "react";
const LINKS = [
    { rel: "authorization_endpoint", href: "https://indieauth.com/auth" },
    { rel: "token_endpoint", href: "https://tokens.indieauth.com/token" },
    { rel: "me", href: "https://github.com/fox3000foxy" },
    { rel: "webmention", href: "https://webmention.io/fox3000foxy/webmention" },
    { rel: "pingback", href: "https://webmention.io/fox3000foxy/xmlrpc" },
];
export default function WebmentionLinks() {
    useEffect(() => {
        const els = [];
        for (const link of LINKS) {
            if (document.querySelector(`link[rel="${link.rel}"]`)) {
                continue;
            }
            const el = document.createElement("link");
            el.rel = link.rel;
            el.href = link.href;
            document.head.appendChild(el);
            els.push(el);
        }
        return () => {
            for (const el of els) {
                el.remove();
            }
        };
    }, []);
    return null;
}
