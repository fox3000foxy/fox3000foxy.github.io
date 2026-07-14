import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
const MERMAID_URL = "https://esm.sh/mermaid@11";
let mermaidPromise = null;
function loadMermaid() {
    if (!mermaidPromise) {
        mermaidPromise = import(MERMAID_URL).then((m) => m.default);
    }
    return mermaidPromise;
}
export default function MermaidBlock({ code }) {
    const ref = useRef(null);
    useEffect(() => {
        let cancelled = false;
        async function render() {
            const mermaid = await loadMermaid();
            if (cancelled || !ref.current) {
                return;
            }
            mermaid.initialize({
                theme: "dark",
                startOnLoad: false,
            });
            const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`;
            const { svg } = await mermaid.render(id, code);
            if (!cancelled && ref.current) {
                ref.current.innerHTML = svg;
            }
        }
        void render();
        return () => {
            cancelled = true;
        };
    }, [code]);
    return _jsx("div", { ref: ref, className: "mermaid-wrapper" });
}
