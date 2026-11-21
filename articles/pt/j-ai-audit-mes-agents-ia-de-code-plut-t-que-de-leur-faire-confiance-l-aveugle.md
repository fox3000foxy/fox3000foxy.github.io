---
title: "Auditei meus agentes de IA de código em vez de confiar neles cegamente"
description: "Como dois audits feitos para escrever o 4º relatório técnico da minha plataforma de trading me revelaram dois desvios distintos : um agente que esquece porque o repo não cabe mais na janela de contexto dele, e um agente que escreve dez vezes mais código do que o necessário porque nada o incentiva à concisão."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "NVZeeh+jd66xUGPxq/l8QXV1kp6UYoBL0YKxrTNQpcqHa/VpuHyso/ncDLsYyE8HqFOfyMD8RaorKHy19ALHyQ=="
---

## O sintoma antes do diagnóstico

Cada edição do relatório técnico da plataforma me obriga a percorrer a arquitetura inteira de novo : serviços, agentes, pipelines de dados. Foi ao preparar a 4ª edição que o volume do repo acabou me chamando a atenção, embora eu o visse crescer aos poucos sem nunca parar para olhar : o repo, que no início cabia em alguns milhares de linhas, menos de 10ko, agora chega a 100Mo. A plataforma tinha apenas um pouco mais de funcionalidades. Eu tinha simplesmente contado com agentes do tipo Claude Chat para implementar e corrigir código, sem definir com precisão o que eu pedia nem em qual escopo.

Escrever o relatório me forçou a sair do modo "está avançando" para voltar ao modo "o que realmente aconteceu". Fiz dois audits distintos no histórico do repo. Os dois apontavam para a mesma causa, por duas razões completamente diferentes.

## Audit nº 1 : a janela de contexto que mente

O primeiro audit consistiu em retomar, serviço por serviço, as correções feitas por um agente de IA ao longo de vários meses, e verificar se eram coerentes com o resto do repo no momento em que tinham sido aplicadas.

O padrão que voltava o tempo todo : o agente corrigia um problema localmente, no arquivo ou módulo que tinha diante dos olhos, sem ter visto o equivalente em outro lugar do repo, ou sem se lembrar dele. Resultado : a mesma interface redefinida de forma um pouco diferente em dois serviços, uma renomeação aplicada pela metade porque a segunda ocorrência estava fora da janela de contexto na hora do prompt, uma convenção de nomes respeitada em um módulo e ignorada no seguinte. Nada de espetacular isoladamente, mas acumulado ao longo de dezenas de sessões, isso produz exatamente a redundância e os code smells que fazem o próximo tool que rodamos em cima perder o fio. Um ciclo que se autoalimenta : quanto mais o repo cresce e se fragmenta, mais difícil fica para um agente mantê-lo inteiro na cabeça, mais as correções ficam locais e parciais, mais o repo cresce.

O problema não é que o agente "mente" ou inventa ; ele responde corretamente à pergunta feita sobre o contexto que recebeu. O problema é que, na maioria das vezes, eu nunca tinha definido o escopo da pergunta antes. Eu pedia "corrige esse typo, esse comportamento, essa função" sem me perguntar se esse bug tinha equivalentes em outro lugar do repo que o agente não podia ver.

## Audit nº 2 : quando a verbosidade vira código

O segundo audit foi mais mecânico : rodar um `git log --numstat` em todo o histórico, agregar linhas adicionadas e caracteres adicionados por commit e olhar a distribuição.

Os 30 maiores commits em linhas adicionadas representavam, sozinhos, uma parte amplamente desproporcional do volume total do repo. Sistematicamente, os mesmos commits também apareciam como os maiores em caracteres adicionados. Era previsível, só que a taxa de caracteres/linhas desses commits não vinha só do número de linhas : as próprias linhas eram mais verborrágicas, com mais comentários explicativos redundantes com o nome das funções, mais blocos de tratamento de erros duplicados em vez de fatorados, mais docstrings que reformulavam três vezes a mesma coisa.

É a consequência direta de um comportamento conhecido ao interagir com um LLM em chat : sem instrução explícita de concisão, ele tende a falar muito, a justificar, comentar, reformular. Em conversa, isso custa tokens de saída. Em geração de código, esse mesmo reflexo se traduz em linhas que ficam no repo para sempre, commit após commit, sem que a gente realmente as releia enquanto o código funciona.

## O que os dois audits, lado a lado, mostraram

Para o primeiro relatório : a coerência entre serviços sofre com uma janela de contexto pequena demais para conter o repo inteiro, o que leva a correções locais, redundâncias e divergências de convenções.

Para o segundo : `git log --numstat` mostra uma verbosidade padrão de um LLM sem direcionamento, o que causa linhas e caracteres adicionados desproporcionais e um código pouco fatorado.

Os dois juntos apontam redundância e volume : isso dá um repo grande demais para um futuro agente manter na cabeça, o que agrava ainda mais o primeiro problema revelado pelo primeiro audit.

Foi essa última linha que mais me preocupou ao escrever o relatório : os dois problemas estão ligados, alimentam um ao outro. Quanto mais verborrágico o código gerado, mais rápido o repo cresce ; quanto mais ele cresce, menos um agente consegue mantê-lo em contexto ; quanto menos consegue mantê-lo em contexto, mais locais e redundantes são as correções ; quanto mais redundantes, mais volume adicionam. Um ciclo de feedback negativo, inteiramente causado por um uso de agentes sem direcionamento.

## Por que não é um bug pontual de uma ferramenta específica

Nada neste diagnóstico é específico de um modelo ou produto em particular. Um agente tipo chat, qualquer que seja, opera sobre o que recebe na janela dele no instante T, e gera por padrão a resposta mais completa e justificada possível. É exatamente o comportamento esperado de um assistente conversacional, e exatamente o que deve ser evitado para uma ferramenta que escreve em um repo de produção. O problema vem da falta de direcionamento entre a ferramenta e o repo : escopo de arquivos a considerar, formato de saída esperado, orçamento de linhas ou de verbosidade, obrigação de citar com precisão o que já existe antes de escrever algo novo.

## O que mudei desde então

O reflexo lógico teria sido reduzir drasticamente o que tinha sido escrito. Pessoalmente, decidi fazer diferente. Os audits me serviram para outra coisa : escanear o código para localizar code smells, e usá-los para delimitar com precisão onde estavam os verdadeiros problemas. As incoerências entre serviços, as redundâncias, os pontos onde o fio se perdeu, em vez de adivinhar. O volume de código escrito continua praticamente o mesmo : verborrágico ou não, continua útil se for bem usado. A alavanca era saber exatamente onde olhar para corrigir o que não encaixava, em vez de impedir o agente de escrever.

## Próximas etapas

A divisão do repo em unidades menores e melhor delimitadas. Além de proteções de produção para execução e documentação. O problema que surge em seguida é uma questão de arquitetura : como analisar, criticar e fazer comunicar de forma limpa os serviços, componentes e documentação que, uma vez separados, ainda precisam coordenar decisões sem voltar ao mesmo monolito de antes.
