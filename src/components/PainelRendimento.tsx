import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addMonths, differenceInCalendarMonths, format, parseISO } from 'date-fns';
import { Card } from './Card';
import { Button } from './Button';
import { CurrencyInput } from './CurrencyInput';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarCentesimos, formatarPercentual } from '@/core/utils/percentual';
import { formatarData, formatarMesReferencia, hojeIso, mesAtualIso } from '@/core/utils/date';
import {
  aporteMensalNecessario,
  calcularRendimento,
  descreverRendimento,
  faltaTaxa,
  mesesParaAtingirMeta,
  rendimentoDoMes,
  simularAplicacao,
  type ConfigRendimento,
  type Fluxo,
  type TaxasReferencia,
} from '@/domain/usecases/rendimento';

type Props = {
  /** Aportes (+) e retiradas (−), em centavos. */
  fluxos: Fluxo[];
  config: ConfigRendimento;
  taxas: TaxasReferencia;
  taxasAtualizadasEm: string | null;
  valorMeta: number;
  /** Data limite da meta, se houver ('YYYY-MM-DD'). */
  dataMeta?: string | null;
};

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
        {rotulo}
      </Text>
      <Text
        className={destaque ? 'font-heading-medium' : 'font-body-medium'}
        style={{ color: destaque ? colors.success : colors.text, fontSize: 13 }}
      >
        {valor}
      </Text>
    </View>
  );
}

/**
 * Rendimento estimado de um cofrinho ou da reserva: quanto vale hoje, quanto rende este mês,
 * quanto renderia uma aplicação no mês que vem e o plano para chegar na meta.
 */
export function PainelRendimento({ fluxos, config, taxas, taxasAtualizadasEm, valorMeta, dataMeta }: Props) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [aplicacao, setAplicacao] = useState(0);
  const [aporteMensal, setAporteMensal] = useState(0);

  const hoje = hojeIso();
  const resultado = useMemo(() => calcularRendimento(fluxos, config, taxas, hoje), [fluxos, config, taxas, hoje]);
  const doMes = useMemo(
    () => (resultado ? rendimentoDoMes(resultado.saldoBruto, config, taxas, mesAtualIso()) : null),
    [resultado, config, taxas]
  );
  const proximoMes = format(addMonths(parseISO(`${mesAtualIso()}-01`), 1), 'yyyy-MM-dd');
  const simulacao = useMemo(
    () => (aplicacao > 0 ? simularAplicacao(aplicacao, config, taxas, proximoMes) : null),
    [aplicacao, config, taxas, proximoMes]
  );

  if (config.indexador === 'nenhum') {
    return (
      <Card>
        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
          Rendimento
        </Text>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
          Este dinheiro está marcado como parado. Escolha onde ele está aplicado (CDI, Selic ou poupança) para ver
          quanto rende e simular os próximos meses.
        </Text>
      </Card>
    );
  }

  if (faltaTaxa(config, taxas) || resultado === null) {
    return (
      <Card>
        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
          Rendimento · {descreverRendimento(config)}
        </Text>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
          Para calcular, informe a taxa {config.indexador === 'cdi' ? 'do CDI' : 'Selic'} atual. O Cofre funciona sem
          internet, então você atualiza quando ela mudar.
        </Text>
        <Button titulo="Informar taxas" variante="secundaria" onPress={() => router.push('/configuracoes/taxas')} />
      </Card>
    );
  }

  // poupança também segue a Selic
  const nomeTaxa = config.indexador === 'cdi' ? 'CDI' : 'Selic';
  const taxaBase = (config.indexador === 'cdi' ? taxas.cdiAnual : taxas.selicAnual) ?? 0;
  const saldoAtual = resultado.saldoBruto;
  const falta = Math.max(valorMeta - saldoAtual, 0);
  const mesesAteMeta =
    aporteMensal > 0 && falta > 0 ? mesesParaAtingirMeta(saldoAtual, aporteMensal, valorMeta, config, taxas) : null;
  const mesesAteDataMeta = dataMeta ? differenceInCalendarMonths(parseISO(dataMeta), parseISO(hoje)) : 0;
  const aporteParaData =
    dataMeta && falta > 0 ? aporteMensalNecessario(saldoAtual, valorMeta, mesesAteDataMeta, config, taxas) : null;

  return (
    <Card>
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
        Rendimento · {descreverRendimento(config)}
      </Text>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 10 }}>
        {nomeTaxa} {formatarCentesimos(taxaBase)}% a.a.
        {taxasAtualizadasEm ? ` · atualizada em ${formatarData(taxasAtualizadasEm)}` : ''}
      </Text>

      <Linha rotulo="Valor aplicado" valor={formatarMoeda(resultado.investido)} />
      <Linha rotulo="Rendeu até hoje" valor={`+${formatarMoeda(resultado.rendimentoBruto)}`} destaque />
      <Linha rotulo="Valor estimado hoje" valor={formatarMoeda(resultado.saldoBruto)} />
      {resultado.impostoEstimado > 0 && (
        <>
          <Linha rotulo="Imposto de renda estimado" valor={`−${formatarMoeda(resultado.impostoEstimado)}`} />
          <Linha rotulo="Se resgatar hoje (líquido)" valor={formatarMoeda(resultado.saldoLiquido)} />
        </>
      )}

      {doMes && (
        <View style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: colors.background }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
            Em {formatarMesReferencia(mesAtualIso())} ({doMes.diasUteis} dias úteis) seu dinheiro rende{' '}
            {formatarPercentual(doMes.percentual)}, cerca de {formatarMoeda(doMes.valor)}.
          </Text>
        </View>
      )}

      <View style={{ height: 16 }} />
      <CurrencyInput label="Se eu aplicar no mês que vem" valor={aplicacao} onChangeValor={setAplicacao} />
      {simulacao && (
        <View style={{ marginTop: -6, marginBottom: 8 }}>
          {simulacao.map((s) => (
            <Linha
              key={s.meses}
              rotulo={`Em ${s.meses} ${s.meses === 1 ? 'mês' : 'meses'} (${formatarData(s.ate)})`}
              valor={`${formatarMoeda(s.valorLiquido)} (+${formatarMoeda(s.rendimentoBruto - s.imposto)})`}
            />
          ))}
          {config.cobraIr && (
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
              Valores já sem o imposto de renda de cada prazo.
            </Text>
          )}
        </View>
      )}

      {valorMeta > 0 && (
        <>
          <View style={{ height: 8 }} />
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 8 }}>
            Plano para a meta de {formatarMoeda(valorMeta)}
          </Text>
          {falta === 0 ? (
            <Text className="font-body" style={{ color: colors.success, fontSize: 13 }}>
              Meta alcançada com o rendimento estimado.
            </Text>
          ) : (
            <>
              {aporteParaData !== null && dataMeta && (
                <Text className="font-body" style={{ color: colors.text, fontSize: 13, marginBottom: 8 }}>
                  Para chegar até {formatarData(dataMeta)}, aplique cerca de {formatarMoeda(aporteParaData)} por mês.
                </Text>
              )}
              <CurrencyInput label="Quanto consigo aplicar por mês" valor={aporteMensal} onChangeValor={setAporteMensal} />
              {aporteMensal > 0 && (
                <Text className="font-body" style={{ color: colors.text, fontSize: 13, marginTop: -6 }}>
                  {mesesAteMeta === null
                    ? 'Nesse ritmo a meta fica para daqui a mais de 50 anos.'
                    : `Você chega lá em ${mesesAteMeta} ${mesesAteMeta === 1 ? 'mês' : 'meses'} (${formatarMesReferencia(
                        format(addMonths(new Date(), mesesAteMeta), 'yyyy-MM')
                      )}).`}
                </Text>
              )}
            </>
          )}
        </>
      )}

      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 12 }}>
        Estimativa com a taxa atual, como se ela valesse o período todo. Conta dias úteis e feriados nacionais; não
        considera IOF nem TR.
      </Text>
    </Card>
  );
}
