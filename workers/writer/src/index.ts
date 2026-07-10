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
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/auth/device" && request.method === "POST") {
        return await startDeviceFlow(env);
      }
      if (path === "/auth/poll" && request.method === "POST") {
        return await pollDeviceFlow(request, env);
      }
      if (path === "/auth/user" && request.method === "GET") {
        return await getCurrentUser(request);
      }
      if (path === "/articles" && request.method === "POST") {
        return await submitArticle(request, env);
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
      scope: "repo",
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

async function isCollaborator(repo: string, username: string, auth: string): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/collaborators/${username}`,
    {
      headers: {
        Authorization: auth,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "fox3000foxy-writer",
      },
    },
  );
  return res.status === 204;
}

async function ensureFork(repo: string, username: string, headers: Record<string, string>): Promise<string> {
  const userFork = `${username}/${repo.split("/")[1]}`;
  const res = await fetch(`https://api.github.com/repos/${userFork}`, { headers });
  if (res.ok) {
    return userFork;
  }
  const forkRes = await fetch(`https://api.github.com/repos/${repo}/forks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ default_branch_only: true }),
  });

  if (forkRes.status >= 300 && forkRes.status < 400) {
    const location = forkRes.headers.get("Location") || "";
    return location.split("/").slice(-2).join("/").replace(/\.git$/, "");
  }
  if (!forkRes.ok) {
    const err = await forkRes.text();
    throw new Error(`Failed to fork repo: ${err}`);
  }
  const fork = await forkRes.json() as { full_name: string };
  return fork.full_name;
}

async function createBranch(repo: string, branch: string, headers: Record<string, string>): Promise<void> {
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) throw new Error("Failed to get repo info");
  const repoInfo = await repoRes.json() as { default_branch: string };
  const defaultBranch = repoInfo.default_branch;

  const mainRef = await fetch(
    `https://api.github.com/repos/${repo}/git/refs/heads/${defaultBranch}`,
    { headers },
  );
  if (!mainRef.ok) throw new Error("Failed to get default branch ref");
  const { object: { sha: mainSha } } = await mainRef.json() as { object: { sha: string } };

  const createBranchRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
    },
  );
  if (!createBranchRes.ok) {
    const err = await createBranchRes.text();
    throw new Error(`Failed to create branch: ${err}`);
  }
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

  let content = article.content;
  if (article.images?.length) {
    for (const img of article.images) {
      content = content.replaceAll(img.filename, `assets/${img.filename}`);
    }
  }

  const authorSig = await signArticle(
    env.SIGNING_PRIVATE_KEY,
    article.slug,
    user.login,
    articleDate,
    content,
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
    content,
  ].join("\n");

  const repo = env.GITHUB_REPO;

  const headers: Record<string, string> = {
    Authorization: auth,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "fox3000foxy-writer",
    "Content-Type": "application/json",
  };

  const collab = await isCollaborator(repo, user.login, auth);

  let targetRepo = repo;
  let targetBranch: string;

  if (collab) {
    targetBranch = "main";
  } else {
    targetBranch = `article-${slugify(article.slug)}-${Date.now().toString(36)}`;
    targetRepo = await ensureFork(repo, user.login, headers);
    await createBranch(targetRepo, targetBranch, headers);
  }

  const langDir = article.lang || "en";
  const filePath = `public/articles/${langDir}/${article.slug}.md`;

  const contentEncoded = btoa(frontmatter);

  const createFileRes = await fetch(
    `https://api.github.com/repos/${targetRepo}/contents/${filePath}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `New article: ${article.title}`,
        content: contentEncoded,
        branch: targetBranch,
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
    const failedImages: string[] = [];

    for (let i = 0; i < article.images.length; i++) {
      const img = article.images[i];
      const base64Data = img.dataUrl.includes("base64,")
        ? img.dataUrl.split("base64,")[1]
        : img.dataUrl;

      const imgRes = await fetch(
        `https://api.github.com/repos/${targetRepo}/contents/${imagesDir}${img.filename}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `Add image for article ${article.slug}`,
            content: base64Data,
            branch: targetBranch,
            author: {
              name: env.GITHUB_USERNAME,
              email: env.GITHUB_EMAIL,
            },
          }),
        },
      );
      if (!imgRes.ok) {
        failedImages.push(img.filename);
      }
    }

    if (failedImages.length) {
      return json({ error: `Failed to upload images: ${failedImages.join(", ")}` }, 502);
    }
  }

  if (collab) {
    return json({
      success: true,
      mode: "direct",
      message: "Article pushed directly to main",
    });
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
        head: `${user.login}:${targetBranch}`,
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
    mode: "pr",
    pr_url: pr.html_url,
    pr_number: pr.number,
    branch: targetBranch,
  });
}
