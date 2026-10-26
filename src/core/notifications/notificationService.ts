import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import type { NotificacaoPlanejada } from '@/domain/usecases/notificacoes/planejarNotificacoes';

/**
 * A partir do SDK 53 o Expo Go removeu do binário Android o módulo nativo usado
 * por expo-notifications — até um simples `import` estático do pacote derruba o
 * app. Por isso o carregamento é dinâmico e só acontece fora desse cenário; o app
 * precisa rodar sem notificações no Expo Go/Android. No APK do Android (`npm run apk`) e no
 * iPhone (Expo Go) funcionam.
 */
export const notificacoesIndisponiveis = isRunningInExpoGo() && Platform.OS === 'android';

/** Ações das notificações (botões no aviso). */
export const ACAO_MARCAR_PAGA = 'marcar_paga';
export const ACAO_LEMBRAR_AMANHA = 'lembrar_amanha';
const CANAL = 'cofre-lembretes';

let preparado = false;

async function carregarNotifications(): Promise<typeof NotificationsModule | null> {
  if (notificacoesIndisponiveis) return null;

  const Notifications = await import('expo-notifications');
  if (!preparado) {
    preparado = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CANAL, {
          name: 'Vencimentos e lembretes',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      await Notifications.setNotificationCategoryAsync('conta_fixa', [
        { identifier: ACAO_MARCAR_PAGA, buttonTitle: 'Marcar como paga', options: { opensAppToForeground: true } },
        { identifier: ACAO_LEMBRAR_AMANHA, buttonTitle: 'Lembrar amanhã', options: { opensAppToForeground: false } },
      ]);
      await Notifications.setNotificationCategoryAsync('lembrete', [
        { identifier: ACAO_LEMBRAR_AMANHA, buttonTitle: 'Lembrar amanhã', options: { opensAppToForeground: false } },
      ]);
    } catch {
      // sem categorias (ações), tocar na notificação ainda abre a tela certa
    }
  }
  return Notifications;
}

export type SituacaoDaPermissao = 'concedida' | 'negada' | 'nao_pedida' | 'indisponivel';

export async function situacaoDaPermissao(): Promise<SituacaoDaPermissao> {
  const Notifications = await carregarNotifications();
  if (!Notifications) return 'indisponivel';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'concedida';
  return status === 'denied' ? 'negada' : 'nao_pedida';
}

/** Pede a permissão (o sistema só mostra o pedido uma vez; depois, só nos Ajustes). */
export async function pedirPermissao(): Promise<boolean> {
  const Notifications = await carregarNotifications();
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Troca tudo o que está agendado pelo que foi planejado agora. */
export async function agendarTodas(planejadas: NotificacaoPlanejada[]): Promise<void> {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const agora = Date.now();
  for (const n of planejadas) {
    if (n.data.getTime() <= agora) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: {
        title: n.titulo,
        body: n.corpo,
        data: { url: n.url, parcelaId: n.parcelaId, id: n.id },
        ...(n.categoria ? { categoryIdentifier: n.categoria } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.data,
        ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
      },
    });
  }
}

export async function notificarImediatamente(titulo: string, corpo: string, url?: string) {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: corpo, data: url ? { url } : {} },
    // no Android, sem canal ela iria para o canal genérico, que o sistema mostra com prioridade baixa
    trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
  });
}

export type RespostaDeNotificacao = {
  acao: 'abrir' | typeof ACAO_MARCAR_PAGA | typeof ACAO_LEMBRAR_AMANHA;
  id: string | null;
  url: string | null;
  parcelaId: number | null;
};

function lerResposta(resposta: NotificationsModule.NotificationResponse): RespostaDeNotificacao {
  const dados = resposta.notification.request.content.data as Record<string, unknown> | undefined;
  const acao =
    resposta.actionIdentifier === ACAO_MARCAR_PAGA || resposta.actionIdentifier === ACAO_LEMBRAR_AMANHA
      ? resposta.actionIdentifier
      : 'abrir';
  return {
    acao,
    id: typeof dados?.id === 'string' ? dados.id : resposta.notification.request.identifier,
    url: typeof dados?.url === 'string' ? dados.url : null,
    parcelaId: typeof dados?.parcelaId === 'number' ? dados.parcelaId : null,
  };
}

/**
 * Escuta toques e ações nas notificações (inclusive a que abriu o app). Devolve a função
 * que para de escutar.
 */
export function ouvirRespostas(aoResponder: (resposta: RespostaDeNotificacao) => void): () => void {
  let assinatura: { remove: () => void } | null = null;
  let parado = false;
  void carregarNotifications().then((Notifications) => {
    if (!Notifications || parado) return;
    const ultima = Notifications.getLastNotificationResponse();
    if (ultima) {
      Notifications.clearLastNotificationResponse();
      aoResponder(lerResposta(ultima));
    }
    assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      Notifications.clearLastNotificationResponse();
      aoResponder(lerResposta(resposta));
    });
  });
  return () => {
    parado = true;
    assinatura?.remove();
  };
}
