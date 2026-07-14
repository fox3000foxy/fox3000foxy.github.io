const BUILD_ID = import.meta.env.VITE_BUILD_ID || "dev";
export function cacheBust(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${BUILD_ID}`;
}
