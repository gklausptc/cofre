import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';

/**
 * A partir do SDK 53 o Expo Go removeu do binário Android o módulo nativo usado
 * por expo-notifications — até um simples `import` estático do pacote derruba o
 * app. Por isso o carregamento é dinâmico e só acontece fora desse cenário; o app
 * precisa rodar sem notificações no Expo Go/Android até existir um development
 * build (EAS Build) — ver seção 3 do CLAUDE.md.
 */
const notificacoesIndisponiveis = isRunningInExpoGo() && Platform.OS === 'android';

let handlerConfigurado = false;

async function carregarNotifications(): Promise<typeof NotificationsModule | null> {
  if (notificacoesIndisponiveis) return null;

  const Notifications = await import('expo-notifications');
  if (!handlerConfigurado) {
    handlerConfigurado = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  return Notifications;
}

export async function configurarNotificacoes() {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Cofre',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const permissao = await Notifications.getPermissionsAsync();
  if (permissao.status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

export type NotificacaoVencimento = {
  identificador: string;
  titulo: string;
  corpo: string;
  data: Date;
};

/**
 * Substitui todos os lembretes de vencimento agendados pelos novos, calculados
 * a partir do estado atual (contas fixas/cartões podem mudar a qualquer momento).
 */
export async function agendarNotificacoesVencimento(itens: NotificacaoVencimento[]) {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const agora = Date.now();
  for (const item of itens) {
    if (item.data.getTime() <= agora) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: item.identificador,
      content: { title: item.titulo, body: item.corpo },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.data },
    });
  }
}

export async function notificarImediatamente(titulo: string, corpo: string) {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: corpo },
    trigger: null,
  });
}
