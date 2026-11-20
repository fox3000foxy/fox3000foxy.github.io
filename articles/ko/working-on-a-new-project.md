---
title: 새 프로젝트 작업 중
description: 새로운 웹사이트를 시작하고 개발하는 과정에 대한 미리보기.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "TI37tF98iP4zs1jTXoKDHwaTsIf3HxiGEBaxQRH0D38/pkDW0XphD3zf5eqNAWNb67Cc6OeaRTRJJEBvAQQLCQ=="
---

# 프로젝트

제가 작업하고 있는 프로젝트의 이름은 LLJT예요.

![](assets/20260313_092734_image.png)

이 프로젝트는 PWA이기도 한 웹사이트라서 모바일 앱처럼 사용할 수 있어요. 진짜 휴대폰 앱처럼 동작하도록 MaterialUI를 사용해요.
Mui import 때문에 한동안 애를 먹었어요. 구조 분해 import 대신 각 아이콘을 한 줄씩 따로 import해서 결국 11707개 모듈에서 595개로 줄였어요. 그때 구조 분해 import는 아이콘 라이브러리 전체를 불러오지만, 개별 import는 실제로 사용하는 것만 불러온다는 걸 알게 되었어요.

Nibi는 이 웹사이트에 연결된 봇이에요.![](assets/20260313_093102_image.png)평가는 Google Forms를 기반으로 해요.
![](assets/20260313_093255_image.png)
저희는 퀴즈로 학생들을 평가하고, 중요한 시험에 합격한 학생들에게 Discord 역할과 이모지, 채널도 부여해요.

![](assets/20260313_093707_image.png)

이 프로젝트의 목표는 사람들이 저희와 함께 일본어를 배우도록 돕는 거예요. 저 자신도 하고 싶은 일이기도 하고요.
학생들은 실력이 늘면 Crunchyroll과 다른 플랫폼과의 제휴 혜택도 받을 수 있어서, 학습의 보상이 될 거예요.

Nibi와 웹사이트는 각각 Cloudflare Workers(Interaction URL과 Hono 서버)와 React를 올린 GitHub Pages에서 호스팅돼요.
웹사이트 코드는 오픈 소스가 아니지만 Nibi는 오픈 소스라서 [이 GitHub 저장소](https://github.com/let-s-Learn-Japanese-Together/nibi)에서 찾으실 수 있어요. 사이트에는 비공개 정보가 들어 있어서 계속 비공개로 두지만, 어떻게 만들었는지 궁금하시면 Discord로 물어봐 주세요. 과정을 기꺼이 설명해 드릴게요! GitHub Enterprise 비용을 내지 않으려고 제가 만든 GitHub Action을 비롯해, 관심 있으시면 설명해 드릴 수 있는 도구와 기법들을 여러 가지 사용했어요!

요즘은 호스팅 비용을 내지 않고 제 프로젝트들을 호스팅할 우회 방법을 찾는 재미에 푹 빠져 있어요. 그래서 Nibi를 Interaction Endpoint 봇으로 만들어 Cloudflare Workers에 무료로 호스팅하고, GitHub Pages에 사이트를 무료로 배포하는 GitHub Action을 만든 거예요. 이런 우회 방법을 찾는 일은 저에게 여전히 코딩에서 가장 신나는 부분 중 하나예요. 다르게 생각하고 창의적인 해결책을 만들어야 하니까요. 바로 그 무예산 도전이 저를 움직이는 원동력이에요!

본래 용도에서 벗어나 GitHub Actions를 사용하고, Cloudflare Workers로 봇을 "호스팅"하는 것은 새로운 것을 배우고 클라우드 호스팅 같은 새로운 기술을 발견하는 방법이기도 해요. 저는 이제 호스팅에 돈을 내고 싶지 않아요.

아직 작업 중이지만, 진행 상황을 지켜보고 어떻게 발전하는지 보고 싶으시면 [Discord 서버](https://discord.gg/frKZ9cJ4fD)에 참여해 보세요. 관심 있으시면 프로젝트에 합류하실 수도 있어요! 서버는 모두에게 열려 있고, 함께 일본어를 배우는 분들이 더 많아졌으면 해요! 초대 링크는 사이트에서 찾으실 수 있고, 저에게 직접 물어보셔도 돼요!
