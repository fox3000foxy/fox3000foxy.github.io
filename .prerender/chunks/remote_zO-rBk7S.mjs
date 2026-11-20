// node_modules/@astrojs/internal-helpers/dist/path.js
function appendForwardSlash(path) {
	return path.endsWith("/") ? path : path + "/";
}
function prependForwardSlash(path) {
	return path[0] === "/" ? path : "/" + path;
}
var MANY_LEADING_SLASHES = /^\/{2,}/;
function collapseDuplicateLeadingSlashes(path) {
	if (!path) return path;
	return path.replace(MANY_LEADING_SLASHES, "/");
}
var MANY_SLASHES = /\/{2,}/g;
function collapseDuplicateSlashes(path) {
	if (!path) return path;
	return path.replace(MANY_SLASHES, "/");
}
var MANY_TRAILING_SLASHES = /\/{2,}$/g;
function collapseDuplicateTrailingSlashes(path, trailingSlash) {
	if (!path) return path;
	return path.replace(MANY_TRAILING_SLASHES, trailingSlash ? "/" : "") || "/";
}
function removeTrailingForwardSlash(path) {
	return path.endsWith("/") ? path.slice(0, path.length - 1) : path;
}
function removeLeadingForwardSlash(path) {
	return path.startsWith("/") ? path.substring(1) : path;
}
function trimSlashes(path) {
	return path.replace(/^\/|\/$/g, "");
}
function isString(path) {
	return typeof path === "string" || path instanceof String;
}
var INTERNAL_PREFIXES = /* @__PURE__ */ new Set([
	"/_",
	"/@",
	"/.",
	"//"
]);
var JUST_SLASHES = /^\/{2,}$/;
function isInternalPath(path) {
	const prefix = path.slice(0, 2).replace(/\\/g, "/");
	return INTERNAL_PREFIXES.has(prefix) && !JUST_SLASHES.test(path);
}
function joinPaths(...paths) {
	return paths.filter(isString).map((path, i) => {
		if (i === 0) return removeTrailingForwardSlash(path);
		else if (i === paths.length - 1) return removeLeadingForwardSlash(path);
		else return trimSlashes(path);
	}).join("/");
}
function removeQueryString(path) {
	const index = path.lastIndexOf("?");
	return index > 0 ? path.substring(0, index) : path;
}
/**
* Checks whether the path is considered a remote path.
* Remote means untrusted in this context, so anything that isn't a straightforward
* local path is considered remote.
*
* @param src
*/
function isRemotePath(src) {
	if (!src) return false;
	const trimmed = src.trim();
	if (!trimmed) return false;
	let decoded = trimmed;
	let previousDecoded = "";
	let maxIterations = 10;
	while (decoded !== previousDecoded && maxIterations > 0) {
		previousDecoded = decoded;
		try {
			decoded = decodeURIComponent(decoded);
		} catch {
			break;
		}
		maxIterations--;
	}
	if (/^[a-zA-Z]:/.test(decoded)) return false;
	if (decoded[0] === "/" && /^\/[\w.@-]/.test(decoded)) return false;
	if (decoded[0] === "\\") return true;
	if (decoded.startsWith("//")) return true;
	try {
		const url = new URL(decoded, "http://n");
		if (url.username || url.password) return true;
		if (decoded.includes("@") && !url.pathname.includes("@") && !url.search.includes("@")) return true;
		if (url.origin !== "http://n") {
			if (url.protocol.toLowerCase() === "file:") return false;
			return true;
		}
		if (URL.canParse(decoded)) return true;
		return false;
	} catch {
		return true;
	}
}
function slash(path) {
	return path.replace(/\\/g, "/");
}
function fileExtension(path) {
	const ext = path.split(".").pop();
	return ext !== path ? `.${ext}` : "";
}
function removeBase(path, base) {
	if (path.startsWith(base)) return path.slice(removeTrailingForwardSlash(base).length);
	return path;
}
/**
* Strips a configured request `base` from a pathname, only when the pathname is
* the base itself or lies under it at a path-segment boundary. `stripRequestBase('/appX/admin', '/app')`
* leaves the pathname untouched, whereas `stripRequestBase('/app/admin', '/app')` returns `/admin`.
*
* Leading slashes are collapsed first so `//admin` cannot pose as being under a
* `/` base. Route matching and `context.url.pathname` derive from separate
* copies of the request path, so a mismatch here lets a request reach a route
* whose base-prefixed pathname middleware never observes.
*/
function stripRequestBase(pathname, base) {
	pathname = collapseDuplicateLeadingSlashes(pathname);
	const baseWithoutTrailingSlash = removeTrailingForwardSlash(base);
	if (pathname === baseWithoutTrailingSlash) return "/";
	if (pathname.startsWith(baseWithoutTrailingSlash + "/")) return pathname.slice(baseWithoutTrailingSlash.length);
	return pathname;
}
var WITH_FILE_EXT = /\/[^/]+\.\w+$/;
function hasFileExtension(path) {
	return WITH_FILE_EXT.test(path);
}
// node_modules/@astrojs/runtime/dist/internal/core/errors/utils.js
function normalizeLF(code) {
	return code.replace(/\r\n|\r(?!\n)|\n/g, "\n");
}
// node_modules/@astrojs/runtime/dist/internal/core/errors/printer.js
/** Generate a code frame from string and an error location */
function codeFrame(src, loc) {
	if (!loc || loc.line === void 0 || loc.column === void 0) return "";
	const lines = normalizeLF(src).split("\n").map((ln) => ln.replace(/\t/g, "  "));
	const visibleLines = [];
	for (let n = -2; n <= 2; n++) if (lines[loc.line + n]) visibleLines.push(loc.line + n);
	let gutterWidth = 0;
	for (const lineNo of visibleLines) {
		let w = `> ${lineNo}`;
		if (w.length > gutterWidth) gutterWidth = w.length;
	}
	let output = "";
	for (const lineNo of visibleLines) {
		const isFocusedLine = lineNo === loc.line - 1;
		output += isFocusedLine ? "> " : "  ";
		output += `${lineNo + 1} | ${lines[lineNo]}\n`;
		if (isFocusedLine) output += `${Array.from({ length: gutterWidth }).join(" ")}  | ${Array.from({ length: loc.column }).join(" ")}^\n`;
	}
	return output;
}
// node_modules/@astrojs/runtime/dist/internal/core/errors/errors.js
function isAstroError(e) {
	return e != null && (e instanceof AstroError || AstroError.is(e));
}
var AstroError = class extends Error {
	loc;
	title;
	hint;
	frame;
	type = "AstroError";
	constructor(props, options) {
		const { name, title, message, stack, location, hint, frame } = props;
		super(message, options);
		this.title = title;
		this.name = name;
		if (message) this.message = message;
		this.stack = stack ? stack : this.stack;
		this.loc = location;
		this.hint = hint;
		this.frame = frame;
	}
	setLocation(location) {
		this.loc = location;
	}
	setName(name) {
		this.name = name;
	}
	setMessage(message) {
		this.message = message;
	}
	setHint(hint) {
		this.hint = hint;
	}
	setFrame(source, location) {
		this.frame = codeFrame(source, location);
	}
	static is(err) {
		return err?.type === "AstroError";
	}
};
// node_modules/@astrojs/runtime/dist/internal/core/errors/errors-data.js
/**
* @docs
* @see
* - [Official integrations](https://docs.astro.build/en/guides/integrations/#official-integrations)
* - [`Astro.clientAddress`](https://docs.astro.build/en/reference/api-reference/#clientaddress)
* @description
* The adapter you're using unfortunately does not support `Astro.clientAddress`.
*/
var ClientAddressNotAvailable = {
	name: "ClientAddressNotAvailable",
	title: "`Astro.clientAddress` is not available in current adapter.",
	message: (adapterName) => `\`Astro.clientAddress\` is not available in the \`${adapterName}\` adapter. File an issue with the adapter to add support.`
};
/**
* @docs
* @see
* - [On-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)
* - [`Astro.clientAddress`](https://docs.astro.build/en/reference/api-reference/#clientaddress)
* @description
* The `Astro.clientAddress` property cannot be used inside prerendered routes.
*/
var PrerenderClientAddressNotAvailable = {
	name: "PrerenderClientAddressNotAvailable",
	title: "`Astro.clientAddress` cannot be used inside prerendered routes.",
	message: (name) => `\`Astro.clientAddress\` cannot be used inside prerendered route ${name}.`
};
/**
* @docs
* @see
* - [Enabling SSR in Your Project](https://docs.astro.build/en/guides/on-demand-rendering/)
* - [`Astro.clientAddress`](https://docs.astro.build/en/reference/api-reference/#clientaddress)
* @description
* The `Astro.clientAddress` property is only available when [Server-side rendering](https://docs.astro.build/en/guides/on-demand-rendering/) is enabled.
*
* To get the user's IP address in static mode, different APIs such as [Ipify](https://www.ipify.org/) can be used in a [Client-side script](https://docs.astro.build/en/guides/client-side-scripts/) or it may be possible to get the user's IP using a serverless function hosted on your hosting provider.
*/
var StaticClientAddressNotAvailable = {
	name: "StaticClientAddressNotAvailable",
	title: "`Astro.clientAddress` is not available in prerendered pages.",
	message: "`Astro.clientAddress` is only available on pages that are server-rendered.",
	hint: "See https://docs.astro.build/en/guides/on-demand-rendering/ for more information on how to enable SSR."
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* @description
* A [dynamic route](https://docs.astro.build/en/guides/routing/#dynamic-routes) was matched, but no corresponding path was found for the requested parameters. This is often caused by a typo in either the generated or the requested path.
*/
var NoMatchingStaticPathFound = {
	name: "NoMatchingStaticPathFound",
	title: "No static path found for requested path.",
	message: (pathName) => `A \`getStaticPaths()\` route pattern was matched, but no matching static path was found for requested path \`${pathName}\`.`,
	hint: (possibleRoutes) => `Possible dynamic routes being matched: ${possibleRoutes.join(", ")}.`
};
/**
* @docs
* @message Route returned a `RETURNED_VALUE`. Only a Response can be returned from Astro files.
* @see
* - [Response](https://docs.astro.build/en/guides/on-demand-rendering/#response)
* @description
* Only instances of [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) can be returned inside Astro files.
* ```astro title="pages/login.astro"
* ---
* return new Response(null, {
*  status: 404,
*  statusText: 'Not found'
* });
*
* // Alternatively, for redirects, `Astro.redirect()` also returns an instance of `Response`
* return Astro.redirect('/login');
* ---
* ```
*
*/
var OnlyResponseCanBeReturned = {
	name: "OnlyResponseCanBeReturned",
	title: "Invalid type returned by Astro page.",
	message: (route, returnedValue) => `Route \`${route ? route : ""}\` returned a \`${returnedValue}\`. Only a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) can be returned from Astro files.`,
	hint: "See https://docs.astro.build/en/guides/on-demand-rendering/#response for more information."
};
/**
* @docs
* @see
* - [`client:media`](https://docs.astro.build/en/reference/directives-reference/#clientmedia)
* @description
* A [media query](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries) parameter is required when using the `client:media` directive.
*
* ```astro
* <Counter client:media="(max-width: 640px)" />
* ```
*/
var MissingMediaQueryDirective = {
	name: "MissingMediaQueryDirective",
	title: "Missing value for `client:media` directive.",
	message: "Media query not provided for `client:media` directive. A media query similar to `client:media=\"(max-width: 600px)\"` must be provided."
};
/**
* @docs
* @message Unable to render `COMPONENT_NAME`. There are `RENDERER_COUNT` renderer(s) configured in your `astro.config.mjs` file, but none were able to server-side render `COMPONENT_NAME`.
* @see
* - [Frameworks components](https://docs.astro.build/en/guides/framework-components/)
* - [UI Frameworks](https://docs.astro.build/en/guides/integrations/#official-integrations)
* @description
* None of the installed integrations were able to render the component you imported. Make sure to install the appropriate integration for the type of component you are trying to include in your page.
*
* For JSX / TSX files, [@astrojs/react](https://docs.astro.build/en/guides/integrations-guide/react/), [@astrojs/preact](https://docs.astro.build/en/guides/integrations-guide/preact/) or [@astrojs/solid-js](https://docs.astro.build/en/guides/integrations-guide/solid-js/) can be used. For Vue and Svelte files, the [@astrojs/vue](https://docs.astro.build/en/guides/integrations-guide/vue/) and [@astrojs/svelte](https://docs.astro.build/en/guides/integrations-guide/svelte/) integrations can be used respectively
*/
var NoMatchingRenderer = {
	name: "NoMatchingRenderer",
	title: "No matching renderer found.",
	message: (componentName, componentExtension, plural, validRenderersCount) => `Unable to render \`${componentName}\`.

${validRenderersCount > 0 ? `There ${plural ? "are" : "is"} ${validRenderersCount} renderer${plural ? "s" : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were" : "it was not"} able to server-side render \`${componentName}\`.` : `No valid renderer was found ${componentExtension ? `for the \`.${componentExtension}\` file extension.` : `for this file extension.`}`}`,
	hint: (probableRenderers) => `Did you mean to enable the ${probableRenderers} integration?\n\nSee https://docs.astro.build/en/guides/framework-components/ for more information on how to install and configure integrations.`
};
/**
* @docs
* @see
* - [`client:only`](https://docs.astro.build/en/reference/directives-reference/#clientonly)
* @description
*
* `client:only` components are not run on the server, as such Astro does not know (and cannot guess) which renderer to use and require a hint. Like such:
*
* ```astro
*	<SomeReactComponent client:only="react" />
* ```
*/
var NoClientOnlyHint = {
	name: "NoClientOnlyHint",
	title: "Missing hint on client:only directive.",
	message: (componentName) => `Unable to render \`${componentName}\`. When using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.`,
	hint: (probableRenderers) => `Did you mean to pass \`client:only="${probableRenderers}"\`? See https://docs.astro.build/en/reference/directives-reference/#clientonly for more information on \`client:only\`.`
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* @description
* `getStaticPaths()`'s return value must be an array of objects. In most cases, this error happens because an array of arrays was returned. Using [`.flatMap()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap) or a [`.flat()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat) call may be useful.
*
* ```ts title="pages/blog/[id].astro"
* export async function getStaticPaths() {
*	return [ // <-- Array
*		{ params: { id: "blog" } }, // <-- Object
* 		{ params: { id: "about" } }
* 	];
*}
* ```
*/
var InvalidGetStaticPathsEntry = {
	name: "InvalidGetStaticPathsEntry",
	title: "Invalid entry inside `getStaticPaths()`'s return value.",
	message: (entryType) => `Invalid entry returned by \`getStaticPaths()\`. Expected an object, got \`${entryType}\`.`,
	hint: "If you're using a `.map` call, you might be looking for `.flatMap()` instead. See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* - [`params`](https://docs.astro.build/en/reference/api-reference/#params)
* @description
* `getStaticPaths()`'s return value must be an array of objects.
*
* ```ts title="pages/blog/[id].astro"
* export async function getStaticPaths() {
*	return [ // <-- Array
*		{ params: { id: "blog" } },
* 		{ params: { id: "about" } }
* 	];
*}
* ```
*/
var InvalidGetStaticPathsReturn = {
	name: "InvalidGetStaticPathsReturn",
	title: "Invalid value returned by `getStaticPaths()`.",
	message: (returnType) => `Invalid type returned by \`getStaticPaths()\`. Expected an \`array\`, got \`${returnType}\`.`,
	hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* - [`params`](https://docs.astro.build/en/reference/api-reference/#params)
* @description
* Every route specified by `getStaticPaths()` requires a `params` property specifying the path parameters needed to match the route.
*
* For instance, the following code:
* ```astro title="pages/blog/[id].astro"
* ---
* export async function getStaticPaths() {
* 	return [
* 		{ params: { id: '1' } }
* 	];
* }
* ---
* ```
* Will create the following route: `site.com/blog/1`.
*/
var GetStaticPathsExpectedParams = {
	name: "GetStaticPathsExpectedParams",
	title: "Missing params property on `getStaticPaths()` route.",
	message: "Missing or empty required `params` property on `getStaticPaths()` route.",
	hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* - [`params`](https://docs.astro.build/en/reference/api-reference/#params)
* @description
* Since `params` are encoded into the URL, only certain types are supported as values.
*
* ```astro title="/route/[id].astro"
* ---
* export async function getStaticPaths() {
* 	return [
* 		{ params: { id: '1' } } // Works
* 		{ params: { id: 2 } } // Does not work
* 		{ params: { id: false } } // Does not work
* 		{ params: { id: [1, 2] } } // Does not work
* 	];
* }
* ---
* ```
*
* In routes using [rest parameters](https://docs.astro.build/en/guides/routing/#rest-parameters), `undefined` can be used to represent a path with no parameters passed in the URL:
*
* ```astro title="/route/[...id].astro"
* ---
* export async function getStaticPaths() {
* 	return [
* 		{ params: { id: '1' } } // /route/1
* 		{ params: { id: '2' } } // /route/2
* 		{ params: { id: undefined } } // /route/
* 	];
* }
* ---
* ```
*/
var GetStaticPathsInvalidRouteParam = {
	name: "GetStaticPathsInvalidRouteParam",
	title: "Invalid route parameter returned by `getStaticPaths()`.",
	message: (key, value, valueType) => `Invalid \`getStaticPaths()\` route parameter for \`${key}\`. Expected a string or undefined, received \`${valueType}\` (\`${value}\`).`,
	hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
};
/**
* @docs
* @see
* - [Dynamic Routes](https://docs.astro.build/en/guides/routing/#dynamic-routes)
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* - [Server-side rendering](https://docs.astro.build/en/guides/on-demand-rendering/)
* @description
* In [Static Mode](https://docs.astro.build/en/guides/routing/#static-ssg-mode), all routes must be determined at build time. As such, dynamic routes must `export` a `getStaticPaths()` function returning the different paths to generate.
*/
var GetStaticPathsRequired = {
	name: "GetStaticPathsRequired",
	title: "`getStaticPaths()` function required for dynamic routes.",
	message: "`getStaticPaths()` function is required for dynamic routes. Make sure that you `export` a `getStaticPaths()` function from your dynamic route.",
	hint: `See https://docs.astro.build/en/guides/routing/#dynamic-routes for more information on dynamic routes.

	If you meant for this route to be server-rendered, set \`export const prerender = false;\` in the page.`
};
/**
* @docs
* @see
* - [Named slots](https://docs.astro.build/en/basics/astro-components/#named-slots)
* @description
* Certain words cannot be used for slot names due to being already used internally.
*/
var ReservedSlotName = {
	name: "ReservedSlotName",
	title: "Invalid slot name.",
	message: (slotName) => `Unable to create a slot named \`${slotName}\`. \`${slotName}\` is a reserved slot name. Please update the name of this slot.`
};
/**
* @docs
* @description
* No import statement was found for one of the components. If there is an import statement, make sure you are using the same identifier in both the imports and the component usage.
*/
var NoMatchingImport = {
	name: "NoMatchingImport",
	title: "No import found for component.",
	message: (componentName) => `Could not render \`${componentName}\`. No matching import has been found for \`${componentName}\`.`,
	hint: "Please make sure the component is properly imported."
};
/**
* @docs
* @message
* **Example error messages:**<br/>
* InvalidComponentArgs: Invalid arguments passed to `<MyAstroComponent>` component.
* @description
* Astro components cannot be rendered manually via a function call, such as `Component()` or `{items.map(Component)}`. Prefer the component syntax `<Component />` or `{items.map(item => <Component {...item} />)}`.
*/
var InvalidComponentArgs = {
	name: "InvalidComponentArgs",
	title: "Invalid component arguments.",
	message: (name) => `Invalid arguments passed to${name ? ` <${name}>` : ""} component.`,
	hint: "Astro components cannot be rendered directly via function call, such as `Component()` or `{items.map(Component)}`."
};
/**
* @docs
* @see
* - [Pagination](https://docs.astro.build/en/guides/routing/#pagination)
* @description
* The page number parameter was not found in your filepath.
*/
var PageNumberParamNotFound = {
	name: "PageNumberParamNotFound",
	title: "Page number param not found.",
	message: (paramName) => `[paginate()] page number param \`${paramName}\` not found in your filepath.`,
	hint: "Rename your file to `[page].astro` or `[...page].astro`."
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* - [Image component](https://docs.astro.build/en/reference/modules/astro-assets/#image-)
* - [Image component#alt](https://docs.astro.build/en/reference/modules/astro-assets/#alt-required)
* @description
* The `alt` property allows you to provide descriptive alt text to users of screen readers and other assistive technologies. In order to ensure your images are accessible, the `Image` component requires that an `alt` be specified.
*
* If the image is merely decorative (i.e. doesn’t contribute to the understanding of the page), set `alt=""` so that screen readers know to ignore the image.
*/
var ImageMissingAlt = {
	name: "ImageMissingAlt",
	title: "Image missing required \"alt\" property.",
	message: "Image missing \"alt\" property. \"alt\" text is required to describe important images on the page.",
	hint: "Use an empty string (\"\") for decorative images."
};
/**
* @docs
* @see
* - [Image Service API](https://docs.astro.build/en/reference/image-service-reference/)
* @description
* There was an error while loading the configured image service. This can be caused by various factors, such as your image service not properly exporting a compatible object in its default export, or an incorrect path.
*
* If you believe that your service is properly configured and this error is wrong, please [open an issue](https://astro.build/issues/).
*/
var InvalidImageService = {
	name: "InvalidImageService",
	title: "Error while loading image service.",
	message: "There was an error loading the configured image service. Please see the stack trace for more information."
};
/**
* @docs
* @message
* Missing width and height attributes for `IMAGE_URL`. When using remote images, both dimensions are required in order to avoid cumulative layout shift (CLS).
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* - [Image component#width-and-height-required](https://docs.astro.build/en/reference/modules/astro-assets/#width-and-height-required-for-images-in-public)
* @description
* For remote images, `width` and `height` cannot automatically be inferred from the original file. To avoid cumulative layout shift (CLS), either specify these two properties, or set [`inferSize`](https://docs.astro.build/en/reference/modules/astro-assets/#infersize) to `true` to fetch a remote image's original dimensions.
*
* If your image is inside your `src` folder, you probably meant to import it instead. See [the Imports guide for more information](https://docs.astro.build/en/guides/imports/#other-assets).
*/
var MissingImageDimension = {
	name: "MissingImageDimension",
	title: "Missing image dimensions.",
	message: (missingDimension, imageURL) => `Missing ${missingDimension === "both" ? "width and height attributes" : `${missingDimension} attribute`} for ${imageURL}. When using remote images, both dimensions are required in order to avoid CLS.`,
	hint: "If your image is inside your `src` folder, you probably meant to import it instead. See [the Imports guide for more information](https://docs.astro.build/en/guides/imports/#other-assets). You can also use `inferSize={true}` for remote images to get the original dimensions."
};
/**
* @docs
* @message
* Failed to get the dimensions for `IMAGE_URL`.
* @description
* Determining the remote image's dimensions failed. This is typically caused by an incorrect URL or attempting to infer the size of an image in the public folder which is not possible.
*/
var FailedToFetchRemoteImageDimensions = {
	name: "FailedToFetchRemoteImageDimensions",
	title: "Failed to retrieve remote image dimensions.",
	message: (imageURL) => `Failed to get the dimensions for ${imageURL}.`,
	hint: "Verify your remote image URL is accurate, and that you are not using `inferSize` with a file located in your `public/` folder."
};
/**
* @docs
* @message
* Remote image `IMAGE_URL` is not allowed by your image configuration.
* @description
* The remote image URL does not match your configured `image.domains` or `image.remotePatterns`.
*/
var RemoteImageNotAllowed = {
	name: "RemoteImageNotAllowed",
	title: "Remote image is not allowed.",
	message: (imageURL) => `Remote image ${imageURL} is not allowed by your image configuration.`,
	hint: "Update `image.domains` or `image.remotePatterns`, or remove `inferSize` for this image."
};
/**
* @docs
* @description
* The built-in image services do not currently support optimizing all image formats.
*
* For unsupported formats such as GIFs, you may be able to use an `img` tag directly:
* ```astro
* ---
* import rocket from '../assets/images/rocket.gif';
* ---
*
* <img src={rocket.src} width={rocket.width} height={rocket.height} alt="A rocketship in space." />
* ```
*/
var UnsupportedImageFormat = {
	name: "UnsupportedImageFormat",
	title: "Unsupported image format.",
	message: (format, imagePath, supportedFormats) => `Received unsupported format \`${format}\` from \`${imagePath}\`. Currently only ${supportedFormats.join(", ")} are supported by our image services.`,
	hint: "Using an `img` tag directly instead of the `Image` component might be what you're looking for."
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* Astro does not currently supporting converting between vector (such as SVGs) and raster (such as PNGs and JPEGs) images.
*/
var UnsupportedImageConversion = {
	name: "UnsupportedImageConversion",
	title: "Unsupported image conversion.",
	message: "Converting between vector (such as SVGs) and raster (such as PNGs and JPEGs) images is not currently supported."
};
/**
* @docs
* @see
* - [`getStaticPaths()`](https://docs.astro.build/en/reference/routing-reference/#getstaticpaths)
* - [`params`](https://docs.astro.build/en/reference/api-reference/#params)
* @description
* The endpoint is prerendered with an `undefined` param so the generated path will collide with another route.
*
* If you cannot prevent passing `undefined`, then an additional extension can be added to the endpoint file name to generate the file with a different name. For example, renaming `pages/api/[slug].ts` to `pages/api/[slug].json.ts`.
*/
var PrerenderDynamicEndpointPathCollide = {
	name: "PrerenderDynamicEndpointPathCollide",
	title: "Prerendered dynamic endpoint has path collision.",
	message: (pathname) => `Could not render \`${pathname}\` with an \`undefined\` param as the generated path will collide during prerendering. Prevent passing \`undefined\` as \`params\` for the endpoint's \`getStaticPaths()\` function, or add an additional extension to the endpoint's filename.`,
	hint: (filename) => `Rename \`${filename}\` to \`${filename.replace(/\.(?:js|ts)/, (m) => `.json` + m)}\``
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* An image's `src` property is not valid. The Image component requires the `src` attribute to be either an image that has been ESM imported or a string. This is also true for the first parameter of `getImage()`.
*
* ```astro
* ---
* import { Image } from "astro:assets";
* import myImage from "../assets/my_image.png";
* ---
*
* <Image src={myImage} alt="..." />
* <Image src="https://example.com/logo.png" width={300} height={300} alt="..." />
* ```
*
* In most cases, this error happens when the value passed to `src` is undefined.
*/
var ExpectedImage = {
	name: "ExpectedImage",
	title: "Expected src to be an image.",
	message: (src, typeofOptions, fullOptions) => `Expected \`src\` property for \`getImage\` or \`<Image />\` to be either an ESM imported image or a string with the path of a remote image. Received \`${src}\` (type: \`${typeofOptions}\`).\n\nFull serialized options received: \`${fullOptions}\`.`,
	hint: "This error can often happen because of a wrong path. Make sure the path to your image is correct. If you're passing an async function, make sure to call and await it."
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* `getImage()`'s first parameter should be an object with the different properties to apply to your image.
*
* ```ts
* import { getImage } from "astro:assets";
* import myImage from "../assets/my_image.png";
*
* const optimizedImage = await getImage({src: myImage, width: 300, height: 300});
* ```
*
* In most cases, this error happens because parameters were passed directly instead of inside an object.
*/
var ExpectedImageOptions = {
	name: "ExpectedImageOptions",
	title: "Expected image options.",
	message: (options) => `Expected \`getImage()\` parameter to be an object. Received \`${options}\`.`
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* An ESM-imported image cannot be passed directly to `getImage()`. Instead, pass an object with the image in the `src` property.
*
* ```diff
* import { getImage } from "astro:assets";
* import myImage from "../assets/my_image.png";
* - const optimizedImage = await getImage( myImage );
* + const optimizedImage = await getImage({ src: myImage });
* ```
*/
var ExpectedNotESMImage = {
	name: "ExpectedNotESMImage",
	title: "Expected image options, not an ESM-imported image.",
	message: "An ESM-imported image cannot be passed directly to `getImage()`. Instead, pass an object with the image in the `src` property.",
	hint: "Try changing `getImage(myImage)` to `getImage({ src: myImage })`"
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* Only one of `densities` or `widths` can be specified. Those attributes are used to construct a `srcset` attribute, which cannot have both `x` and `w` descriptors.
*/
var IncompatibleDescriptorOptions = {
	name: "IncompatibleDescriptorOptions",
	title: "Cannot set both `densities` and `widths`.",
	message: "Only one of `densities` or `widths` can be specified. In most cases, you'll probably want to use only `widths` if you require specific widths.",
	hint: "Those attributes are used to construct a `srcset` attribute, which cannot have both `x` and `w` descriptors."
};
/**
* @docs
* @message Could not process image metadata for `IMAGE_PATH`.
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* Astro could not process the metadata of an image you imported. This is often caused by a corrupted or malformed image and re-exporting the image from your image editor may fix this issue.
*/
var NoImageMetadata = {
	name: "NoImageMetadata",
	title: "Could not process image metadata.",
	message: (imagePath) => `Could not process image metadata${imagePath ? ` for \`${imagePath}\`` : ""}.`,
	hint: "This is often caused by a corrupted or malformed image. Re-exporting the image from your image editor may fix this issue."
};
/**
* @docs
* @see
* - [HTML streaming](https://docs.astro.build/en/guides/on-demand-rendering/#html-streaming)
* @description
* Making changes to the response, such as setting headers, cookies, and the status code can only be done in [page components](https://docs.astro.build/en/basics/astro-pages/).
*/
var ResponseSentError = {
	name: "ResponseSentError",
	title: "Unable to set response.",
	message: "The response has already been sent to the browser and cannot be altered."
};
/**
* @docs
* @description
* Thrown when the middleware does not return any data or call the `next` function.
*
* For example:
* ```ts
* import {defineMiddleware} from "astro:middleware";
* export const onRequest = defineMiddleware((context, _) => {
* 	// doesn't return anything or call `next`
* 	context.locals.someData = false;
* });
* ```
*/
var MiddlewareNoDataOrNextCalled = {
	name: "MiddlewareNoDataOrNextCalled",
	title: "The middleware didn't return a `Response`.",
	message: "Make sure your middleware returns a `Response` object, either directly or by returning the `Response` from calling the `next` function."
};
/**
* @docs
* @description
* Thrown in development mode when middleware returns something that is not a `Response` object.
*
* For example:
* ```ts
* import {defineMiddleware} from "astro:middleware";
* export const onRequest = defineMiddleware(() => {
*   return "string"
* });
* ```
*/
var MiddlewareNotAResponse = {
	name: "MiddlewareNotAResponse",
	title: "The middleware returned something that is not a `Response` object.",
	message: "Any data returned from middleware must be a valid `Response` object."
};
/**
* @docs
* @description
* Thrown when an endpoint does not return anything or returns an object that is not a `Response` object.
*
* An endpoint must return either a `Response`, or a `Promise` that resolves with a `Response`. For example:
* ```ts
* import type { APIContext } from 'astro';
*
* export async function GET({ request, url, cookies }: APIContext): Promise<Response> {
*     return Response.json({
*         success: true,
*         result: 'Data from Astro Endpoint!'
*     })
* }
* ```
*/
var EndpointDidNotReturnAResponse = {
	name: "EndpointDidNotReturnAResponse",
	title: "The endpoint did not return a `Response`.",
	message: "An endpoint must return either a `Response`, or a `Promise` that resolves with a `Response`."
};
/**
* @docs
* @description
*
* Thrown when `locals` is overwritten with something that is not an object
*
* For example:
* ```ts
* import {defineMiddleware} from "astro:middleware";
* export const onRequest = defineMiddleware((context, next) => {
*   context.locals = 1541;
*   return next();
* });
* ```
*/
var LocalsNotAnObject = {
	name: "LocalsNotAnObject",
	title: "Value assigned to `locals` is not accepted.",
	message: "`locals` can only be assigned to an object. Other values like numbers, strings, etc. are not accepted.",
	hint: "If you tried to remove some information from the `locals` object, try to use `delete` or set the property to `undefined`."
};
/**
* @docs
* @description
* Thrown when a value is being set as the `locals` field on the Astro global or context.
*/
var LocalsReassigned = {
	name: "LocalsReassigned",
	title: "`locals` must not be reassigned.",
	message: "`locals` cannot be assigned directly.",
	hint: "Set a `locals` property instead."
};
/**
* @docs
* @description
* Thrown when a value is being set as the `headers` field on the `ResponseInit` object available as `Astro.response`.
*/
var AstroResponseHeadersReassigned = {
	name: "AstroResponseHeadersReassigned",
	title: "`Astro.response.headers` must not be reassigned.",
	message: "Individual headers can be added to and removed from `Astro.response.headers`, but it must not be replaced with another instance of `Headers` altogether.",
	hint: "Consider using `Astro.response.headers.add()`, and `Astro.response.headers.delete()`."
};
/**
* @docs
* @see
* - [Images](https://docs.astro.build/en/guides/images/)
* @description
* When using the default image services, `Image`'s and `getImage`'s `src` parameter must be either an imported image or a URL, it cannot be a string of a filepath.
*
* For local images from content collections, you can use the [image() schema helper](https://docs.astro.build/en/guides/images/#images-in-content-collections) to resolve the images.
*
* ```astro
* ---
* import { Image } from "astro:assets";
* import myImage from "../my_image.png";
* ---
*
* <!-- GOOD: `src` is the full imported image. -->
* <Image src={myImage} alt="Cool image" />
*
* <!-- GOOD: `src` is a URL. -->
* <Image src="https://example.com/my_image.png" alt="Cool image" />
*
* <!-- BAD: `src` is an image's `src` path instead of the full image object. -->
* <Image src={myImage.src} alt="Cool image" />
*
* <!-- BAD: `src` is a string filepath. -->
* <Image src="../my_image.png" alt="Cool image" />
* ```
*/
var LocalImageUsedWrongly = {
	name: "LocalImageUsedWrongly",
	title: "Local images must be imported.",
	message: (imageFilePath) => `\`Image\`'s and \`getImage\`'s \`src\` parameter must be an imported image or a URL, it cannot be a string filepath. Received \`${imageFilePath}\`.`,
	hint: "If you want to use an image from your `src` folder, you need to either import it or if the image is coming from a content collection, use the [image() schema helper](https://docs.astro.build/en/guides/images/#images-in-content-collections). See https://docs.astro.build/en/reference/modules/astro-assets/#src-required for more information on the `src` property."
};
/**
* @docs
* @see
* - [Default Image Service](https://docs.astro.build/en/guides/images/#default-image-service)
* - [Image Services API](https://docs.astro.build/en/reference/image-service-reference/)
* @description
* Sharp is the default image service used for `astro:assets`. When using a [strict package manager](https://pnpm.io/pnpm-vs-npm#npms-flat-tree) like pnpm, Sharp must be installed manually into your project in order to use image processing.
*
* If you are not using `astro:assets` for image processing, and do not wish to install Sharp, you can configure the following passthrough image service that does no processing:
*
* ```js
* import { defineConfig, passthroughImageService } from "astro/config";
* export default defineConfig({
*  image: {
*    service: passthroughImageService(),
*  },
* });
* ```
*/
var MissingSharp = {
	name: "MissingSharp",
	title: "Could not find Sharp.",
	message: "Could not find Sharp. Please install Sharp (`sharp`) manually into your project or migrate to another image service.",
	hint: "See Sharp's installation instructions for more information: https://sharp.pixelplumbing.com/install. If you are not relying on `astro:assets` to optimize, transform, or process any images, you can configure a passthrough image service instead of installing Sharp. See https://docs.astro.build/en/reference/errors/missing-sharp for more information.\n\nSee https://docs.astro.build/en/guides/images/#default-image-service for more information on how to migrate to another image service."
};
/**
* @docs
* @description
* `Astro.rewrite()` cannot be used if the request body has already been read. If you need to read the body, first clone the request. For example:
*
* ```js
* const data = await Astro.request.clone().formData();
*
* Astro.rewrite("/target")
* ```
*
* @see
* - [Request.clone()](https://developer.mozilla.org/en-US/docs/Web/API/Request/clone)
* - [Astro.rewrite](https://docs.astro.build/en/reference/api-reference/#rewrite)
*/
var RewriteWithBodyUsed = {
	name: "RewriteWithBodyUsed",
	title: "Cannot use `Astro.rewrite()` after the request body has been read.",
	message: "`Astro.rewrite()` cannot be used if the request body has already been read. If you need to read the body, first clone the request.",
	hint: "Read the body from `Astro.request.clone()` instead of `Astro.request`, so the original request can still be rewritten."
};
/**
* @docs
* @description
* `Astro.rewrite()` can't be used to rewrite an on-demand route with a static route when using the `"server"` output.
*
*/
var ForbiddenRewrite = {
	name: "ForbiddenRewrite",
	title: "Forbidden rewrite to a static route.",
	message: (from, to, component) => `You tried to rewrite the on-demand route '${from}' with the static route '${to}', when using the 'server' output. \n\nThe static route '${to}' is rendered by the component
'${component}', which is marked as prerendered. This is a forbidden operation because during the build, the component '${component}' is compiled to an
HTML file, which can't be retrieved at runtime by Astro.`,
	hint: (component) => `Add \`export const prerender = false\` to the component '${component}', or use \`Astro.redirect()\`.`
};
/**
* @docs
* @description
* Font file URL not found.
* @message
* The URL passed to the `experimental_getFontFileURL()` function is invalid.
*/
var FontFileUrlNotFound = {
	name: "FontFileUrlNotFound",
	title: "Font file URL not found.",
	message: (url) => `The \`"${url}"\` URL passed to the \`experimental_getFontFileURL()\` function is invalid.`,
	hint: "Make sure you pass a valid URL, obtained via the `fontData` object."
};
/**
* @docs
* @description
* Unavailable Astro global in `getStaticPaths()`.
* @message
* The Astro global is not available in `getStaticPaths()`.
*/
var UnavailableAstroGlobal = {
	name: "UnavailableAstroGlobal",
	title: "Unavailable Astro global in `getStaticPaths()`.",
	message: (name) => `The Astro global is not available in this scope. Please remove \`Astro.${name}\` from your \`getStaticPaths()\` function.`
};
/**
* @docs
* @description
* `new FetchState(request)` can only be used inside an Astro server — the built
* server output or the dev server — where Astro provides the manifest describing
* your site. This error means it was called somewhere else, for example in a
* plain Node script that imports `astro/fetch`.
*
* If this error occurs inside an Astro-built server, please [open an issue](https://astro.build/issues/).
* @message
* `new FetchState(request)` was called outside of an Astro server, so no manifest is available.
*/
var NoManifestAvailable = {
	name: "NoManifestAvailable",
	title: "No manifest available.",
	message: "`new FetchState(request)` was called outside of an Astro server, so no manifest is available.",
	hint: "Make sure this code runs as part of your Astro app, such as its fetch entrypoint. If this error occurred inside an Astro-built server, please open an issue at https://github.com/withastro/astro/issues."
};
/**
* @docs
* @see
* - [Actions handler reference](https://docs.astro.build/en/reference/modules/astro-actions/#handler-property)
* @description
* Action handler returned invalid data. Handlers should return serializable data types, and cannot return a Response object.
*/
var ActionsReturnedInvalidDataError = {
	name: "ActionsReturnedInvalidDataError",
	title: "Action handler returned invalid data.",
	message: (error) => `Action handler returned invalid data. Handlers should return serializable data types like objects, arrays, strings, and numbers. Parse error: ${error}`,
	hint: "See the devalue library for all supported types: https://github.com/rich-harris/devalue"
};
/**
* @docs
* @description
* The server received a request for an action but could not find a match with the same name.
*/
var ActionNotFoundError = {
	name: "ActionNotFoundError",
	title: "Action not found.",
	message: (actionName) => `The server received a request for an action named \`${actionName}\` but could not find a match. If you renamed an action, check that you've updated your \`actions/index\` file and your calling code to match.`,
	hint: "You can run `astro check` to detect type errors caused by mismatched action names."
};
/**
* @docs
* @message `Astro.cache` is not available because the cache feature is not enabled.
* @description
* Thrown when `Astro.cache` or `context.cache` is used but the cache feature has not been enabled in the Astro config.
*/
var CacheNotEnabled = {
	name: "CacheNotEnabled",
	title: "Cache is not enabled.",
	message: "`Astro.cache` is not available because the cache feature is not enabled. To use caching, configure a cache provider in your Astro config under `cache`.",
	hint: "Use an adapter that provides a default cache provider, or set one explicitly: `cache: { provider: \"...\" }`. See https://docs.astro.build/en/guides/caching/."
};
// node_modules/@astrojs/internal-helpers/dist/remote.js
/**
* Evaluates whether a given URL matches the specified remote pattern based on protocol, hostname, port, and pathname.
*
* @param {URL} url - The URL object to be matched against the remote pattern.
* @param {RemotePattern} remotePattern - The remote pattern object containing the protocol, hostname, port, and pathname to match.
* @return {boolean} Returns `true` if the URL matches the given remote pattern; otherwise, `false`.
*/
function matchPattern(url, remotePattern) {
	return matchProtocol(url, remotePattern.protocol) && matchHostname(url, remotePattern.hostname, true) && matchPort(url, remotePattern.port) && matchPathname(url, remotePattern.pathname, true);
}
/**
* Checks if the given URL's port matches the specified port. If no port is provided, it returns `true`.
*
* @param {URL} url - The URL object whose port will be checked.
* @param {string} [port=] - The port to match against the URL's port. Optional.
* @return {boolean} Returns `true` if the URL's port matches the specified port or if no port is provided; otherwise, `false`.
*/
function matchPort(url, port) {
	return !port || port === url.port;
}
/**
* Compares the protocol of the provided URL with a specified protocol.
*
* @param {URL} url - The URL object whose protocol needs to be checked.
* @param {string} [protocol] - The protocol to compare against, without the trailing colon. If not provided, the method will always return `true`.
* @return {boolean} Returns `true` if the protocol matches or if no protocol is specified; otherwise, `false`.
*/
function matchProtocol(url, protocol) {
	return !protocol || protocol === url.protocol.slice(0, -1);
}
/**
* Matches a given URL's hostname against a specified hostname, with optional support for wildcard patterns.
*
* @param {URL} url - The URL object whose hostname is to be matched.
* @param {string} [hostname] - The hostname to match against. Supports wildcard patterns if `allowWildcard` is `true`.
* @param {boolean} [allowWildcard=false] - Indicates whether wildcard patterns in the `hostname` parameter are allowed.
* @return {boolean} - Returns `true` if the URL's hostname matches the given hostname criteria; otherwise, `false`.
*/
function matchHostname(url, hostname, allowWildcard = false) {
	if (!hostname) return true;
	else if (!allowWildcard || !hostname.startsWith("*")) return hostname === url.hostname;
	else if (hostname.startsWith("**.")) {
		const slicedHostname = hostname.slice(2);
		return slicedHostname !== url.hostname && url.hostname.endsWith(slicedHostname);
	} else if (hostname.startsWith("*.")) {
		const slicedHostname = hostname.slice(1);
		if (!url.hostname.endsWith(slicedHostname)) return false;
		const subdomainWithDot = url.hostname.slice(0, -(slicedHostname.length - 1));
		return subdomainWithDot.endsWith(".") && !subdomainWithDot.slice(0, -1).includes(".");
	}
	return false;
}
/**
* Matches a given URL's pathname against a specified pattern, with optional support for wildcards.
*
* @param {URL} url - The URL object containing the pathname to be matched.
* @param {string} [pathname] - The pathname pattern to match the URL against.
* @param {boolean} [allowWildcard=false] - Determines whether wildcard matching is allowed.
* @return {boolean} - Returns `true` if the URL's pathname matches the specified pattern; otherwise, `false`.
*/
function matchPathname(url, pathname, allowWildcard = false) {
	if (!pathname) return true;
	else if (!allowWildcard || !pathname.endsWith("*")) return pathname === url.pathname;
	else if (pathname.endsWith("/**")) {
		const slicedPathname = pathname.slice(0, -2);
		return slicedPathname !== url.pathname && url.pathname.startsWith(slicedPathname);
	} else if (pathname.endsWith("/*")) {
		const slicedPathname = pathname.slice(0, -1);
		if (!url.pathname.startsWith(slicedPathname)) return false;
		return url.pathname.slice(slicedPathname.length).split("/").filter(Boolean).length === 1;
	}
	return false;
}
/**
* Determines whether a given remote resource, identified by its source URL,
* is allowed based on specified domains and remote patterns.
*
* @param {string} src - The source URL of the remote resource to be validated.
* @param {Object} options - The configuration options for domain and pattern matching.
* @param {string[]} options.domains - A list of allowed domain names.
* @param {RemotePattern[]} options.remotePatterns - A list of allowed remote patterns for matching.
* @return {boolean} Returns `true` if the source URL matches any of the specified domains or remote patterns; otherwise, `false`.
*/
function isRemoteAllowed(src, { domains, remotePatterns }) {
	if (!URL.canParse(src)) return false;
	const url = new URL(src);
	if (![
		"http:",
		"https:",
		"data:"
	].includes(url.protocol)) return false;
	return domains.some((domain) => matchHostname(url, domain)) || remotePatterns.some((remotePattern) => matchPattern(url, remotePattern));
}
export { collapseDuplicateLeadingSlashes as $, MissingMediaQueryDirective as A, PrerenderClientAddressNotAvailable as B, InvalidImageService as C, MiddlewareNoDataOrNextCalled as D, LocalsReassigned as E, NoMatchingImport as F, RewriteWithBodyUsed as G, RemoteImageNotAllowed as H, NoMatchingRenderer as I, UnsupportedImageConversion as J, StaticClientAddressNotAvailable as K, NoMatchingStaticPathFound as L, NoClientOnlyHint as M, NoImageMetadata as N, MiddlewareNotAResponse as O, NoManifestAvailable as P, appendForwardSlash as Q, OnlyResponseCanBeReturned as R, InvalidGetStaticPathsReturn as S, LocalsNotAnObject as T, ReservedSlotName as U, PrerenderDynamicEndpointPathCollide as V, ResponseSentError as W, AstroError as X, UnsupportedImageFormat as Y, isAstroError as Z, GetStaticPathsRequired as _, AstroResponseHeadersReassigned as a, isRemotePath as at, InvalidComponentArgs as b, EndpointDidNotReturnAResponse as c, removeBase as ct, ExpectedNotESMImage as d, removeTrailingForwardSlash as dt, collapseDuplicateSlashes as et, FailedToFetchRemoteImageDimensions as f, slash as ft, GetStaticPathsInvalidRouteParam as g, GetStaticPathsExpectedParams as h, ActionsReturnedInvalidDataError as i, isInternalPath as it, MissingSharp as j, MissingImageDimension as k, ExpectedImage as l, removeLeadingForwardSlash as lt, ForbiddenRewrite as m, trimSlashes as mt, matchHostname as n, fileExtension as nt, CacheNotEnabled as o, joinPaths as ot, FontFileUrlNotFound as p, stripRequestBase as pt, UnavailableAstroGlobal as q, ActionNotFoundError as r, hasFileExtension as rt, ClientAddressNotAvailable as s, prependForwardSlash as st, isRemoteAllowed as t, collapseDuplicateTrailingSlashes as tt, ExpectedImageOptions as u, removeQueryString as ut, ImageMissingAlt as v, LocalImageUsedWrongly as w, InvalidGetStaticPathsEntry as x, IncompatibleDescriptorOptions as y, PageNumberParamNotFound as z };
