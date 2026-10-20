import React, { useState } from 'react';
import { View } from 'react-native';
import { ChipSelect } from './ChipSelect';
import { TextField } from './TextField';
import { SwitchRow } from './SwitchRow';
import { formatarCentesimos, textoParaCentesimos } from '@/core/utils/percentual';
import type { ConfigRendimento, Indexador } from '@/domain/usecases/rendimento';

const OPCOES: { valor: Indexador; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'Não rende' },
  { valor: 'cdi', rotulo: 'CDI' },
  { valor: 'selic', rotulo: 'Selic' },
  { valor: 'poupanca', rotulo: 'Poupança' },
];

type Props = {
  valor: ConfigRendimento;
  onAlterar: (valor: ConfigRendimento) => void;
};

/** Onde o dinheiro está aplicado: indexador, quanto dele rende e se cobra imposto de renda. */
export function ConfigRendimentoForm({ valor, onAlterar }: Props) {
  const [percentualTexto, setPercentualTexto] = useState(formatarCentesimos(valor.percentualIndexador));
  const usaPercentual = valor.indexador === 'cdi' || valor.indexador === 'selic';

  function handlePercentual(texto: string) {
    setPercentualTexto(texto);
    const centesimos = textoParaCentesimos(texto);
    if (Number.isFinite(centesimos) && centesimos > 0) onAlterar({ ...valor, percentualIndexador: centesimos });
  }

  return (
    <View>
      <ChipSelect
        label="Onde o dinheiro está aplicado"
        opcoes={OPCOES}
        valor={valor.indexador}
        onSelecionar={(indexador) => onAlterar({ ...valor, indexador })}
      />
      {usaPercentual && (
        <>
          <TextField
            label={valor.indexador === 'cdi' ? 'Quanto do CDI ele rende (%)' : 'Quanto da Selic ele rende (%)'}
            placeholder="Ex.: 105"
            keyboardType="decimal-pad"
            value={percentualTexto}
            onChangeText={handlePercentual}
          />
          <SwitchRow
            titulo="Cobra imposto de renda"
            descricao="CDB e Tesouro Direto cobram IR pela tabela regressiva. LCI e LCA são isentas."
            valor={valor.cobraIr}
            onAlterar={(cobraIr) => onAlterar({ ...valor, cobraIr })}
          />
          <View style={{ height: 16 }} />
        </>
      )}
    </View>
  );
}
