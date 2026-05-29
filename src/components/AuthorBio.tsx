import { Link } from "react-router-dom";

export default function AuthorBio() {
	return (
		<div className="author-bio">
			<img
				className="author-avatar"
				src="https://github.com/fox3000foxy.png"
				alt="Fox3000foxy"
			/>
			<div className="author-info">
				<h4 className="author-name">
					<Link to="/">Fox3000foxy</Link>
				</h4>
				<p className="author-desc">
					Dev, gamer, reverse-engineer. Je fouille le code source de tout ce qui
					me passe sous la main et j'écris ce que j'apprends.
				</p>
				<div className="author-links">
					<a
						href="https://github.com/fox3000foxy"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a
						href="https://www.npmjs.com/~fox3000foxy"
						target="_blank"
						rel="noopener noreferrer"
					>
						npm
					</a>
					<Link to="/">Blog</Link>
				</div>
			</div>
		</div>
	);
}
