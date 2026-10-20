import { Redirect } from 'expo-router';

/** A aba (+) não tem tela: o botão abre a folha /acoes. Se alguém chegar aqui, volta ao Início. */
export default function NovoTab() {
  return <Redirect href="/dashboard" />;
}
