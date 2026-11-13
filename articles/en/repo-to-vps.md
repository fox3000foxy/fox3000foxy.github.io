---
title: "Repo to VPS: Turning GitHub Actions Into a Free VPS With Persistent Storage"
description: How to turn a GitHub Actions runner into a permanent VPS with git as persistent storage -- tmate, inotify, and commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zbNLpAPfAWxFbeaNuy09ubaSVU4E4MYUxb/wuIW6fkEbMGVqukqXBR3I0ltIFnH4U4sLxMhj4Oy2Qp/7rzEAfg=="
---

## GitHub gives you a free VPS for 6h. I figured out how to make it permanent.

GitHub Actions gives you free Linux machines.

Like, real Ubuntu servers. 2 cores, 7 GB RAM, 14 GB disk. Free. For 6h per run.

The only "problem": at the end of the run, everything is wiped. The machine is disposable. You install packages, you code, you configure... and poof, at the end it all disappears. As if you'd done nothing.

Unless.

Unless you use **git as a hard drive**.

And then, suddenly, you have a free VPS with a persistent disk that survives runs. You reconnect, everything is still there. You pick up where you left off.

It's completely broken. Let me explain.

---

## Context: GitHub Actions runners

When you launch a GitHub Actions workflow, GitHub hands you a VM.

It's made to build your code, run your tests, deploy. The workflow runs, does its job, and the machine is destroyed.

But nothing stops you from doing something else with that VM. Like opening an SSH shell on it and using it as a server.

The constraint is that those machines are **stateless** and **temporary**:
- Temporary: 6h max per run (`timeout-minutes: 360`, GitHub's ceiling)
- Stateless: everything is wiped at the end

So to make a usable VPS out of it, you have to solve two problems:
1. **How to connect to it live?**
2. **How to keep the disk between two runs?**

That's where it gets into nasty-hack territory.

---

## Problem 1: live SSH with tmate

**tmate** is a tmux fork that creates a shareable SSH session.

You launch it on a machine, it generates two links:
- an SSH URL (`ssh xxx@nyc1.tmate.io`)
- a web URL (terminal in the browser)

You connect with one of those links, and boom, you're in a shell on the machine. Live.

So the workflow launches tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# fetch the connection links
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

And those links are written straight into the repo README by a Python script. You open your repo, you see the connection link, you click. There you are in your VPS.

First problem solved. But the second one is the truly wild one.

---

## Problem 2: git as a hard drive

Here's the idea that changes everything.

The machine is wiped every run. So we store **the filesystem in a dedicated git branch**, called `filesystem`.

On startup, the script restores state from that branch:

```bash
filesystem_branch="filesystem"

# fetch the filesystem branch from the remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore the workspace from that branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

The `filesystem` branch IS your hard drive. Your files, your installs, your configs -- all in it.

See the idea? The machine is disposable, but the disk lives in git. You relaunch the workflow, the disk is restored, you pick up exactly where you were.

It's like a VPS that hibernates. Except hibernation is a git repo.

### First launch: creating the empty disk

On the very first run, the `filesystem` branch doesn't exist yet. You have to create it. And it's not trivial:

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

`git checkout --orphan` is the key. An orphan branch is a branch **with no history** -- like starting from an empty repo.

Why orphan? Because you do NOT want your persistent disk dragging along your whole source code history. The disk stays isolated, with its own life. It starts pristine.

And the `git ls-remote --exit-code` at the start is just a clean check: "does the branch already exist on the remote?" If yes, don't touch anything. If no, create it. Idempotent, as we like it.

### Selective git clean: protecting caches

This line deserves a closer look:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` nukes EVERYTHING not tracked by git. Normally that's violent -- it deep-cleans the workspace.

But the `-e` (exclude) flags protect certain files:
- `.apt-cache` → the APT package cache (we'll come back to it, it's clever)
- `.cache` → generic cache
- `host.conf` → the session's SSH address
- `tmate.sock` → the current tmate session socket

If you cleaned those files, you'd break the active session or lose your cache. So we spare them during reset.

A detail that looks trivial at first glance, but without it everything blows up.

---

## Autosave: inotify watching everything

OK, but how do files end up in the `filesystem` branch?

Answer: a watcher that monitors ALL file changes and auto commits/pushes.

The magic tool is **inotifywait** (from the `inotify-tools` package). It watches the filesystem at kernel level and fires as soon as a file changes.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce if many changes at once
  done
}

autosave &
```

Let's break down the inotify flags, because each one counts:
- `-r` → recursive, watches all subfolders
- `-e modify,create,delete,move` → reacts to those 4 event types
- `--exclude '...'` → a regex to ignore certain files

The `--exclude` is crucial. Look at what it ignores:
- `.git` → obviously, otherwise every commit would trigger an autosave which would trigger a commit... infinite loop. Catastrophe.
- `.apt-cache` and `.cache` → caches, which change all the time and we don't want to spam git with
- `host.conf` and `tmate.sock` → session files, which move constantly
- `.gitignore`, `.txt.swp` → temp files (`.swp` are vim edit files)

Without that exclude, you'd end up with an autosave firing in a loop on its own changes. The `.git` in the list is THE line stopping you from shooting yourself in the foot.

You edit a file? inotify detects it instantly, it commits, it pushes. In under a second, your change is in the `filesystem` branch.

You install a package, write code, touch a config -- everything is saved in real time, automatically, without you doing anything.

You literally have an automatic full-disk backup system. Broken.

### Debounce: don't spam git

The `sleep 1` after each save is a **debounce**.

When you save a file in an editor, it often generates several filesystem events in a burst (temp file creation, rename, old file deletion...). Without debounce, you'd trigger 3-4 commits for a single save.

The `sleep 1` says: "wait a second after a save, let the burst settle, before listening again". That groups close-together changes into one commit. Clever.

### Plus a periodic save

In case inotify misses an event, there's also a save every 5 seconds:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # fetch any remote changes
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Belt AND suspenders. We really don't want to lose disk state.

---

## The clever detail: a single commit

If you commit on every file change, you accumulate thousands of commits. In an hour-long session, your git history explodes. The repo gets huge. It's disgusting.

The elegant solution: **amend the existing commit** instead of creating a new one.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock so two saves never run at once

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # don't touch scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: replace the previous commit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` means: "replace the last commit with this one".

So the `filesystem` branch ALWAYS has a single commit. No matter how many times you save. It's just a snapshot of the current state, force-pushed over and over.

The `flock` is a lock: since there are two save loops (inotify + periodic), you must avoid them running git at the same time and stepping on each other. One git process at a time.

Clean.

---

## sync_from_remote: handling multiple sessions

Here's a case you don't think about at first: what if you launch TWO runs at once? Or if a session modifies the `filesystem` branch while another is running?

The script handles that with a `sync_from_remote` before each commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

The `--ff-only` (fast-forward only) matters: it means "merge ONLY if we can advance cleanly, without creating a merge commit".

If both branches diverged (say, two sessions edited different files), the fast-forward fails silently (`2>/dev/null || true`) and we keep local state. It's not a perfect merge system, but it avoids corruption in the simple case where a single session runs.

Honestly, don't launch 3 sessions in parallel on the same repo. But the code still tries not to blow up if it happens. That's defense.

---

## The APT cache: installing fast

There's a detail in the workflow that looks unremarkable but is well thought out:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate and inotify-tools are installed via an action that **caches APT packages**.

First run, it downloads and installs. On later runs, it's restored from the GitHub Actions cache -- faster, no re-downloading.

And remember the `git clean -fdx -e .apt-cache` from earlier? It's related. The `.apt-cache` folder is protected from cleanup precisely so packages you install during your session can persist a minimum.

It all holds together. I thought through the full lifecycle.

---

## Scripts hidden in /tmp

Another sneaky but clever detail. At the very start of the script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

The scripts (`update_readme.py`, etc.) are copied into `/tmp` BEFORE touching the `filesystem` branch.

Why? Because when you do the `git reset --hard` to the `filesystem` branch (empty at first, or holding your disk), the `.github/scripts` files from the source repo disappear from the workspace.

But the script still needs them during the session (to update the README on every tmate relaunch). So it stashes them in `/tmp`, out of git's reach:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

If you don't think of that, you spend 30 minutes wondering why your script vanished. I thought of it.

---

## The custom shell

Small comfort: the session gives you a configured shell, not a bare bash.

`prestart.sh` copies a custom `.bashrc`:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

And that `.bashrc` holds a colored prompt, aliases (`ll`, `lla`, `rm -i`), and above all an `exit` override:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D does the same as exit
bind -x '"\C-d": "exit"'
```

When you type `exit` (or Ctrl+D), it cleanly kills tmate processes before closing. That avoids leaving zombie tmate sessions.

There's also a `tmate-detach` function if you want to disconnect WITHOUT killing the session (to reconnect later). Comfort detail, but it shows the level of care.

---

## tmate relaunching itself

Small comfort: if you type `exit` in your shell, normally the tmate session dies and you're disconnected for good.

Except here, tmate sits in a `while true` loop:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

You `exit`? The session restarts on its own. You reconnect with the same link.

It's dumb, but it makes the session usable.

---

## Reconnecting in one command

How do you reconnect after a disconnect, without digging through run logs every time?

tmate's SSH address is written into a `host.conf` file, committed in the `filesystem` branch:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

And since that file is in git, you can fetch it via the GitHub API with a single command:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

You run that, it fetches the current SSH address from the repo, and connects you. Even if the address changed between sessions.

---

## The full flow

Let's recap:

1. You trigger the workflow (push or manual button)
2. GitHub hands you an Ubuntu VM
3. The script restores the disk from the "filesystem" branch
4. inotify starts watching all changes
5. periodic_save commits every 5s as backup
6. tmate starts → generates the SSH/web links
7. The links are written into the README + host.conf
8. You connect with ssh or the web terminal
9. You do whatever you want -- every file change = autosave
10. 6h later, GitHub kills the VM
11. Your disk is intact in the "filesystem" branch
12. You relaunch the workflow → back to step 3, everything is still there

A free VPS with persistent disk. Just with git and GitHub Actions.

---

## OK, let's be honest: the limits

It's a hack, not a real VPS. So:

- **6h max per run.** You have to relaunch the workflow regularly. Uptime limited per run.
- **For dev and tinkering.** You're not hosting your site on this. It's for exploring, dev, debug, testing a throwaway-but-recoverable Linux environment.
- **GitHub sees everything.** It's their machines. Don't put anything sensitive on it.
- **Keep the repo private.** You're exposing an SSH shell. A public repo = anyone could potentially connect. Bad idea.
- **It's at the edge of the terms of use.** GitHub Actions is made for CI/CD, not free VPS. So use sparingly, for legit stuff, without abusing.

### The real Achilles heel: git hates big files

Git is made for text, not for a filesystem.

The persistent disk lives in a git branch. So everything you save goes through git. And git:
- handles big binary files badly (a 2GB Docker image in git? forget it)
- has a 100MB per-file hard limit on GitHub (it just won't push beyond)
- recommends staying under ~5GB per repo

So if you `npm install` a project with 500MB of `node_modules`, or build a project generating heavy binaries, the push to `filesystem` will either crawl or flat-out fail.

`git commit --amend` helps (one commit, no growing history), but it changes nothing about a 200MB file never passing through.

Basically: **it works great for code, configs, small files. It doesn't work for storing big data or build artifacts.** Keep that in mind for what you do in your session.

### It's not a full system snapshot

Another important nuance: the `filesystem` branch saves the **workspace** (the repo folder), not the whole system.

If you `apt install htop`, the binary lands in `/usr/bin/htop`, which is OUTSIDE the workspace. So it will NOT be saved. Next run, you have to reinstall it.

That's why there's the APT cache and `prestart.sh`: to re-prepare the system environment on every startup, since only the workspace persists.

If you want your installs to survive, put them in the workspace (like installing into a local folder instead of system-wide). It's a discipline to pick up.

---

## Free VPS vs real VPS: the matchup

| | repo-to-vps | Real VPS (€5/month) |
|---|---|---|
| **Price** | 0€ | ~€5-10/month |
| **Uptime** | 6h, relaunch needed | 24/7 |
| **Disk** | git branch, small files | real SSD, several GB |
| **RAM** | ~7GB (generous!) | 1-2GB usually |
| **CPU** | 2-4 decent cores | 1-2 vCPU |
| **Setup** | clone a template | manual config |
| **Persistence** | workspace only | full system |
| **Legitimacy** | edge of ToS | 100% clean |

The interesting bit is that on raw specs (RAM, CPU), the GitHub runner is often BETTER than a €5 VPS. But the 6h uptime and workspace-only persistence make it a hacker toy, not a real server.

For learning, testing, debugging a Linux system quickly in a recoverable environment? Perfect. For hosting anything serious? Get a real VPS.

But for a temporary Linux environment you can restore at will? It's just awesome.

---

## The pattern behind it all

If you step back, repo-to-vps and the email bot (my other article) rest on the same idea:

> Git isn't just a version manager. It's a free, versioned persistent storage system, reachable via an API.

Whenever you have a stateless system (GitHub Actions, a Worker, a serverless function) and want to keep state between two runs, git can serve as "disk".

- The email bot stores a `lastId` in a git tag.
- repo-to-vps stores a whole filesystem in a git branch.

Same pattern, two scales. One value on one side, one disk on the other.

And `git commit --amend` + force-push is the common technique: **you keep a single commit representing the current state, overwritten on every update.**

It's not made for that. But it works. And it's free.

---

**3 key points:**

1. **A git branch = a persistent hard drive** -- Store your filesystem in a dedicated branch, restore on startup, and you have state surviving disposable machines.

2. **inotify + git = real-time autosave** -- `inotifywait` watches changes at kernel level and pushes to git instantly. With `git commit --amend` to keep a single clean commit.

3. **tmate turns a runner into a VPS** -- Live SSH onto a GitHub Actions machine, with auto-restart and one-command reconnection via the GitHub API.

Git as a hard drive, episode two. I think I'll end up storing everything in git branches.
