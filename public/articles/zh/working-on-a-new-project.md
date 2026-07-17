---
title: 正在开发一个新项目
description: 瞥一眼开始和开发一个新网站的过程。
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - meta
  - webdev
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "WSZ7Fe2uODSghfwwRihohCb1s+yLL7/DQYirf0D99qvOQMRu0xV6K0/g5+2n1p07h3V7tCNouC8kNCSBh05foA=="
---

# 项目

我正在做的项目叫 LLJT：

![](assets/20260313_092734_image.png)

这是一个网站，同时也是一款 PWA，所以也是一款移动应用。它使用 MaterialUI 来营造真实手机应用的感觉。
最近我需要管理 Mui 的导入，通过逐行手动导入每个图标而不是使用解构导入，我最终从 11707 个模块减少到了只有 595 个：我发现当你使用解构导入时，实际上会加载整个图标库，而逐个导入则只导入你需要的那些……

Nibi 是连接到这个网站的机器人。![](assets/20260313_093102_image.png)等级评估基于 Google Forms：
![](assets/20260313_093255_image.png)
我们用选择题测试来评估学生，如果学生通过了重要考试，我们还会授予 Discord 角色，以及对应的表情符号和频道。

![](assets/20260313_093707_image.png)

这个项目的目标是一起带动大家学习日语，因为这也是我自己想做的事情。
学生还可以解锁与 Crunchyroll 及其他平台的合作福利，以奖励他们的能力。

Nibi 和网站分别托管在 Cloudflare Workers Hono Server Interaction URL 和带有 React 部署的 GitHub Pages 上。
网站代码不开源，但 Nibi 是开源的，你可以在[这个 GitHub 仓库](https://github.com/let-s-Learn-Japanese-Together/nibi)找到它。网站不开源是因为它包含一些私人信息，但如果你想知道我是如何构建它的，可以在 Discord 上问我，我很乐意分享这个过程！它实际上使用了我写的一个 GitHub Action，这样我就不用为 GitHub Enterprise 付费了，它还使用了很多其他很酷的工具和技术，如果你感兴趣的话，我可以分享给你！

最近我真的很喜欢为我的项目找替代方案来避免托管费用，这就是为什么我把 Nibi 做成了一个交互端点机器人，这样它就可以免费托管在 Cloudflare Workers 上，我还写了一个 GitHub Action 来把网站免费部署到 GitHub Pages 上，这样我就不用支付托管费用了。我发现寻找替代方案是编程中最有趣的部分之一，也是我很喜欢做的事情！你真的需要跳出固有思维，找到创造性的解决方案，这正是我热爱它的原因。这不只是写代码，而是找到不用花钱也能把事情做好的方法，这是我非常享受的挑战！

用 GitHub Actions 做一些不是它本来设计用途的事情，用 Cloudflare Workers 来"托管"一个机器人，也是一种学习新技术的方式，比如云托管，这也是我很喜欢的事情。我真的不想再支付托管费用了。

我还在继续开发中，但你可以加入 [Discord 服务器](https://discord.gg/frKZ9cJ4fD) 来关注进度，看看它是如何演变的，如果你感兴趣的话，甚至可以加入项目！服务器对所有人开放，我们很希望能有更多人加入我们一起学习日语！你可以在网站上找到邀请链接，也可以问我要！
