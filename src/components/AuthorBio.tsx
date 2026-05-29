import { Link } from "react-router-dom";
import { getAuthors, type Author } from "../utils/authors";

export default function AuthorBio({ authors }: { authors?: string[] }) {
	const list = getAuthors(authors);

	return (
		<div className="author-bio-top">
			{list.map((author: Author) => (
				<Link
					key={author.id}
					to={`/authors/${author.id}`}
					className="author-bio-item"
				>
					<img
						className="author-avatar-small"
						src={author.avatar ?? `https://github.com/${author.id}.png`}
						alt={author.name}
					/>
					<div className="author-info-top">
						<span className="author-name-top">{author.name}</span>
						<span className="author-link-top">@{author.id}</span>
					</div>
				</Link>
			))}
		</div>
	);
}
