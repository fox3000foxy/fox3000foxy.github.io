import { useCallback, useEffect, useState } from "react";
export function useReadingMode() {
    const [enabled, setEnabled] = useState(() => localStorage.getItem("readingMode") === "true");
    useEffect(() => {
        document.documentElement.classList.toggle("reading-mode", enabled);
        localStorage.setItem("readingMode", String(enabled));
    }, [enabled]);
    const toggle = useCallback(() => setEnabled((v) => !v), []);
    return { enabled, toggle };
}
