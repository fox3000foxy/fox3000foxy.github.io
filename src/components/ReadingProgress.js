import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export default function ReadingProgress() {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        function update() {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            const max = scrollHeight - clientHeight;
            setProgress(max > 0 ? Math.min(scrollTop / max, 1) : 0);
        }
        update();
        window.addEventListener("scroll", update, { passive: true });
        return () => window.removeEventListener("scroll", update);
    }, []);
    return (_jsx("div", { className: "reading-progress", style: { transform: `scaleX(${progress})` } }));
}
