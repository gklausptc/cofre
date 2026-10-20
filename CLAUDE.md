# CLAUDE.md — Instruções do Projeto

Este arquivo orienta o Claude Code na construção deste app. Leia por completo antes de gerar qualquer código.

Ver também `@AGENTS.md` para práticas específicas de Expo/React Native (o template Expo injeta esse arquivo; ele lembra que APIs do Expo mudam a cada release e não se deve confiar apenas em conhecimento de treino desatualizado).

## 1. O que é este projeto

Um app de controle financeiro pessoal (e familiar, ver seção 5), para uso próprio, rodando **offline, sem servidor, sem backend**. Todos os dados ficam em SQLite local no aparelho. Vai ser testado via **Expo Go** no iPhone do usuário durante todo o desenvolvimento — por isso **nenhuma biblioteca com código nativo customizado pode ser usada** enquanto não for dito o contrário (ver seção 3, restrição crítica).

O usuário quer controlar em um único app: contas fixas mensais, gastos variáveis, compras na hora, parcelamentos, metas financeiras, reserva de emergência, cofrinhos (objetivos de economia), cartões de crédito, contas bancárias e fluxo de caixa futuro.

## 2. Stack técnica (fixa — não trocar sem perguntar)

- **Expo (managed workflow)** + **React Native** + **TypeScript** (strict mode)
- **Expo Router** para navegação (roteamento por arquivo)
- **expo-sqlite** como banco local
- **Drizzle ORM** sobre expo-sqlite (schema tipado, migrations)
- **Zustand** para estado global simples (sem Redux)
- **expo-notifications** para notificações locais (vencimentos, faturas, metas)
- **Victory Native** (ou `react-native-gifted-charts`) para gráficos
- **date-fns** para manipulação de datas
- **Nativewind** (Tailwind para React Native) OU StyleSheet puro — escolher Nativewind se quiser produtividade em estilização, é compatível com Expo Go

## 3. Restrição crítica — Expo Go compatibility

O usuário testa o app no iPhone via Expo Go, **sem Mac disponível para builds nativos**. Isso significa:

- ✅ Pode usar: qualquer pacote puro JS/TS, e qualquer módulo Expo do SDK padrão (`expo-*`).
- ❌ **Não pode usar**: bibliotecas que exigem `expo-dev-client` / Development Build (qualquer coisa com passo de instalação tipo "run `npx expo prebuild`" ou "adicione ao `ios/`, `android/`"). Isso inclui, por exemplo, bibliotecas de iCloud, algumas libs de biometria não-Expo, SDKs de terceiros com módulos nativos próprios.
- Antes de adicionar qualquer dependência nova, verifique se ela é "Expo Go compatible". Na dúvida, prefira o módulo `expo-*` equivalente.
- Se alguma funcionalidade pedida exigir sair do Expo Go, **pare e avise o usuário antes de implementar**, explicando a implicação (vai precisar de EAS Build + conta Apple Developer paga para instalar no iPhone).

## 4. Estrutura de pastas a criar

```
app/                                  # Expo Router — cada arquivo = 1 rota
├── _layout.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── dashboard.tsx
│   ├── lancamentos.tsx
│   ├── cartoes.tsx
│   ├── planejamento.tsx
│   └── mais.tsx
├── conta-fixa/
│   ├── novo.tsx
│   └── [id].tsx
├── cartao/
│   └── [id].tsx
├── cofrinho/
│   ├── novo.tsx
│   └── [id].tsx
└── gasto-rapido.tsx                  # rota modal

src/
├── domain/
│   ├── types/                        # tipos TypeScript de cada entidade (seção 6)
│   ├── usecases/                     # regras de negócio (seção 7)
│   └── repositories/                 # interfaces
├── data/
│   ├── db/
│   │   ├── schema.ts                 # schema Drizzle completo (seção 6)
│   │   ├── client.ts
│   │   └── migrations/
│   └── repositories/                 # implementações concretas
├── core/
│   ├── notifications/
│   ├── theme/
│   └── utils/
│       ├── currency.ts               # formatação R$ (pt-BR)
│       └── date.ts
├── store/                            # Zustand, um arquivo por domínio
└── components/
    ├── CurrencyInput.tsx
    ├── CategoryPicker.tsx
    ├── ProgressCard.tsx
    └── MonthSelector.tsx
```

Regra de arquitetura: `presentation` (app/, components/, store/) nunca acessa `data/` diretamente — sempre passa por `domain/usecases` ou `domain/repositories`. Isso garante que trocar o mecanismo de storage no futuro não exija tocar nas telas.

Como isso está implementado: cada repositório tem uma interface em `src/domain/repositories/` e uma implementação SQLite em `src/data/repositories/`; as implementações são registradas uma única vez em `src/core/inicializacao/` (raiz de composição, chamada pelo `app/_layout.tsx`). Telas e stores usam `repositorios().<nome>` (ex.: `repositorios().cartoes.listarCartoes()`). O ESLint barra import de `@/data` em `app/`, `src/store/` e `src/components/`, e de `@/data`/React em `src/domain/usecases/`. Gravações que mexem em mais de uma tabela vão dentro de `repositorios().manutencao.emTransacao(...)`. Visão geral em `docs/arquitetura.md`.

## 5. Suporte familiar (baixo impacto)

O app continua local, em um único aparelho — não há sincronização entre celulares de pessoas diferentes (exigiria backend). O jeito correto de cobrir uso familiar aqui é: adicionar uma entidade `membros_familia` (nome, cor, ícone) e um campo opcional `membro_id` em `movimentacoes`, `gastos_rapidos`, `contas_fixas` e `compras_parceladas`. O dashboard deve permitir filtrar/agrupar por membro. Implementar isso desde o MVP (é simples e evita retrabalho de migration depois).

## 6. Schema do banco (Drizzle)

A fonte da verdade é `src/data/db/schema.ts`; toda mudança é uma migration nova gerada com `npx drizzle-kit generate` (nunca editar migration já publicada, nunca resetar o banco). Tabelas atuais:

| Tabela | Para quê |
|---|---|
| `membros_familia` | pessoas da família (nome, cor, ícone) — `membro_id` opcional nos lançamentos |
| `categorias` | receita/despesa. Padrão em `src/domain/dados/categoriasPadrao.ts`, em levas (`versao`): banco novo recebe todas; banco antigo recebe só as levas novas, uma vez (`preferencias.categorias_padrao_versao`, `seedCategoriasPadrao`). `refina` diz a categoria geral que uma detalhada substitui se não existir (Mercado → Alimentação). Tela `app/categorias` cria, renomeia e junta (`juntarCategorias` move lançamentos, contas fixas, compras, regras, contatos e orçamentos) |
| `contas_bancarias` | `saldo_inicial`; saldo atual é sempre calculado. `identificador_extrato` (banco\|agência\|conta\|tipo, de `identificadorDoExtrato`) liga os próximos extratos a esta conta sozinho |
| `movimentacoes` | entrada/saída/transferência em conta; `recorrente` + `recorrente_origem_id` (salário), `reservar_proximo_mes`. Pagar fatura/conta fixa com uma conta cria uma saída aqui (`origem` 'fatura'/'conta_fixa', ligada por `fatura_id`/`parcela_id`): conta no saldo, mas **não** como despesa nos relatórios (`ehPagamentoDeCompromisso`). `origem` 'interna': entrada/saída de/para uma conta sua que não está no app (PIX para o próprio nome, poupança, caixinha) — conta no saldo, mas não é receita nem despesa (`ehReceita`, `ehDespesa`, `ehMovimentoInterno`; natureza 'transferencia' na camada unificada) |
| `cartoes` | limite, dia de fechamento e de vencimento |
| `faturas` | por cartão/mês de vencimento; quando paga guarda `conta_bancaria_id`, `valor_pago`, `data_pagamento` |
| `compras_parceladas` | compra no cartão em N vezes |
| `parcelas` | parcelas de compra **e** ocorrências de conta fixa (exatamente um de `compra_parcelada_id`/`conta_fixa_id`); `valor_original` + `justificativa_alteracao` quando o valor é ajustado |
| `contas_fixas` | recorrência mensal/quinzenal/semanal/anual/única, débito/pix/cartão/boleto |
| `gastos_rapidos` | gasto em dinheiro/débito/pix/cartão sem passar por movimentação. `comprovante` (também em `movimentacoes`): caminho relativo da foto em `documentDirectory/comprovantes` — as fotos não entram no backup |
| `cofrinhos` + `aportes_cofrinho` | metas de economia; valor atual = soma dos aportes |
| `reserva_emergencia` (singleton) + `movimentacoes_reserva` | reserva com histórico de aportes/retiradas; o valor guardado é **calculado** (aportes − retiradas, `saldoReserva.ts`) e não dá para retirar mais do que ele |
| `metas_financeiras` | metas financeiras (nome, valor da meta, valor atual, data e categoria) — mantida; a tela Metas financeiras reúne reserva, cofrinhos e metas |
| `preferencias` (singleton) | tema, bloqueio/biometria, tutorial, `ultimo_backup_em`, taxas CDI/Selic de referência, configuração e adiamentos das notificações, divisão do salário (`divisao_salario`, `salarios_divididos`), insights dispensados e alertas de orçamento já enviados (JSON), `nomes_proprios` (JSON: o seu nome como cada banco escreve, aprendido do titular dos extratos e editável em Regras aprendidas) |
| `orcamentos` | limite por categoria: vale de `mes_inicio` em diante (o mais recente com mes_inicio ≤ mês) ou `apenas_no_mes`; limite 0 = sem orçamento a partir dali (`orcamentoDoMes`) |
| `importacoes` | cada extrato importado (arquivo, `formato` csv/ofx/txt/pdf, banco, período, números). As linhas guardam `importacao_id` e `id_externo`; `efeitos` (JSON) guarda o que a importação mudou fora das linhas, com o estado de antes, para desfazer |
| `regras_categorizacao` | regra aprendida: `padrao` (texto de `textoParaRegra`), `tipo_correspondencia` (exato/contem/comeca_com), `natureza` (despesa/receita/ambas), `acao` (categorizar/ignorar/transferencia_propria/conta_fixa/emprestimo), `vezes_usada` |
| `perguntas_pendentes` | fila de dúvidas da importação (tela Revisão): `tipo` (categoria/pix_pessoa/parcelamento/recorrencia/duplicidade), `chave` que junta perguntas iguais entre importações, `valor` (impacto), `dados` em JSON (`DadosDaPergunta`, com as linhas afetadas por importação + id externo) |
| `contatos_pix` | quem é quem nos PIX (`nome_normalizado`, `apelido`, `tipo` pessoa/familia/servico/emprestimo/propria, categoria e membro) |

**Dinheiro é sempre `integer` em centavos** (R$ 12,34 = `1234`), do banco até as telas. Conversão para exibir/ler texto só em `src/core/utils/currency.ts` (`formatarMoeda`, `formatarDecimal`, `textoParaCentavos`, `dividirEmParcelas`); o `CurrencyInput` já trabalha em centavos. Nunca usar `parseFloat`/`toFixed` em dinheiro. A migration 0006 converteu os valores antigos com `ROUND(valor * 100)`, e backups de antes dela são convertidos na restauração (`CONVERSORES` em `src/domain/usecases/backup.ts` — toda migration que muda o significado de um dado precisa de um conversor ali).

**Backup**: antes de qualquer migration pendente o app grava uma cópia automática em `documentDirectory/backups` (`src/data/db/prepararBanco.ts`); a tela `app/backup` exporta/restaura o JSON completo.

**Regra importante de design:** `saldo_atual` de conta bancária, `valor_total` de fatura, `valor_atual` de cofrinho e o valor guardado na reserva de emergência **nunca são colunas gravadas diretamente** — são sempre calculados a partir das tabelas de movimento (`movimentacoes`, `parcelas`, `aportes_cofrinho`). Implemente como funções/queries derivadas, não como campos que o usuário edita.

## 7. Regras de negócio a implementar em `domain/usecases/`

1. **`gerarParcelas(compra: CompraParcelada)`** — cria N registros em `parcelas`, valor = `valorTotal / numParcelas` (ajustar centavos na última parcela para bater exatamente o total), define `mesReferencia` de cada uma com base na data de compra + dia de fechamento do cartão.
2. **`editarParcelamento(...)`** — ao editar valor/número de parcelas de uma compra já existente, recalcula **somente** as parcelas com `status = 'pendente'`. Parcelas já pagas nunca são alteradas.
3. **`gerarRecorrencia()`** — roda ao abrir o app: para cada `contaFixa` ativa e recorrente, verifica se já existem ocorrências geradas para os próximos 3 meses; se não, cria (respeitando `recorrencia`: mensal/quinzenal/semanal/anual).
4. **`calcularFatura(cartaoId, mesReferencia)`** — soma todas as `parcelas` cujo `faturaId` aponta pra fatura daquele cartão/mês.
5. **`calcularSaldoDisponivel(mes)`** — `receita_prevista - contas_fixas_do_mes - parcelas_do_mes - gastos_ja_realizados_no_mes`.
6. **`projetarFluxoCaixa(mesesAFrente)`** — para cada mês futuro, soma contas fixas + parcelas já geradas, retorna receita prevista, despesa prevista, saldo previsto.
7. **`calcularProgressoCofrinho(cofrinhoId)`** — soma `aportes_cofrinho`, calcula percentual (`valorAtual / valorMeta`), e projeta data de conclusão com base na média de aportes dos últimos meses (regra simples: se não houver histórico suficiente, não mostrar previsão).
8. **`calcularSaldoConta(contaBancariaId)`** — `saldoInicial + soma(entradas) - soma(saidas) +/- transferencias`.

**Cofre 2.0 — modelo integrado (Fase 1):**

- **`obterLancamentosDoPeriodo(inicio, fim, dados, hoje)`**: fonte única. Junta movimentações, gastos rápidos, parcelas, ocorrências de contas fixas, faturas (uma por cartão/mês de vencimento, somando o que é cobrado nela), aportes de cofrinho e movimentos da reserva num `LancamentoDoPeriodo` (`src/domain/types/lancamento.ts`) com `tipo`, `natureza` (receita/despesa/fatura/pagamento/transferencia/guardado/resgate), `status` (pago/previsto/atrasado), `competencia` (mês em que pesa: compra no cartão pesa no mês da fatura), `noCartao` e `link` para a tela. Agenda, Início, previsão, gráficos e notificações devem ler daqui.
- **`calcularLivreParaGastar(lancamentos, mes, hoje)`**: receitas − contas fixas fora do cartão − faturas − gastos fora do cartão − guardado; devolve também o valor por dia restante. Card no Início.
- **Pagamentos (`pagarFatura.ts`)**: `planejarPagamentoFatura` e `planejarPagamentoContaFixa` dão baixa e criam a saída ligada (`registrarPagamentoVinculado`, nunca duplica), tudo dentro de `emTransacao`.
- **`ehPagamentoDeCompromisso` / `ehDespesa`**: a saída que paga fatura/conta fixa conta no saldo, não nos relatórios. Transferência nunca é receita nem despesa.
- **`calcularLimiteDisponivel`**: compra à vista no cartão libera o limite quando a fatura dela é paga.
- Testes das regras de integração em `src/domain/usecases/__tests__/integracao.test.ts`.

**Cofre 2.0 — importação de extrato (Fase 2, `src/domain/usecases/importacao/`):**

- **`lerExtrato`** (CSV/OFX/TXT, layouts por banco em `layouts.ts`, guia em `docs/importacao-bancos.md`) → **`normalizarDescricao`** → **`deduplicar`** (id externo, depois valor igual + data ±2 dias + semelhança; o outro lado de uma transferência entre contas suas já no app casa só por valor e data ±1 dia).
- **PDF**: `src/core/utils/pdf/` lê o PDF em JS puro (objetos, ObjStm, FlateDecode com `fflate`, senha RC4/AES-128 — `criptografia.ts` —, texto com posição por fonte em `fontes.ts`); `lerExtratoDoPdf` (domínio) transforma as linhas em extrato: linha com data no começo e valor no fim é lançamento, as linhas sem data mais próximas (na coluna da descrição) completam a descrição. `lerArquivoDeExtrato` (`src/core/importacao/`) junta texto e PDF e devolve `precisa_senha`/`senha_errada` (a senha nunca é guardada).
- **Dados do arquivo** (`dadosDoArquivo.ts`): `titular` ("Cliente:"), `conta` (agência, número, corrente/poupança), `saldoAnterior`, e na fatura `cartao` (nome, limite, dias). O titular entra em `preferencias.nomes_proprios` (`juntarNomeProprio`); `ehNomeProprio`/`contemNomeProprio` reconhecem o nome mesmo abreviado de outro jeito ("GREGORY K SILVA PEREIRA" × "GREGORY KLAUS DA SILVA PE": mesmo primeiro nome e ≥ 2 outros pedaços).
- **Movimentações internas**: PIX/TED para o seu nome (categorizador, camada de contato, sem pergunta "Quem é?"), "mesma titularidade", poupança, caixinha, CDB, resgate (fora rendimento/juros) → `transferencia_propria`. Saída sem o outro lado → transferência (para a outra conta, se o texto disser qual); entrada sem o outro lado → transferência vinda da outra conta do app (poupança, banco) ou entrada `origem 'interna'`.
- **Importação em lote** (`importacaoEmLote.ts`, tela `app/importar-extrato/lote.tsx`; o seletor aceita vários arquivos): `planejarLote` liga cada arquivo a uma conta/cartão (identificador → banco + corrente/poupança) ou cria um novo (conta com o saldo anterior do extrato mais antigo; cartão com os dias e o limite da fatura); `dividirPorMes` quebra extrato de vários meses; `ordenarLote` importa mês a mês, faturas antes das contas e corrente antes da poupança; `prepararImportacaoAutomatica` grava sem prévia (o que precisar de você vai para a Revisão).
- **`categorizar` / `prepararCategorizador`** (comparação: palavra inteira, começo de palavra ou colado — "AUTOPOSTO", "MERCADOLIVRE"; `textoParaRegra` tira números de loja, CNPJ, "LTDA" e o "PIX ENVIADO" do começo, e as regras antigas são limpas na hora de comparar; nome com palavra de loja não é pessoa; intermediário de pagamento não decide a categoria), em camadas com confiança e motivo: regras e contatos PIX (1,0) → dicionário `src/domain/dados/comerciantes.ts` (0,9) → categoria do banco no arquivo (0,8) → histórico igual (0,7–0,8) → palavras-chave `palavrasChave.ts` (0,7) → histórico parecido (0,6). Abaixo de 0,7 (`CONFIANCA_MINIMA`) a linha "precisa de você". PIX para pessoa (`pareceNomeDePessoa`) não usa palavra-chave.
- **`conciliarExtrato`**: conta fixa do mês (valor ±5% e data ±5 dias, com nome parecido ou mesma categoria se o valor não for quase igual) → baixa na ocorrência; fatura (valor igual ao total, ou texto de pagamento de fatura) → baixa e saída ligada; pagamento que o app já tem → "já paga"; transferência entre contas suas (outro lado já no app, contato/regra de conta própria, "mesma titularidade", aplicação) → transferência; receita recorrente prevista → confirmada com o valor do banco; salário (texto ou mesma fonte em ≥ 3 meses). Na fatura do cartão, parcela ou conta fixa que já está no app → "já na fatura".
- **`detectarPadroes`**: `detectarParcelamentos` (marca n/N na fatura sem compra parcelada no app), `detectarRecorrencias` (mesmo comerciante/pessoa, valor ±10%, dia ±5, ≥ 3 meses seguidos somando o app; fora o que aparece muitas vezes no mês, parcelas e o que já é conta fixa).
- **`reavaliarPerguntas`** (rodado pela Revisão ao abrir e depois de cada "Sempre fazer assim"): o que o categorizador de agora já sabe responder vira resposta automática, e perguntas com a mesma chave nova se juntam (`juntarPerguntas`). A Revisão mostra cada lançamento (data, valor, PIX/débito/cartão), filtra Conta × Cartão de crédito e tem "Não sei" (categoria Não identificado).
- **Prints** (`lerTextoColado`): texto copiado com o Texto ao Vivo do iPhone (um bloco por print; repetido entre prints entra uma vez), para a fatura em aberto.
- **`montarFilaDePerguntas`**: transforma o que sobrou em perguntas agrupadas (uma por pessoa do PIX, uma por texto sem categoria, compra parcelada, conta fixa, possível duplicata) e ordena pelo impacto. **`planejarResposta`** (puro) decide o que gravar para cada resposta; "Sempre fazer assim" cria regra ou contato PIX. Compra parcelada criada pela resposta fica com as N parcelas (as anteriores pagas) e o gasto importado vira a parcela do mês.
- **Resultado e desfazer**: `resumirImportacao` (entradas, gastos por categoria, comparação com o mês anterior, `detectarForaDoPadrao`) alimenta `app/importar-extrato/resultado.tsx`, com o `GraficoProjecao` (também no Planejamento). `desfazerImportacao` (repositório) apaga as linhas da importação e volta tudo o que está em `efeitos` (parcelas, faturas, lançamentos alterados, compras/contas fixas criadas pelas respostas, gastos antigos que viraram parcela); `importacoesQueDependem` impede desfazer uma importação usada por outra mais nova. As regras aprendidas continuam.
- **`analisarImportacao(extrato, destino, existentes, inteligencia)`** junta tudo e monta o resumo; **`montarRegistroDeImportacao`** devolve o que gravar (linhas, baixas, alterações, regras novas), e `registrarImportacao` grava numa transação só, guardando os `efeitos`.

**Cofre 2.0 — notificações (Fase 3):**

- Só locais (`expo-notifications`); no Expo Go Android o módulo não existe e tudo vira no-op (`notificacoesIndisponiveis`).
- **`planejarNotificacoes`** (puro, `src/domain/usecases/notificacoes/`) decide tudo o que deve estar agendado a partir de `obterLancamentosDoPeriodo`: vencimento de conta fixa e de fatura (agrupados por dia), fechamento da fatura, conta atrasada, parcelas do mês, fechamento do mês, resumo semanal, lembrete de importar e de backup. Nada entre 21h e 8h, no máximo 60 agendadas (limite do iOS é 64). Configuração por tipo em `preferencias.config_notificacoes` (`lerConfigNotificacoes`), adiamentos ("Lembrar amanhã") em `preferencias.adiamentos_notificacoes`.
- **`reagendarTodas()`** (`src/core/notifications/agendador.ts`) cancela e reagenda; roda ao abrir, ao voltar do segundo plano e, com `pedirReagendamento()` (debounce), depois de qualquer mutação nos stores. A permissão é pedida na primeira conta fixa (`pedirPermissaoNaPrimeiraVez`) ou em Configurações → Notificações, nunca na abertura.
- Ações: "Marcar como paga" (conta fixa) e "Lembrar amanhã"; tocar abre a tela pelo `url` (ex.: `/pagamentos?mes=2026-10&item=parcela-12`, que já mostra o botão de marcar como paga). Tratado em `src/components/RespostasDeNotificacao.tsx`.
- Marcos de cofrinho (25/50/75/100%) avisam na hora (`marcoAtingido`).

**Cofre 2.0 — automações (Fase 4, `src/domain/usecases/automacoes/`):**

- **Orçamento** (`orcamento.ts`): `orcamentoDoMes`, `progressoDosOrcamentos` (pela competência, só consumo; âmbar em 80%, vermelho em 100%), `sugerirOrcamentos` (média dos 3 meses fechados, categorias com gasto em ≥ 2 deles, para cima em R$ 10), `alertaDeOrcamento`. Tela `app/orcamento`. Aviso na hora em 80%/100% por `avisarOrcamentos` (`src/core/notifications/alertas.ts`), chamado junto do reagendamento.
- **Assinaturas** (`assinaturas.ts`): tudo na categoria Assinaturas (contas fixas e cobranças repetidas); aumento = 5% e R$ 1 acima da maior das 3 anteriores. Tela `app/assinaturas`.
- **Simuladores** (`simuladores.ts`): `simularCompra` ("Dá para comprar?", veredito pelo mês mais justo; apertado = sobra < 10% da renda), `simularQuitacao`, `melhorCartaoParaHoje`, `custoFixoMensal` / `sugerirMetaDaReserva` (6×) / `mesesCobertos`. Telas `app/simulador` e `app/simulador/quitacao`; fatura prevista e melhor cartão na aba Cartões.
- **Divisão do salário** (`divisaoSalario.ts`): 10% reserva + 5% cofrinhos por padrão, nunca deixa o Livre para gastar negativo; card no Início com Guardar/Ajustar/Agora não e snackbar de Desfazer.
- **Insights do Início** (`insights.ts`, `saldoProjetado.ts`): saldo negativo previsto por conta, orçamento estourado, assinatura que subiu, gasto fora do padrão, orçamento em 80%, melhor cartão; no máximo 3, com "Entendi" (`src/components/inicio/AutomacoesDoInicio.tsx`).
- **Pagamentos de fatura soltos** (`faturasSoltas.ts`): saída da conta com o valor da fatura em aberto perto do vencimento (ou "pagamento de fatura"/boleto do banco do cartão) que entrou como gasto — Agenda (`FaturasParaArrumar`) e Início avisam e `ligarPagamento` liga à fatura (registra nos `efeitos` da importação para desfazer); faturas antigas sem pagamento podem ser marcadas como pagas.
- **Assistente da Ajuda** (`src/domain/usecases/ajuda/assistente.ts`, tela `app/ajuda`): sem IA; pelas palavras da pergunta responde gastos (por período e categoria/loja), saldo, livre para gastar, faturas, maior gasto, entradas, como exportar de cada banco e os artigos de `src/domain/dados/ajuda.ts`.
- **Fechamento do mês** (`fechamentoDoMes.ts`, tela `app/fechamento-mes`), **busca** (`busca.ts`, tela `app/busca`), **relatório e PDF** (`relatorio.ts` → HTML → `expo-print`, em Relatórios).
- **Comprovante**: `src/core/comprovantes/comprovantes.ts` (expo-image-picker + expo-image-manipulator: 1280 px, JPEG 0,6) e `ComprovanteField` nas telas de editar gasto e movimentação.

## 8. Rotas / telas (Expo Router)

Navegação do Cofre 2.0 (Fase 5): **5 abas — Início · Extrato · (+) · Agenda · Metas**. Nenhuma tela foi removida: Cartões, Planejamento e Mais viraram telas do Stack (abrem pelo Início — "Seu dinheiro", "Próximos meses" e o ícone de menu), e Pagamentos está inteira dentro da Agenda (`PainelDePagamentos`); a rota `/pagamentos` só redireciona para `/agenda` (links antigos de notificação).

| Rota | Conteúdo |
|---|---|
| `(tabs)/dashboard.tsx` (Início) | Livre para gastar (com ritmo e "Ver a conta"), aviso de perguntas pendentes, automações (divisão do salário, fechamento do mês, insights), próximos 7 dias com "Paguei", Seu dinheiro (contas, faturas, guardado), gráfico dos próximos meses, atalhos, resumo do mês, gastos fixos, por categoria e últimos lançamentos. Filtro por membro. |
| `(tabs)/lancamentos.tsx` (Extrato) | Lista única do mês (`obterLancamentosDoPeriodo`), agrupada por dia, filtros por tipo, conta/cartão, categoria e membro, busca |
| `categorias/index.tsx`, `ajuda/index.tsx` | Categorias (criar, renomear, cor, juntar) e Ajuda (assistente sem IA + tour de novo) |
| `(tabs)/novo.tsx` (+) | Botão do meio: abre a `FolhaDeAcoes` (gasto rápido em destaque, grade e importar) (Modal do React Native; a folha nativa formSheet abria em branco no iPhone) com gasto rápido, entrada, transferência, saída, compra parcelada, importar extratos, conta fixa e cofrinho. A rota `acoes.tsx` (modal) mostra a mesma lista |
| `(tabs)/agenda.tsx` | Calendário do mês com pontos (pago/pendente/atrasado/entrada), lista do dia, "Pago · Falta", menor saldo previsto e a tela de Pagamentos inteira |
| `(tabs)/metas.tsx` | Reserva de emergência, cofrinhos, orçamento do mês (resumo) e assinaturas |
| `cartoes.tsx`, `cartao/[id].tsx` | Cartões (limite, fatura prevista, melhor cartão para hoje) e detalhe |
| `planejamento.tsx` | Projeção de 6 meses (cards + gráfico), "Dá para comprar?" e "Adiantar parcelas" |
| `mais.tsx` | Cartões, planejamento, contas, importação, regras, orçamento, assinaturas, fechamento, busca, relatórios, membros, backup e configurações |
| `gasto-rapido.tsx` (modal) | 3 campos: valor, categoria, descrição — salvar em menos de 10s |
| `importar-extrato/index.tsx`, `lote.tsx` | Um arquivo (com prévia, senha de PDF e mapeamento de CSV) ou vários de uma vez (cria contas/cartões e importa o ano todo) |
| `relatorios/anual.tsx` | Relatório do ano (`montarRelatorioAnual`): receitas × despesas mês a mês, sobra e taxa de poupança, categorias, maiores gastos, cartões, membros, saldo das contas, comparação com o ano anterior e PDF |
| `conta-fixa/novo.tsx` e `[id].tsx` | Form completo: nome, categoria, valor, vencimento, forma de pagamento, conta/cartão, recorrência, membro |
| `cofrinho/novo.tsx` e `[id].tsx` | Nome, meta, ícone/cor, rendimento e aportes com progresso |

Excluir gasto, movimentação, regra ou contato mostra "Desfazer" por 5 s (`useAvisoStore` + `AvisoGlobal`) em vez de pedir confirmação. Estados vazios sempre com uma ação (`EmptyState` → `acao`).

## 9. Convenções de código

- TypeScript **strict**. Sem `any` — usar tipos explícitos ou `unknown` + narrowing.
- Nomes de domínio (entidades, campos, funções de negócio) em **português**, consistente com o schema acima (ex.: `calcularSaldoDisponivel`, não `calculateAvailableBalance`). Nomes técnicos genéricos (props de componentes React puros, tipos utilitários) podem ficar em inglês.
- Toda formatação de moeda passa por `src/core/utils/currency.ts` (formato `R$ 1.234,56`, pt-BR).
- Nunca formatar data manualmente — usar `date-fns` com locale pt-BR.
- Componentes de UI reutilizáveis ficam em `src/components/`, telas específicas ficam em `app/`.
- Cada `usecase` é uma função pura (recebe dados, retorna dados/decide o que gravar) — **não** deve importar React nem componentes.

## 10. Ordem de implementação (siga esta sequência — não pule etapas)

**Fase 1 — Fundação**
1. `npx create-expo-app` com template TypeScript + Expo Router.
2. Configurar `expo-sqlite` + Drizzle, gerar schema (seção 6) e rodar a primeira migration.
3. Popular categorias padrão (seed inicial: Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Salário, etc.)
4. Layout base (`_layout.tsx`, tabs, tema claro/escuro adaptado Material/Cupertino).

**Fase 2 — Fatia vertical mínima (valida a arquitetura ponta a ponta)**
5. CRUD de Contas Bancárias.
6. CRUD de Movimentações manuais (entrada/saída/transferência).
7. Dashboard mínimo mostrando só saldo atual (via `calcularSaldoConta`).

**Fase 3 — MVP**
8. CRUD de Contas Fixas + `gerarRecorrencia`.
9. Gasto rápido (modal).
10. CRUD de Cartões + Compras Parceladas + `gerarParcelas`.
11. Dashboard completo (todos os cards da seção 8).
12. Membros da família (CRUD simples + campo `membroId` nos formulários acima).

**Fase 4 — v1.0**
13. Cálculo completo de fatura (`calcularFatura`), tela de detalhe do cartão.
14. Cofrinhos + Reserva de Emergência (com progresso e previsão).
15. Planejamento financeiro (`projetarFluxoCaixa`).
16. Relatórios com gráficos (Victory Native): por categoria, mês, cartão, conta, membro.
17. Notificações locais (`expo-notifications`): vencimento de conta, parcela, fechamento de cartão, meta atingida.
18. Importação de extrato CSV/OFX (`expo-document-picker` + parser).

**Fase 5 — não implementar ainda, apenas deixar preparado**
- Qualquer coisa que exija sair do Expo Go (backup iCloud/Drive nativo, leitura de notificações bancárias, widgets) fica fora do escopo até o usuário pedir explicitamente e confirmar que está pronto para usar EAS Build.

## 11. O que NÃO fazer

- Não usar Redux, MobX ou outras libs de estado pesadas — Zustand é suficiente.
- Não criar backend, API, nem qualquer chamada de rede além de bibliotecas puramente locais.
- Não usar bibliotecas com passo de instalação nativo (`pod install`, edição manual de `Info.plist`/`AndroidManifest.xml`) sem avisar o usuário antes (ver seção 3).
- Não deixar `saldo_atual`, `valor_total` de fatura, ou `valor_atual` de cofrinho como campos editáveis diretamente — sempre calculados (seção 6).
- Não alterar parcelas já pagas ao editar um parcelamento (seção 7, regra 2).

## 12. Comandos úteis

```bash
npx create-expo-app@latest . --template blank-typescript   # bootstrap inicial
npx expo start                                              # inicia o dev server (QR code p/ Expo Go)
npx expo start --tunnel                                     # acesso fora da rede local
npx drizzle-kit generate                                    # gera migrations a partir do schema
npm run lint                                                # lint (configurar ESLint + Prettier no setup)
npm test                                                    # testes (Jest + jest-expo) dos usecases e parsers
```

Testes ficam em `__tests__/` ao lado do código (ex.: `src/domain/usecases/__tests__/`), importam `describe/it/expect` de `@jest/globals` (o TypeScript 6 não carrega tipos globais por padrão) e usam as fábricas e cenários de `src/test/`.

## 13. Identidade visual — Cofre Klaus

Marca do app: **Cofre Klaus** (nome escolhido em out/2026, ver `docs/pesquisa-concorrentes.md`). Só o nome **exibido** mudou (`app.json` → `name`, `src/core/marca.ts` → `NOME_DO_APP`); `slug`, `scheme`, o banco `cofre.db` e as chaves do SecureStore continuam "cofre" — mudar qualquer um deles troca a identidade no Expo Go e o app abre vazio (§14).

- **Logo**: quadrado arredondado azul `#2A5CE0` com um "K" claro desenhado como porta de cofre (a haste é a dobradiça, com duas presilhas) e um ponto ciano no lugar do segredo. Geometria única em `scripts/marca-klaus.js` (ícones, splash e favicon via `node scripts/generate-brand-assets.js`) e espelhada em `src/components/Logo.tsx`. No Expo Go o ícone do app não muda na tela do iPhone (só num build próprio).

- **Paleta** (fonte da verdade: `src/core/theme/colors.ts`, espelhada à mão em `tailwind.config.js`): azul elétrico + ciano, alto contraste.
  - Marca: brand `#2A5CE0` (no escuro `#5B8CFF`), brandDark `#1A3FA8`; acento ciano `#06B6D4` (no escuro `#22D3EE`), também usado como "sucesso"; perigo/despesa `#D32F2F`.
  - Tema claro: fundo `#F2F4F8`, cards `#FFFFFF`, borda `#CBD2E0`, texto `#0F1320`, texto secundário `#666E7E`.
  - Tema escuro: fundo `#0A0D14`, cards `#141926`, borda `#242B3D`, texto `#EEF1F8`, texto secundário `#8891A6`.
  - Âmbar `#B45309` (no escuro `#F59E0B`) só para "precisa de atenção" (perguntas pendentes, alertas) — entra no Cofre 2.0.
- **Tipografia**: Manrope (headings e valores monetários, tabular figures), fonte do sistema para texto corrido.
- **Estilo**: cards com borda 1px (sem sombras pesadas), cantos 12–16px, ícones de linha simples, sem gradientes/glassmorphism. Alvo de toque ≥ 44px e contraste ≥ 4,5:1.
- Tokens implementados em `src/core/theme/`.

## 14. Distribuição e identidade no Expo Go (lições de outubro/2026)

- **Nunca gravar `extra.eas.projectId` nem `updates` no `app.json`.** O `app.config.js` injeta ambos só quando `COFRE_PUBLICAR=1` (`npm run publicar`). Com projectId presente, o Expo CLI assina o manifesto do servidor de desenvolvimento e o Expo Go passa a guardar o banco SQLite sob a identidade `@cofre-familia/cofre`, em vez de `@anonymous/cofre-<uuid de ~/.expo/state.json>`. Trocar a identidade faz o app abrir vazio no aparelho (os dados antigos continuam no outro sandbox).
- **Expo Go iOS (SDK 57+) exige a mesma conta** no CLI e no Expo Go para abrir o servidor de desenvolvimento, e desde maio/2026 só carrega updates publicados de projetos da conta logada ou da organização dela. Android ainda não aplica. Não há configuração do nosso lado que mude isso.
- **Projeto EAS**: `@cofre-familia/cofre` (organização `cofre-familia`, dona: `gregory.ks`). Projeto transferido entre contas mantém a chave antiga e dá 403 para membros; por isso ele foi recriado direto na organização. Publicação: `npm run publicar` (branch e canal `preview`).
- Guia manual de servidor em `docs/SERVIDOR.md`.
