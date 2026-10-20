# Projeto: App de Controle Financeiro Pessoal — Arquitetura Completa

## 1. Resumo e decisões técnicas principais

| Decisão | Escolha recomendada | Por quê |
|---|---|---|
| Framework | **Flutter** | Único codebase, alta performance, widgets nativos Material/Cupertino, forte para apps offline-first |
| Banco de dados local | **SQLite via Drift** (não Hive/Isar) | Ver seção 1.1 |
| Gerência de estado | **Riverpod** (v2, code-gen) | Testável, DI nativo, sem BuildContext em regras de negócio |
| Arquitetura | **Clean Architecture simplificada + MVVM** | Separa regra de negócio da UI, facilita evoluir para backend depois |
| Notificações locais | `flutter_local_notifications` | Vencimentos, faturas, metas — tudo local, sem servidor |
| Gráficos | `fl_chart` | Leve, nativo Flutter, sem dependência de WebView |
| Backup | iCloud (`icloud_storage`) / Google Drive (`google_sign_in` + Drive API) | Sem backend próprio (ver seção 8) |

### 1.1 Por que Drift/SQLite em vez de Hive ou Isar

Você pediu para considerar Hive ou Isar, mas vale alinhar expectativa antes de começar: **Hive e Isar foram abandonados pelo autor original** e hoje sobrevivem apenas por forks mantidos pela comunidade (`hive_ce`, forks de Isar). Para um app que você quer que dure anos e evolua, apostar nessas bibliotecas significa herdar risco de manutenção. O consenso atual da comunidade Flutter é usar **Drift** (ORM reativo sobre SQLite) como escolha "segura e chata" — tipado, com migrations versionadas, streams reativas nativas para a UI, e builds isolate para não travar a thread principal.

Isso também combina melhor com o seu domínio: contas fixas, parcelamentos, cartões e contas bancárias têm relações fortes entre si (uma parcela pertence a uma compra, que pertence a um cartão, que pertence a uma pessoa/perfil). Isso é relacional por natureza — SQL é o modelo certo, não NoSQL orientado a documentos.

Se no futuro você quiser algo ainda mais rápido que Drift para volumes grandes, **ObjectBox** é uma alternativa NoSQL ativamente mantida (inclusive com sync proprietário opcional pago) — mas não é necessário para um app financeiro pessoal, cujo volume de dados é pequeno (milhares de lançamentos, não milhões).

---

## 2. Arquitetura geral (camadas)

```
┌─────────────────────────────────────────────┐
│                 PRESENTATION                 │
│  Screens / Widgets (Material + Cupertino)    │
│  Riverpod Providers (state, controllers)     │
└───────────────────┬───────────────────────────┘
                    │  chama
┌───────────────────▼───────────────────────────┐
│                   DOMAIN                      │
│  Entities (puras, sem dependência de Flutter) │
│  UseCases (regras de negócio: gerar parcelas, │
│  calcular fatura, projetar fluxo de caixa)    │
│  Repository INTERFACES (contratos)            │
└───────────────────┬───────────────────────────┘
                    │  implementa
┌───────────────────▼───────────────────────────┐
│                    DATA                       │
│  Repository IMPLEMENTATIONS                   │
│  DataSources: Drift (SQLite local)            │
│  DataSources: Backup (iCloud/Drive) — futuro  │
└───────────────────┬───────────────────────────┘
                    │
┌───────────────────▼───────────────────────────┐
│                    CORE                       │
│  DB (Drift), DI (Riverpod), Notifications,    │
│  Utils (formatação de moeda, datas), Themes   │
└─────────────────────────────────────────────┘
```

**Por que essa separação importa para você:** quando um dia quiser adicionar sincronização entre dispositivos ou multiusuário, você troca só a camada `data` (implementações de repositório) sem tocar em `domain` nem em `presentation`. É o que garante a "evolução futura" que você pediu, sem precisar reescrever o app.

---

## 3. Estrutura de pastas

```
lib/
├── main.dart
├── app.dart                          # MaterialApp/CupertinoApp, rotas, tema
│
├── core/
│   ├── database/
│   │   ├── app_database.dart         # Drift: definição do DB + migrations
│   │   ├── tables/                   # Uma tabela Drift por entidade
│   │   └── daos/                     # Data Access Objects (queries)
│   ├── di/
│   │   └── providers.dart            # Riverpod: injeção de repositórios/DB
│   ├── notifications/
│   │   └── notification_service.dart
│   ├── theme/
│   │   ├── app_theme.dart            # Material + Cupertino adaptativo
│   │   └── colors.dart
│   └── utils/
│       ├── currency_formatter.dart
│       ├── date_utils.dart
│       └── platform_adaptive.dart    # Widget.adaptive() helpers
│
├── domain/
│   ├── entities/
│   │   ├── conta_fixa.dart
│   │   ├── gasto.dart
│   │   ├── compra_parcelada.dart
│   │   ├── parcela.dart
│   │   ├── cartao.dart
│   │   ├── fatura.dart
│   │   ├── conta_bancaria.dart
│   │   ├── movimentacao.dart
│   │   ├── cofrinho.dart
│   │   ├── reserva_emergencia.dart
│   │   ├── meta_financeira.dart
│   │   └── categoria.dart
│   ├── usecases/
│   │   ├── gerar_parcelas_usecase.dart
│   │   ├── gerar_recorrencia_usecase.dart
│   │   ├── calcular_fatura_usecase.dart
│   │   ├── calcular_saldo_disponivel_usecase.dart
│   │   ├── projetar_fluxo_caixa_usecase.dart
│   │   └── calcular_progresso_cofrinho_usecase.dart
│   └── repositories/                 # Interfaces abstratas
│       ├── conta_fixa_repository.dart
│       ├── cartao_repository.dart
│       └── ...
│
├── data/
│   └── repositories/                 # Implementações concretas (usam Drift)
│       ├── conta_fixa_repository_impl.dart
│       └── ...
│
├── features/                         # Um módulo por tela/fluxo (MVVM)
│   ├── dashboard/
│   │   ├── dashboard_screen.dart
│   │   ├── dashboard_controller.dart # Riverpod StateNotifier/AsyncNotifier
│   │   └── widgets/
│   ├── contas_fixas/
│   ├── gastos_rapidos/
│   ├── parcelamentos/
│   ├── cartoes/
│   ├── contas_bancarias/
│   ├── cofrinhos/
│   ├── reserva_emergencia/
│   ├── planejamento/
│   ├── relatorios/
│   └── configuracoes/
│       └── backup/                   # iCloud / Drive (fase futura)
│
└── shared_widgets/
    ├── currency_input_field.dart
    ├── category_picker.dart
    ├── progress_bar_card.dart
    └── month_selector.dart
```

---

## 4. Modelagem de dados (entidades e relacionamentos)

### 4.1 Diagrama conceitual

```
Categoria 1───* Gasto
Categoria 1───* ContaFixa
Categoria 1───* CompraParcelada

ContaBancaria 1───* Movimentacao
ContaBancaria 1───* ContaFixa (forma de pagamento = débito em conta)
ContaBancaria 1───* Cofrinho (opcional: vincular a uma conta "poupança")

Cartao 1───* Fatura
Fatura 1───* Parcela
CompraParcelada 1───* Parcela
ContaFixa 1───* Ocorrencia (uma por mês, se recorrente)

Cofrinho: meta, valor atual, histórico de aportes (1───* AporteCofrinho)
ReservaEmergencia: singleton (uma por perfil), meta e valor atual
MetaFinanceira 1───* Aporte (genérico: aplica-se a metas customizadas)
```

### 4.2 Tabelas principais (colunas essenciais)

**categorias**
`id, nome, icone, cor, tipo (receita/despesa), is_padrao`

**contas_bancarias**
`id, banco, nome_conta, saldo_inicial, saldo_atual (calculado), cor, icone, ativo`

**movimentacoes** (extrato de contas)
`id, conta_bancaria_id, tipo (entrada/saida/transferencia), valor, data, descricao, categoria_id, conta_destino_id (se transferência), origem (manual/conta_fixa/gasto/parcela)`

**cartoes**
`id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo`

**faturas** (uma por cartão/mês, gerada automaticamente)
`id, cartao_id, mes_referencia, data_fechamento, data_vencimento, valor_total (calculado), status (aberta/fechada/paga)`

**compras_parceladas**
`id, descricao, valor_total, num_parcelas, cartao_id, categoria_id, data_compra, ativo`

**parcelas**
`id, compra_parcelada_id (nullable), conta_fixa_id (nullable), numero (1/12, 2/12...), valor, mes_referencia, fatura_id, status (pendente/paga), data_pagamento`
> Uma parcela pode vir de uma compra parcelada OU ser a ocorrência mensal de uma conta fixa recorrente — por isso os dois campos nullable, com constraint de "exatamente um preenchido".

**contas_fixas**
`id, nome, categoria_id, valor, dia_vencimento, forma_pagamento (debito/cartao/boleto), conta_bancaria_id (nullable), cartao_id (nullable), recorrencia (mensal/quinzenal/semanal/anual/unica), data_inicio, data_fim (nullable), ativo`

**gastos_rapidos**
`id, valor, categoria_id, descricao, data, forma_pagamento, conta_bancaria_id (nullable), cartao_id (nullable)`

**cofrinhos**
`id, nome, valor_meta, valor_atual (calculado por aportes), data_meta (opcional), cor, icone, status (ativo/concluido)`

**aportes_cofrinho**
`id, cofrinho_id, valor, data`

**reserva_emergencia**
`id, valor_meta, valor_atual, meses_cobertura_desejados (opcional, para calcular meta automaticamente a partir dos gastos fixos)`

**metas_financeiras** (metas livres, não ligadas a cofrinho)
`id, nome, valor_meta, valor_atual, data_meta, categoria (viagem/compra/investimento/outro)`

### 4.3 Regras de negócio importantes (para os UseCases)

- **Geração de parcelas**: ao salvar uma `CompraParcelada`, o `GerarParcelasUseCase` cria N registros em `parcelas`, distribuindo `valor_total / num_parcelas` (com ajuste de centavos na última parcela) e associando cada uma ao `mes_referencia` correto a partir da data de fechamento do cartão.
- **Edição de parcelamento**: se o usuário edita valor/número de parcelas, o usecase **recalcula apenas as parcelas com status "pendente"** — parcelas já pagas não são alteradas retroativamente. Isso evita que seu histórico financeiro mude sozinho.
- **Recorrência de contas fixas**: um job local (executado ao abrir o app, comparando `data_atual` com a última ocorrência gerada) cria automaticamente as próximas ocorrências dentro de uma janela (ex.: sempre manter os próximos 3 meses gerados).
- **Cálculo de fatura**: `valor_total` da fatura é a soma de todas as `parcelas` cujo `fatura_id` aponta para ela — nunca um campo editável manualmente, para evitar inconsistência.
- **Saldo disponível para gastar no mês**: `receita_prevista - contas_fixas_do_mes - parcelas_do_mes - media_gastos_variaveis_ja_realizados`.

---

## 5. Fluxo de telas

```
                        ┌─────────────┐
                        │  Dashboard  │  (tela inicial)
                        └──────┬──────┘
        ┌───────────┬──────────┼──────────┬───────────┬────────────┐
        ▼           ▼          ▼          ▼           ▼            ▼
   Contas Fixas  Cartões  Contas Banc.  Cofrinhos  Planejamento  Relatórios
        │           │          │          │
        ▼           ▼          ▼          ▼
   Nova Conta   Nova Fatura  Nova Mov.  Novo Cofrinho
   Fixa/Editar   (auto)     /Transfer.   /Aporte

   [FAB flutuante em todas as telas] → Gasto Rápido (bottom sheet, 3 campos, <10s)
   [FAB secundário]                  → Nova Compra Parcelada
```

- **Navegação**: `BottomNavigationBar` adaptativo (Material no Android, estilo tab bar no iOS via `CupertinoTabScaffold`) com 4-5 destinos principais: Dashboard, Lançamentos, Cartões/Contas, Planejamento, Mais.
- **Gasto rápido**: acessível de qualquer tela via FAB — abre um bottom sheet modal, não uma tela nova, para não quebrar o fluxo.
- **Detalhe de cartão**: mostra fatura atual, próxima fatura prevista, limite disponível, e lista de parcelas futuras agrupadas por mês (accordion).

---

## 6. Dashboard — dados exibidos e origem

| Card do dashboard | Fonte do cálculo |
|---|---|
| Saldo atual | Soma de `saldo_atual` de todas as `contas_bancarias` |
| Quanto ainda posso gastar | UseCase `calcular_saldo_disponivel` (seção 4.3) |
| Total a pagar / já pago | Soma de `parcelas` + `contas_fixas` do mês, por status |
| Próximos vencimentos | Query ordenada por `data_vencimento`, próximos 7-15 dias |
| Gastos por categoria | Agregação de `movimentacoes` + `gastos_rapidos` do mês, agrupado por `categoria_id` |
| Valor reservado | `reserva_emergencia.valor_atual` |
| Valor dos cofrinhos | Soma de `valor_atual` de todos os `cofrinhos` |
| Previsão próximo mês | UseCase `projetar_fluxo_caixa` (contas fixas + parcelas já geradas para o mês seguinte) |

---

## 7. Apple Wallet — o que é e não é possível

Você pediu para avaliar detecção automática de compras via Apple Wallet. Importante alinhar expectativa aqui, porque isso é uma limitação de plataforma, não de implementação:

**O que a Apple permite (framework PassKit):**
- Criar e distribuir *passes* (cartões de fidelidade, ingressos, cupons) que aparecem na Wallet.
- Atualizar um pass já instalado remotamente (via push).
- Ler dados **do próprio pass que seu app criou** — não de passes de terceiros.

**O que a Apple NÃO permite, por design de privacidade:**
- Nenhum app de terceiros tem acesso à lista de compras feitas com Apple Pay, extratos de cartão salvos na Wallet, ou notificações de transação de outros emissores. Isso é proposital: a Apple isola essa informação para o próprio sistema e para o banco emissor do cartão.
- Não existe API pública para "escutar" transações do Apple Pay em segundo plano.

**Alternativas viáveis para você, em ordem de robustez:**

1. **Open Finance Brasil (Open Banking)** — a alternativa mais forte para um usuário no Brasil. Bancos regulados pelo Banco Central são obrigados a expor APIs padronizadas de extrato e saldo mediante seu consentimento. Existem agregadores (Pluggy, Belvo) que simplificam a integração — mas isso **exige backend próprio** (mesmo que simples/serverless), porque as credenciais OAuth do Open Finance não podem ficar só no app. Isso contradiz seu requisito de "zero servidor", então é algo para avaliar como fase bem futura, com um backend mínimo (ex.: Cloudflare Workers gratuito) só para esse fluxo.
2. **Leitura de notificações do sistema (Android apenas)** — usando `NotificationListenerService`, é possível capturar notificações de apps de banco/cartão (ex.: "Compra aprovada R$ 50,00 no Mercado") e fazer parsing de texto para sugerir um lançamento. Funciona bem na prática, mas é frágil (cada banco muda o texto da notificação) e **não existe equivalente no iOS** — a Apple não permite acesso a notificações de outros apps por política de privacidade.
3. **Importação de extrato (CSV/OFX)** — a maioria dos bancos permite exportar extrato em CSV ou OFX. Um importador dentro do app (mapeando colunas, com preview antes de confirmar) é 100% viável offline, funciona igual em iOS e Android, e é provavelmente a melhor relação esforço/benefício para automatizar lançamentos sem depender de servidor.
4. **Compartilhamento manual via Share Sheet** — o app pode se registrar como destino de "compartilhar" (share extension), permitindo que você encaminhe um e-mail de confirmação de compra ou um SMS diretamente para o app, que tenta extrair valor/estabelecimento via regex/heurística simples.

**Recomendação:** para a v1.0, foque na opção 3 (importação CSV/OFX) — é a única 100% offline, sem servidor e igualmente boa nas duas plataformas. Deixe Open Finance como funcionalidade de uma versão futura, já assumindo que ela vai exigir um pequeno backend.

---

## 8. Sincronização e backup (sem backend próprio)

| Plataforma | Mecanismo | Como funciona |
|---|---|---|
| iOS | **iCloud (CloudKit ou iCloud Documents)** | O arquivo `.sqlite` (ou um export criptografado) é salvo no container iCloud do app via `icloud_storage` ou `flutter_icloud`. Sincroniza entre iPhones do mesmo usuário automaticamente, sem servidor seu. |
| Android | **Google Drive (App Data folder)** | Usando `google_sign_in` + Drive API (escopo `drive.appdata`), que é gratuito e não exige aprovação de app "verificado" pelo Google, porque `appdata` é uma pasta privada e oculta do app. |

**Estratégia recomendada:** não sincronizar em tempo real — fazer **backup/restore sob demanda** (botão "Fazer backup agora" + backup automático diário/semanal em segundo plano). Isso é muito mais simples de implementar corretamente do que sync bidirecional em tempo real, e resolve 100% do seu requisito real, que é "não perder dados se trocar de celular".

Fluxo: exportar o banco Drift para um arquivo, opcionalmente compactar, enviar para iCloud/Drive. Restore: baixar o arquivo mais recente, validar versão do schema, substituir/mesclar.

---

## 9. Recursos exclusivos por plataforma

**iOS (diferenciais a explorar depois do MVP):**
- Widgets de tela de bloqueão / Home Screen (WidgetKit via Flutter `home_widget`) mostrando saldo disponível do mês.
- Siri Shortcuts para "registrar gasto rápido por voz".
- Face ID / Touch ID para abrir o app (`local_auth`).

**Android (diferenciais a explorar depois do MVP):**
- Widgets de home screen nativos (App Widgets).
- Leitura de notificações de banco (`NotificationListenerService`) — ver seção 7, opção 2.
- Atalhos dinâmicos (App Shortcuts) no ícone do app: "Gasto rápido", "Ver fatura".

---

## 10. O que é gratuito vs. tem limitação

| Recurso | Gratuito? | Limitação |
|---|---|---|
| SQLite/Drift local | Sim, sem limite | — |
| Notificações locais | Sim | Não funcionam se o app for "force stopped" pelo usuário no Android; precisa reagendar ao abrir o app |
| Backup iCloud | Sim | Conta iCloud do usuário precisa ter espaço disponível (5GB grátis padrão da Apple) |
| Backup Google Drive (appdata) | Sim, ilimitado dentro da cota da conta Google | Cota de 15GB compartilhada da conta Gmail padrão do usuário |
| Open Finance Brasil | Gratuito para o usuário final, mas exige registro de aplicação e (na prática) um backend mínimo | Não é "zero servidor" — avaliar como fase 4+ |
| Gráficos (`fl_chart`) | Sim, open source | — |
| Publicação na App Store | **Paga**: US$99/ano (conta de desenvolvedor Apple) | Necessário mesmo para uso pessoal via TestFlight/instalação direta em alguns cenários |
| Publicação na Play Store | **Paga**: US$25 (taxa única) | Não necessária se for só instalar no seu próprio Android via APK/sideload |

> Se o app é só para uso pessoal, você pode evitar completamente as taxas de loja: no Android, basta instalar o APK diretamente (sideload); no iOS, é possível instalar via Xcode diretamente no seu iPhone com uma conta Apple gratuita (sem taxa), com a limitação de que o app expira a cada 7 dias e precisa ser reinstalado pelo Xcode — a conta paga de US$99/ano só é necessária se quiser TestFlight ou validade de 1 ano sem reconectar o cabo.

---

## 11. Roadmap de desenvolvimento

### MVP (uso pessoal imediato — foco: substituir planilha)
- Setup do projeto (Flutter + Drift + Riverpod + tema adaptativo)
- Cadastro de categorias (com categorias padrão pré-carregadas)
- Contas bancárias (CRUD + movimentações manuais: entrada/saída/transferência)
- Contas fixas (CRUD + recorrência mensal, sem quinzenal/semanal/anual ainda)
- Gastos rápidos (bottom sheet)
- Cartões (CRUD simples, sem cálculo automático de fatura ainda)
- Compras parceladas (geração automática de parcelas)
- Dashboard básico (saldo atual, contas a pagar/pagas, próximos vencimentos)
- Persistência 100% local, sem backup ainda

### v1.0 (app completo para uso diário)
- Recorrência quinzenal/semanal/anual
- Cálculo automático de fatura por cartão (fechamento/vencimento, limite disponível)
- Cofrinhos + reserva de emergência com progresso e previsão de conclusão
- Planejamento financeiro (projeção de meses futuros)
- Relatórios com gráficos (`fl_chart`): por categoria, mês, cartão, conta
- Notificações locais (vencimento de conta, parcela, fechamento de cartão, meta atingida)
- Importação de extrato CSV/OFX
- Backup manual iCloud/Google Drive

### Futuro (evolução)
- Backup automático agendado
- Widgets de tela inicial (iOS WidgetKit / Android App Widgets)
- Autenticação biométrica para abrir o app
- Leitura de notificações bancárias (Android)
- Siri Shortcuts (iOS)
- Modo multiusuário/multiperfil (ex.: pessoal + família) — ainda local
- Integração com Open Finance Brasil (exige backend mínimo — ruptura consciente do "zero servidor", avaliar custo-benefício quando chegar a hora)
- Sincronização multi-dispositivo em tempo real (se algum dia quiser abandonar o modelo "backup sob demanda")

---

## 12. Próximos passos sugeridos

1. Validar esse modelo de dados com 2-3 semanas reais de uso mental — simule mentalmente lançar seus gastos de um mês típico nesse esquema, veja se falta algum campo.
2. Rodar `flutter create` com Riverpod + Drift já configurados (posso gerar esse boilerplate inicial se quiser).
3. Implementar primeiro a fatia vertical mais simples: Categoria → Conta Bancária → Movimentação manual → Dashboard mínimo. Isso valida a arquitetura ponta a ponta antes de construir os módulos mais complexos (parcelamentos, cartões).
