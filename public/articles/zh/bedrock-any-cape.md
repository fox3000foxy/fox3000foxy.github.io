---
title: "如何在 Minecraft 基岩版上获取任意披风"
description: "一个第三方启动器、一个旧版本游戏、还有一个从没学会说「不」的披风选择器。完整教程，加上它为什么会奏效的可能解释。"
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Sax6b68RaCPIrvrefweQEdjVsspCCxCnO0DT5WXb2b4DBvZ1hZzk13CP6jLHcNBVLlSsRtAWH9C5dPmI2sSbWg=="
---

# 如何在 Minecraft 基岩版上获取任意披风

在 Java 版上，有各种歪门邪道让你搞到不该有的披风（参考 `cape-mod` 文章）。在基岩版上，游戏不同了，认证也不同了，但方法依然存在----不需要模组，不需要动任何网络数据包。只需要一个第三方启动器和一个旧到还没做好验证的游戏版本。

教你怎么做，然后我们看看这背后到底是怎么回事。

## 你需要什么

- 一个已经拥有 Minecraft 基岩版的 Microsoft 账号（你自己的就行）
- 已安装官方 Minecraft 启动器
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)，一个开源的第三方启动器，允许你安装和运行基岩版的任意历史版本
- .NET 8.0 Desktop Runtime
- Windows 上启用了开发人员模式

## 第 1 步----用官方启动器至少安装一次基岩版

在做其他事情之前，打开官方 Minecraft 启动器，进入 **Minecraft: Bedrock Edition** 标签页，点击 **Install**。在碰 BedrockLauncher 之前，基岩版必须至少通过官方渠道安装并启动过一次。

![从官方启动器安装基岩版](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## 第 2 步----下载 BedrockLauncher

前往项目的 GitHub Releases 页面。下载 **Assets** 下列出的最新版本的 zip 文件。

![BedrockLauncher 的 GitHub Releases 页面](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## 第 3 步----解压文件

下载完 zip 之后，解压到你的 `Downloads` 文件夹（或任何你能找到的地方）。

![解压 BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## 第 4 步----运行可执行文件

进入解压后的文件夹，运行 `BedrockLauncher.exe`。

![运行 BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## 第 5 步----安装 .NET Desktop Runtime 并启用开发人员模式

第一次运行时，Windows 很可能会让你安装 **.NET 8.0 Desktop Runtime**----装就完了。你还需要在 `设置 > 系统 > 开发人员` 中启用**开发人员模式**，因为 BedrockLauncher 以松散包的形式安装游戏（原始文件，不是真正签名的商店包），而没有这个模式 Windows 会拒绝这种安装。

![安装 .NET 运行时并启用开发人员模式](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## 第 6 步----创建新安装

重新打开 BedrockLauncher，用你的 Microsoft 账号登录，进入 **Installations** 标签页，点击 **New installation**。

![在 BedrockLauncher 中创建新安装](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## 第 7 步----选择一个旧版本

给安装起个名字，然后在版本列表中选择一个**旧**版本----一般是 `1.16.x` 或更早的。点击 **Create**。

![选择旧版本，这里是 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## 第 8 步----启动安装

点击 **Play**。文件提取根据电脑配置可能需要长达十分钟----启动器看起来会像卡死了（「未响应」），这是正常的，让它跑。

![提取进行中，启动器似乎未响应](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## 第 9 步----选择披风

游戏启动后，用你的账号登录，创建新角色，然后进入皮肤编辑器，**披风（Capes）**标签页。在这里，你会看到游戏中存在的所有披风的完整列表----包括你从未拥有过的那些（促销活动披风、过往节日披风、Mob Vote 披风等）。挑你想要的随便选。

**在这个阶段不要动皮肤的其他部分**，只留下披风就行。

![在角色编辑器中选取披风](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## 第 10 步----重装官方版本

回到官方启动器，**安装**标签页，点击主基岩版安装的 **Uninstall**，然后重新安装（或点击 **检查更新**）。这次从官方启动器启动 Minecraft 基岩版。

![从官方启动器卸载并重装](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

这就行了----你的披风就在官方版本上，在你真实的个人资料里。

## 可能发生了什么

我没有逆向基岩版的闭源代码（不像 Java 版可以反编译），所以下面是一个**可能的**解释，不是百分百确定的。但观察到的行为与以下假设非常吻合。

### 披风选择器从来就不是一个权限控制

在基岩版上，披风选择界面很可能展示的是**游戏中存在的所有披风的完整列表**，而不仅是你账号拥有的那些。在较新的客户端上，一个应用层过滤器（客户端侧或通过网络调用 Xbox/Microsoft 的游戏权益服务）会把你未拥有的披风变灰或隐藏。

关键在于，这个过滤器很可能是**后来加上的**，在一个足够新的版本才有的。像 1.16.x 这样的版本在这个过滤器之前，或者使用了不同的（甚至没有的）验证机制：列表里的一切都可以选择，管你有没有权益。

### 披风到底存在哪里？

这个部分解释了为什么重装之后还能保留。在基岩版上，皮肤/披风的选择不只是一个用完就丢的本地文件----它很可能是同步到你 Microsoft 账号关联的 Xbox Live 个人资料上的（跟管理你在其他基岩版平台----手机、主机等----上的皮肤是同一个系统）。当你在旧客户端选择一个披风时，它极有可能把这次选择发给了个人资料服务，就像一个最新客户端发送合法披风选择的方式一模一样----因为在客户端的视角里，「你拥有的」披风和「被选中的」披风没有任何区别。而个人资料服务在这一点上信任客户端：它记录这次选择，并不重新验证这权益背后是否真的存在，至少在写入时不做。

结果就是：当你重新启动最新版官方游戏时，它从个人资料服务拉取你当前的皮肤/披风----而服务忠实地返回了之前保存的内容，非法披风也包括在内。权益检查如果存在的话，很可能发生在最新 UI 中**选择**的时候（所以新客户端有过滤器），而不是**显示**已经存到账号上的内容的时候。

### 与 Java 版的相似之处

这跟 Java 版的 `cape-mod` 是同一类逻辑漏洞：一个服务相信了数据，却不在每一步都重新验证它的来源。Java 版上，是一个有效的 RSA 签名被重放到错误的个人资料上。基岩版上，则很可能是一个旧客户端接受了一个披风选择（因为它从来没有正确的过滤器），然后这个选择在没有重新验证的情况下被传播到账号的持久状态里。两种情况下，问题都不是入口（Java 的 mod、旧的基岩版客户端）----而是应该在下游重新验证权益的那一层没有这样做，或者只做了一次，在错误的地方。

## 为什么现在还能用

两种可能的解释，互不排斥：

1. **Mojang 大概率不把这当回事。** 这需要一个第三方启动器、一个多步操作，而且结果纯属外观类----没有游戏性优势，没有他人的数据受到威胁。
2. **想彻底修复这个问题，需要在每次读取个人资料时都重新验证权益**，而不仅仅在选择时----这就意味着每次显示皮肤都要多一次网络调用，为了一个只关乎外观的问题。

## 总结

这个教程用十张截图能讲完，但它展示了一个你在软件安全领域随处可见的原则：只要一个遗留系统（一个旧版客户端、一个遗留 API、一个从未更新过的服务）仍然可以写入共享状态，当今的访问控制就只能保护经过当今系统的东西。任何还能跟旧 API 对话的东西都能绕过新过滤器----不是因为过滤器坏了，而是因为它从未被应用到之前的版本上。

---

**资源**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **相关文章** : Cape Mod，通过 RSA 签名注入实现的 Java 版披风

**3 个要点**

1. 旧版基岩版的披风选择器很可能展示所有游戏披风的完整列表，没有权益过滤器。
2. 选择会像任何合法披风一样同步到你的 Xbox Live 个人资料----个人资料服务信任客户端。
3. 权益检查如果存在的话，发生在最新 UI 的选择时----而不是读取已保存在账号上的内容时。
