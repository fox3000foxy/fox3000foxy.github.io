export function parseFrontMatter(text) {
    const meta = {};
    let content = text;
    if (text.startsWith("---\n")) {
        const end = text.indexOf("\n---\n", 4);
        if (end !== -1) {
            const raw = text.slice(4, end);
            content = text.slice(end + 5);
            const lines = raw.split("\n");
            let listKey = null;
            for (const line of lines) {
                const colonIdx = line.indexOf(":");
                if (colonIdx !== -1) {
                    listKey = null;
                    const key = line.slice(0, colonIdx).trim();
                    const val = line.slice(colonIdx + 1).trim();
                    if (key === "title") {
                        meta.title = val.replace(/^["']|["']$/g, "");
                    }
                    else if (key === "description") {
                        meta.description = val.replace(/^["']|["']$/g, "");
                    }
                    else if (key === "date") {
                        meta.date = val;
                    }
                    else if (key === "lastmod") {
                        meta.lastmod = val;
                    }
                    else if (key === "aiGenerated") {
                        meta.aiGenerated = val === "true";
                    }
                    else if (key === "sponsored") {
                        meta.sponsored = val === "true";
                    }
                    else if (key === "series") {
                        meta.series = val;
                    }
                    else if (key === "tags" || key === "authors") {
                        const arr = val
                            .replace(/^\[|\]$/g, "")
                            .split(",")
                            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
                            .filter(Boolean);
                        if (!(arr.length || val)) {
                            listKey = key;
                            if (key === "tags") {
                                meta.tags = [];
                            }
                            else {
                                meta.authors = [];
                            }
                        }
                        else if (key === "tags") {
                            meta.tags = arr;
                        }
                        else {
                            meta.authors = arr;
                        }
                    }
                    else if (key === "author_pubkey") {
                        meta.author_pubkey = val.replace(/^["']|["']$/g, "");
                    }
                    else if (key === "author_sig") {
                        meta.author_sig = val.replace(/^["']|["']$/g, "");
                    }
                }
                else if (listKey && /^\s+-\s+/.test(line)) {
                    const item = line.replace(/^\s+-\s+/, "").trim();
                    if (item) {
                        if (listKey === "tags") {
                            meta.tags = [...(meta.tags || []), item];
                        }
                        else if (listKey === "authors") {
                            meta.authors = [...(meta.authors || []), item];
                        }
                    }
                }
            }
        }
    }
    return { meta, content };
}
