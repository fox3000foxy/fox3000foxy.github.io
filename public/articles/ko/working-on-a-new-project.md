---
title: 새 프로젝트 작업 중
description: 새 웹사이트를 시작하고 개발하는 과정 살펴보기
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "fkAkP5+riSQvmBQaSzUvUYOLSuAGR7QFSlVJliWskCVK2yscPlCA27fC3K+pia6OXhQOAD/rR61+y/N8NCMqFg=="
---

# 프로젝트

내가 작업 중인 프로젝트는 LLJT라고 해:

![](assets/20260313_092734_image.png)

이건 웹사이트이면서 PWA라서 모바일 앱이기도 해. MaterialUI를 사용해서 진짜 폰 앱처럼 보이게 만들었어.
최근에 Mui imports를 관리해야 했는데, destructured import를 쓰는 대신 아이콘마다 한 줄씩 수동으로 import해서 11707개 모듈에서 595개로 줄였어: destructured import를 쓰면 전체 아이콘 라이브러리를 로드하는 반면, 개별적으로 import하면 필요한 것만 로드한다는 걸 배웠거든...

Nibi는 이 웹사이트에 연결된 봇이야.![](assets/20260313_093102_image.png)등급은 Google Forms 기반이야:
![](assets/20260313_093255_image.png)
객관식 테스트로 학생들을 평가하고, 주요 시험에 통과하면 Discord 역할과 이모지, 채널도 부여해.

![](assets/20260313_093707_image.png)

이 프로젝트의 목표는 사람들이 함께 일본어를 배우도록 하는 거야. 나 자신도 배우고 싶은 거니까.
학생들은 Crunchyroll 및 다른 플랫폼과의 제휴도 잠금 해제해서 능력에 대한 보상을 받게 돼.

Nibi와 웹사이트는 각각 Cloudflare Workers Hono Server Interaction URL과 GitHub Pages + React 배포로 호스팅되고 있어.
웹사이트 코드는 오픈 소스가 아니지만, Nibi는 오픈 소스고 [이 GitHub 저장소](https://github.com/let-s-Learn-Japanese-Together/nibi)에서 찾을 수 있어. 웹사이트는 개인 정보가 포함되어 있어서 오픈 소스가 아니지만, 어떻게 만들었는지 알고 싶으면 Discord로 물어봐 줘. 기꺼이 과정을 공유할게! 실제로 내가 만든 GitHub Action을 사용해서 GitHub Enterprise 비용을 안 내도 돼, 그리고 관심 있으면 공유할 수 있는 멋진 도구와 기술도 많이 사용하고 있어!

요즘 나는 프로젝트를 호스팅하지 않고도 돌아가게 하는 우회로를 찾는 걸 정말 좋아해. 그래서 Nibi를 Interaction Endpoint Bot으로 만들어서 Cloudflare Workers에서 무료로 호스팅하고, GitHub Action을 만들어 웹사이트를 GitHub Pages에 무료로 배포해서 호스팅 비용을 안 내도 돼. 우회로를 찾는 건 코딩에서 가장 재미있는 부분 중 하나라고 생각해. 틀 밖에서 생각하고 창의적인 해결책을 찾아야 해. 그냥 코드를 쓰는 게 아니라 돈 안 쓰고도 작동하게 만드는 방법을 찾는 거, 그게 내가 정말 좋아하는 도전이야!

GitHub Actions를 본래 용도가 아닌 방식으로 사용하고, Cloudflare Workers로 봇을 '호스팅'하는 건 새로운 기술을 배우고 발견하는 방법이기도 해. 나는 더 이상 호스팅 비용을 내고 싶지 않아.

아직 작업 중이지만, [Discord 서버](https://discord.gg/frKZ9cJ4fD)에 들어오면 진행 상황을 지켜보고, 어떻게 발전하는지 볼 수 있어. 관심 있으면 프로젝트에 참여할 수도 있어! 서버는 모두에게 열려 있고, 함께 일본어를 배우는 여정에 더 많은 사람들이 합류했으면 좋겠어! 초대 링크는 웹사이트에서 찾을 수 있고, 아니면 나한테 직접 물어봐도 돼!
