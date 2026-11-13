---
title: Minecraft Bedrock 任意披风获取法
description: 一个第三方启动器、一个老版本游戏、一个从没学会说不的披风选择器。完整教程加原理解释。
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "vNBqNkSO3fZEOhH0vJeRKCWKRj+6uzm5qK+Rk0xR3k48q/JVSMXiGLexwkO3Mi/6PxktajzUgHP9FpCdxdHtAg=="
---

# Minecraft Bedrock 任意披风获取法

Java 版有一堆歪门邪道搞到本不该有的披风（见 `cape-mod` 那篇）。Bedrock 不一样，认证不一样，但路还是有，你只需要第三方启动器加足够老的游戏版本，老到无视你以为天经地义的校验。

下面先讲怎么做，再看底下可能发生了什么。

## 你需要

- 拥有 Minecraft Bedrock 的微软账号（你自己的就行）
- 装好官方 Minecraft 启动器
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)，开源第三方启动器，能装能跑 Bedrock 任意历史版本
- .NET 8.0 Desktop Runtime
- Windows 开开发者模式

## 第 1 步，先用官方启动器装一次 Bedrock

碰 BedrockLauncher 之前，打开官方 Minecraft 启动器，进 **Minecraft: Bedrock Edition** 标签，点 **Install**。Bedrock 必须先被官方路子装过跑过一次。

![从官方启动器安装 Bedrock 版](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## 第 2 步，下 BedrockLauncher

去项目 GitHub releases 页。拿 Assets 里最新版的 zip。

![BedrockLauncher 的 GitHub releases 页](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## 第 3 步，解压

zip 下好解到 `Downloads` 文件夹（随便哪，解完找得到就行）。

![解压 BedrockLauncher 压缩包](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## 第 4 步，跑可执行文件

进解压的文件夹，跑 `BedrockLauncher.exe`。

![运行 BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## 第 5 步，装 .NET Desktop Runtime，开开发者模式

第一次启动，Windows 大概率跟你要 **.NET 8.0 Desktop Runtime**，装上。还要在`设置 > 系统 > 开发者选项`里开**开发者模式**，因为 BedrockLauncher 把游戏装成松散包（一堆裸文件，不是商店签名的正经包），不开这模式 Windows 拒绝装。

![装 .NET 运行时和开开发者模式](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## 第 6 步，建新安装

重开 BedrockLauncher，微软账号登录，进**安装**标签，点 **New installation**。

![在 BedrockLauncher 里建新安装](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## 第 7 步，选老版本

起个名，版本列表里选个**老**版本，一般 `1.16.x` 或更老。点 **Create**。

![选老版本，这里是 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## 第 8 步，启动安装

点 **Play**。解压文件看机器要 up to 十分钟，启动器看着像卡死（"Not Responding"），正常，让它跑。

![解压中，启动器看着像没响应](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## 第 9 步，选披风

游戏起来了，账号登录，建新角色进皮肤编辑器，**Capes** 标签。这时你会看到游戏里**全部**披风列表，包括你从来没拥有过的（活动限定、往届节日、Mob Vote 等）。选你想要的。

**这时皮肤别处别动**，只动披风。

![在角色编辑器里选披风](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## 第 10 步，装回官方版本

回官方启动器，**安装**标签，主 Bedrock 安装点 **Uninstall**，再装回来（或 **Check for Updates**）。这次从官方启动器启动 Minecraft Bedrock。

![从官方启动器卸载重装](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

完事了，披风在官方版本、你的真 profile 上了。

## 底下可能发生了什么

Bedrock 闭源我没法下手翻（Java 能反编译它不能），下面是**可能**的解释，不是板上钉钉。但观察到的行为和这个假设对得很好。

### 披风选择器从来不是访问控制

Bedrock 的披风选择界面大概率显示**游戏里存在的全部披风**，不是你账号拥有的。新客户端有个应用层过滤（客户端本地或调 Xbox/微软 entitlement 服务走网络），把没拥有的灰掉或隐藏。

关键这过滤大概率是**后加上**的，足够新的版本才有。1.16.x 这种老版本早于过滤，或用另一套验证（甚至没有）：列表里有的都能选，有没有 entitlement 都行。

### 披风到底存哪了？

这解释了为什么重装还在。Bedrock 的皮肤/披风选择不只是本地文件一扔，大概率同步到微软账号绑的 Xbox Live profile（管 Bedrock 全平台皮肤的同一套系统，手机、主机等）。老客户端里选披风，大概率像正版披风一样把选择发给 profile 服务，对客户端来说"你的"和"选的"没区别。profile 服务信客户端写的：记下选择，当时不回头验 entitlement 到底有没有，至少写的时候不验。

结果：重开新版官方游戏，它去 profile 服务取你当前皮肤/披风，服务原样返回记下的，非正版披风也一样。entitlement 检查如果有，也只在新版 UI **选的时候**做一次（所以新版有过滤），**显示**已存 profile 时放行。

### 和 Java 的对照

和 Java `cape-mod` 同一族逻辑漏洞：服务信了数据，不在每步重验来源。Java 是 RSA 签名有效但重放到错的 profile。Bedrock 大概率是老客户端没过滤的披风选择，被一路同步到账号持久状态，下游不重验 entitlement。入口不同（Java 的 mod，老版 Bedrock 客户端），病一样：该重验 entitlement 的下游没验，或只验了一次还验错了地方。

## 为什么现在还管用

两种可能，不互斥：

1. **Mojang 大概率觉得不值得修。** 要第三方启动器，加多步操作，结果纯 cosmetic，无玩法优势，不碰别人数据。
2. **修好要每次读 profile 都重验 entitlement**，不只选的时候验一次，等于每次显示皮肤多一次网络调用，就为个外观问题。

## 结语

教程十张截图，但讲的是软件安全里反复出现的原理：只要还有历史系统（老客户端、legacy API、没升级的服务）能写共享状态，今天的访问控制只管得住走今天路的人。还能讲老 API 的话，全绕过新过滤，新版上过滤好好的，老版本出生时根本没有它。

---

**资源**

- **BedrockLauncher**：[github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **关联文章**：Cape Mod，Java 版 RSA 签名注入等价物

**三句话总结**

1. 老版 Bedrock 的披风选择器大概率显示游戏全部披风，没有 entitlement 过滤。
2. 选择像正版披风一样同步到你的 Xbox Live profile，profile 服务信客户端。
3. entitlement 检查如果有，只在新版 UI 选的时候做，不在读已存账号时做。
