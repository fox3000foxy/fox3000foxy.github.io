---
title: Working on a New Project
description: A look at the process of starting and developing a new website.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "RZeAwqJO1dZRt+Pi2cuHshr/vGHf8ztlwSiyAzFC9uFxX9btGtw1y8WjqxyAUjnNdFSLue8K/6X5pL+CpzVgdw=="
---

# The Project

The project I'm working on is called LLJT:

![](assets/20260313_092734_image.png)

It's a website that's also a PWA, so you can use it like a mobile app. It uses MaterialUI to behave like a real phone app.
I spent a while on the Mui imports: I went from 11707 modules down to 595 in the end, by importing each icon line by line instead of the destructured import. That's when I learned that the destructured import loads the whole icon library, while individual imports only load the ones you actually use.

Nibi is the bot connected to this website.![](assets/20260313_093102_image.png)Grading relies on Google Forms:
![](assets/20260313_093255_image.png)
We use multiple-choice quizzes to evaluate our students, and we also hand out Discord roles, plus emojis and channels, to our students when they pass an important exam.

![](assets/20260313_093707_image.png)

The goal of this project is to help people learn Japanese together with us, since it's something I want to do myself too.
Students will also unlock partnerships with Crunchyroll and other platforms, to reward their progress.

Nibi and the website are hosted by Cloudflare Workers (Interaction URL with Hono Server) and GitHub Pages with React, respectively.
The website's code is not open source, but Nibi's is, and you can find it on [this GitHub repo](https://github.com/let-s-Learn-Japanese-Together/nibi). The website stays private because it contains private information, but if you want to know how I built it, ask me on Discord and I'll gladly walk you through the process! It uses a GitHub Action I created to avoid paying for GitHub Enterprise, plus several other tools and techniques I can tell you about if you're interested!

For the past few days, I've been having a lot of fun finding workarounds to host my projects without paying for hosting. That's why I made Nibi an Interaction Endpoint bot, to host it for free on Cloudflare Workers, and why I created a GitHub Action to deploy the website for free on GitHub Pages. Hunting for these workarounds is still one of the most exciting parts of coding for me: you have to think differently and build creative solutions, and it's exactly that no-budget challenge that motivates me!

Using GitHub Actions outside their intended purpose, and using Cloudflare Workers to "host" a bot, is also a way to learn new things and discover new technologies, like cloud hosting. I don't want to pay for hosting anymore.

I'm still working on it but you can join the [Discord server](https://discord.gg/frKZ9cJ4fD) if you want to follow along and see how it evolves, and maybe even join the project if you're interested! The server is open to everyone, and we'd love to have more people learning Japanese together! You'll find the invite link on the website, or you can ask me for it directly!
