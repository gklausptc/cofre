# Cofre — arquitetura

Como o app está organizado hoje. A primeira versão deste documento planejava um app em
Flutter, que nunca foi feito; ela está guardada em [`arquivo/arquitetura-flutter-original.md`](arquivo/arquitetura-flutter-original.md).

## Stack

| Peça | Escolha |
|---|---|
| App | Expo (managed) + React Native + TypeScript strict, testado no **Expo Go** (sem código nativo próprio) |
| Navegação | Expo Router (cada arquivo em `app/` é uma rota) |
| Banco | SQLite local (`expo-sqlite`) com Drizzle ORM e migrations versionadas |
| Estado | Zustand, um store por domínio em `src/store/` |
| Estilo | NativeWind + tokens de `src/core/theme/` (paleta azul, modo claro e escuro) |
| Gráficos | `react-native-gifted-charts` |
| Testes | Jest + `jest-expo` (`npm test`) |

Não há servidor nem rede: todos os dados ficam no aparelho.

## Camadas

```
app/ (telas)  ─┐
src/components ├──► src/store (Zustand) ──► src/domain/repositories (interfaces)
               │                                   ▲
               └──────────► src/domain/usecases    │ implementadas por
                            (regras puras)         │
                                           src/data/repositories (SQLite/Drizzle)
```

- **`src/domain/usecases/`**: regras de negócio como funções puras. Recebem dados e devolvem
  dados ou um plano do que gravar. Não importam React, telas nem `src/data/`.
- **`src/domain/repositories/`**: interfaces de acesso a dados e o registro `repositorios()`.
- **`src/data/`**: schema, migrations e as implementações SQLite dos repositórios.
- **`src/core/inicializacao/`**: raiz de composição. É o único lugar fora de `src/data/` que
  conhece as implementações, e registra todas na abertura do app.
- **Telas, stores e componentes** nunca importam `src/data/`. O ESLint barra isso.

## Regras que valem para todo o código

- **Dinheiro em centavos inteiros** (R$ 12,34 = `1234`), do banco às telas. Conversões só em
  `src/core/utils/currency.ts`.
- **Valores derivados não são colunas**: o saldo da conta, o total da fatura e o valor do
  cofrinho são sempre calculados a partir dos lançamentos.
- **Mudança de schema é sempre migration nova**, gerada com `npx drizzle-kit generate`, sem
  resetar o banco. Antes de aplicar migrations pendentes, o app grava uma cópia automática dos
  dados (`src/data/db/prepararBanco.ts`). Se a migration muda o significado de um dado (como reais
  → centavos), ela ganha um conversor em `src/domain/usecases/backup.ts`, para que backups
  antigos continuem restauráveis.
- **Gravações compostas usam transação** (`repositorios().manutencao.emTransacao`).
- **Datas** sempre com `date-fns` e locale pt-BR.

## Dados no aparelho

- Banco `cofre.db` (SQLite), dentro do sandbox do Expo Go. A identidade do app no Expo Go define
  qual sandbox é usado (ver `docs/SERVIDOR.md`, seção 8).
- PIN de bloqueio no SecureStore (Keychain/Keystore), só como hash SHA-256 com salt, fora do
  banco e fora do backup.
- Backup: **Mais → Backup e restauração** exporta um JSON com todas as tabelas, para salvar fora
  do app. As cópias automáticas ficam em `documentDirectory/backups`, e as 5 mais recentes são
  mantidas.

## Testes e verificação

- `npm test`: usecases, parsers e backup (`__tests__/` ao lado do código; fábricas e cenários
  em `src/test/`).
- `npx tsc --noEmit` e `npm run lint`.
- O CI no GitHub (`.github/workflows/ci.yml`) roda os três a cada push.
- Antes de entregar, conferir que o app empacota: `npx expo export --platform ios`.
