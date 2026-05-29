import type { AnchorHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] || []), "class", "style"],
	},
};

interface MarkdownContentProps {
	content: string;
	urlTransform?: (url: string) => string;
}

function ExternalLinkRenderer(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
	const { href, children, ...rest } = props;
	if (!href) { return <a {...rest}>{children}</a>; }
	const isExternal = /^https?:\/\//.test(href);
	if (isExternal) {
		return (
			<a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
				{children}
			</a>
		);
	}
	return <a href={href} {...rest}>{children}</a>;
}

export default function MarkdownContent({ content, urlTransform }: MarkdownContentProps) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[
				rehypeRaw,
				[rehypeSanitize, sanitizeSchema],
				rehypeHighlight,
			]}
			components={{ a: ExternalLinkRenderer }}
			urlTransform={urlTransform}
		>
			{content}
		</ReactMarkdown>
	);
}
