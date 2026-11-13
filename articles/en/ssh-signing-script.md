---
title: SSH commit signing script explained
description: A walkthrough of the SSH commit-signing helper and why I wanted
  stylish commits.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oKniors9SV74DnmlW93ehy9PxWN225KJ0gTJmA8RHr6rZEiexMq/Cd+lQAO+aq4jvplIBFnE1wAbpKeluWCf+A=="
---

# SSH commit signing script -- explained

This article breaks down the `setup-ssh-signing.sh` script I published on [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). We'll look at what each part does, how it makes repo-local SSH signing completely painless, and, yes, why I even bothered writing it (spoiler: I just wanted my commits to look **cool**).

## Motivation

I've always loved tinkering with my Git workflow, and after seeing people with little "Verified" badges next to their commits, I thought: why not me? The built-in GPG signing is heavyweight and global, so I ended up writing a small helper that:

- creates a dedicated signing key,
- configures only the current repo,
- optionally rewrites history to sign old commits,
- and lets you carry the key between machines.

Honestly, the need was mostly vanity. My personal projects impose no signing requirements, but seeing a green "Verified" badge on a commit does have an effect, and writing that script in shell was genuinely fun.

> Signing your commits is a bit like wearing a leather jacket to a code review -- totally useless, but it makes you feel like a hacker.

## What the script does

The script is a single Bash file with `set -euo pipefail` at the top to abort on the first error. Here's a summary of what it does:

1. **Generate or import a signing key**
   Keys land in `.git-signing/` in the directory where you run it.
2. **Configure Git locally**
   It sets `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, and an `allowedSignersFile` pointing at the public key.
3. **Move keys between machines**
   With `--export-keys` / `--import-keys`, you can transfer your private key from one machine to another without touching the global config.
4. **Optional history rewrite** (`--resign-all`)
   Rewrites all commits on all branches/tags and re-signs them with `-S`, without touching the other authors.
5. **Utility flags**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` for non-interactive mode, etc.
6. **Fork detection and safety checks**
   It detects the `upstream` remote, warns before rewriting history, checks required tools (`git`, `ssh-keygen`, `zip/unzip`), makes sure permissions are right, and even creates a secure copy of the key if the filesystem permissions are too loose.

The script is idempotent: running it twice doesn't regenerate your key or overwrite the existing config.

## Step-by-step walkthrough

Here are a few key excerpts from the code with their explanations.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

The header sets the safety ground rules and documents the goal. The next chunk parses CLI options (`--name`, `--email`, `--repo`, etc.) with a `while [[ $# -gt 0 ]]; do case … esac done` loop. The required identity fields are checked later:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Key generation happens in `$LAUNCH_DIR/.git-signing`. If a key already exists, the script keeps it as is; `--import-keys` fills the directory from a ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

After verifying the private key is usable (`ssh-keygen -Y sign …`), the script writes an `allowed_signers` file containing the public key and sets the local Git config:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

If you ask for a history rewrite with `--resign-all`, the script builds a `git filter-branch` command that re-signs eligible commits with `-S`. It respects fork state by optionally skipping commits already present in `upstream`.

The final output prints the public key and instructions for adding it in GitHub's **Signing Key** section, with a test recipe.

## Why sign your commits?

This is where I admit I didn't need it. My repos require no provenance for what I publish, and I don't use signed tags for releases. The "why" is:

- because I could,
- because it looks good (you saw the badge?),
- because it gave me an excuse to experiment with `git filter-branch` and shell,
- and because it's one more "I built this myself" for the blog.

In short, it was just for showing off, but that's what I love about tinkering with my tools.

## Usage examples

```bash
# initial setup in the current repo
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# export keys for another machine
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# import keys on a second machine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# rewrite history and push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Final thoughts

This script stays a compact utility, but it carries a few principles I stand by:

- keep cryptographic keys local and per-repo,
- never touch the global config unless you ask,
- provide simple import/export and history rewrite,
- and document the whole process in a blog article to keep a reusable record.

If you feel like adding signatures to your own commits, give it a try! And if you're just here for the style, same. 😎
