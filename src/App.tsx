import { lazy, Suspense } from "react";
import {
	Navigate,
	Route,
	BrowserRouter as Router,
	Routes,
} from "react-router-dom";
import BackToTop from "./components/BackToTop";
import Footer from "./components/Footer";
import Header from "./components/Header";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import Lightbox from "./components/Lightbox";
import WebmentionLinks from "./components/WebmentionLinks";
import { LangContext, useLangState } from "./hooks/useLang";
import { ThemeContext, useThemeState } from "./hooks/useTheme";
import "./styles/App.css";

const Archive = lazy(() => import("./pages/Archive"));
const Article = lazy(() => import("./pages/Article"));
const AuthorIndex = lazy(() => import("./pages/AuthorIndex"));
const BlogList = lazy(() => import("./pages/BlogList"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Legacy = lazy(() => import("./pages/Legacy"));
const Project = lazy(() => import("./pages/Project"));
const ProjectList = lazy(() => import("./pages/ProjectList"));
const TagIndex = lazy(() => import("./pages/TagIndex"));

function App() {
	const langCtx = useLangState();
	const themeCtx = useThemeState();
	return (
		<LangContext.Provider value={langCtx}>
			<ThemeContext.Provider value={themeCtx}>
				<Router>
					<WebmentionLinks />
					<Header />
					<KeyboardShortcuts />
					<Lightbox />
					<BackToTop />
					<main>
						<Suspense fallback={<div>Loading...</div>}>
							<Routes>
								<Route path="/" element={<Home />} />
								<Route path="/blog" element={<BlogList />} />
								<Route path="/blog/:slug" element={<Article />} />
								<Route path="/tags/:tag" element={<TagIndex />} />
								<Route path="/authors/:id" element={<AuthorIndex />} />
								<Route path="/archive" element={<Archive />} />
								<Route path="/projects" element={<ProjectList />} />
								<Route path="/projects/:slug" element={<Project />} />
								<Route path="/legacy" element={<Legacy />} />
								<Route
									path="/portfolio"
									element={<Navigate to="/legacy" replace />}
								/>
								<Route path="*" element={<NotFound />} />
							</Routes>
						</Suspense>
					</main>
					<Footer />
				</Router>
			</ThemeContext.Provider>
		</LangContext.Provider>
	);
}

export default App;
