import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { getAuthors } from "../utils/authors";
export default function AuthorBio({ authors, verified, }) {
    const list = getAuthors(authors);
    return (_jsx("div", { className: "author-bio-top", children: list.map((author) => (_jsxs(Link, { to: `/authors/${author.id}`, className: "author-bio-item", children: [_jsx("img", { className: "author-avatar-small", src: author.avatar ?? `https://github.com/${author.id}.png`, alt: author.name }), _jsxs("div", { className: "author-info-top", children: [_jsxs("span", { className: "author-name-top", children: [author.name, verified && _jsx("span", { className: "verified-badge", children: "Verified" })] }), _jsxs("span", { className: "author-link-top", children: ["@", author.id] })] })] }, author.id))) }));
}
