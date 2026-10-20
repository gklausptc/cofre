import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { CategoryPicker } from '@/components/CategoryPicker';
import { SwitchRow } from '@/components/SwitchRow';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { normalizarDescricao } from '@/domain/usecases/importacao/normalizarDescricao';
import type { ItemDaAnalise } from '@/domain/usecases/importacao/analisarImportacao';
import type { Categoria } from '@/domain/types/entities';

type Props = {
  item: ItemDaAnalise;
  marcada: boolean;
  aberta: boolean;
  categorias: Categoria[];
  categoriaId: number | null;
  /** "Sempre categorizar assim" (null = a categoria não foi mexida na prévia). */
  sempre: boolean | null;
  natureza: 'despesa' | 'receita';
  noCartao: boolean;
  /** Compra antiga (parcela) que entra na data de fechamento da fatura. */
  antiga: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
  onEscolher: (categoriaId: number) => void;
  onSempre: (valor: boolean) => void;
};

/** O que a linha é, numa frase curta: o que já existe, a conciliação ou de onde veio a categoria. */
function explicacao(item: ItemDaAnalise): string | null {
  if (item.situacao.tipo === 'ja_importada') return 'já importado antes';
  if (item.pagamentoOuEstorno) return 'pagamento ou estorno (não entra)';
  if (item.situacao.tipo === 'duplicata') return 'igual a um lançamento que você já fez';
  if (item.situacao.tipo === 'duvida') return 'pode ser um lançamento que você já fez';
  if (item.conciliacao) return item.conciliacao.motivo;
  if (item.categorizacao?.acao === 'ignorar') return `${item.categorizacao.motivo} (ignorar)`;
  if (item.categorizacao && item.categorizacao.camada !== null) return item.categorizacao.motivo;
  return null;
}

/** Categoria só faz diferença em gasto ou entrada comum (não em fatura, transferência…). */
function usaCategoria(item: ItemDaAnalise): boolean {
  const tipo = item.conciliacao?.tipo;
  return tipo === undefined || tipo === 'salario' || tipo === 'conta_fixa' || tipo === 'ja_paga' || tipo === 'ja_na_fatura';
}

export function LinhaDaPrevia(props: Props) {
  const { item, marcada, aberta, categorias, categoriaId, sempre, natureza, noCartao, antiga } = props;
  const { colors } = useAppTheme();
  const t = item.transacao;
  const parcela = t.parcela ?? normalizarDescricao(t.descricao).parcela;
  const texto = explicacao(item);
  const categoria = categoriaId !== null ? categorias.find((c) => c.id === categoriaId) : undefined;
  const mostrarCategoria = item.podeIncluir && usaCategoria(item);
  const pendente = marcada && item.precisaDeVoce && (item.situacao.tipo === 'duvida' || categoriaId === null);
  const corDoValor = noCartao ? (t.valor < 0 ? colors.textMuted : colors.text) : t.valor < 0 ? colors.danger : colors.success;

  return (
    <Card style={{ opacity: marcada ? 1 : 0.55, borderColor: pendente ? colors.warning : colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={props.onAlternar}
          disabled={!item.podeIncluir}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marcada, disabled: !item.podeIncluir }}
          accessibilityLabel={marcada ? 'Não importar esta linha' : 'Importar esta linha'}
          style={{ minHeight: 44, minWidth: 32, justifyContent: 'center' }}
        >
          <Feather
            name={marcada ? 'check-square' : 'square'}
            size={20}
            color={item.podeIncluir ? colors.brand : colors.textMuted}
          />
        </Pressable>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
            {t.descricao}
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={2}>
            {antiga ? `compra em ${formatarData(t.data)}` : formatarData(t.data)}
            {parcela ? ` · parcela ${parcela.numero}/${parcela.total}` : ''}
            {texto ? ` · ${texto}` : ''}
          </Text>
        </View>
        <Text className="font-heading-medium" style={{ color: corDoValor, fontSize: 13, fontVariant: ['tabular-nums'] }}>
          {formatarMoeda(t.valor)}
        </Text>
      </View>

      {mostrarCategoria && (
        <Pressable
          onPress={props.onAbrir}
          accessibilityRole="button"
          accessibilityLabel={categoria ? `Categoria ${categoria.nome}. Trocar` : 'Escolher categoria'}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 32, minHeight: 32 }}
        >
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: categoria ? categoria.cor : colors.warning,
            }}
          >
            <Text className="font-body-medium" style={{ color: categoria ? colors.text : colors.warning, fontSize: 12 }}>
              {categoria ? categoria.nome : 'Escolher categoria'}
            </Text>
          </View>
          <Feather name={aberta ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
        </Pressable>
      )}

      {aberta && mostrarCategoria && (
        <View style={{ marginTop: 10 }}>
          <CategoryPicker
            categorias={categorias}
            tipo={natureza}
            categoriaId={categoriaId}
            onSelecionar={props.onEscolher}
          />
          {sempre !== null && (
            <SwitchRow
              titulo="Sempre categorizar assim"
              descricao="Cria uma regra para as próximas importações (dá para mudar em Regras aprendidas)."
              valor={sempre}
              onAlterar={props.onSempre}
            />
          )}
        </View>
      )}
    </Card>
  );
}
