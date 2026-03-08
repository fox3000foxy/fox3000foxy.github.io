import { Link } from 'react-router-dom';
import './Header.css';

export default function Header() {
  return (
    <header>
      <div className="container">
        <Link to="/">
          <img
            className="avatar"
            src="https://github.com/fox3000foxy.png"
            alt="GitHub avatar"
          />
        </Link>
        <h1 className="site-title">
          <Link to="/" className="title-link">
            Fox's Blog
          </Link>
        </h1>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/portfolio">Portfolio</Link>
        </nav>
      </div>
    </header>
  );
}