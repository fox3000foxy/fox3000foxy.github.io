const AUTHOR_PUBKEY =
	"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA==";

export async function verifyArticle(
	slug: string,
	author: string,
	date: string,
	content: string,
	signatureBase64: string
): Promise<boolean> {
	try {
		const msg = `${slug}|${author}|${date}|${content}`;
		const msgBytes = new TextEncoder().encode(msg);

		const keyData = Uint8Array.from(atob(AUTHOR_PUBKEY), (c) =>
			c.charCodeAt(0)
		);
		const key = await crypto.subtle.importKey(
			"spki",
			keyData,
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["verify"]
		);

		const sig = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));

		return await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			sig,
			msgBytes
		);
	} catch {
		return false;
	}
}
