/**
 * Perguntas frequentes do assistente da Ajuda (sem IA: ele escolhe a resposta pelas palavras
 * da pergunta). `palavras` são começos de palavra, sem acento; vale a resposta com mais
 * palavras encontradas.
 */
export type ArtigoDeAjuda = {
  id: string;
  titulo: string;
  palavras: string[];
  resposta: string;
  acoes: { rotulo: string; href: string }[];
};

export const ARTIGOS_DE_AJUDA: ArtigoDeAjuda[] = [
  {
    id: 'importar',
    titulo: 'Como importar o extrato',
    palavras: ['IMPORT', 'EXTRATO', 'ARQUIVO', 'CSV', 'OFX', 'SUBIR', 'MANDAR'],
    resposta:
      'Toque no + embaixo e em "Importar extratos". Escolha o arquivo do banco (CSV, OFX ou PDF). Um arquivo só mostra a prévia antes de gravar; vários de uma vez entram direto e o app cria as contas e os cartões que faltam. O que ele não souber vai para a Revisão.',
    acoes: [
      { rotulo: 'Importar extratos', href: '/importar-extrato' },
      { rotulo: 'Importar vários (o ano todo)', href: '/importar-extrato/lote' },
    ],
  },
  {
    id: 'pdf',
    titulo: 'PDF com senha',
    palavras: ['PDF', 'SENHA', 'PROTEGID', 'BLOQUEAD'],
    resposta:
      'O app lê PDF de extrato e de fatura gerado pelo banco. Se tiver senha, ele pede na hora (costuma ser parte do CPF) e não guarda. PDF escaneado (foto) não tem texto e não dá para ler.',
    acoes: [{ rotulo: 'Importar extratos', href: '/importar-extrato' }],
  },
  {
    id: 'varios',
    titulo: 'Importar o ano todo',
    palavras: ['VARIOS', 'ANO TODO', 'TODOS', 'LOTE', 'DE UMA VEZ', 'HISTORICO'],
    resposta:
      'Em "Importar vários", escolha todos os arquivos juntos (corrente, poupança e faturas, de vários meses). O app reconhece cada conta, cria as que faltam com o saldo do extrato mais antigo, importa mês a mês na ordem certa e no fim abre o relatório do ano.',
    acoes: [{ rotulo: 'Importar vários', href: '/importar-extrato/lote' }],
  },
  {
    id: 'revisao',
    titulo: 'As perguntas da Revisão',
    palavras: ['PERGUNTA', 'REVISAO', 'DUVIDA', 'NAO RECONHEC', 'QUEM E'],
    resposta:
      'São os lançamentos que o app não soube categorizar. Cada pergunta mostra data, valor e de onde veio (PIX, débito ou cartão de crédito). Responda com "Sempre fazer assim" e as parecidas se resolvem sozinhas; "Não sei" põe em Não identificado.',
    acoes: [{ rotulo: 'Abrir a Revisão', href: '/revisao' }],
  },
  {
    id: 'categorias',
    titulo: 'Criar ou juntar categorias',
    palavras: ['CATEGORIA', 'CRIAR', 'JUNTAR', 'APAGAR', 'RENOMEAR', 'NOVA'],
    resposta:
      'Em Mais → Categorias você cria as suas, muda nome e cor, e junta duas (tudo de uma passa para a outra — é o jeito de apagar sem perder lançamentos). Em qualquer seletor de categoria também tem o "+ Nova".',
    acoes: [{ rotulo: 'Categorias', href: '/categorias' }],
  },
  {
    id: 'regras',
    titulo: 'Regras aprendidas',
    palavras: ['REGRA', 'APRENDE', 'SEMPRE', 'AUTOMATIC'],
    resposta:
      'Cada "Sempre fazer assim" vira uma regra: na próxima importação aquele texto já entra na categoria certa. Em Regras aprendidas dá para ver, mudar e apagar, e também ver o seu nome como cada banco escreve.',
    acoes: [{ rotulo: 'Regras aprendidas', href: '/regras' }],
  },
  {
    id: 'transferencia',
    titulo: 'Transferência entre contas suas',
    palavras: ['TRANSFER', 'POUPANCA', 'MINHA CONTA', 'OUTRA CONTA', 'CAIXINHA', 'ENTRE CONTAS', 'INTERNA'],
    resposta:
      'Dinheiro de uma conta sua para outra (PIX para o seu nome, poupança, caixinha, CDB) não é gasto nem receita: conta no saldo das duas contas e fica fora dos relatórios. O app reconhece pelo seu nome no extrato; se as duas contas estiverem no app, o lado de lá é reconhecido e não entra de novo.',
    acoes: [{ rotulo: 'Seu nome nos bancos', href: '/regras' }],
  },
  {
    id: 'livre',
    titulo: 'Livre para gastar',
    palavras: ['LIVRE', 'POSSO GASTAR', 'NEGATIV', 'SOBRA', 'NAO FECHA'],
    resposta:
      'É o que entra no mês menos contas fixas, faturas, gastos fora do cartão e o que você guardou. Se ficou negativo depois de importar, veja na Agenda se algum pagamento de fatura está contando como gasto (aparece um aviso para corrigir com um toque).',
    acoes: [
      { rotulo: 'Ver a Agenda', href: '/agenda' },
      { rotulo: 'Ver o Início', href: '/dashboard' },
    ],
  },
  {
    id: 'fatura',
    titulo: 'Fatura do cartão',
    palavras: ['FATURA', 'CARTAO', 'LIMITE', 'ATRASAD', 'VENC'],
    resposta:
      'Cada compra no cartão pesa no mês da fatura. Na Agenda você vê o que vence e marca como paga (escolhendo a conta de onde saiu). Fatura antiga que aparece como atrasada depois de importar pode ser marcada como paga lá mesmo.',
    acoes: [
      { rotulo: 'Cartões', href: '/cartoes' },
      { rotulo: 'Agenda', href: '/agenda' },
    ],
  },
  {
    id: 'conta-fixa',
    titulo: 'Contas fixas',
    palavras: ['CONTA FIXA', 'FIXA', 'ALUGUEL', 'LUZ', 'RECORREN', 'TODO MES', 'MENSAL'],
    resposta:
      'Contas que se repetem (aluguel, luz, internet, escola) entram em "Conta fixa" no +. O app cria as próximas sozinho, avisa no vencimento e, ao importar o extrato, dá baixa quando acha o pagamento.',
    acoes: [{ rotulo: 'Nova conta fixa', href: '/conta-fixa/novo' }],
  },
  {
    id: 'parcelas',
    titulo: 'Compras parceladas',
    palavras: ['PARCEL', 'VEZES', 'PRESTAC'],
    resposta:
      'Compra em várias vezes no cartão: "Parcelada" no +. Ao importar a fatura, se aparecer "parcela 3/10" de algo que não está no app, ele pergunta se quer criar a compra com as parcelas que faltam.',
    acoes: [{ rotulo: 'Nova compra parcelada', href: '/compra-parcelada/novo' }],
  },
  {
    id: 'metas',
    titulo: 'Cofrinhos, reserva e metas',
    palavras: ['META', 'COFRINHO', 'RESERVA', 'GUARDAR', 'ECONOMIZ', 'OBJETIVO'],
    resposta:
      'Na aba Metas ficam a reserva de emergência, os cofrinhos (objetivos com valor e data) e o orçamento do mês. O que você guarda sai do "Livre para gastar".',
    acoes: [
      { rotulo: 'Metas', href: '/metas' },
      { rotulo: 'Novo cofrinho', href: '/cofrinho/novo' },
    ],
  },
  {
    id: 'orcamento',
    titulo: 'Orçamento por categoria',
    palavras: ['ORCAMENTO', 'LIMITE DE GASTO', 'TETO', 'PLANEJ'],
    resposta: 'Em Mais → Orçamento do mês você põe um limite por categoria; o app avisa em 80% e quando passar, e sugere valores pela média dos últimos meses.',
    acoes: [{ rotulo: 'Orçamento do mês', href: '/orcamento' }],
  },
  {
    id: 'relatorio',
    titulo: 'Relatórios',
    palavras: ['RELATORIO', 'GRAFICO', 'ANUAL', 'DO ANO', 'RESUMO', 'PDF DO MES'],
    resposta: 'Em Relatórios você vê o mês (para onde foi o dinheiro, 6 meses) e o ano inteiro, e gera PDF dos dois.',
    acoes: [
      { rotulo: 'Relatório do mês', href: '/relatorios' },
      { rotulo: 'Relatório do ano', href: '/relatorios/anual' },
    ],
  },
  {
    id: 'desfazer',
    titulo: 'Desfazer uma importação',
    palavras: ['DESFAZ', 'ERREI', 'APAGAR IMPORT', 'IMPORTEI ERRADO', 'DUPLIC'],
    resposta:
      'Em Mais → Importações anteriores, abra a importação e toque em Desfazer: as linhas dela somem e tudo o que ela mudou (faturas pagas, contas fixas) volta. As regras aprendidas continuam.',
    acoes: [{ rotulo: 'Importações anteriores', href: '/importar-extrato/historico' }],
  },
  {
    id: 'backup',
    titulo: 'Backup',
    palavras: ['BACKUP', 'COPIA', 'SEGURANCA', 'TROCAR DE CELULAR', 'PERDER'],
    resposta:
      'Os dados ficam só no seu aparelho. Em Mais → Backup e restauração você gera um arquivo com tudo e guarda onde quiser (Arquivos, e-mail, nuvem); para voltar, é só restaurar esse arquivo.',
    acoes: [{ rotulo: 'Backup', href: '/backup' }],
  },
  {
    id: 'notificacoes',
    titulo: 'Avisos e notificações',
    palavras: ['NOTIFIC', 'AVISO', 'LEMBRETE', 'ALERTA'],
    resposta: 'O app avisa vencimentos, fechamento de fatura, contas atrasadas e o resumo da semana. Em Configurações → Notificações você liga e desliga cada tipo.',
    acoes: [{ rotulo: 'Notificações', href: '/configuracoes/notificacoes' }],
  },
  {
    id: 'membros',
    titulo: 'Família',
    palavras: ['FAMILIA', 'MEMBRO', 'ESPOSA', 'MARIDO', 'FILHO', 'DEPENDENTE'],
    resposta: 'Em Mais → Membros da família você cadastra as pessoas; cada lançamento pode ter um membro e o Início e os relatórios filtram por ele.',
    acoes: [{ rotulo: 'Membros da família', href: '/membro' }],
  },
  {
    id: 'senha-app',
    titulo: 'Bloqueio do app',
    palavras: ['PIN', 'BLOQUE', 'FACE ID', 'BIOMETRIA', 'SENHA DO APP'],
    resposta: 'Em Configurações você liga o bloqueio com PIN e, se o iPhone tiver, Face ID.',
    acoes: [{ rotulo: 'Configurações', href: '/configuracoes' }],
  },
];

/** Sugestões que aparecem antes de você digitar. */
export const SUGESTOES_DO_ASSISTENTE = [
  'Quanto gastei este mês?',
  'Quanto gastei com mercado?',
  'Qual o meu saldo?',
  'Quanto posso gastar?',
  'Quando vence a fatura?',
  'Qual foi meu maior gasto?',
  'Como exportar o extrato do BB?',
  'Como juntar categorias?',
];
