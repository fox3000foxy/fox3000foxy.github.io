import { useEffect, useState } from "react";
import { useLang } from "../hooks/useLang";

export default function BackToTop() {
	const [visible, setVisible] = useState(false);
	const { t } = useLang();

	useEffect(() => {
		const onScroll = () => setVisible(window.scrollY > 300);
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<button
			type="button"
			className={`back-to-top${visible ? " visible" : ""}`}
			onClick={scrollToTop}
			aria-label={t("backToTop.aria")}
		>
			↑
		</button>
	);
}
