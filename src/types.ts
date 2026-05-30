export interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
	date?: string;
	lastmod?: string;
	readingTime?: number;
	aiGenerated?: boolean;
	tags?: string[];
	series?: string;
	authors?: string[];
}
