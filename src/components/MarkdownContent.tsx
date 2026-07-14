import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
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

interface MarkdownContentProps {
	content: string;
	urlTransform?: (url: string) => string;
}

interface Segment {
	type: "md" | "mermaid";
	content: string;
}

function splitContent(content: string): Segment[] {
	const segments: Segment[] = [];
	const re = /```mermaid\n([\s\S]*?)```/g;
	let last = 0;

	let m: RegExpExecArray | null;
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

function textContent(node: ReactNode): string {
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
		return textContent(
			(node as { props: { children?: ReactNode } }).props.children
		);
	}
	return "";
}

function ExternalLinkRenderer(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
	const { href, children, ...rest } = props;
	if (!href) {
		return <a {...rest}>{children}</a>;
	}
	const isExternal = /^https?:\/\//.test(href);
	if (isExternal) {
		return (
			<a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
				{children}
			</a>
		);
	}
	return <a {...rest}>{children}</a>;
}

function HeadingRenderer({
	Tag,
	children,
	...rest
}: HTMLAttributes<HTMLHeadingElement> & { Tag: "h2" | "h3" }) {
	return (
		<Tag id={slugify(textContent(children))} {...rest}>
			{children}
		</Tag>
	);
}

function CodeBlock({ children, ...rest }: HTMLAttributes<HTMLPreElement>) {
	const [copied, setCopied] = useState(false);
	const { t } = useLang();
	const code = textContent(children);

	// Extract language from <code> child className
	const codeEl = Array.isArray(children) ? children[0] : children;
	// biome-ignore lint/suspicious/noExplicitAny: need className from child
	const lang = ((codeEl as any)?.props?.className ?? "").replace(
		/^language-/,
		""
	);
	const showLang = lang && lang !== "mermaid" ? lang : "";

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
		} catch {
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

	return (
		<div className="code-block-wrapper">
			<div className="code-block-header">
				{showLang && <span className="code-lang-label">{showLang}</span>}
				<button
					type="button"
					className={`code-copy-btn${copied ? " copied" : ""}`}
					onClick={handleCopy}
				>
					{copied ? t("code.copied") : t("code.copy")}
				</button>
			</div>
			<pre {...rest}>{children}</pre>
		</div>
	);
}

function MarkdownSection({
	content,
	urlTransform,
}: {
	content: string;
	urlTransform?: (url: string) => string;
}) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[
				rehypeRaw,
				[rehypeSanitize, sanitizeSchema],
				rehypeHighlight,
			]}
			components={{
				a: ExternalLinkRenderer,
				h2: (props) => <HeadingRenderer Tag="h2" {...props} />,
				h3: (props) => <HeadingRenderer Tag="h3" {...props} />,
				pre: CodeBlock,
			}}
			urlTransform={urlTransform}
		>
			{content}
		</ReactMarkdown>
	);
}

export default function MarkdownContent({
	content,
	urlTransform,
}: MarkdownContentProps) {
	const segments = useMemo(() => splitContent(content), [content]);

	const hasMermaid = segments.some((s) => s.type === "mermaid");

	if (!hasMermaid) {
		return (
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[
					rehypeRaw,
					[rehypeSanitize, sanitizeSchema],
					rehypeHighlight,
				]}
				components={{
					a: ExternalLinkRenderer,
					h2: (props) => <HeadingRenderer Tag="h2" {...props} />,
					h3: (props) => <HeadingRenderer Tag="h3" {...props} />,
					pre: CodeBlock,
				}}
				urlTransform={urlTransform}
			>
				{content}
			</ReactMarkdown>
		);
	}

	return (
		<>
			{segments.map((seg) => {
				const key = `${seg.type}-${seg.content.slice(0, 40)}`;
				return seg.type === "mermaid" ? (
					<Suspense
						key={key}
						fallback={<div className="mermaid-loading">Loading diagram...</div>}
					>
						<MermaidBlock code={seg.content} />
					</Suspense>
				) : (
					<MarkdownSection
						key={key}
						content={seg.content}
						urlTransform={urlTransform}
					/>
				);
			})}
		</>
	);
}
