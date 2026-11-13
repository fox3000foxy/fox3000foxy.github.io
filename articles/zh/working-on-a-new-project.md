---
title: 正在做一个新项目
description: 新网站从启动到开发的过程一览。
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "CBK7uFD7MCuLUBNxtEb+hOSIV997p751LKNBuoEd5Bz0J8xdI5QxVaaOJFHsTU7noa3tlgCtwNUlPyHSy9pmwA=="
---

# 这个项目

我正在做的项目叫 LLJT：

![](assets/20260313_092734_image.png)

这是一个网站，同时也是 PWA，可以像手机应用一样使用。它用 MaterialUI 来表现得像真正的手机应用。
我在 Mui 的导入上花了不少时间：从 11707 个模块一路砍到最后的 595 个，方法是逐行单独导入每个图标，而不是用解构导入。就在那时我学到，解构导入会把整个图标库都加载进来，而单独导入只加载用到的图标。

Nibi 是连接到这个网站的机器人。![](assets/20260313_093102_image.png)评分机制基于 Google Forms：
![](assets/20260313_093255_image.png)
我们用选择题来考核学生，学生在通过重要考试后还会获得 Discord 身份组、表情和频道。

![](assets/20260313_093707_image.png)

这个项目的目标是帮助大家和我们一起学日语，这也是我自己想做的事。
学生还会解锁与 Crunchyroll 等平台的合作奖励，用来嘉奖他们的进步。

Nibi 和网站分别托管在 Cloudflare Workers（带 Hono Server 的 Interaction URL）和 GitHub Pages（React）上。
网站代码不开源，但 Nibi 开源，你可以在[这个仓库](https://github.com/let-s-Learn-Japanese-Together/nibi)找到它。网站因为包含隐私信息所以保持私有，但如果你想知道我是怎么搭建的，可以在 Discord 上问我，我很乐意一步步讲给你听！它用到了我写的一个 GitHub Action（为了避开 GitHub Enterprise 的付费），以及其他一些我可以给你介绍的工具和技巧！

这几天我特别享受为项目寻找免费托管的变通方案。正因如此，我把 Nibi 做成了 Interaction Endpoint 机器人，免费跑在 Cloudflare Workers 上，还写了一个 GitHub Action 把网站免费部署到 GitHub Pages。对我来说，寻找这类变通方案始终是写代码最刺激的部分：要换个思路，构造有创意的解法，而正是这种零预算的挑战激励着我！

把 GitHub Actions 用在原本设计之外的用途，用 Cloudflare Workers 来"托管"机器人，也是学习新东西、发现云托管这类新技术的方式。我不想再为托管付费了。

我还在继续做这个项目，如果你想关注进展、看看它怎么演变，甚至加入进来，可以加入 [Discord 服务器](https://discord.gg/frKZ9cJ4fD)！服务器对所有人开放，我们很希望有更多人一起来学日语！邀请链接在网站上有，也可以直接问我要！
