import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { slugify } from "../utils/headings";
import { useLang } from "../hooks/useLang";
const MermaidBlock = lazy(() => import("./MermaidBlock"));
const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "iframe"],
    attributes: {
        ...defaultSchema.attributes,
        "*": [...(defaultSchema.attributes?.["*"] || []), "class", "style"],
        iframe: [
            "src",
            "width",
            "height",
            "frameBorder",
            "allow",
            "allowFullScreen",
            "title",
            "loading",
        ],
    },
};
function splitContent(content) {
    const segments = [];
    const re = /```mermaid\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration
    while ((m = re.exec(content)) !== null) {
        if (m.index > last) {
            segments.push({ type: "md", content: content.slice(last, m.index) });
        }
        segments.push({ type: "mermaid", content: m[1].trim() });
        last = m.index + m[0].length;
    }
    if (last < content.length) {
        segments.push({ type: "md", content: content.slice(last) });
    }
    return segments;
}
function textContent(node) {
    if (typeof node === "string") {
        return node;
    }
    if (typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(textContent).join("");
    }
    if (node && typeof node === "object" && "props" in node) {
        return textContent(node.props.children);
    }
    return "";
}
function ExternalLinkRenderer(props) {
    const { href, children, ...rest } = props;
    if (!href) {
        return _jsx("a", { ...rest, children: children });
    }
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
        return (_jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", ...rest, children: children }));
    }
    return _jsx("a", { ...rest, children: children });
}
function HeadingRenderer({ Tag, children, ...rest }) {
    return (_jsx(Tag, { id: slugify(textContent(children)), ...rest, children: children }));
}
function CodeBlock({ children, ...rest }) {
    const [copied, setCopied] = useState(false);
    const { t } = useLang();
    const code = textContent(children);
    // Extract language from <code> child className
    const codeEl = Array.isArray(children) ? children[0] : children;
    // biome-ignore lint/suspicious/noExplicitAny: need className from child
    const lang = (codeEl?.props?.className ?? "").replace(/^language-/, "");
    const showLang = lang && lang !== "mermaid" ? lang : "";
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
        }
        catch {
            // clipboard not available
        }
    };
    useEffect(() => {
        if (!copied) {
            return;
        }
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);
    return (_jsxs("div", { className: "code-block-wrapper", children: [_jsxs("div", { className: "code-block-header", children: [showLang && _jsx("span", { className: "code-lang-label", children: showLang }), _jsx("button", { type: "button", className: `code-copy-btn${copied ? " copied" : ""}`, onClick: handleCopy, children: copied ? t("code.copied") : t("code.copy") })] }), _jsx("pre", { ...rest, children: children })] }));
}
function MarkdownSection({ content, urlTransform, }) {
    return (_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [
            rehypeRaw,
            [rehypeSanitize, sanitizeSchema],
            rehypeHighlight,
        ], components: {
            a: ExternalLinkRenderer,
            h2: (props) => _jsx(HeadingRenderer, { Tag: "h2", ...props }),
            h3: (props) => _jsx(HeadingRenderer, { Tag: "h3", ...props }),
            pre: CodeBlock,
        }, urlTransform: urlTransform, children: content }));
}
export default function MarkdownContent({ content, urlTransform, }) {
    const segments = useMemo(() => splitContent(content), [content]);
    const hasMermaid = segments.some((s) => s.type === "mermaid");
    if (!hasMermaid) {
        return (_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [
                rehypeRaw,
                [rehypeSanitize, sanitizeSchema],
                rehypeHighlight,
            ], components: {
                a: ExternalLinkRenderer,
                h2: (props) => _jsx(HeadingRenderer, { Tag: "h2", ...props }),
                h3: (props) => _jsx(HeadingRenderer, { Tag: "h3", ...props }),
                pre: CodeBlock,
            }, urlTransform: urlTransform, children: content }));
    }
    return (_jsx(_Fragment, { children: segments.map((seg) => {
            const key = `${seg.type}-${seg.content.slice(0, 40)}`;
            return seg.type === "mermaid" ? (_jsx(Suspense, { fallback: _jsx("div", { className: "mermaid-loading", children: "Loading diagram..." }), children: _jsx(MermaidBlock, { code: seg.content }) }, key)) : (_jsx(MarkdownSection, { content: seg.content, urlTransform: urlTransform }, key));
        }) }));
}
