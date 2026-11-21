---
title: "5 Sneaky Ways to Use GitHub Actions (and What They Teach About Secrets)"
description: "A CI runner turned free VPS, a bot that opens its own pull requests, an npm publish with zero secrets. A tour of my repos listing the GitHub Actions patterns that go beyond plain \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+u6hr8+9604aDyhyEGX044E1VtSyenVS+foOIRc++exBSdVtohzORy/zd3a1AfTTJZw88pzfmf4MZkJWKulMpQ=="
---

# 5 Sneaky Ways to Use GitHub Actions

GitHub Actions, on paper, is for classic CI/CD: you push, it lints, it tests, it deploys. I already wrote about one special case (using git tags as a database for an email bot, see the dedicated article). But digging through my own repos, there are enough different patterns to fill a standalone article, less centered on one project, more of a technique catalog.

Five uses, from the most classic to the most twisted.

## 1. A git tag as persistent state between two runs

Quick reminder, the full detail is in the `email-autoreply` article. GitHub Actions is stateless by design: every run starts from a pristine machine. The workaround: storing a value (an ID, a timestamp, any small state) in a dedicated git tag, never in a branch.

```bash
# read state
git show refs/tags/lastid:data/lastId > data/lastId

# write state (orphan branch, single commit, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

The key point: an orphan branch to never accumulate history, and a forced tag instead of a branch to avoid polluting the repo's branch list.

## 2. A git tag as precompiled build cache

Same family of ideas, different use: instead of storing application state, you store a **build artifact**. The `build` job compiles the code once (on push to `master`), then pushes `dist/` + `node_modules/` into a `runtime` tag. The `cron` job, in turn, directly checks out that tag instead of running `bun install && bun run build` on every execution:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# no install, no build -- the code is already ready
- run: node dist/index.js --action
```

That changes the run from ~20s to ~10s. On a cron that runs often, it counts. `actions/cache` does similar work (caching dependencies), but a git tag is more direct when you want to outright freeze a versioned artifact and point at it explicitly, rather than just speeding up an `npm install`.

## 3. One mandatory check that aggregates several jobs

A small pattern that looks like nothing but changes your life in protected-branch configuration. On `konosuba-rpg`, CI has three independent jobs (`typecheck`, `lint`, `tests`) running in parallel, and a fourth job, `test-battery`, that does nothing but depend on the first three:

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

Without that facade job, configuring a protected branch would require ticking three separate mandatory checks, and updating that list every time a job is added or renamed. With `test-battery`, a single name to tick in the repo settings, which stays stable even as the internal detail changes.

## 4. Turning a free runner into a temporary VPS

This one is the most twisted of all, and clearly my favorite: `repo-to-vps` fully repurposes an intended GitHub Actions runner into a Linux machine reachable over SSH, free, for up to 6 hours (the max limit of a job).

The principle: a job that does almost nothing but launch [tmate](https://tmate.io/) (a tmux fork that exposes a terminal session shareable over SSH or browser):

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

The real headache is that a GitHub Actions runner's filesystem is **throwaway**: as soon as the job ends, everything vanishes. An SSH session that lasts hours is useless if everything you do in it evaporates on the next run. The solution: a git branch that acts as a live snapshot of the filesystem, synced continuously.

The `start-tmate.sh` script does, in order:

1. **Restores** the filesystem from a dedicated `filesystem` branch at job start (`git reset --hard` onto it).
2. **Watches** file changes with `inotifywait` continuously, and **commits + pushes immediately** as soon as a file moves:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Each save **amends** the previous commit instead of creating a new one (`git commit --amend --no-edit`), so the `filesystem` branch always stays at a single commit, which avoids accumulating thousands of snapshots.
4. A `while true` loop relaunches `tmate` automatically if the session dies, with `remain-on-exit on` so the terminal stays reachable even after an `exit`.
5. The SSH URL generated by tmate is written into a `host.conf` file, committed on the `filesystem` branch, so it's retrievable via the GitHub API (`gh api .../contents/host.conf`) without ever having had access to the job's live logs.
6. A `periodic_save` routine runs every 5 seconds in the background, in case `inotifywait` misses an event.

Result: a full Linux shell, reachable from anywhere, with a filesystem that persists between sessions, even though the underlying infrastructure (a GitHub Actions runner) was never designed for that. The only real limit is the 6h timeout per job: after that you have to restart the workflow.

## 5. A bot that opens its own pull requests

On `konosuba-rpg`, a push to the `dev` branch triggers a job that checks whether an open pull request to `main` already exists, and creates one automatically if not, via `actions/github-script` and the GitHub REST API:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // nothing to propose

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // already an open PR

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

The detail that matters here is the token used. This workflow does **not** use the automatic `GITHUB_TOKEN`: it requires a separate `AUTO_PR_TOKEN` secret, and refuses to continue if it's missing:

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Publishing to npm with zero secrets

The most discreet of the five, but probably the most important for the future: the `publish.yml` workflow of `typescript-virtual-container` contains **no npm secret**. No `NPM_TOKEN`, no `NODE_AUTH_TOKEN`. Just this:

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` still works, because the npm registry now supports **trusted publishing** via OIDC: the workflow proves its identity directly to the registry (exact repo + workflow, configured on npmjs.org), without any static token transiting or stored anywhere. Zero secrets to leak, zero tokens to rotate every six months.

---

## GitHub Secrets, in depth

These five patterns all touch, one way or another, on the secrets question. A few principles that come up everywhere in my workflows:

**A secret is not necessarily a simple string.** In `email-autoreply`, `ACCOUNTS_JSON` holds the entire minified JSON of the multi-account config: a full data structure rather than a simple API key, injected as-is into a file at runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

That avoids having to commit a config file, even an encrypted one, and it updates in one click in the repo settings without touching the code.

**`GITHUB_TOKEN` has precise limits, and that's by design.** The automatic token GitHub injects into every run is powerful, but sealed on certain points: by default, it cannot trigger another workflow, and depending on the repo configuration it can be blocked by branch protection rules. That's exactly why `create-pull-request.yml` requires a separate PAT (`AUTO_PR_TOKEN`): a token from a real account (or a GitHub App), with explicit `contents:write` + `pull-requests:write` rights, distinct from the job's ephemeral token.

**Permissions scope job by job, not globally.** Every workflow I listed here declares a minimal, commented `permissions:` block:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

The default `GITHUB_TOKEN` historically has fairly broad rights on a public repo; explicitly restricting it to what the job actually needs limits the damage if a third-party action in the chain (`uses: someone/action@version`) turns out compromised.

**The best secret is the one that doesn't exist.** The `typescript-virtual-container` OIDC pattern is the most polished version of that idea: instead of managing rotation, expiration, and leak risk of an `NPM_TOKEN`, the workflow cryptographically proves its identity (this exact repo, this exact workflow) directly to the third-party service. Same logic available for AWS, Docker Hub, PyPI: more and more registries and clouds support OIDC from GitHub Actions.

---

**3 key points**

1. An orphan, force-pushed git tag can serve as a minimalist database or a precompiled build cache: two distinct uses of the same mechanism.
2. A free GitHub Actions runner can become a persistent SSH shell if you accept syncing its filesystem continuously to a git branch, with autosave via `inotifywait` and a single amended commit.
3. The default `GITHUB_TOKEN` is deliberately limited: creating cross-branch PRs or publishing without secrets requires either a dedicated PAT or a move to OIDC trusted publishing.
