import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ACAO_LEMBRAR_AMANHA, ACAO_MARCAR_PAGA, ouvirRespostas } from '@/core/notifications/notificationService';
import { adiarParaAmanha, pedirReagendamento } from '@/core/notifications/agendador';
import { useParcelasStore } from '@/store/parcelasStore';

/**
 * Trata o toque nas notificações: "Marcar como paga" dá baixa na conta fixa e abre
 * Pagamentos; "Lembrar amanhã" adia; tocar no aviso abre a tela certa (no Expo Go, se as
 * ações não aparecerem, o toque abre Pagamentos já com o botão de marcar como paga).
 * Também reagenda tudo quando o app volta do segundo plano. Não desenha nada.
 */
export function RespostasDeNotificacao() {
  const router = useRouter();
  const marcarPaga = useParcelasStore((s) => s.marcarPaga);

  useEffect(
    () =>
      ouvirRespostas((resposta) => {
        if (resposta.acao === ACAO_LEMBRAR_AMANHA && resposta.id) {
          adiarParaAmanha(resposta.id).catch(() => {});
          return;
        }
        if (resposta.acao === ACAO_MARCAR_PAGA && resposta.parcelaId !== null) {
          const url = resposta.url ? `${resposta.url}${resposta.url.includes('?') ? '&' : '?'}paga=1` : '/pagamentos';
          marcarPaga(resposta.parcelaId)
            .catch(() => {})
            .finally(() => router.push(url as Href));
          return;
        }
        if (resposta.url) router.push(resposta.url as Href);
      }),
    [router, marcarPaga]
  );

  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') pedirReagendamento();
    });
    return () => assinatura.remove();
  }, []);

  return null;
}
