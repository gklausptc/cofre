import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * A tela de Pagamentos agora fica dentro da aba Agenda (com tudo o que fazia). Esta rota
 * continua existindo para os links antigos (notificações já agendadas) e só leva para lá,
 * com o mês e o item do link.
 */
export default function PagamentosScreen() {
  const params = useLocalSearchParams<{ mes?: string; item?: string }>();
  const query: Record<string, string> = {};
  if (params.mes) query.mes = params.mes;
  if (params.item) query.item = params.item;
  return <Redirect href={{ pathname: '/agenda', params: query }} />;
}
