import { lazy, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import BackToTop from "./components/BackToTop";
import Footer from "./components/Footer";
import Header from "./components/Header";
import { LangContext, useLangState } from "./hooks/useLang";
import "./styles/App.css";

const Archive = lazy(() => import("./pages/Archive"));
const Article = lazy(() => import("./pages/Article"));
const BlogList = lazy(() => import("./pages/BlogList"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Project = lazy(() => import("./pages/Project"));
const ProjectList = lazy(() => import("./pages/ProjectList"));

function App() {
	const langCtx = useLangState();
	return (
		<LangContext.Provider value={langCtx}>
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
		</LangContext.Provider>
	);
}

export default App;
