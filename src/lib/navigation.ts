import {
	createElement,
	type AnchorHTMLAttributes,
	type ReactNode,
} from "react";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
	to: string;
	children?: ReactNode;
}

export function Link({ to, children, ...rest }: LinkProps) {
	return createElement("a", { href: to, ...rest }, children);
}

type NavigateFn = (to: number | string) => void;

export function useNavigate(): NavigateFn {
	return (to) => {
		if (typeof window === "undefined") return;
		if (typeof to === "number") {
			window.history.go(to);
		} else {
			window.location.href = to;
		}
	};
}

export function useParams<T extends Record<string, string>>(): T {
	if (typeof window === "undefined") return {} as T;
	const path = window.location.pathname;
	const blogMatch = path.match(/\/blog\/([^/]+)/);
	const tagMatch = path.match(/\/tags\/([^/]+)/);
	const authorMatch = path.match(/\/author\/([^/]+)/);
	const projectMatch = path.match(/\/projects\/([^/]+)/);
	return {
		slug: blogMatch?.[1] ?? projectMatch?.[1] ?? "",
		tag: tagMatch?.[1] ?? "",
		author: authorMatch?.[1] ?? "",
	} as unknown as T;
}

export function useLocation() {
	if (typeof window === "undefined") return { hash: "", pathname: "", search: "" } as Location;
	return window.location;
}
