import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
export default function KeyboardShortcuts() {
    const navigate = useNavigate();
    const [showHelp, setShowHelp] = useState(false);
    useEffect(() => {
        function handleKey(e) {
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                return;
            }
            switch (e.key) {
                case "?":
                    e.preventDefault();
                    setShowHelp((v) => !v);
                    break;
                case "/":
                    e.preventDefault();
                    document
                        .querySelector('.search-bar input[type="search"]')
                        ?.focus();
                    break;
                case "t": {
                    e.preventDefault();
                    const toc = document.querySelector(".toc");
                    if (toc) {
                        toc.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        toc.querySelector("a")?.focus();
                    }
                    break;
                }
                case "Escape":
                    setShowHelp(false);
                    document.activeElement?.blur();
                    break;
                case "h":
                    if (!(e.ctrlKey || e.metaKey)) {
                        break;
                    }
                    void navigate("/");
                    break;
                default:
                    break;
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [navigate]);
    if (!showHelp) {
        return null;
    }
    return (_jsx("button", { type: "button", className: "shortcuts-overlay", onClick: () => setShowHelp(false), onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
                setShowHelp(false);
            }
        }, children: _jsxs("div", { className: "shortcuts-modal", role: "dialog", onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Keyboard Shortcuts" }), _jsxs("dl", { children: [_jsx("dt", { children: _jsx("kbd", { children: "?" }) }), " ", _jsx("dd", { children: "Toggle this help" }), _jsx("dt", { children: _jsx("kbd", { children: "/" }) }), " ", _jsx("dd", { children: "Focus search" }), _jsx("dt", { children: _jsx("kbd", { children: "t" }) }), " ", _jsx("dd", { children: "Focus table of contents" }), _jsx("dt", { children: _jsx("kbd", { children: "Esc" }) }), " ", _jsx("dd", { children: "Close / blur" }), _jsx("dt", { children: _jsx("kbd", { children: "Ctrl+H" }) }), " ", _jsx("dd", { children: "Go home" })] }), _jsx("button", { type: "button", className: "shortcuts-close", onClick: () => setShowHelp(false), children: "Close" })] }) }));
}
