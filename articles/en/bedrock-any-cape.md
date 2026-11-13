---
title: "How to Get Any Cape on Minecraft Bedrock"
description: "A third-party launcher, an old game version, and a cape picker that never learned to say no. Full tutorial plus the likely explanation of why it works."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oEcYNfcoVWTQxsMjN0IeRc8/I/SsxGVtz6Umf90d1JFaaB2o4re027129z0m+u52D01zIW6QPEoOWTd5KzRItA=="
---

# How to Get Any Cape on Minecraft Bedrock

On Java, there are plenty of twisted ways to end up with a cape you shouldn't have (see the article on `cape-mod`). On Bedrock, the game is different, auth is different, but there's still a way -- you just need a third-party launcher and a game version old enough to ignore the validation everyone takes for granted.

Here's how to do it, and then we'll look at what's probably going on under the hood.

## What you need

- A Microsoft account that already owns Minecraft Bedrock (yours works just fine)
- The official Minecraft launcher installed
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), an open-source third-party launcher that lets you install and launch any historical Bedrock version
- .NET 8.0 Desktop Runtime
- Developer mode enabled on Windows

## Step 1 -- Install Bedrock at least once with the official launcher

Before anything else, open the official Minecraft launcher, go to the **Minecraft: Bedrock Edition** tab, and click **Install**. Bedrock must have been installed and launched at least once through the official channel before you touch BedrockLauncher.

![Install Bedrock Edition from the official launcher](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Step 2 -- Download BedrockLauncher

Head to the project's GitHub releases page. Grab the zip of the latest listed version in the **Assets**.

![BedrockLauncher GitHub releases page](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Step 3 -- Extract the archive

Once the zip is downloaded, extract it into your `Downloads` folder (or anywhere, as long as you can find the folder afterward).

![Extracting the BedrockLauncher archive](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Step 4 -- Run the executable

Go into the extracted folder and launch `BedrockLauncher.exe`.

![Launching BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Step 5 -- Install the .NET Desktop Runtime and enable developer mode

On first launch, Windows will very likely ask you for the **.NET 8.0 Desktop Runtime** -- install it. You also need to enable **developer mode** in `Settings > System > For Developers`, because BedrockLauncher installs the game as a loose package (raw files, not a real signed Store package), and Windows refuses that kind of install without this mode.

![Installing the .NET runtime and enabling developer mode](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Step 6 -- Create a new installation

Relaunch BedrockLauncher, sign in with your Microsoft account, go to the **Installations** tab, then click **New installation**.

![Creating a new installation in BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Step 7 -- Pick an old version

Give the installation a name, then in the version list, pick an **old** version -- typically a `1.16.x` or older. Click **Create**.

![Picking an old version, here 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Step 8 -- Launch the installation

Click **Play**. Extracting the files can take up to ten minutes depending on the machine -- the launcher will look frozen ("Not Responding"), that's normal, just let it run.

![Extracting, the launcher seems unresponsive](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Step 9 -- Pick the cape

Once the game is running, sign in with your account, create a new character, and go to the skin editor, **Capes** tab. There you'll find the full list of every cape that exists in Minecraft -- including the ones you never had (promo event capes, past festivals, Mob Vote, etc). Pick the one you want.

**Don't touch the rest of the skin's appearance at this point**, just the cape.

![Picking a cape in the character editor](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Step 10 -- Reinstall the official version

Go back to the official launcher, **Installation** tab, and click **Uninstall** on the main Bedrock installation, then reinstall it (or hit **Check for Updates**). Relaunch Minecraft Bedrock from the official launcher this time.

![Uninstalling and reinstalling from the official launcher](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

And there it is -- your cape is there, on the official version, on your real profile.

## What probably happens

I didn't dig into Bedrock's closed source (unlike Java, which is decompilable), so what follows is a **likely** explanation, not absolute certainty. But the observed behavior fits the following hypothesis pretty well.

### The cape picker was never an access control

On Bedrock, the cape selection screen most likely shows **the full list of capes that exist in the game**, not just the ones your account owns. On recent clients, an application filter (client-side or via a network call to an Xbox/Microsoft entitlement service) grays out or hides the capes you don't own.

The key point is that this filter was probably added **after the fact**, on a recent enough game version. A version like 1.16.x predates that filter, or uses a different (possibly nonexistent) verification mechanism: everything in the list becomes selectable, entitlement or not.

### Where is the cape actually stored?

This is the part that explains why it survives reinstallation. The skin/cape choice on Bedrock is not just a throwaway local file -- it's most likely synced to the Xbox Live profile tied to your Microsoft account (the same system that manages your skin on other Bedrock platforms -- mobile, console, etc.). When you pick a cape in the old client, it very likely sends that choice to the profile service, exactly like an up-to-date client would with a legitimate cape -- because from the client's point of view, there is no difference between a cape that is "yours" and one that is "picked". The profile service, for its part, trusts the client on this: it records the selection without revalidating whether the entitlement actually exists behind it, at least not at write time.

Result: when you relaunch the up-to-date official game, it fetches your current skin/cape from the profile service -- and the service faithfully returns what was recorded, non-legitimate cape included. The entitlement check, if there is one, probably happens only at **selection** time in the UI (hence the filter on recent clients), and lets **display** of what's already recorded on the profile pass through.

### The parallel with Java

It's the same family of logic flaw as the `cape-mod` one on Java: a service trusting data without re-verifying its origin at every step. On Java, it's a valid RSA signature but replayed onto the wrong profile. On Bedrock, it's most likely a cape selection accepted by an old client that never had the right filter, then propagated without revalidation into the account's persistent state. In both cases, the problem isn't the entry point (the Java mod, the old Bedrock client) -- it's that the layer that should revalidate the entitlement downstream doesn't, or only does it once, in the wrong place.

## Why it still works

Two possible explanations, not incompatible with each other:

1. **Mojang probably doesn't consider it a priority.** It takes a third-party launcher, a multi-step manipulation, and the result is purely cosmetic -- no gameplay advantage, no one else's data compromised.
2. **Fixing it properly would mean revalidating entitlements on every profile read**, not just at selection -- which means an extra network call on every skin display, for a problem that only concerns cosmetics.

## Conclusion

This tutorial fits in ten screenshots, but it illustrates a principle you find everywhere in software security: as soon as a historical system (an old client version, a legacy API, a never-updated service) can still write into shared state, the present day's access control only protects what goes through the present. Everything that can still talk to the old API bypasses the newer filter -- the filter works on recent versions, but it was never applied to the version that came before it.

---

**Resources**

- **BedrockLauncher**: [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Related article**: Cape Mod, the Java equivalent via RSA signature injection

**3 key points**

1. An old Bedrock version's cape picker most likely shows the full list of capes in the game, with no entitlement filter.
2. The selection is then synced to your Xbox Live profile like any legitimate cape -- the profile service trusts the client.
3. The entitlement check, if there is one, happens at selection time in the recent UI -- not when reading what's already recorded on the account.
