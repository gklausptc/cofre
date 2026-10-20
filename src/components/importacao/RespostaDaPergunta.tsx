import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ChipSelect } from '@/components/ChipSelect';
import { MemberPicker } from '@/components/MemberPicker';
import { SwitchRow } from '@/components/SwitchRow';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import type { RespostaPergunta } from '@/domain/usecases/importacao/responderPergunta';
import type { Categoria, ContaBancaria, MembroFamilia } from '@/domain/types/entities';
import type { DadosDaPergunta } from '@/domain/types/perguntas';

type Props = {
  dados: DadosDaPergunta;
  categorias: Categoria[];
  contas: ContaBancaria[];
  membros: MembroFamilia[];
  /** Conta de onde vieram as linhas (fica fora da lista "para qual conta"). */
  contaDasLinhas: number | null;
  /** A resposta montada até agora (null = ainda falta escolher algo). */
  onResposta: (resposta: RespostaPergunta | null) => void;
};

const FORA_DO_APP = 'fora';

function categoriaPorNome(categorias: Categoria[], nome: string, tipo: 'despesa' | 'receita'): number | null {
  return categorias.find((c) => c.tipo === tipo && semAcentos(c.nome) === semAcentos(nome))?.id ?? null;
}

function OutraConta({
  contas,
  contaDasLinhas,
  valor,
  onSelecionar,
}: {
  contas: ContaBancaria[];
  contaDasLinhas: number | null;
  valor: number | null;
  onSelecionar: (id: number | null) => void;
}) {
  const opcoes = [
    ...contas.filter((c) => c.id !== contaDasLinhas && c.ativo !== false).map((c) => ({ valor: String(c.id), rotulo: c.nomeConta })),
    { valor: FORA_DO_APP, rotulo: 'Conta fora do app' },
  ];
  return (
    <ChipSelect
      label="Qual a outra conta?"
      opcoes={opcoes}
      valor={valor === null ? FORA_DO_APP : String(valor)}
      onSelecionar={(v) => onSelecionar(v === FORA_DO_APP ? null : Number(v))}
    />
  );
}

function Sempre({ valor, onAlterar, texto }: { valor: boolean; onAlterar: (v: boolean) => void; texto: string }) {
  return <SwitchRow titulo="Sempre fazer assim" descricao={texto} valor={valor} onAlterar={onAlterar} />;
}

/** Pergunta de categoria: escolher a categoria, ou dizer que é transferência sua ou que não era para importar. */
function RespostaCategoria({ dados, categorias, contas, contaDasLinhas, onResposta }: Props & { dados: Extract<DadosDaPergunta, { tipo: 'categoria' }> }) {
  const [modo, setModo] = useState<'categoria' | 'transferencia' | 'ignorar'>('categoria');
  const [categoriaId, setCategoriaId] = useState<number | null>(dados.sugestaoCategoriaId);
  const [outraConta, setOutraConta] = useState<number | null>(null);
  const [sempre, setSempre] = useState(true);

  useEffect(() => {
    if (modo === 'categoria') onResposta(categoriaId !== null ? { tipo: 'categoria', categoriaId, sempre } : null);
    else if (modo === 'transferencia') onResposta({ tipo: 'transferencia_propria', outraContaId: outraConta, sempre });
    else onResposta({ tipo: 'ignorar', sempre });
  }, [modo, categoriaId, outraConta, sempre, onResposta]);

  const noCartao = dados.linhas.every((l) => l.onde === 'gasto');
  return (
    <View>
      <ChipSelect
        label="É"
        opcoes={[
          { valor: 'categoria', rotulo: dados.natureza === 'despesa' ? 'Um gasto' : 'Uma entrada' },
          ...(noCartao ? [] : [{ valor: 'transferencia' as const, rotulo: 'Transferência minha' }]),
          { valor: 'ignorar', rotulo: 'Não era para importar' },
        ]}
        valor={modo}
        onSelecionar={setModo}
      />
      {modo === 'categoria' && (
        <CategoryPicker categorias={categorias} tipo={dados.natureza} categoriaId={categoriaId} onSelecionar={setCategoriaId} />
      )}
      {modo === 'transferencia' && (
        <OutraConta contas={contas} contaDasLinhas={contaDasLinhas} valor={outraConta} onSelecionar={setOutraConta} />
      )}
      <Sempre
        valor={sempre}
        onAlterar={setSempre}
        texto={`Nas próximas importações, "${dados.padrao}" já entra assim.`}
      />
    </View>
  );
}

type QuemE = 'servico' | 'familia' | 'emprestimo' | 'propria' | 'outra';

/** "Quem é Fulano?": diarista, família, empréstimo, conta sua ou outra categoria. */
function RespostaPix({ dados, categorias, contas, membros, contaDasLinhas, onResposta }: Props & { dados: Extract<DadosDaPergunta, { tipo: 'pix_pessoa' }> }) {
  const [quem, setQuem] = useState<QuemE | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [membroId, setMembroId] = useState<number | null>(null);
  const [outraConta, setOutraConta] = useState<number | null>(null);
  const [apelido, setApelido] = useState('');
  const [sempre, setSempre] = useState(true);

  function escolher(valor: QuemE) {
    setQuem(valor);
    if (valor === 'servico') setCategoriaId(categoriaPorNome(categorias, 'Moradia', dados.natureza));
    if (valor === 'familia') setCategoriaId(categoriaPorNome(categorias, dados.natureza === 'despesa' ? 'Outros gastos' : 'Outras receitas', dados.natureza));
  }

  useEffect(() => {
    if (quem === null) return onResposta(null);
    if (quem === 'outra') {
      return onResposta(categoriaId !== null ? { tipo: 'categoria', categoriaId, sempre } : null);
    }
    const precisaCategoria = quem === 'servico' || quem === 'familia';
    if (precisaCategoria && categoriaId === null) return onResposta(null);
    onResposta({
      tipo: 'contato',
      contato: quem,
      apelido,
      categoriaId: precisaCategoria ? categoriaId : null,
      membroId: quem === 'familia' ? membroId : null,
      outraContaId: quem === 'propria' ? outraConta : null,
      sempre,
    });
  }, [quem, categoriaId, membroId, outraConta, apelido, sempre, onResposta]);

  return (
    <View>
      <ChipSelect<QuemE>
        label="Quem é"
        opcoes={[
          { valor: 'servico', rotulo: 'Diarista / serviço da casa' },
          { valor: 'familia', rotulo: 'Família' },
          { valor: 'emprestimo', rotulo: 'Empréstimo (vai voltar)' },
          { valor: 'propria', rotulo: 'Conta minha' },
          { valor: 'outra', rotulo: 'Outra categoria' },
        ]}
        valor={quem ?? ('' as QuemE)}
        onSelecionar={escolher}
      />
      {quem === 'familia' && <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />}
      {(quem === 'servico' || quem === 'familia' || quem === 'outra') && (
        <CategoryPicker categorias={categorias} tipo={dados.natureza} categoriaId={categoriaId} onSelecionar={setCategoriaId} />
      )}
      {quem === 'propria' && <OutraConta contas={contas} contaDasLinhas={contaDasLinhas} valor={outraConta} onSelecionar={setOutraConta} />}
      {quem !== null && quem !== 'outra' && (
        <TextField label="Como chamar (opcional)" placeholder={dados.nome} value={apelido} onChangeText={setApelido} />
      )}
      <Sempre
        valor={sempre}
        onAlterar={setSempre}
        texto="O Cofre lembra quem é essa pessoa nas próximas importações."
      />
    </View>
  );
}

function RespostaSimNao({
  rotuloSim,
  rotuloNao,
  onEscolha,
}: {
  rotuloSim: string;
  rotuloNao: string;
  onEscolha: (sim: boolean) => void;
}) {
  const [sim, setSim] = useState(true);
  useEffect(() => onEscolha(sim), [sim, onEscolha]);
  return (
    <ChipSelect
      label="Resposta"
      opcoes={[
        { valor: 'sim', rotulo: rotuloSim },
        { valor: 'nao', rotulo: rotuloNao },
      ]}
      valor={sim ? 'sim' : 'nao'}
      onSelecionar={(v) => setSim(v === 'sim')}
    />
  );
}

function RespostaRecorrencia({ dados, onResposta }: Props & { dados: Extract<DadosDaPergunta, { tipo: 'recorrencia' }> }) {
  const [criar, setCriar] = useState(true);
  const [nome, setNome] = useState(dados.nome);
  const [valor, setValor] = useState(dados.valor);
  const [dia, setDia] = useState(String(dados.dia));
  const [sempre, setSempre] = useState(true);

  useEffect(() => {
    const numeroDoDia = Number(dia);
    const valido = Number.isInteger(numeroDoDia) && numeroDoDia >= 1 && numeroDoDia <= 31 && valor > 0;
    onResposta(criar ? (valido ? { tipo: 'recorrencia', criar, nome, valor, dia: numeroDoDia, sempre } : null) : { tipo: 'recorrencia', criar: false, nome, valor, dia: 1, sempre: false });
  }, [criar, nome, valor, dia, sempre, onResposta]);

  return (
    <View>
      <RespostaSimNao rotuloSim="Sim, virar conta fixa" rotuloNao="Não" onEscolha={setCriar} />
      {criar && (
        <>
          <TextField label="Nome da conta fixa" value={nome} onChangeText={setNome} />
          <CurrencyInput label="Valor por mês" valor={valor} onChangeValor={setValor} />
          <TextField label="Dia do vencimento" keyboardType="number-pad" value={dia} onChangeText={setDia} />
          <Sempre valor={sempre} onAlterar={setSempre} texto="Nas próximas importações, a cobrança já dá baixa nesta conta fixa." />
        </>
      )}
    </View>
  );
}

export function RespostaDaPergunta(props: Props) {
  const { dados, onResposta } = props;
  const { colors } = useAppTheme();
  const responderParcelamento = React.useCallback((sim: boolean) => onResposta({ tipo: 'parcelamento', criar: sim }), [onResposta]);
  const responderDuplicidade = React.useCallback((mesmo: boolean) => onResposta({ tipo: 'duplicidade', mesmo }), [onResposta]);

  if (dados.tipo === 'categoria') return <RespostaCategoria {...props} dados={dados} />;
  if (dados.tipo === 'pix_pessoa') return <RespostaPix {...props} dados={dados} />;
  if (dados.tipo === 'recorrencia') return <RespostaRecorrencia {...props} dados={dados} />;
  if (dados.tipo === 'parcelamento') {
    return (
      <View>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
          A compra fica com as {dados.total} parcelas: as {dados.numero - 1 > 0 ? `${dados.numero - 1} anteriores como pagas e ` : ''}
          as próximas aparecem nas faturas e na previsão dos meses seguintes.
        </Text>
        <RespostaSimNao rotuloSim="Sim, criar compra parcelada" rotuloNao="Não, deixar só esta" onEscolha={responderParcelamento} />
      </View>
    );
  }
  return (
    <View>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
          Já no app
        </Text>
        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
          {dados.existente.descricao || 'Sem descrição'} · {formatarData(dados.existente.data)} · {formatarMoeda(dados.existente.valor)}
        </Text>
      </View>
      <RespostaSimNao rotuloSim="É o mesmo (não importar)" rotuloNao="São diferentes (importar)" onEscolha={responderDuplicidade} />
    </View>
  );
}
