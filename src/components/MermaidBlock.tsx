import { useEffect, useRef } from "react";
import type mermaidType from "mermaid";

const MERMAID_URL = "https://esm.sh/mermaid@11";

let mermaidPromise: Promise<typeof mermaidType> | null = null;

function loadMermaid(): Promise<typeof mermaidType> {
	if (!mermaidPromise) {
		mermaidPromise = import(MERMAID_URL).then((m) => m.default);
	}
	return mermaidPromise;
}

export default function MermaidBlock({ code }: { code: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;

		async function render() {
			const mermaid = await loadMermaid();
			if (cancelled || !ref.current) {
				return;
			}

			mermaid.initialize({
				theme: "dark",
				startOnLoad: false,
			});

			const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`;
			const { svg } = await mermaid.render(id, code);
			if (!cancelled && ref.current) {
				ref.current.innerHTML = svg;
			}
		}

		void render();
		return () => {
			cancelled = true;
		};
	}, [code]);

	return <div ref={ref} className="mermaid-wrapper" />;
}
