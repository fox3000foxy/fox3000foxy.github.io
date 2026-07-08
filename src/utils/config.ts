export const CONFIG = {
	newsletterApiUrl: import.meta.env.VITE_NEWSLETTER_API_URL as
		| string
		| undefined,
	contactApiUrl: import.meta.env.VITE_CONTACT_API_URL as string | undefined,
	turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY as
		| string
		| undefined,
};
