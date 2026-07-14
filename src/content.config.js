import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
const LANG_CODES = [
    "en",
    "fr",
    "de",
    "es",
    "pt",
    "it",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi",
    "id",
    "th",
    "tr",
    "vi",
];
const blogCollections = LANG_CODES.reduce((acc, lang) => {
    acc[lang] = defineCollection({
        loader: glob({ pattern: "*.md", base: `./public/articles/${lang}` }),
        schema: z.object({
            title: z.string(),
            description: z.string().default(""),
            date: z.coerce.date().optional(),
            lastmod: z.coerce.date().optional(),
            readingTime: z.number().optional(),
            aiGenerated: z.boolean().default(false),
            tags: z.array(z.string()).default([]),
            series: z.string().optional(),
            authors: z.array(z.string()).default([]),
            author_pubkey: z.string().optional(),
            author_sig: z.string().optional(),
        }),
    });
    return acc;
}, {});
export const collections = blogCollections;
