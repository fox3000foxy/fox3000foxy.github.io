import type { ReactNode } from "react";
import { useWhenVisible } from "../hooks/useWhenVisible";

export default function LazyVisible({
	children,
	placeholder,
	rootMargin,
}: {
	children: ReactNode;
	placeholder?: ReactNode;
	rootMargin?: string;
}) {
	const { ref, isVisible } = useWhenVisible(rootMargin);

	return <div ref={ref}>{isVisible ? children : (placeholder ?? <div />)}</div>;
}
