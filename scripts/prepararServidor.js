// Deixa esta máquina pronta para ligar o servidor com o mesmo endereço e os mesmos dados de
// sempre. Chamado pelo iniciar-servidor.cmd antes de cada `expo start --tunnel`.
//
// - Endereço: o tunnel é <urlRandomness>-<usuário Expo>-8081.exp.direct. O urlRandomness fica em
//   .expo/settings.json (fora do git) e o Expo sorteia outro quando o endereço está ocupado
//   (erro 103 do ngrok), por isso ele é regravado a cada partida.
// - Dados: o Expo Go guarda o banco do app em "@anonymous/cofre-<uuid>", com o uuid de
//   ~/.expo/state.json. Outra máquina tem outro uuid e o app abriria vazio nos celulares.
//
// Sai com 2 quando o endereço já está no ar (servidor ligado em outra máquina).
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_RANDOMNESS = 'WY6BD5Q';
const UUID_DOS_DADOS = 'c8d3e9d5-9983-407d-b6f8-0f2749e48ef5';
const ENDERECO = `${URL_RANDOMNESS.toLowerCase()}-gregoryks-8081.exp.direct`;

const raiz = path.resolve(__dirname, '..');

function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return {};
  }
}

function gravarJson(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, `${JSON.stringify(dados, null, 2)}\n`);
}

function fixarEndereco() {
  const arquivo = path.join(raiz, '.expo', 'settings.json');
  const settings = lerJson(arquivo);
  if (settings.urlRandomness === URL_RANDOMNESS) return;
  gravarJson(arquivo, { ...settings, urlRandomness: URL_RANDOMNESS });
}

function fixarIdentidade() {
  const arquivo = path.join(process.env.EXPO_HOME || path.join(os.homedir(), '.expo'), 'state.json');
  const estado = lerJson(arquivo);
  if (estado.uuid === UUID_DOS_DADOS) return;
  if (fs.existsSync(arquivo)) fs.copyFileSync(arquivo, `${arquivo}.antes-do-cofre`);
  // só o uuid muda: o login do Expo (auth) continua como estava
  gravarJson(arquivo, { ...estado, uuid: UUID_DOS_DADOS });
  console.log(`Identidade dos dados ajustada em ${arquivo} (cópia do anterior em state.json.antes-do-cofre).`);
}

async function enderecoJaNoAr() {
  try {
    const resposta = await fetch(`https://${ENDERECO}/`, {
      headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
      signal: AbortSignal.timeout(15000),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

async function main() {
  fixarEndereco();
  fixarIdentidade();
  if (await enderecoJaNoAr()) {
    console.log(`\nO endereço exp://${ENDERECO} já está no ar: o servidor está ligado em outra máquina.`);
    console.log('Desligue o servidor lá (feche a janela) e este aqui liga sozinho em seguida.');
    process.exit(2);
  }
  console.log(`\nEndereço do servidor: exp://${ENDERECO}`);
  console.log('No Android: Expo Go > "Scan QR code" no QR que aparece abaixo, ou "Enter URL manually" com o endereço acima.\n');
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
