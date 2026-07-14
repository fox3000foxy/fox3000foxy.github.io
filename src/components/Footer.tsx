import "./Footer.css";

const YEAR = new Date().getFullYear();

export default function Footer() {
	return (
		<footer>
			<p>© {YEAR} Fox's Blog</p>
		</footer>
	);
}
