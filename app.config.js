// Config dinâmica do Expo. Lê o app.json e só inclui a ligação com o EAS
// (projectId + updates.url) quando COFRE_PUBLICAR=1, ou seja, no `npm run publicar`.
//
// Motivo: com projectId presente, o servidor de desenvolvimento assina o manifesto e o
// Expo Go passa a guardar os dados do app sob a identidade "@cofre-familia/cofre".
// Sem projectId, a identidade é "@anonymous/cofre-<id da máquina>", que é onde ficam os
// dados de quem usa o app pelo servidor de desenvolvimento. Trocar a identidade faz o
// app abrir vazio no aparelho — os dados antigos continuam lá, mas em outro sandbox.
// `config` é o que está no app.json (o Expo lê e passa para cá).
const EAS_PROJECT_ID = '49f1fb65-45d0-4995-abe6-36c885597210';
const publicando = process.env.COFRE_PUBLICAR === '1';

module.exports = ({ config }) => {
  const expo = { ...config };
  const extra = { ...(expo.extra ?? {}) };

  if (publicando) {
    extra.eas = { projectId: EAS_PROJECT_ID };
    expo.updates = { url: `https://u.expo.dev/${EAS_PROJECT_ID}` };
  } else {
    delete extra.eas;
    delete expo.updates;
  }

  return { ...expo, extra };
};
