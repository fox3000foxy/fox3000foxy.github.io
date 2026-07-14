import type { ReactNode } from "react";
import { useWhenVisible } from "../hooks/useWhenVisible";

export default function LazyVisible({
	children,
	placeholder,
	rootMargin,
	height,
}: {
	children: ReactNode;
	placeholder?: ReactNode;
	rootMargin?: string;
	height?: string;
}) {
	const { ref, isVisible } = useWhenVisible(rootMargin);

	if (isVisible) {
		return <div ref={ref}>{children}</div>;
	}

	return (
		<div ref={ref} style={height ? { minHeight: height } : undefined}>
			{placeholder ?? <div />}
		</div>
	);
}
