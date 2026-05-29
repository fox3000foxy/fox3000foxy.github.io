import { useState } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { slugify } from "../utils/headings";
import { useLang } from "../hooks/useLang";
import MermaidBlock from "./MermaidBlock";

const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		"*": [
			...(defaultSchema.attributes?.["*"] || []),
			"class",
			"style",
			"data-id",
		],
	},
};

interface MarkdownContentProps {
	content: string;
	urlTransform?: (url: string) => string;
}

// Replace ```mermaid blocks with <pre class="mermaid-code"> so rehypeHighlight doesn't touch them
function preprocessMermaid(content: string, mermaidBlocks: string[]): string {
	return content.replace(
		/```mermaid\n([\s\S]*?)```/g,
		(_match, code: string) => {
			const id = `MERMAID_${mermaidBlocks.length}`;
			mermaidBlocks.push(code.trim());
			return `<pre class="mermaid-code" data-id="${id}"></pre>`;
		}
	);
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
	return (
		<a href={href} {...rest}>
			{children}
		</a>
	);
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

	const isMermaid = rest.className === "mermaid-code";
	const dataId = (rest as Record<string, string>)["data-id"];

	if (isMermaid && dataId) {
		const idx = Number.parseInt(dataId.replace("MERMAID_", ""), 10);
		const code = mermaidBlocksRef.current[idx];
		if (code) {
			return <MermaidBlock code={code} />;
		}
	}

	const code = textContent(children);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard not available
		}
	};

	return (
		<div className="code-block-wrapper">
			<button
				type="button"
				className={`code-copy-btn${copied ? " copied" : ""}`}
				onClick={handleCopy}
			>
				{copied ? t("code.copied") : t("code.copy")}
			</button>
			<pre {...rest}>{children}</pre>
		</div>
	);
}

const mermaidBlocksRef = { current: [] as string[] };

export default function MarkdownContent({
	content,
	urlTransform,
}: MarkdownContentProps) {
	mermaidBlocksRef.current = [];
	const processed = preprocessMermaid(content, mermaidBlocksRef.current);

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
			{processed}
		</ReactMarkdown>
	);
}
