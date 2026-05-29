import { useEffect, useRef } from "react";

export default function MermaidBlock({ code }: { code: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;

		async function render() {
			const { default: mermaid } = await import("mermaid");
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
