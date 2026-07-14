import { jsx as _jsx } from "react/jsx-runtime";
import { useWhenVisible } from "../hooks/useWhenVisible";
export default function LazyVisible({ children, placeholder, rootMargin, height, }) {
    const { ref, isVisible } = useWhenVisible(rootMargin);
    if (isVisible) {
        return _jsx("div", { ref: ref, children: children });
    }
    return (_jsx("div", { ref: ref, style: height ? { minHeight: height } : undefined, children: placeholder ?? _jsx("div", {}) }));
}
