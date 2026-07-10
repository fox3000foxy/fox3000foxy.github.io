interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REPO: string;
  GITHUB_USERNAME: string;
  GITHUB_EMAIL: string;
  WORKER_URL: string;
  SIGNING_PRIVATE_KEY: string;
}

const AUTHOR_PUBKEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A==";

interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
}

interface ArticleDraft {
  title: string;
  slug: string;
  description: string;
  content: string;
  tags: string[];
  lang: string;
  images: { filename: string; dataUrl: string }[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/auth/device" && request.method === "POST") {
        return startDeviceFlow(env);
      }
      if (path === "/auth/poll" && request.method === "POST") {
        return pollDeviceFlow(request, env);
      }
      if (path === "/auth/user" && request.method === "GET") {
        return getCurrentUser(request);
      }
      if (path === "/articles" && request.method === "POST") {
        return submitArticle(request, env);
      }
      if (path === "/pubkey" && request.method === "GET") {
        return json({ pubkey: AUTHOR_PUBKEY });
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  },
};

async function startDeviceFlow(env: Env): Promise<Response> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      scope: "public_repo",
    }),
  });

  if (!res.ok) {
    return json({ error: "Failed to start device flow" }, 502);
  }

  const data: DeviceFlowResponse = await res.json();
  return json(data);
}

async function pollDeviceFlow(request: Request, env: Env): Promise<Response> {
  const { device_code } = await request.json() as { device_code: string };

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  const data = await res.json() as Record<string, string>;

  if (data.error) {
    return json({ error: data.error, error_description: data.error_description }, 400);
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "fox3000foxy-writer",
    },
  });

  const user: GitHubUser = await userRes.json();

  return json({
    access_token: data.access_token,
    user: {
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      name: user.name,
    },
  });
}

async function getCurrentUser(request: Request): Promise<Response> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: auth,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "fox3000foxy-writer",
    },
  });

  if (!res.ok) {
    return json({ error: "Invalid token" }, 401);
  }

  const user: GitHubUser = await res.json();
  return json({ login: user.login, id: user.id, avatar_url: user.avatar_url, name: user.name });
}

async function signArticle(
  privateKeyBase64: string,
  slug: string,
  author: string,
  date: string,
  content: string,
): Promise<string> {
  const msg = `${slug}|${author}|${date}|${content}`;
  const encoder = new TextEncoder();
  const msgBytes = encoder.encode(msg);

  const keyData = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    msgBytes,
  );

  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function submitArticle(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: auth,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "fox3000foxy-writer",
    },
  });

  if (!userRes.ok) {
    return json({ error: "Invalid token" }, 401);
  }

  const user: GitHubUser = await userRes.json();
  const article: ArticleDraft = await request.json();

  if (!((article.title && article.content ) && article.slug)) {
    return json({ error: "title, slug, and content are required" }, 400);
  }

  const articleDate = new Date().toISOString().split("T")[0];
  const authorSig = await signArticle(
    env.SIGNING_PRIVATE_KEY,
    article.slug,
    user.login,
    articleDate,
    article.content,
  );
  const frontmatter = [
    "---",
    `title: "${article.title.replace(/"/g, '\\"')}"`,
    `description: "${article.description?.replace(/"/g, '\\"') || ""}"`,
    `date: ${articleDate}`,
    article.tags?.length ? `tags: [${article.tags.map((t) => `"${t}"`).join(", ")}]` : "tags: []",
    `authors: ["${user.login}"]`,
    `lang: "${article.lang || "en"}"`,
    `author_pubkey: "${AUTHOR_PUBKEY}"`,
    `author_sig: "${authorSig}"`,
    ...(article.images?.length
      ? [`images:\n${article.images.map((img) => `  - ${img.filename}`).join("\n")}`]
      : []),
    "---",
    article.content,
  ].join("\n");

  const branchName = `article-${slugify(article.slug)}-${Date.now().toString(36)}`;

  const repo = env.GITHUB_REPO;

  const headers: Record<string, string> = {
    Authorization: auth,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "fox3000foxy-writer",
    "Content-Type": "application/json",
  };

  const mainRef = await fetch(
    `https://api.github.com/repos/${repo}/git/refs/heads/main`,
    { headers },
  );
  if (!mainRef.ok) {
    return json({ error: "Failed to get main branch" }, 502);
  }
  const { object: { sha: mainSha } } = await mainRef.json() as { object: { sha: string } };

  const createBranchRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: mainSha,
      }),
    },
  );
  if (!createBranchRes.ok) {
    const err = await createBranchRes.text();
    return json({ error: `Failed to create branch: ${err}` }, 502);
  }

  const langDir = article.lang || "en";
  const filePath = `public/articles/${langDir}/${article.slug}.md`;

  const contentEncoded = btoa(frontmatter);

  const createFileRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `New article: ${article.title}`,
        content: contentEncoded,
        branch: branchName,
        author: {
          name: env.GITHUB_USERNAME,
          email: env.GITHUB_EMAIL,
        },
      }),
    },
  );
  if (!createFileRes.ok) {
    const err = await createFileRes.text();
    return json({ error: `Failed to create file: ${err}` }, 502);
  }

  if (article.images?.length) {
    const imagesDir = "public/articles/assets/";

    for (let i = 0; i < article.images.length; i++) {
      const img = article.images[i];
      const base64Data = img.dataUrl.includes("base64,")
        ? img.dataUrl.split("base64,")[1]
        : img.dataUrl;

      await fetch(
        `https://api.github.com/repos/${repo}/contents/${imagesDir}${img.filename}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `Add image for article ${article.slug}`,
            content: base64Data,
            branch: branchName,
            author: {
              name: env.GITHUB_USERNAME,
              email: env.GITHUB_EMAIL,
            },
          }),
        },
      );
    }
  }

  const prRes = await fetch(
    `https://api.github.com/repos/${repo}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `New article: ${article.title}`,
        body: [
          `## Article Submission by @${user.login}`,
          "",
          `**Title:** ${article.title}`,
          `**Language:** ${article.lang || "en"}`,
          article.description ? `**Description:** ${article.description}` : "",
          article.tags?.length ? `**Tags:** ${article.tags.join(", ")}` : "",
          "",
          "---",
          "",
          "This PR was automatically created via the article editor.",
        ]
          .filter(Boolean)
          .join("\n"),
        head: branchName,
        base: "main",
      }),
    },
  );

  if (!prRes.ok) {
    const err = await prRes.text();
    return json({ error: `Failed to create PR: ${err}` }, 502);
  }

  const pr = await prRes.json() as { html_url: string; number: number };

  return json({
    success: true,
    pr_url: pr.html_url,
    pr_number: pr.number,
    branch: branchName,
  });
}
