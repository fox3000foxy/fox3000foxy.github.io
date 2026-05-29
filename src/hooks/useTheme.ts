import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
	const stored = localStorage.getItem("theme");
	if (stored === "light" || stored === "dark") {
		return stored;
	}
	return window.matchMedia("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";
}

export const ThemeContext = createContext<{
	theme: Theme;
	toggleTheme: () => void;
}>({ theme: "dark", toggleTheme: () => {} });

export function useThemeState() {
	const [theme, setTheme] = useState<Theme>(getInitialTheme);

	useEffect(() => {
		document.documentElement.classList.toggle("light", theme === "light");
		localStorage.setItem("theme", theme);
	}, [theme]);

	function toggleTheme() {
		setTheme((t) => (t === "dark" ? "light" : "dark"));
	}

	return { theme, toggleTheme };
}

export function useTheme() {
	return useContext(ThemeContext);
}
