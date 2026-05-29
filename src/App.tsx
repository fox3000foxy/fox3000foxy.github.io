import { Suspense } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import BackToTop from "./components/BackToTop";
import Footer from "./components/Footer";
import Header from "./components/Header";
import "./styles/App.css";

import Archive from "./pages/Archive";
import Article from "./pages/Article";
import BlogList from "./pages/BlogList";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Portfolio from "./pages/Portfolio";
import Project from "./pages/Project";
import ProjectList from "./pages/ProjectList";

function App() {
	return (
		<Router>
			<Header />
			<BackToTop />
			<main>
				<Suspense fallback={<div>Loading...</div>}>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/blog" element={<BlogList />} />
						<Route path="/blog/:slug" element={<Article />} />
						<Route path="/archive" element={<Archive />} />
						<Route path="/projects" element={<ProjectList />} />
						<Route path="/projects/:slug" element={<Project />} />
						<Route path="/portfolio" element={<Portfolio />} />
						<Route path="*" element={<NotFound />} />
					</Routes>
				</Suspense>
			</main>
			<Footer />
		</Router>
	);
}

export default App;
