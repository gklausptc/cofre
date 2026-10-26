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
```

## 3. Ligar o servidor

Dois cliques em **`iniciar-servidor.cmd`**, na pasta `cofre`. Deixe a janela aberta: fechar a
janela desliga o servidor. Ele faz tudo sozinho:

1. Na primeira vez, roda o `npm install` (alguns minutos).
2. Se a máquina não estiver logada no Expo, pede o login: usuário `gregory.ks`, a mesma senha
   do site expo.dev. O endereço do tunnel leva o nome do usuário, então outra conta daria
   outro endereço. O iPhone também só abre o servidor com essa conta (ver seção 5).
3. Fixa o endereço `exp://wy6bd5q-gregoryks-8081.exp.direct` (o mesmo do QR
   `docs/cofre-servidor-qr.png`) e a identidade dos dados (seção 6), para os celulares abrirem
   o app com o que já tinham.
4. Mostra o endereço e o QR na janela. No Android: Expo Go > "Scan QR code".
5. Religa o servidor se ele cair.

**Uma máquina por vez.** Se o servidor já estiver ligado em outro computador, a janela avisa e
espera: feche o servidor no outro computador e este liga sozinho em seguida.

Para o computador não suspender: Configurações do Windows > Sistema > Energia > Tela e
suspensão > "Suspender" em **Nunca**.

Para subir sozinho ao ligar o computador: tecle Win+R, digite `shell:startup`, Enter, e crie
nessa pasta um atalho para `iniciar-servidor.cmd`.

Pelo terminal, sem o arquivo: `npm run servidor`. Nesse caso o endereço e a identidade não são
fixados, e o Expo sorteia outro endereço se o atual estiver ocupado.

## 4. Publicar uma versão para o app publicado

O app publicado (EAS Update, canal `preview`) funciona sem o servidor ligado. Ele só muda quando
você publica. Depois de alterar o código:

```powershell
npm run publicar
```

Leva de 1 a 3 minutos. Quem usa o app publicado recebe a versão nova na próxima abertura.
O endereço do app publicado só muda quando o SDK do Expo muda (o `runtime-version`); no SDK 58
(QR em `docs/cofre-preview-qr.png`):

```
exp://u.expo.dev/49f1fb65-45d0-4995-abe6-36c885597210?channel-name=preview&runtime-version=exposdk:58.0.0
```

Só publica quem está logado na conta `gregory.ks` (dona da organização `cofre-familia`).

## 5. Como cada celular abre o app

| Aparelho | Servidor de desenvolvimento | App publicado |
|---|---|---|
| iPhone com Expo Go logado como `gregory.ks` | Aparece em "Development servers" na tela inicial do Expo Go; basta tocar. Também fica em "Recently opened". | Ícone de pessoa > selecionar `cofre-familia` > PROJECTS > Cofre > preview > Open. |
| iPhone com outra conta ou sem conta | Não abre. Regra do Expo Go desde o SDK 57. | Só se a conta for membro da organização `cofre-familia` (convite em expo.dev > cofre-familia > Settings > Members). |
| Android, qualquer conta ou sem conta | Use o APK (seção 5.1). Pelo Expo Go: "Scan QR code" no QR da janela do servidor (ou em `docs/cofre-servidor-qr.png`), ou "Enter URL manually" > `exp://wy6bd5q-gregoryks-8081.exp.direct` — precisa do Expo Go do SDK 58 (em 26/10/2026 a Google Play ainda tinha o do SDK 57, que não abre o app). | Use o APK (seção 5.1). O Expo Go do Android no SDK 57 dava "Failed to download remote update" em qualquer app publicado (defeito do Expo Go, expo/expo#50139). |

O Expo Go de iPhone não tem campo para digitar endereço nem leitor de QR. A câmera do iPhone
lê QR com endereço `exp://` e abre o Expo Go.

### 5.1 Android: o APK (sem Expo Go)

No Android o Cofre é um app instalado de verdade (um APK), feito no EAS Build. Ele recebe as
versões novas do `npm run publicar` sozinho, como o app publicado do iPhone, e tem as
notificações ligadas (no Expo Go do Android elas não funcionam). O iPhone não muda nada.

Gerar (no computador, logado como `gregory.ks`):

```powershell
npm run apk
```

Na primeira vez o EAS pergunta se pode criar a chave de assinatura do Android ("Generate a new
Android Keystore?"): responda **Y**. A chave fica guardada no EAS; os próximos APKs saem
assinados com ela e instalam por cima do anterior sem perder dados. O build roda na nuvem
(10 a 20 minutos na fila gratuita) e termina com um link e um QR code.

Instalar no celular Android:

1. Abra o link (ou leia o QR com a câmera) no próprio celular e toque em **Install**/baixar.
2. Abra o arquivo `.apk` baixado. Na primeira vez o Android pede para permitir instalar apps
   desta fonte (Chrome ou Arquivos): permita e volte.
3. Se aparecer o Play Protect avisando de app desconhecido, toque em "Mais detalhes" >
   "Instalar mesmo assim".
4. Abra o Cofre Klaus. Ele começa vazio (ver seção 6): restaure um backup em Mais > Backup.
5. Em Mais > Configurações > Notificações, ative as notificações.

Quando gerar outro APK: só quando o SDK do Expo mudar ou entrar um pacote com código nativo
(o APK só aceita updates do mesmo `runtime-version`, hoje `exposdk:58.0.0`). Mudança só de
código JS vai pelo `npm run publicar`, sem APK novo.

## 6. Onde ficam os dados

Os dados do Cofre ficam em um banco SQLite dentro de cada aparelho. Não há sincronização entre
celulares, mesmo com a mesma conta Expo. Dentro de um mesmo aparelho, o Expo Go guarda um banco
separado para cada "identidade" do app:

- **Servidor de desenvolvimento**: identidade `@anonymous/cofre-<id da máquina>`. O id vem de
  `~/.expo/state.json` (campo `uuid`) do computador que roda o servidor. Trocar de computador
  troca a identidade, e o app abriria vazio nos celulares. O `iniciar-servidor.cmd` grava sempre
  o mesmo `uuid` (o de `scripts/prepararServidor.js`), então qualquer computador abre os mesmos
  dados; o `state.json` anterior fica guardado em `state.json.antes-do-cofre`.
- **App publicado**: identidade `@cofre-familia/cofre`. Banco próprio, começa vazio.
- **APK do Android**: é um app separado do Expo Go (`com.cofre.app`), com banco próprio que
  começa vazio. Instalar um APK novo por cima mantém os dados; desinstalar apaga.

Importante: nunca coloque `extra.eas.projectId` ou `updates` no `app.json`. Isso faz o servidor
assinar o manifesto e muda a identidade para `@cofre-familia/cofre`, o que faz o app abrir vazio
no celular. O `app.config.js` já cuida disso: só inclui o projectId quando `npm run publicar` roda.

## 7. Problemas comuns

- **"failed to start tunnel" / "remote gone away"**: instabilidade do ngrok. Espere um minuto e
  ligue de novo. O `iniciar-servidor.cmd` já faz isso sozinho.
- **"Port 8081 is being used by another process"**: já tem um servidor rodando. Feche a outra
  janela ou, no PowerShell: `Get-Process node | Stop-Process -Force`.
- **"these accounts need to match"** no iPhone: o Expo Go do celular está em outra conta.
  Ícone de pessoa > Log out > entrar como `gregory.ks`.
- **App abre vazio** depois de uma mudança: a identidade mudou (seção 6). Verifique se o
  `app.json` não ganhou `projectId`, e se o `uuid` em `~/.expo/state.json` é o mesmo de antes.
- **"Failed to download remote update"** no Android: pelo app publicado é o defeito do Expo Go
  (seção 5). Pelo servidor, o endereço está fora do ar: confira se a janela do
  `iniciar-servidor.cmd` está aberta e mostra o endereço.
- **403 "not viewable"** no app publicado: a conta do Expo Go não é membro de `cofre-familia`,
  ou o Expo Go precisa de Log out e login para atualizar a lista de contas.
