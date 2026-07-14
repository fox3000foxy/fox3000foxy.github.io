import { useCallback, useEffect, useState } from "react";
const STORAGE_KEY = "bookmarks";
function loadBookmarks() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }
    catch {
        return [];
    }
}
export function useBookmarks() {
    const [bookmarks, setBookmarks] = useState(loadBookmarks);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    }, [bookmarks]);
    const toggle = useCallback((slug) => {
        setBookmarks((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
    }, []);
    const isBookmarked = useCallback((slug) => bookmarks.includes(slug), [bookmarks]);
    return { bookmarks, toggle, isBookmarked };
}
