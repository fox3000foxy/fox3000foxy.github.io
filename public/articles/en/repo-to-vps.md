## GitHub gives you a free VPS for 6h. I found how to make it permanent.

GitHub Actions gives you free Linux machines.

Like, real Ubuntu servers. 2 cores, 7 GB RAM, 14 GB disk. Free. For 6h per run.

The only "problem": at the end of the run, everything gets wiped. The machine is disposable. You install stuff, you code, you configure... and poof, at the end everything disappears. Like you did nothing.

Except if.

Except if you use **git as a hard drive**.

And just like that, you've got a free VPS with persistent storage that survives runs. You reconnect, everything's still there. You pick up right where you left off.

It's completely busted. Let me explain xD

---

## The context: GitHub Actions runners

When you launch a GitHub Actions workflow, GitHub hands you a VM.

It's meant to build your code, run your tests, deploy. The workflow runs, does its thing, and the machine gets destroyed.

But nothing's stopping you from... doing something else with that VM. Like, opening an SSH shell on it and using it as a server.

The thing is, these machines are **stateless** and **temporary**:
- Temporary: 6h max per run (`timeout-minutes: 360`, GitHub's ceiling)
- Stateless: everything gets wiped at the end

So to turn it into a usable VPS, you gotta solve two problems:
1. **How do you connect to it in real time?**
2. **How do you keep the disk between runs?**

That's where it becomes a dirty genius hack.

---

## Problem 1: live SSH with tmate

**tmate** is a fork of tmux that creates a shareable SSH session.

You launch it on a machine, it generates two links:
- an SSH URL (`ssh xxx@nyc1.tmate.io`)
- a web URL (terminal in the browser)

You connect with one of those links, and boom, you're in a shell on the machine. In real time.

So the workflow launches tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# grab the connection links
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

And these links get written straight to the repo's README by a Python script. You open your repo, you see the connection link, you click. There you are in your VPS.

First problem solved. But the second one is really wild.

---

## Problem 2: git as a hard drive

Here's the crazy thing.

The machine gets wiped every run. So we store **the filesystem in a dedicated git branch** called `filesystem`.

On startup, the script restores the state from that branch:

```bash
filesystem_branch="filesystem"

# fetch the filesystem branch from remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore the workspace from that branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

The `filesystem` branch IS your hard drive. Your files, your installs, your configs -- it's all in there.

You see the trick? The machine is disposable, but the disk lives in git. You restart the workflow, the disk is restored, you pick up exactly where you left off.

It's like a VPS that hibernates. Except the hibernation is a git repo xD

### First launch: creating the empty disk

On the very first run, the `filesystem` branch doesn't exist yet. Gotta create it. And it's not trivial:

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

`git checkout --orphan` is the key. An orphan branch is a branch **with no history whatsoever** -- like starting from an empty repo.

Why orphan? Because you DON'T want your persistent disk dragging along all your source code history. The disk is its own thing, with its own life. It starts blank.

And the `git ls-remote --exit-code` at the start is just a clean check: "does this branch already exist on the remote?" If yes, don't touch anything. If no, create it. Idempotent, as we like it.

### Selective git clean: protecting caches

This line deserves a pause:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` nukes EVERYTHING not tracked by git. Normally that's violent -- it deep-cleans the workspace.

But the `-e` (exclude) flags protect certain things:
- `.apt-cache` → APT package cache (we'll get back to this, it's clever)
- `.cache` → generic cache
- `host.conf` → session SSH address
- `tmate.sock` → current tmate session socket

If you cleaned those files, you'd break the active session or lose your cache. So they get spared during the reset.

It's the kind of detail you don't notice at first glance, but makes the difference between "it works" and "it actually works".

---

## Autosave: inotify watching everything

Alright, but how do files end up in the `filesystem` branch?

Answer: a watcher that monitors ALL file changes and commits/pushes automatically.

The magic tool is **inotifywait** (from the `inotify-tools` package). It watches the filesystem at the kernel level and triggers whenever a file changes.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce if lots of changes at once
  done
}

autosave &
```

Let's break down the inotify flags, because each one matters:
- `-r` → recursive, watches all subdirectories
- `-e modify,create,delete,move` → reacts to these 4 event types (modify, create, delete, move)
- `--exclude '...'` → a regex to ignore certain files

The `--exclude` is crucial. Look what it ignores:
- `.git` → obviously, otherwise each commit would trigger an autosave which would trigger a commit... infinite loop. Disaster.
- `.apt-cache` and `.cache` → caches that change all the time and we don't want to spam in git
- `host.conf` and `tmate.sock` → session files that change constantly
- `.gitignore`, `.txt.swp` → temporary files (`.swp` are vim's edit files)

Without this exclude, you'd get an autosave looping on its own changes. The `.git` in the list is THE line that keeps you from shooting yourself in the foot.

You modify a file? inotify detects it instantly, it commits, it pushes. In under a second, your change is in the `filesystem` branch.

You install something, write code, touch a config -- everything is saved in real time, automatically, without you doing a thing.

You literally have an auto-save system for your entire disk. Broken.

### The debounce: don't spam git

The `sleep 1` after each save is a **debounce**.

When you save a file in an editor, it often generates multiple filesystem events in a burst (create a temp file, rename, delete the old one...). Without debounce, you'd trigger 3-4 commits for a single save.

The `sleep 1` says: "wait one second after a save, let the burst settle, then listen again." It groups nearby changes into a single commit. Clever.

### And a periodic save on top

In case inotify misses something, there's also a save every 5 seconds:

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

Belt AND suspenders. We really don't want to lose the disk state.

---

## The clever detail: a single commit

If you commit on every file change, you'll pile up... thousands of commits. After an hour of session, your git history explodes. The repo gets huge. It's disgusting.

The solution is elegant: **we amend the existing commit** instead of creating a new one.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock so two saves don't run at the same time

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # don't touch the scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: overwrites the previous commit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` means: "replace the last commit with this one."

So the `filesystem` branch ALWAYS has a single commit. No matter how many times you save. It's just a snapshot of the current state, force-pushed over and over.

The `flock` is a lock: since there are two save loops (inotify + periodic), you gotta prevent them from running git at the same time and stepping on each other. One git process at a time.

Clean.

---

## sync_from_remote: handling multiple sessions

Here's something you don't think about at first: what if you launch TWO runs at the same time? Or if one session modifies the `filesystem` branch while another is running?

The script handles this with a `sync_from_remote` before each commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

The `--ff-only` (fast-forward only) is important: it means "merge ONLY if we can advance cleanly, without creating a merge commit."

If the two branches have diverged (like, two sessions modified different things), the fast-forward silently fails (`2>/dev/null || true`) and we keep the local state. It's not a perfect merge system, but it avoids corruption in the simple case where only one session is running.

Honestly, you shouldn't launch 3 parallel sessions on the same repo. But the code still tries not to explode if it happens. That's defense.

---

## The APT cache: install fast

There's a detail in the workflow that doesn't look like much but is well thought out:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate and inotify-tools are installed via an action that **caches APT packages**.

On the first run, it downloads and installs. On subsequent runs, it's restored from the GitHub Actions cache -- faster, no need to re-download.

And remember the `git clean -fdx -e .apt-cache` from earlier? It's related. The `.apt-cache` folder is protected from cleanup precisely so the packages you install during your session can persist a bit.

Everything is connected. The guy thought through the entire lifecycle.

---

## Scripts stashed in /tmp

Another vicious but clever detail. Right at the start of the script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

The scripts (`update_readme.py`, etc.) are copied to `/tmp` BEFORE touching the `filesystem` branch.

Why? Because when you do the `git reset --hard` to the `filesystem` branch (which is empty at first, or contains your disk), the `.github/scripts` files from the source repo disappear from the workspace.

But the script still needs them during the session (to update the README each time tmate restarts). So it stashes them in `/tmp`, out of git's reach, ready to be called later:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

This is the kind of bug that bites you in the ass if you don't think about it: "why did my script disappear?" He thought about it.

---

## The custom shell

A little final comfort: the session gives you a configured shell, not a bare bash.

The `prestart.sh` copies a custom `.bashrc`:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc   # same for root via sudo
```

And this `.bashrc` has a colored prompt, aliases (`ll`, `lla`, `rm -i`), and most importantly a clever `exit` override:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D does the same as exit
bind -x '"\C-d": "exit"'
```

When you type `exit` (or Ctrl+D), it cleanly kills the tmate processes before closing. This avoids leaving zombie tmate sessions hanging around on the machine.

There's also a `tmate-detach` function if you want to disconnect WITHOUT killing the session (to reconnect later). Comfort detail, but it shows the level of care.

---

## tmate that restarts itself

Little comfort: if you type `exit` in your shell, normally the tmate session dies and you're disconnected for good.

Except here, tmate is in a `while true` loop:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  # ... generates links, updates README ...

  # wait for the tmate session to die
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

You `exit`? The session restarts by itself. You can reconnect with the same link. Stable reconnection, even after a disconnect.

It's the kind of detail that transforms a scrappy hack into something actually usable.

---

## Reconnecting in one command

How do you reconnect after a disconnect, without digging through run logs every time?

The tmate SSH address gets written to a `host.conf` file, itself committed to the `filesystem` branch:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

And since this file is in git, you can grab it via the GitHub API with a single command:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

You run that, it fetches the current SSH address from the repo, and connects you directly. Even if the address changed between sessions.

So smooth.

---

## The full flow

Here's the recap:

```
1. You trigger the workflow (push or manual button)
2. GitHub gives you an Ubuntu VM
3. The script restores the disk from the "filesystem" branch
4. inotify starts watching all changes
5. periodic_save commits every 5s as backup
6. tmate starts → generates SSH/web links
7. The links are written to the README + host.conf
8. You connect via ssh or the web terminal
9. You do whatever you want (code, install, debug...)
   └── every file change = instant autosave to git
10. 6h later, GitHub kills the VM
11. But your disk is intact in the "filesystem" branch
12. You restart the workflow → back to step 3, everything's still there
```

A VPS. Free. With persistent storage. Just using git and GitHub Actions.

---

## Alright, gotta be honest: the limits

It's a hack, not a real VPS. So:

- **6h max per run.** Gotta restart the workflow regularly. No infinite uptime.
- **Not for production.** You're not gonna host your site on this. It's for exploring, dev, debug, testing stuff in a disposable-but-recoverable Linux.
- **GitHub sees everything.** It's their machines. Don't put anything sensitive.
- **Keep the repo private.** You're exposing an SSH shell. A public repo = anyone can potentially connect. Bad idea.
- **It's pushing the ToS.** GitHub Actions is meant for CI/CD, not free VPS. So use it sparingly, for legit stuff, without abusing it.

### The real Achilles heel: git hates big files

There's a more technical limit, and it's the most important one to understand.

**Git is made for text, not for a filesystem.**

The persistent disk lives in a git branch. So everything you save goes through git. And git:
- handles large binary files poorly (a 2 GB Docker image in git? forget it)
- has a 100 MB per file hard limit on GitHub (you can't push past it)
- recommends staying under ~5 GB per repo

So if you `npm install` a project with 500 MB of `node_modules`, or you build something that spits out heavy binaries, the push to `filesystem` will either crawl or fail outright.

The `git commit --amend` helps (one commit, no bloating history), but it doesn't change the fact that a 200 MB file will never make it.

Basically: **it works great for code, configs, small files. It does NOT work for storing large data or binary artifacts.** Gotta keep that in mind for what you do in your session.

### It's not a full system snapshot

Another important nuance: the `filesystem` branch saves the **workspace** (the repo folder), not the entire system.

If you run `apt install htop`, the binary goes to `/usr/bin/htop`, which is OUTSIDE the workspace. So it won't be saved. On the next run, you'll need to reinstall it.

That's why there's the APT cache and `prestart.sh`: to re-prep the system environment on each startup, since only the workspace persists.

If you want your installs to survive, you gotta put them in the workspace (like, install to a local folder instead of system-wide). It's a mindset shift.

---

## Free VPS vs real VPS: the match

| | repo-to-vps | Real VPS (5€/month) |
|---|---|---|
| **Price** | 0€ | ~5-10€/month |
| **Uptime** | 6h, gotta restart | 24/7 |
| **Disk** | git branch, small files | real SSD, several GB |
| **RAM** | ~7 GB (generous!) | 1-2 GB typically |
| **CPU** | 2-4 decent cores | 1-2 vCPU |
| **Setup** | clone a template | manual config |
| **Persistence** | workspace only | full system |
| **Legitimacy** | pushing ToS | 100% clean |

The funny thing is that on raw specs (RAM, CPU), the GitHub runner is often BETTER than a 5€ VPS. But the 6h uptime and workspace-only persistence are what make it a hacker toy, not a real server.

For learning, testing, quickly debugging a Linux thing in a recoverable environment? Perfect. For hosting anything serious? Get a real VPS.

But for a temporary Linux environment you can restore at will? It's just brilliant.

---

## The pattern behind it all

If you zoom out, repo-to-vps and the email bot (my other article) are built on the same idea:

> **Git isn't just a version control system. It's a free, versioned, persistent storage system accessible via an API.**

As soon as you have a stateless system (GitHub Actions, a Worker, a serverless function) and you want to keep state between executions, git can serve as a "disk."

- The email bot stores a `lastId` in a git tag.
- repo-to-vps stores an entire filesystem in a git branch.

Same pattern, two scales. A single value on one side, a full disk on the other.

And the `git commit --amend` + force-push is the common technique: **you keep a single commit representing the current state, overwritten on every update.** No bloating history, just a living snapshot.

It wasn't built for this. But it works. And it's free. And that's what's beautiful.

---

**The 3 takeaways:**

1. **A git branch = a persistent hard drive** -- Store your filesystem in a dedicated branch, restore on startup, and you've got state that survives disposable machines.

2. **inotify + git = real-time autosave** -- `inotifywait` watches changes at the kernel level and pushes to git instantly. With `git commit --amend` to keep a single clean commit.

3. **tmate turns a runner into a VPS** -- Live SSH on a GitHub Actions machine, with auto-restart and one-command reconnection via the GitHub API.

Git as a hard drive, episode two. I think I'm gonna end up storing everything in git branches xD
