import { useEffect, useRef, useState } from "react";

function isInViewport(el: HTMLElement, rootMargin = "200px"): boolean {
	const rect = el.getBoundingClientRect();
	const margin = Number.parseInt(rootMargin, 10) || 200;
	return rect.top - margin < window.innerHeight && rect.bottom + margin > 0;
}

export function useWhenVisible(rootMargin = "200px") {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(() => {
		if (typeof document === "undefined") {
			return false;
		}
		return false;
	});

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		if (isInViewport(el, rootMargin)) {
			setIsVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [rootMargin]);

	return { ref, isVisible };
}
