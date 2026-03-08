# SSH commit signing script explained

This post dives into the `setup-ssh-signing.sh` script I published on [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). We'll look at what each part does, how it makes repository‑local SSH commit signing painless, and, yes, why I even bothered to write it in the first place (spoiler: I just wanted my commits to look **stylish**).

## Motivation

I’ve always loved tweaking my Git workflow, and after seeing other people with little “Verified” badges next to their commits I thought: why not me? The built‑in GPG signing is a bit heavy and global, so I ended up writing a tiny helper that:

- creates an SSH key just for signing,
- configures the current repository only,
- optionally rewrites history to sign old commits,
- and lets me ship the key between machines.

Really, the need was mostly vanity. There’s no technical requirement for signatures in my personal projects, but having a green “Verified” on a commit feels cool, and writing the script was a fun exercise in shell scripting.

> I mean, signing your commits is like wearing a leather jacket to a code review — totally unnecessary, but it makes you feel like a hacker.

## What the script does

The script is a single Bash file with `set -euo pipefail` at the top so it fails fast. Here’s a high‑level summary of its behaviour:

1. **Generate or import a signing key**  
   Keys live in `.git-signing/` under the directory where you run the script.
2. **Configure Git locally**  
   Sets `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, and an `allowedSignersFile` pointing to the public key.
3. **Manage keys cross‑machine**  
   Support for `--export-keys`/`--import-keys` lets you move the private key between computers without touching global state.
4. **Optional history rewrite** (`--resign-all`)  
   Rewrites every commit on every branch/tag (or just those not in `upstream` for forks) and re‑commits them with `-S`, leaving other authors untouched.
5. **Utility flags**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` for non‑interactive mode, etc.
6. **Fork‑awareness and safety checks**  
   Detects `upstream` remote, warns before rewriting history, checks for required tools (`git`, `ssh-keygen`, `zip/unzip`), ensures proper permissions, and even creates a secure runtime copy of the key if filesystem permissions are too loose.

The script is idempotent: running it twice won’t regenerate your key or overwrite existing configuration.

## Step‑by‑step walkthrough

Below are some of the key parts of the code with explanations.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

The header establishes safety and documents the goal. The next chunk parses CLI options (`--name`, `--email`, `--repo`, etc.) with a `while [[ $# -gt 0 ]]; do case … esac done` loop. Mandatory identity fields are enforced later:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Key generation happens under `$LAUNCH_DIR/.git-signing`. If a key already exists the script leaves it alone; `--import-keys` can populate the directory from a ZIP file.

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

After ensuring the private key is usable (`ssh-keygen -Y sign …`), the script writes a tiny `allowed_signers` file containing the public key and sets the Git local config accordingly:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

If you request history rewriting with `--resign-all`, the script builds a `git filter-branch` command that re‑commits eligible commits with `-S`. It respects fork state by optionally skipping commits already present in `upstream`.

The final output prints the public key and instructions for adding it to GitHub’s **Signing Key** section, along with a quick test recipe.

## Why commit signing?

This is the part where I admit I didn’t need it. My repositories don’t require provenance for anything I publish, and I’m not using signed tags for releases. The “why” is:

- because I could,
- because it looks neat (have you seen the badge?),
- because it gave me an excuse to experiment with `git filter-branch` and shell scripting,
- and because it’s another piece of “I built this myself” content for the blog.

In short: it was just for show, but that’s half the fun of tinkering with tooling.

## Usage examples

```bash
# initial setup in current repo
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# export keys to use on another machine
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# import keys on second machine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# rewrite history and push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Final thoughts

This script is a small utility, but it encapsulates a few nice ideas:

- keep cryptographic keys local and per‑repo,
- never touch global config unless you ask for it,
- provide simple import/export and history rewriting,
- and document the whole process in a blog post because why not.

If you’re tempted to add signatures to your own commits, give it a spin! And if you’re just here for the style points, same. 😎

*(AI generated)*
