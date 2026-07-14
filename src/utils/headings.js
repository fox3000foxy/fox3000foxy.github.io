export function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}
export function parseHeadings(markdown) {
    const regex = /^(#{2,3})\s+(.+)$/gm;
    const entries = [];
    for (;;) {
        const match = regex.exec(markdown);
        if (match === null) {
            break;
        }
        const level = match[1].length;
        const text = match[2].trim();
        entries.push({ level, text, id: slugify(text) });
    }
    return entries;
}
