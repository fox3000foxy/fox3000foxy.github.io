import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TurndownService from "turndown";

interface GitHubUser {
	login: string;
	avatar_url: string;
	name: string | null;
}

interface UploadedImage {
	filename: string;
	dataUrl: string;
}

type LoginState =
	| { phase: "idle" }
	| {
			phase: "device-code" | "polling";
			device_code: string;
			user_code: string;
			verification_uri: string;
	  }
	| { phase: "error"; message: string };

const API_URL = import.meta.env.VITE_WRITER_API_URL || "http://localhost:8787";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
});

function formatDate() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function imageNameFromFile(file: File): string {
	const base = file.name.replace(/\.[^.]+$/, "").toLowerCase();
	const ext = file.name.split(".").pop() || "png";
	return `${base
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40)}.${ext}`;
}

export default function WriteArticle() {
	const [user, setUser] = useState<GitHubUser | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [loginState, setLoginState] = useState<LoginState>({ phase: "idle" });
	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [tagsInput, setTagsInput] = useState("");
	const [lang, setLang] = useState("en");
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{
		pr_url: string;
		pr_number: number;
	} | null>(null);
	const [error, setError] = useState("");
	const [images, setImages] = useState<UploadedImage[]>([]);
	const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const restored = useRef(false);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [2, 3] },
			}),
			LinkExtension.configure({
				openOnClick: false,
			}),
			ImageExtension.extend({
				addAttributes() {
					return {
						src: { default: null },
						alt: { default: null },
						title: { default: null },
						"data-filename": { default: null },
					};
				},
			}),
			Placeholder.configure({
				placeholder: "Start writing your article...",
			}),
		],
		editorProps: {
			handlePaste: (_view, event) => {
				const items = event.clipboardData?.items;
				if (!items) return false;
				for (let i = 0; i < items.length; i++) {
					const item = items[i];
					if (item.type.startsWith("image/")) {
						const file = item.getAsFile();
						if (file) {
							handleImageFile(file);
							return true;
						}
					}
				}
				return false;
			},
			handleDrop: (_view, event) => {
				const files = event.dataTransfer?.files;
				if (!files) return false;
				let handled = false;
				for (let i = 0; i < files.length; i++) {
					if (files[i].type.startsWith("image/")) {
						handleImageFile(files[i]);
						handled = true;
					}
				}
				return handled;
			},
		},
	});

	useEffect(() => {
		const raw = localStorage.getItem("gh_writer_session");
		if (raw && !restored.current) {
			restored.current = true;
			try {
				const session = JSON.parse(raw) as {
					token: string;
					user: GitHubUser;
				};
				fetch(`${API_URL}/auth/user`, {
					headers: { Authorization: `Bearer ${session.token}` },
				})
					.then((res) => {
						if (res.ok) {
							setToken(session.token);
							setUser(session.user);
						} else {
							localStorage.removeItem("gh_writer_session");
						}
					})
					.catch(() => {
						localStorage.removeItem("gh_writer_session");
					});
			} catch {
				localStorage.removeItem("gh_writer_session");
			}
		}
		return () => {
			if (pollTimer.current) {
				clearTimeout(pollTimer.current);
			}
		};
	}, []);

	const pollForToken = useCallback((device_code: string, interval: number) => {
		const poll = () => {
			fetch(`${API_URL}/auth/poll`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code }),
			})
				.then((r) => r.json())
				.then((data) => {
					if (data.access_token) {
						setToken(data.access_token);
						setUser(data.user);
						setLoginState({ phase: "idle" });
						localStorage.setItem(
							"gh_writer_session",
							JSON.stringify({
								token: data.access_token,
								user: data.user,
							})
						);
						return;
					}
					if (data.error === "authorization_pending") {
						pollTimer.current = setTimeout(poll, interval * 1000);
					} else if (data.error === "slow_down") {
						pollTimer.current = setTimeout(poll, (interval + 5) * 1000);
					} else {
						setLoginState({
							phase: "error",
							message: data.error_description || data.error,
						});
					}
				})
				.catch(() => {
					pollTimer.current = setTimeout(poll, interval * 1000);
				});
		};
		pollTimer.current = setTimeout(poll, interval * 1000);
	}, []);

	const startLogin = useCallback(() => {
		setLoginState({ phase: "idle" });
		setError("");

		fetch(`${API_URL}/auth/device`, { method: "POST" })
			.then((res) => {
				if (!res.ok) {
					throw new Error("Failed to start login");
				}
				return res.json();
			})
			.then((data) => {
				setLoginState({
					phase: "device-code",
					device_code: data.device_code,
					user_code: data.user_code,
					verification_uri: data.verification_uri,
				});
				pollForToken(data.device_code, data.interval || 5);
			})
			.catch((e: Error) => {
				setLoginState({ phase: "error", message: e.message });
			});
	}, [pollForToken]);

	const handleTitleChange = (value: string) => {
		setTitle(value);
		setSlug(
			value
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 80)
		);
	};

	const isWaiting =
		loginState.phase === "device-code" || loginState.phase === "polling";

	function exec(fn: () => boolean | undefined) {
		if (editor) {
			fn();
		}
	}

	function handleImageFile(file: File) {
		if (!(file.type.startsWith("image/") && editor)) {
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const filename = imageNameFromFile(file);
			setImages((prev) => {
				const finalName = prev.some((i) => i.filename === filename)
					? `${filename.replace(/\.\w+$/, "")}-${Date.now().toString(36)}.${filename.split(".").pop()}`
					: filename;
				editor
					.chain()
					.focus()
					.insertContent({
						type: "image",
						attrs: {
							src: dataUrl,
							alt: finalName,
							"data-filename": finalName,
						},
					})
					.run();
				return [...prev, { filename: finalName, dataUrl }];
			});
		};
		reader.readAsDataURL(file);
	}

	function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files;
		if (!files) {
			return;
		}
		for (let i = 0; i < files.length; i++) {
			handleImageFile(files[i]);
		}
		e.target.value = "";
	}

	function removeImage(filename: string) {
		setImages((prev) => prev.filter((i) => i.filename !== filename));
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!(token && user && editor)) {
			return;
		}

		const html = editor.getHTML();
		if (!html || html === "<p></p>") {
			setError("Article content is required");
			return;
		}

		setSubmitting(true);
		setError("");
		setResult(null);

		const tags = tagsInput
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

		const temp = document.createElement("div");
		temp.innerHTML = html;
		const imgs = temp.querySelectorAll<HTMLImageElement>("img[data-filename]");
		for (const img of imgs) {
			const fn = img.getAttribute("data-filename");
			if (fn) {
				img.setAttribute("src", fn);
				img.removeAttribute("data-filename");
			}
		}
		const processedHtml = temp.innerHTML;
		const markdown = turndown.turndown(processedHtml);

		fetch(`${API_URL}/articles`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				title,
				slug,
				description,
				content: markdown,
				tags,
				lang,
				images: images.map((i) => ({
					filename: i.filename,
					dataUrl: i.dataUrl,
				})),
			}),
		})
			.then(async (res) => {
				const data = await res.json();
				if (!res.ok) {
					throw new Error(data.error || "Failed to submit article");
				}
				return data;
			})
			.then((data) => {
				setResult({
					pr_url: data.pr_url,
					pr_number: data.pr_number,
				});
			})
			.catch((e: Error) => {
				setError(e.message);
			})
			.finally(() => {
				setSubmitting(false);
			});
	};

	if (result) {
		return (
			<div className="write-article">
				<h1>Article Submitted!</h1>
				<p>
					Your article has been submitted as{" "}
					<a href={result.pr_url} target="_blank" rel="noopener noreferrer">
						PR #{result.pr_number}
					</a>
					.
				</p>
				<p>
					It will be reviewed and published once merged. You can track the
					progress on GitHub.
				</p>
				<a
					href={result.pr_url}
					className="button"
					target="_blank"
					rel="noopener noreferrer"
				>
					View PR on GitHub
				</a>
			</div>
		);
	}

	const polling = loginState.phase === "polling";

	return (
		<div className="write-article">
			<h1>Write an Article</h1>

			{!user && (
				<div className="write-login">
					<p>
						Log in with GitHub to submit articles. You'll need a GitHub account
						to contribute.
					</p>
					{isWaiting && (
						<div className="device-code-box">
							<p>Enter the code below on GitHub to authorize:</p>
							<p className="device-code">{loginState.user_code}</p>
							<p>
								<a
									href={loginState.verification_uri}
									target="_blank"
									rel="noopener noreferrer"
								>
									{loginState.verification_uri}
								</a>
							</p>
							<p className="device-hint">
								Waiting for authorization
								{polling ? "..." : ""}
							</p>
						</div>
					)}
					{loginState.phase === "error" && (
						<p className="error">{loginState.message}</p>
					)}
					<button
						type="button"
						onClick={startLogin}
						disabled={isWaiting}
						className="button"
					>
						Login with GitHub
					</button>
				</div>
			)}

			{user && (
				<div className="write-header">
					<img src={user.avatar_url} alt="" width={32} height={32} />
					<span>{user.name || user.login}</span>
					<button
						type="button"
						onClick={() => {
							setUser(null);
							setToken(null);
							localStorage.removeItem("gh_writer_session");
						}}
						className="button-outline"
					>
						Logout
					</button>
				</div>
			)}

			{user && (
				<form onSubmit={handleSubmit} className="write-form">
					{error && <p className="error">{error}</p>}

					<label>
						Title
						<input
							type="text"
							value={title}
							onChange={(e) => handleTitleChange(e.target.value)}
							required
							placeholder="Article title"
						/>
					</label>

					<label>
						Slug
						<input
							type="text"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							required
							placeholder="article-url-slug"
						/>
					</label>

					<label>
						Description
						<input
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="A short description (appears in blog listings)"
						/>
					</label>

					<label>
						Language
						<select value={lang} onChange={(e) => setLang(e.target.value)}>
							<option value="en">English</option>
							<option value="fr">Français</option>
							<option value="de">Deutsch</option>
							<option value="es">Español</option>
							<option value="it">Italiano</option>
							<option value="pt">Português</option>
							<option value="ru">Русский</option>
							<option value="ja">日本語</option>
							<option value="ko">한국어</option>
							<option value="zh">中文</option>
							<option value="ar">العربية</option>
							<option value="hi">हिन्दी</option>
							<option value="id">Bahasa Indonesia</option>
							<option value="th">ไทย</option>
							<option value="tr">Türkçe</option>
							<option value="vi">Tiếng Việt</option>
						</select>
					</label>

					<label>
						Tags (comma separated)
						<input
							type="text"
							value={tagsInput}
							onChange={(e) => setTagsInput(e.target.value)}
							placeholder="gaming, retro, tutorial"
						/>
					</label>

					<div className="editor-section">
						<div className="editor-toolbar">
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleBold().run())
								}
								className={editor?.isActive("bold") ? "active" : ""}
								title="Bold"
							>
								<strong>B</strong>
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleItalic().run())
								}
								className={editor?.isActive("italic") ? "active" : ""}
								title="Italic"
							>
								<em>I</em>
							</button>
							<span className="toolbar-sep" />
							<button
								type="button"
								onClick={() =>
									exec(() =>
										editor?.chain().focus().toggleHeading({ level: 2 }).run()
									)
								}
								className={
									editor?.isActive("heading", {
										level: 2,
									})
										? "active"
										: ""
								}
								title="Heading"
							>
								H2
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() =>
										editor?.chain().focus().toggleHeading({ level: 3 }).run()
									)
								}
								className={
									editor?.isActive("heading", {
										level: 3,
									})
										? "active"
										: ""
								}
								title="Subheading"
							>
								H3
							</button>
							<span className="toolbar-sep" />
							<button
								type="button"
								onClick={() => {
									const url = prompt("Link URL:");
									if (url && editor) {
										editor
											.chain()
											.focus()
											.extendMarkRange("link")
											.setLink({ href: url })
											.run();
									}
								}}
								className={editor?.isActive("link") ? "active" : ""}
								title="Link"
							>
								🔗
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleBulletList().run())
								}
								className={editor?.isActive("bulletList") ? "active" : ""}
								title="Bullet list"
							>
								••
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleOrderedList().run())
								}
								className={editor?.isActive("orderedList") ? "active" : ""}
								title="Numbered list"
							>
								1.
							</button>
							<span className="toolbar-sep" />
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleCodeBlock().run())
								}
								className={editor?.isActive("codeBlock") ? "active" : ""}
								title="Code block"
							>
								{"</>"}
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().toggleBlockquote().run())
								}
								className={editor?.isActive("blockquote") ? "active" : ""}
								title="Blockquote"
							>
								&quot;
							</button>
							<button
								type="button"
								onClick={() =>
									exec(() => editor?.chain().focus().setHorizontalRule().run())
								}
								title="Horizontal rule"
							>
								—
							</button>
							<span className="toolbar-sep" />
							<button
								type="button"
								onClick={() => imageInputRef.current?.click()}
								title="Insert image"
							>
								🖼️
							</button>
						</div>
						<EditorContent editor={editor} />
						<input
							ref={imageInputRef}
							type="file"
							accept="image/*"
							multiple
							onChange={handleImageSelect}
							style={{ display: "none" }}
						/>
					</div>

					{images.length > 0 && (
						<div className="image-list">
							{images.map((img) => (
								<div key={img.filename} className="image-item">
									<img src={img.dataUrl} alt={img.filename} />
									<span className="image-name" title={img.filename}>
										{img.filename}
									</span>
									<button
										type="button"
										className="image-remove"
										onClick={() => removeImage(img.filename)}
									>
										×
									</button>
								</div>
							))}
						</div>
					)}

					<div className="write-meta">
						<p className="write-date">
							Date: <strong>{formatDate()}</strong>
						</p>
						<p className="write-author">
							Author: <strong>@{user?.login}</strong>
						</p>
					</div>

					<button type="submit" disabled={submitting} className="button">
						{submitting ? "Submitting..." : "Submit Article"}
					</button>
				</form>
			)}
		</div>
	);
}
