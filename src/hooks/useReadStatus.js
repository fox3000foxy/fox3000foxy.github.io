import { useCallback, useEffect, useState } from "react";
const STORAGE_KEY = "read-articles";
export function useReadStatus() {
    const [readSlugs, setReadSlugs] = useState(() => {
        if (typeof localStorage === "undefined") {
            return new Set();
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return new Set(raw ? JSON.parse(raw) : []);
        }
        catch {
            return new Set();
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSlugs]));
    }, [readSlugs]);
    const markAsRead = useCallback((slug) => {
        setReadSlugs((prev) => {
            if (prev.has(slug)) {
                return prev;
            }
            const next = new Set(prev);
            next.add(slug);
            return next;
        });
    }, []);
    const isRead = useCallback((slug) => readSlugs.has(slug), [readSlugs]);
    return { markAsRead, isRead };
}
