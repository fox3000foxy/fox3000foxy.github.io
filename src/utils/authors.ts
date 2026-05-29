export interface Author {
	id: string;
	name: string;
	github: string;
	avatar?: string;
}

const AUTHORS: Record<string, Author> = {
	fox3000foxy: {
		id: "fox3000foxy",
		name: "Fox3000foxy",
		github: "https://github.com/fox3000foxy",
	},
};

export function getAuthor(id: string): Author {
	return AUTHORS[id] ?? { id, name: id, github: `https://github.com/${id}` };
}

export function getAuthors(ids?: string[]): Author[] {
	if (!ids || ids.length === 0) {
		return [AUTHORS.fox3000foxy];
	}
	return ids.map(getAuthor);
}
