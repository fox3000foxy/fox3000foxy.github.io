const RATE_WINDOW = 60000;
const MAX_PER_WINDOW = 5;
const ipMap = new Map<string, { count: number; reset: number }>();

addEventListener("fetch", (event: FetchEvent) => {
	const ip = event.request.headers.get("CF-Connecting-IP") ?? "unknown";
	const now = Date.now();
	const entry = ipMap.get(ip);
	if (entry && now < entry.reset && entry.count >= MAX_PER_WINDOW) {
		return event.respondWith(jsonResponse({ error: "Too many requests" }, 429));
	}
	if (!entry || now >= entry.reset) {
		ipMap.set(ip, { count: 1, reset: now + RATE_WINDOW });
	} else {
		entry.count++;
	}
	event.respondWith(handleRequest(event.request, ip));
});

async function handleRequest(request: Request, ip: string): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	let body: Record<string, string>;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Invalid JSON" }, 400);
	}

	if (!body.name || !body.email || !body.message) {
		return jsonResponse({ error: "Missing fields" }, 400);
	}

	if (typeof TURNSTILE_SECRET_KEY !== "undefined") {
		const turnstileToken = body["cf-turnstile-response"];
		if (turnstileToken) {
			const verify = await fetch(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				{
					method: "POST",
					body: `secret=${TURNSTILE_SECRET_KEY}&response=${turnstileToken}&remoteip=${ip}`,
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
				},
			);
			const outcome: { success?: boolean } = await verify.json();
			if (!outcome.success) {
				return jsonResponse({ error: "Bot detected" }, 403);
			}
		}
	}

	if (typeof DISCORD_WEBHOOK_URL !== "undefined") {
		const payload = {
			username: "Contact Form",
			embeds: [
				{
					title: `✉️ Message from ${body.name}`,
					description: body.message.slice(0, 2000),
					fields: [
						{ name: "Email", value: body.email, inline: true },
						{ name: "IP", value: ip, inline: true },
					],
					color: 0x64b5f6,
					timestamp: new Date().toISOString(),
				},
			],
		};

		const discord = await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!discord.ok) {
			return jsonResponse({ error: "Delivery failed" }, 500);
		}
	}

	return jsonResponse({ success: true }, 200, corsHeaders());
}

declare const TURNSTILE_SECRET_KEY: string;
declare const DISCORD_WEBHOOK_URL: string;

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

function jsonResponse(
	data: unknown,
	status: number,
	extra?: Record<string, string>,
): Response {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...extra,
	};
	return new Response(JSON.stringify(data), { status, headers });
}
