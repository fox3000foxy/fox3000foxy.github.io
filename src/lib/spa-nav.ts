const baseStyleContents = new Set<string>();
const baseLinkHrefs = new Set<string>();
const baseMetaKeys = new Set<string>();
let currentAbort: AbortController | null = null;
let navigating = false;

function metaKey(el: HTMLMetaElement): string {
	if (el.name) {
		return `name:${el.name}`;
	}
	if (el.getAttribute("property")) {
		return `property:${el.getAttribute("property")}`;
	}
	if (el.httpEquiv) {
		return `httpEquiv:${el.httpEquiv}`;
	}
	return "";
}

function initBaseSnapshot() {
	document.querySelectorAll("head > style").forEach((el) => {
		baseStyleContents.add(el.textContent || "");
	});
	document.querySelectorAll('head > link[rel="stylesheet"]').forEach((el) => {
		baseLinkHrefs.add(el.href);
	});
	document.querySelectorAll("head > meta").forEach((el) => {
		const key = metaKey(el as HTMLMetaElement);
		if (key) {
			baseMetaKeys.add(key);
		}
	});
}

function shouldSkip(link: HTMLAnchorElement): boolean {
	if (link.hasAttribute("target") && link.target !== "_self") {
		return true;
	}
	if (link.hasAttribute("download")) {
		return true;
	}
	if (link.getAttribute("rel")?.includes("external")) {
		return true;
	}
	if (link.hasAttribute("data-no-spa")) {
		return true;
	}
	const href = link.getAttribute("href");
	if (!href) {
		return true;
	}
	if (
		href.startsWith("#") ||
		href.startsWith("mailto:") ||
		href.startsWith("tel:")
	) {
		return true;
	}
	try {
		const url = new URL(href, location.origin);
		if (url.origin !== location.origin) {
			return true;
		}
	} catch {
		return true;
	}
	return false;
}

function showProgress() {
	let bar = document.getElementById("spa-progress");
	if (!bar) {
		bar = document.createElement("div");
		bar.id = "spa-progress";
		bar.style.cssText =
			"position:fixed;top:0;left:0;width:0;height:2px;background:var(--accent,#7c3aed);z-index:99999;transition:width 0.3s ease;pointer-events:none;";
		document.body.prepend(bar);
	}
	bar.style.width = "0";
	bar.style.opacity = "1";
	requestAnimationFrame(() => {
		const el = document.getElementById("spa-progress");
		if (el) {
			el.style.width = "70%";
		}
	});
}

function completeProgress() {
	const bar = document.getElementById("spa-progress");
	if (bar) {
		bar.style.width = "100%";
		bar.style.opacity = "0";
		setTimeout(() => {
			bar.remove();
		}, 300);
	}
}

function failProgress() {
	const bar = document.getElementById("spa-progress");
	if (bar) {
		bar.style.width = "100%";
		bar.style.background = "#ef4444";
		bar.style.opacity = "0";
		setTimeout(() => {
			bar.remove();
		}, 300);
	}
}

function swapStyles(doc: Document) {
	document.querySelectorAll("head > style").forEach((el) => {
		if (!baseStyleContents.has(el.textContent || "")) {
			el.remove();
		}
	});
	document.querySelectorAll('head > link[rel="stylesheet"]').forEach((el) => {
		if (!baseLinkHrefs.has(el.href)) {
			el.remove();
		}
	});

	doc.querySelectorAll("head > style").forEach((el) => {
		if (!baseStyleContents.has(el.textContent || "")) {
			document.head.appendChild(el.cloneNode(true));
		}
	});
	doc.querySelectorAll('head > link[rel="stylesheet"]').forEach((el) => {
		if (!baseLinkHrefs.has(el.href)) {
			document.head.appendChild(el.cloneNode(true));
		}
	});
}

function swapMeta(doc: Document) {
	document.querySelectorAll("head > meta").forEach((el) => {
		const key = metaKey(el as HTMLMetaElement);
		if (key && !baseMetaKeys.has(key)) {
			el.remove();
		}
	});

	doc.querySelectorAll("head > meta").forEach((el) => {
		const src = el as HTMLMetaElement;
		const key = metaKey(src);
		if (!key) {
			return;
		}
		if (baseMetaKeys.has(key)) {
			const existing = key.startsWith("name:")
				? document.querySelector(`meta[name="${src.name}"]`)
				: document.querySelector(
						`meta[property="${src.getAttribute("property")}"]`
					);
			if (existing) {
				existing.setAttribute("content", src.content);
				return;
			}
		}
		document.head.appendChild(src.cloneNode(true));
	});

	const oldCanonical = document.querySelector('link[rel="canonical"]');
	const newCanonical = doc.querySelector('link[rel="canonical"]');
	if (oldCanonical && newCanonical) {
		oldCanonical.setAttribute("href", newCanonical.getAttribute("href") || "");
	} else if (newCanonical) {
		document.head.appendChild(newCanonical.cloneNode(true));
	}

	document
		.querySelectorAll('head > script[type="application/ld+json"]')
		.forEach((el) => {
			el.remove();
		});
	doc
		.querySelectorAll('head > script[type="application/ld+json"]')
		.forEach((el) => {
			document.head.appendChild(el.cloneNode(true));
		});
}

function getPageScripts(doc: Document): HTMLScriptElement[] {
	const inMain = doc.getElementById("main-content");
	const results: HTMLScriptElement[] = [];

	if (inMain) {
		results.push(...Array.from(inMain.querySelectorAll("script")));
	}

	doc.body.querySelectorAll("script").forEach((s) => {
		if (s.closest("header") || s.closest("footer")) {
			return;
		}
		if (inMain?.contains(s)) {
			return;
		}
		results.push(s);
	});

	return results;
}

function executeScripts(container: HTMLElement, scripts: HTMLScriptElement[]) {
	for (const oldScript of scripts) {
		oldScript.remove();
	}

	for (const oldScript of scripts) {
		const newScript = document.createElement("script");
		for (const attr of oldScript.attributes) {
			newScript.setAttribute(attr.name, attr.value);
		}
		newScript.textContent = oldScript.textContent;
		container.appendChild(newScript);
	}
}

function swapContent(doc: Document): boolean {
	const main = document.getElementById("main-content");
	const newMain = doc.getElementById("main-content");
	if (!(main && newMain)) {
		return false;
	}

	const scripts = getPageScripts(doc);

	main.innerHTML = newMain.innerHTML;
	executeScripts(main, scripts);

	return true;
}

async function navigate(url: string, isPopState = false) {
	if (navigating && url === location.href) {
		return;
	}

	currentAbort?.abort();
	const ctrl = new AbortController();
	currentAbort = ctrl;

	navigating = true;
	showProgress();

	document.querySelectorAll(".reading-progress").forEach((el) => {
		el.remove();
	});

	window.dispatchEvent(new CustomEvent("spa:cleanup"));

	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { "X-SPA-Navigation": "1" },
		});

		if (!res.ok) {
			location.href = url;
			return;
		}

		const html = await res.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		const swapped = swapContent(doc);
		if (!swapped) {
			location.href = url;
			return;
		}

		document.title = doc.title || "";
		swapMeta(doc);
		swapStyles(doc);

		if (!isPopState) {
			history.pushState({ spa: true }, "", url);
		}

		window.scrollTo({ top: 0 });
		completeProgress();

		window.dispatchEvent(new CustomEvent("spa:navigate", { detail: { url } }));
	} catch (e) {
		if ((e as Error).name === "AbortError") {
			return;
		}
		failProgress();
		location.href = url;
	} finally {
		navigating = false;
	}
}

function closeMobileMenu() {
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("nav-menu");
  const navDropdown = document.getElementById("nav-dropdown");
  
  hamburger?.classList.remove("open");
  navMenu?.classList.remove("open");
  navDropdown?.classList.remove("open");
}

function handleClick(e: MouseEvent) {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  ) {
    return;
  }

  const link = (e.target as Element).closest("a");
  if (!link) {
    return;
  }
  if (shouldSkip(link as HTMLAnchorElement)) {
    return;
  }

  e.preventDefault();
  const href = (link as HTMLAnchorElement).getAttribute("href")!;
  const url = new URL(href, location.origin).href;

  if (url === location.href) {
    const hash = new URL(url).hash;
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    }
    return;
  }

  closeMobileMenu();
  void navigate(url);
}

function handlePopState() {
  closeMobileMenu();
  void navigate(location.href, true);
}

export function initSpaNav() {
	if (typeof window === "undefined") {
		return;
	}

	initBaseSnapshot();
	document.addEventListener("click", handleClick);
	window.addEventListener("popstate", handlePopState);

	history.replaceState({ spa: true }, "", location.href);
}

// Auto-initialization removed - call initSpaNav() explicitly from your layout
