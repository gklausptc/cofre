# Cofre — rodar o servidor em outra máquina

Guia manual, sem Claude, para colocar o servidor de desenvolvimento do Cofre em um
computador que vai ficar ligado, e para publicar versões para quem usa o app publicado.

## 1. O que instalar

1. **Node.js LTS** (versão 22): https://nodejs.org — instale com as opções padrão.
2. **Git**: https://git-scm.com/download/win — instale com as opções padrão.

Qualquer computador com 8 GB de memória e 3 GB livres em disco serve. Precisa de internet
estável e de ficar ligado, sem suspender.

## 2. Baixar o projeto

Abra o PowerShell e rode, uma linha por vez:

```powershell
cd $HOME\Documentos
git clone https://github.com/gklausptc/cofre.git
cd cofre
npm install
```

O `npm install` demora alguns minutos na primeira vez.

## 3. Entrar na conta Expo

```powershell
npx expo login
```

Usuário: `gregory.ks`. A senha é a mesma do site expo.dev. Confira com:

```powershell
npx expo whoami
```

Sem esse login o iPhone não abre o servidor. O Expo Go dos iPhones também precisa estar
logado como `gregory.ks` (ver seção 7).

## 4. Manter a mesma URL do tunnel (opcional, recomendado)

A URL do tunnel é formada por um código gravado em `.expo/settings.json`. Para que os celulares
continuem usando o atalho antigo (`exp://ywdzy18-gregoryks-8081.exp.direct`), crie esse arquivo
antes de subir o servidor:

```powershell
New-Item -ItemType Directory -Force .expo | Out-Null
Set-Content -Encoding utf8 .expo\settings.json '{ "urlRandomness": "ywDZY18" }'
```

Se pular este passo, a URL muda e os celulares precisam abrir o servidor uma vez pelo
novo endereço, que aparece no terminal.

## 5. Subir o servidor

Dois cliques em `scripts\servidor.cmd`, ou no PowerShell:

```powershell
npm run servidor
```

Deixe a janela aberta. O script `servidor.cmd` religa o servidor sozinho se ele cair.
O terminal mostra `Tunnel ready` e `Waiting on http://localhost:8081` quando está pronto.

Para o computador não suspender: Configurações do Windows > Sistema > Energia > Tela e
suspensão > "Suspender" em **Nunca**.

Para subir sozinho ao ligar o computador: tecle Win+R, digite `shell:startup`, Enter, e crie
nessa pasta um atalho para `scripts\servidor.cmd`.

## 6. Publicar uma versão para o app publicado

O app publicado (EAS Update, canal `preview`) funciona sem o servidor ligado. Ele só muda quando
você publica. Depois de alterar o código:

```powershell
npm run publicar
```

Leva de 1 a 3 minutos. Quem usa o app publicado recebe a versão nova na próxima abertura.
O endereço do app publicado não muda:

```
exp://u.expo.dev/49f1fb65-45d0-4995-abe6-36c885597210?channel-name=preview&runtime-version=exposdk:57.0.0
```

Só publica quem está logado na conta `gregory.ks` (dona da organização `cofre-familia`).

## 7. Como cada celular abre o app

| Aparelho | Servidor de desenvolvimento | App publicado |
|---|---|---|
| iPhone com Expo Go logado como `gregory.ks` | Aparece em "Development servers" na tela inicial do Expo Go; basta tocar. Também fica em "Recently opened". | Ícone de pessoa > selecionar `cofre-familia` > PROJECTS > Cofre > preview > Open. |
| iPhone com outra conta ou sem conta | Não abre. Regra do Expo Go desde o SDK 57. | Só se a conta for membro da organização `cofre-familia` (convite em expo.dev > cofre-familia > Settings > Members). |
| Android, qualquer conta ou sem conta | Expo Go > "Enter URL manually" > `exp://ywdzy18-gregoryks-8081.exp.direct`. | Mesmo caminho, com o endereço do app publicado acima. |

O Expo Go de iPhone não tem campo para digitar endereço nem leitor de QR. A câmera do iPhone
lê QR com endereço `exp://` e abre o Expo Go.

## 8. Onde ficam os dados

Os dados do Cofre ficam em um banco SQLite dentro de cada aparelho. Não há sincronização entre
celulares, mesmo com a mesma conta Expo. Dentro de um mesmo aparelho, o Expo Go guarda um banco
separado para cada "identidade" do app:

- **Servidor de desenvolvimento**: identidade `@anonymous/cofre-<id da máquina>`. O id vem de
  `~/.expo/state.json` (campo `uuid`) do computador que roda o servidor. Trocar de computador
  troca a identidade, e o app abre vazio nos celulares. Para manter os dados, copie o `uuid`
  desse arquivo do computador antigo para o novo antes de subir o servidor.
- **App publicado**: identidade `@cofre-familia/cofre`. Banco próprio, começa vazio.

Importante: nunca coloque `extra.eas.projectId` ou `updates` no `app.json`. Isso faz o servidor
assinar o manifesto e muda a identidade para `@cofre-familia/cofre`, o que faz o app abrir vazio
no celular. O `app.config.js` já cuida disso: só inclui o projectId quando `npm run publicar` roda.

## 9. Problemas comuns

- **"failed to start tunnel" / "remote gone away"**: instabilidade do ngrok. Espere um minuto e
  rode `npm run servidor` de novo. O `servidor.cmd` já faz isso sozinho.
- **"Port 8081 is being used by another process"**: já tem um servidor rodando. Feche a outra
  janela ou, no PowerShell: `Get-Process node | Stop-Process -Force`.
- **"these accounts need to match"** no iPhone: o Expo Go do celular está em outra conta.
  Ícone de pessoa > Log out > entrar como `gregory.ks`.
- **App abre vazio** depois de uma mudança: a identidade mudou (seção 8). Verifique se o
  `app.json` não ganhou `projectId`, e se o `uuid` em `~/.expo/state.json` é o mesmo de antes.
- **403 "not viewable"** no app publicado: a conta do Expo Go não é membro de `cofre-familia`,
  ou o Expo Go precisa de Log out e login para atualizar a lista de contas.
