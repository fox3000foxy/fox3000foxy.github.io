import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { useCallback, useEffect, useRef, useState } from "react";
import TurndownService from "turndown";
const API_URL = import.meta.env.VITE_WRITER_API_URL ||
    "https://writer-worker.fox3000foxy.workers.dev";
const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
});
function formatDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function imageNameFromFile(file) {
    const base = file.name.replace(/\.[^.]+$/, "").toLowerCase();
    const ext = file.name.split(".").pop() || "png";
    const id = crypto.randomUUID().slice(0, 8);
    return `${base
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)}-${id}.${ext}`;
}
export default function WriteArticle() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loginState, setLoginState] = useState({ phase: "idle" });
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [lang, setLang] = useState("en");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [images, setImages] = useState([]);
    const pollTimer = useRef(undefined);
    const imageInputRef = useRef(null);
    const restored = useRef(false);
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            LinkExtension.configure({
                openOnClick: false,
            }),
            ImageExtension.extend({
                addAttributes() {
                    return {
                        src: { default: null },
                        alt: { default: null },
                        title: { default: null },
                        "data-filename": { default: null },
                    };
                },
            }),
            Placeholder.configure({
                placeholder: "Start writing your article...",
            }),
        ],
        editorProps: {
            handlePaste: (_view, event) => {
                const items = event.clipboardData?.items;
                if (!items) {
                    return false;
                }
                let handled = false;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (file) {
                            handleImageFile(file);
                            handled = true;
                        }
                    }
                }
                if (handled) {
                    return true;
                }
                const text = event.clipboardData?.getData("text/plain");
                if (text && /[#*`\->\d+.]/.test(text[0])) {
                    event.preventDefault();
                    const result = marked.parse(text);
                    if (result instanceof Promise) {
                        result.then((html) => {
                            editor?.commands.insertContent(html);
                        });
                    }
                    else {
                        editor?.commands.insertContent(result);
                    }
                    return true;
                }
                return false;
            },
            handleDrop: (_view, event) => {
                const files = event.dataTransfer?.files;
                if (!files) {
                    return false;
                }
                let handled = false;
                for (let i = 0; i < files.length; i++) {
                    if (files[i].type.startsWith("image/")) {
                        handleImageFile(files[i]);
                        handled = true;
                    }
                }
                return handled;
            },
        },
    });
    useEffect(() => {
        const raw = localStorage.getItem("gh_writer_session");
        if (raw && !restored.current) {
            restored.current = true;
            try {
                const session = JSON.parse(raw);
                fetch(`${API_URL}/auth/user`, {
                    headers: { Authorization: `Bearer ${session.token}` },
                })
                    .then((res) => {
                    if (res.ok) {
                        setToken(session.token);
                        setUser(session.user);
                    }
                    else {
                        localStorage.removeItem("gh_writer_session");
                    }
                })
                    .catch(() => {
                    localStorage.removeItem("gh_writer_session");
                });
            }
            catch {
                localStorage.removeItem("gh_writer_session");
            }
        }
        return () => {
            if (pollTimer.current) {
                clearTimeout(pollTimer.current);
            }
        };
    }, []);
    const pollForToken = useCallback((device_code, interval) => {
        const poll = () => {
            fetch(`${API_URL}/auth/poll`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code }),
            })
                .then((r) => r.json())
                .then((data) => {
                if (data.access_token) {
                    setToken(data.access_token);
                    setUser(data.user);
                    setLoginState({ phase: "idle" });
                    localStorage.setItem("gh_writer_session", JSON.stringify({
                        token: data.access_token,
                        user: data.user,
                    }));
                    return;
                }
                if (data.error === "authorization_pending") {
                    pollTimer.current = setTimeout(poll, interval * 1000);
                }
                else if (data.error === "slow_down") {
                    pollTimer.current = setTimeout(poll, (interval + 5) * 1000);
                }
                else {
                    setLoginState({
                        phase: "error",
                        message: data.error_description || data.error,
                    });
                }
            })
                .catch(() => {
                pollTimer.current = setTimeout(poll, interval * 1000);
            });
        };
        pollTimer.current = setTimeout(poll, interval * 1000);
    }, []);
    const startLogin = useCallback(() => {
        setLoginState({ phase: "idle" });
        setError("");
        fetch(`${API_URL}/auth/device`, { method: "POST" })
            .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to start login");
            }
            return res.json();
        })
            .then((data) => {
            setLoginState({
                phase: "device-code",
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri,
            });
            pollForToken(data.device_code, data.interval || 5);
        })
            .catch((e) => {
            setLoginState({ phase: "error", message: e.message });
        });
    }, [pollForToken]);
    const handleTitleChange = (value) => {
        setTitle(value);
        setSlug(value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80));
    };
    const isWaiting = loginState.phase === "device-code" || loginState.phase === "polling";
    function exec(fn) {
        if (editor) {
            fn();
        }
    }
    function handleImageFile(file) {
        if (!(file.type.startsWith("image/") && editor)) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const filename = imageNameFromFile(file);
            editor
                .chain()
                .focus()
                .insertContent({
                type: "image",
                attrs: {
                    src: dataUrl,
                    alt: filename,
                    "data-filename": filename,
                },
            })
                .run();
            setImages((prev) => [...prev, { filename, dataUrl }]);
        };
        reader.readAsDataURL(file);
    }
    function handleImageSelect(e) {
        const files = e.target.files;
        if (!files) {
            return;
        }
        for (let i = 0; i < files.length; i++) {
            handleImageFile(files[i]);
        }
        e.target.value = "";
    }
    function removeImage(filename) {
        setImages((prev) => prev.filter((i) => i.filename !== filename));
    }
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!(token && user && editor)) {
            return;
        }
        const html = editor.getHTML();
        if (!html || html === "<p></p>") {
            setError("Article content is required");
            return;
        }
        setSubmitting(true);
        setError("");
        setResult(null);
        const tags = tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const imgs = temp.querySelectorAll("img[data-filename]");
        for (const img of imgs) {
            const fn = img.getAttribute("data-filename");
            if (fn) {
                img.setAttribute("src", fn);
                img.removeAttribute("data-filename");
            }
        }
        const processedHtml = temp.innerHTML;
        const markdown = turndown.turndown(processedHtml);
        fetch(`${API_URL}/articles`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                title,
                slug,
                description,
                content: markdown,
                tags,
                lang,
                images: images.map((i) => ({
                    filename: i.filename,
                    dataUrl: i.dataUrl,
                })),
            }),
        })
            .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to submit article");
            }
            return data;
        })
            .then((data) => {
            setResult({
                mode: data.mode || "pr",
                pr_url: data.pr_url,
                pr_number: data.pr_number,
                message: data.message,
            });
        })
            .catch((e) => {
            setError(e.message);
        })
            .finally(() => {
            setSubmitting(false);
        });
    };
    if (result) {
        if (result.mode === "direct") {
            return (_jsxs("div", { className: "write-article", children: [_jsx("h1", { children: "Article Published!" }), _jsx("p", { children: "Your article has been pushed directly to main." }), _jsx("p", { children: "It will be live once the deployment completes." })] }));
        }
        return (_jsxs("div", { className: "write-article", children: [_jsx("h1", { children: "Article Submitted!" }), _jsxs("p", { children: ["Your article has been submitted as", " ", _jsxs("a", { href: result.pr_url, target: "_blank", rel: "noopener noreferrer", children: ["PR #", result.pr_number] }), "."] }), _jsx("p", { children: "It will be reviewed and published once merged. You can track the progress on GitHub." }), _jsx("a", { href: result.pr_url, className: "button", target: "_blank", rel: "noopener noreferrer", children: "View PR on GitHub" })] }));
    }
    const polling = loginState.phase === "polling";
    return (_jsxs("div", { className: "write-article", children: [_jsx("h1", { children: "Write an Article" }), !user && (_jsxs("div", { className: "write-login", children: [_jsx("p", { children: "Log in with GitHub to submit articles. You'll need a GitHub account to contribute." }), isWaiting && (_jsxs("div", { className: "device-code-box", children: [_jsx("p", { children: "Enter the code below on GitHub to authorize:" }), _jsx("p", { className: "device-code", children: loginState.user_code }), _jsx("p", { children: _jsx("a", { href: loginState.verification_uri, target: "_blank", rel: "noopener noreferrer", children: loginState.verification_uri }) }), _jsxs("p", { className: "device-hint", children: ["Waiting for authorization", polling ? "..." : ""] })] })), loginState.phase === "error" && (_jsx("p", { className: "error", children: loginState.message })), _jsx("button", { type: "button", onClick: startLogin, disabled: isWaiting, className: "button", children: "Login with GitHub" })] })), user && (_jsxs("div", { className: "write-header", children: [_jsx("img", { src: user.avatar_url, alt: "", width: 32, height: 32 }), _jsx("span", { children: user.name || user.login }), _jsx("button", { type: "button", onClick: () => {
                            setUser(null);
                            setToken(null);
                            localStorage.removeItem("gh_writer_session");
                        }, className: "button-outline", children: "Logout" })] })), user && (_jsxs("form", { onSubmit: handleSubmit, className: "write-form", children: [error && _jsx("p", { className: "error", children: error }), _jsxs("label", { children: ["Title", _jsx("input", { type: "text", value: title, onChange: (e) => handleTitleChange(e.target.value), required: true, placeholder: "Article title" })] }), _jsxs("label", { children: ["Slug", _jsx("input", { type: "text", value: slug, onChange: (e) => setSlug(e.target.value), required: true, placeholder: "article-url-slug" })] }), _jsxs("label", { children: ["Description", _jsx("input", { type: "text", value: description, onChange: (e) => setDescription(e.target.value), placeholder: "A short description (appears in blog listings)" })] }), _jsxs("label", { children: ["Language", _jsxs("select", { value: lang, onChange: (e) => setLang(e.target.value), children: [_jsx("option", { value: "en", children: "English" }), _jsx("option", { value: "fr", children: "Fran\u00E7ais" }), _jsx("option", { value: "de", children: "Deutsch" }), _jsx("option", { value: "es", children: "Espa\u00F1ol" }), _jsx("option", { value: "it", children: "Italiano" }), _jsx("option", { value: "pt", children: "Portugu\u00EAs" }), _jsx("option", { value: "ru", children: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" }), _jsx("option", { value: "ja", children: "\u65E5\u672C\u8A9E" }), _jsx("option", { value: "ko", children: "\uD55C\uAD6D\uC5B4" }), _jsx("option", { value: "zh", children: "\u4E2D\u6587" }), _jsx("option", { value: "ar", children: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" }), _jsx("option", { value: "hi", children: "\u0939\u093F\u0928\u094D\u0926\u0940" }), _jsx("option", { value: "id", children: "Bahasa Indonesia" }), _jsx("option", { value: "th", children: "\u0E44\u0E17\u0E22" }), _jsx("option", { value: "tr", children: "T\u00FCrk\u00E7e" }), _jsx("option", { value: "vi", children: "Ti\u1EBFng Vi\u1EC7t" })] })] }), _jsxs("label", { children: ["Tags (comma separated)", _jsx("input", { type: "text", value: tagsInput, onChange: (e) => setTagsInput(e.target.value), placeholder: "gaming, retro, tutorial" })] }), _jsxs("div", { className: "write-import", children: [_jsx("strong", { children: "Import markdown (.md)" }), _jsx("input", { type: "file", accept: ".md", onChange: async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) {
                                        return;
                                    }
                                    const text = await file.text();
                                    let body = text;
                                    if (text.startsWith("---")) {
                                        const end = text.indexOf("\n---\n", 4);
                                        if (end !== -1) {
                                            const raw = text.slice(4, end);
                                            body = text.slice(end + 5);
                                            for (const line of raw.split("\n")) {
                                                const ci = line.indexOf(":");
                                                if (ci === -1) {
                                                    continue;
                                                }
                                                const k = line.slice(0, ci).trim();
                                                const v = line
                                                    .slice(ci + 1)
                                                    .trim()
                                                    .replace(/^["']|["']$/g, "");
                                                if (k === "title") {
                                                    setTitle(v);
                                                }
                                                else if (k === "slug") {
                                                    setSlug(v);
                                                }
                                                else if (k === "description") {
                                                    setDescription(v);
                                                }
                                                else if (k === "tags") {
                                                    setTagsInput(v.replace(/^\[|\]$/g, ""));
                                                }
                                            }
                                        }
                                    }
                                    const html = await marked.parse(body);
                                    if (editor) {
                                        editor.commands.setContent(html);
                                    }
                                }, style: { marginTop: "0.3rem" } })] }), _jsxs("div", { className: "editor-section", children: [_jsxs("div", { className: "editor-toolbar", children: [_jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleBold().run()), className: editor?.isActive("bold") ? "active" : "", title: "Bold", children: _jsx("strong", { children: "B" }) }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleItalic().run()), className: editor?.isActive("italic") ? "active" : "", title: "Italic", children: _jsx("em", { children: "I" }) }), _jsx("span", { className: "toolbar-sep" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleHeading({ level: 2 }).run()), className: editor?.isActive("heading", {
                                            level: 2,
                                        })
                                            ? "active"
                                            : "", title: "Heading", children: "H2" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleHeading({ level: 3 }).run()), className: editor?.isActive("heading", {
                                            level: 3,
                                        })
                                            ? "active"
                                            : "", title: "Subheading", children: "H3" }), _jsx("span", { className: "toolbar-sep" }), _jsx("button", { type: "button", onClick: () => {
                                            const url = prompt("Link URL:");
                                            if (url && editor) {
                                                editor
                                                    .chain()
                                                    .focus()
                                                    .extendMarkRange("link")
                                                    .setLink({ href: url })
                                                    .run();
                                            }
                                        }, className: editor?.isActive("link") ? "active" : "", title: "Link", children: "\uD83D\uDD17" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleBulletList().run()), className: editor?.isActive("bulletList") ? "active" : "", title: "Bullet list", children: "\u2022\u2022" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleOrderedList().run()), className: editor?.isActive("orderedList") ? "active" : "", title: "Numbered list", children: "1." }), _jsx("span", { className: "toolbar-sep" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleCodeBlock().run()), className: editor?.isActive("codeBlock") ? "active" : "", title: "Code block", children: "</>" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().toggleBlockquote().run()), className: editor?.isActive("blockquote") ? "active" : "", title: "Blockquote", children: "\"" }), _jsx("button", { type: "button", onClick: () => exec(() => editor?.chain().focus().setHorizontalRule().run()), title: "Horizontal rule", children: "--" }), _jsx("span", { className: "toolbar-sep" }), _jsx("button", { type: "button", onClick: () => imageInputRef.current?.click(), title: "Insert image", children: "\uD83D\uDDBC\uFE0F" })] }), _jsx(EditorContent, { editor: editor }), _jsx("input", { ref: imageInputRef, type: "file", accept: "image/*", multiple: true, onChange: handleImageSelect, style: { display: "none" } })] }), images.length > 0 && (_jsx("div", { className: "image-list", children: images.map((img) => (_jsxs("div", { className: "image-item", children: [_jsx("img", { src: img.dataUrl, alt: img.filename }), _jsx("span", { className: "image-name", title: img.filename, children: img.filename }), _jsx("button", { type: "button", className: "image-remove", onClick: () => removeImage(img.filename), children: "\u00D7" })] }, img.filename))) })), _jsxs("div", { className: "write-meta", children: [_jsxs("p", { className: "write-date", children: ["Date: ", _jsx("strong", { children: formatDate() })] }), _jsxs("p", { className: "write-author", children: ["Author: ", _jsxs("strong", { children: ["@", user?.login] })] })] }), _jsx("button", { type: "submit", disabled: submitting, className: "button", children: submitting ? "Submitting..." : "Submit Article" })] }))] }));
}
