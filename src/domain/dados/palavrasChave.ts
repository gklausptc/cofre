/**
 * Palavras que indicam a categoria quando o comerciante não está no dicionário (camada de
 * confiança 0,7). Casam como início de palavra na descrição normalizada ("FARMA" pega
 * "FARMACIA" e "FARMA LTDA"). Separadas por saída e entrada.
 */
export const PALAVRAS_CHAVE_DESPESA: { categoria: string; palavras: string[] }[] = [
  {
    categoria: 'Alimentação',
    palavras: [
      'SUPERMERC', 'MERCADINHO', 'MERCEARIA', 'ATACAD', 'HORTIFRUT', 'SACOLAO', 'QUITANDA', 'PADARIA', 'PANIFICADORA',
      'PANIFIC', 'ACOUGUE', 'CASA DE CARNES', 'RESTAURANTE', 'LANCHONETE', 'LANCHES', 'PIZZARIA', 'HAMBURGUER',
      'BURGER', 'SORVETERIA', 'CAFETERIA', 'CAFE ', 'CHOPERIA', 'EMPORIO', 'DOCERIA', 'CONFEITARIA', 'SUSHI',
      'CHURRASCARIA', 'PASTELARIA', 'ESPETINHO', 'ACAI', 'BOMBONIERE', 'DISTRIBUIDORA DE BEBIDAS', 'ADEGA',
    ],
  },
  {
    categoria: 'Transporte',
    palavras: [
      'POSTO', 'AUTO POSTO', 'COMBUSTIV', 'ESTACIONAMENTO', 'PEDAGIO', 'OFICINA', 'AUTO PECAS', 'AUTOPECAS', 'PNEU',
      'LAVA JATO', 'LAVAJATO', 'LAVA RAPIDO', 'TAXI', 'MECANICA', 'BORRACHARIA', 'IPVA', 'LICENCIAMENTO',
    ],
  },
  {
    categoria: 'Saúde',
    palavras: [
      'FARMA', 'DROGARIA', 'DROGA', 'CLINICA', 'HOSPITAL', 'LABORATORIO', 'ODONTO', 'DENTISTA', 'MEDIC', 'OTICA',
      'PSICOLOG', 'FISIOTERAP', 'ACADEMIA', 'NUTRI', 'PILATES', 'CROSSFIT', 'EXAMES', 'VETERINAR',
    ],
  },
  {
    categoria: 'Moradia',
    palavras: [
      'CONDOMINIO', 'ALUGUEL', 'IPTU', 'ENERGIA', 'ELETRICIDADE', 'AGUA E ESGOTO', 'SANEAMENTO', 'GAS ', 'INTERNET',
      'TELECOM', 'TELEFONIA', 'FIBRA', 'MATERIAL DE CONSTRUCAO', 'MAT CONSTRUCAO', 'HOME CENTER', 'MOVEIS',
      'ELETRICISTA', 'ENCANADOR', 'DIARISTA', 'LAVANDERIA', 'CHAVEIRO', 'DEDETIZ',
    ],
  },
  {
    categoria: 'Educação',
    palavras: [
      'ESCOLA', 'COLEGIO', 'FACULDADE', 'UNIVERSIDADE', 'CURSO', 'LIVRARIA', 'PAPELARIA', 'MENSALIDADE ESCOLAR',
      'EDUCACAO', 'EDUCACIONAL', 'ENSINO', 'IDIOMAS',
    ],
  },
  {
    categoria: 'Lazer',
    palavras: [
      'CINEMA', 'TEATRO', 'SHOW', 'INGRESSO', 'HOTEL', 'POUSADA', 'RESORT', 'PARQUE', 'CLUBE', 'VIAGEM', 'TURISMO',
      'PASSAGEM', 'AGENCIA DE VIAGEM', 'BOLICHE', 'KARAOKE', 'BAR ', 'PUB',
    ],
  },
  {
    categoria: 'Compras',
    palavras: [
      'LOJA', 'LOJAS', 'MAGAZINE', 'MODA', 'CALCADOS', 'VESTUARIO', 'CONFECC', 'PERFUMARIA', 'COSMETICOS',
      'ELETRONICOS', 'ELETRO', 'PET SHOP', 'PETSHOP', 'BRINQUEDOS', 'PRESENTES', 'OTICA', 'JOALHERIA', 'FLORICULTURA',
    ],
  },
  {
    categoria: 'Outros gastos',
    palavras: ['TARIFA', 'IOF', 'JUROS', 'ANUIDADE', 'SEGURO', 'CARTORIO', 'IMPOSTO', 'MULTA', 'ENCARGOS'],
  },
];

export const PALAVRAS_CHAVE_RECEITA: { categoria: string; palavras: string[] }[] = [
  {
    categoria: 'Salário',
    palavras: ['SALARIO', 'FOLHA DE PAGAMENTO', 'FOLHA PGTO', 'PROVENTOS', 'PAGTO SALARIO', 'PAG SALARIO', 'VENCIMENTOS'],
  },
  {
    categoria: 'Outras receitas',
    palavras: ['RENDIMENTO', 'RENDIMENTOS', 'REMUNERACAO', 'JUROS', 'CASHBACK', 'REEMBOLSO', 'ESTORNO', 'RESGATE'],
  },
];

/**
 * Categoria que o banco põe no arquivo (coluna "Categoria" da fatura do C6, "category" da
 * fatura antiga do Nubank) → categoria do app. Casa por trecho, sem acento e em maiúsculas;
 * vale o primeiro da lista que aparecer. Categorias genéricas ("Serviços", "Outros") ficam de fora.
 */
export const CATEGORIAS_DOS_BANCOS: { trecho: string; categoria: string }[] = [
  { trecho: 'SUPERMERCADO', categoria: 'Alimentação' },
  { trecho: 'RESTAURANTE', categoria: 'Alimentação' },
  { trecho: 'LANCHONETE', categoria: 'Alimentação' },
  { trecho: 'ALIMENTACAO', categoria: 'Alimentação' },
  { trecho: 'PADARIA', categoria: 'Alimentação' },
  { trecho: 'DELIVERY', categoria: 'Alimentação' },
  { trecho: 'POSTO', categoria: 'Transporte' },
  { trecho: 'COMBUSTIVEL', categoria: 'Transporte' },
  { trecho: 'TRANSPORTE', categoria: 'Transporte' },
  { trecho: 'AUTOMOTIVO', categoria: 'Transporte' },
  { trecho: 'ESTACIONAMENTO', categoria: 'Transporte' },
  { trecho: 'PEDAGIO', categoria: 'Transporte' },
  { trecho: 'ASSISTENCIA MEDICA', categoria: 'Saúde' },
  { trecho: 'ODONTO', categoria: 'Saúde' },
  { trecho: 'SAUDE', categoria: 'Saúde' },
  { trecho: 'FARMACIA', categoria: 'Saúde' },
  { trecho: 'DROGARIA', categoria: 'Saúde' },
  { trecho: 'HOSPITAL', categoria: 'Saúde' },
  { trecho: 'EDUCACAO', categoria: 'Educação' },
  { trecho: 'HOTEL', categoria: 'Lazer' },
  { trecho: 'TURISMO', categoria: 'Lazer' },
  { trecho: 'VIAGEM', categoria: 'Lazer' },
  { trecho: 'CIA AEREA', categoria: 'Lazer' },
  { trecho: 'LAZER', categoria: 'Lazer' },
  { trecho: 'ENTRETENIMENTO', categoria: 'Lazer' },
  { trecho: 'STREAMING', categoria: 'Assinaturas' },
  { trecho: 'ASSINATURA', categoria: 'Assinaturas' },
  { trecho: 'TELECOMUNICACO', categoria: 'Moradia' },
  { trecho: 'TELEFONIA', categoria: 'Moradia' },
  { trecho: 'CONSTRUCAO', categoria: 'Moradia' },
  { trecho: 'CASA', categoria: 'Moradia' },
  { trecho: 'VESTUARIO', categoria: 'Compras' },
  { trecho: 'ROUPA', categoria: 'Compras' },
  { trecho: 'DEPARTAMENTO', categoria: 'Compras' },
  { trecho: 'ELETRO', categoria: 'Compras' },
  { trecho: 'COMPRAS', categoria: 'Compras' },
  { trecho: 'VAREJO', categoria: 'Compras' },
  { trecho: 'PET', categoria: 'Compras' },
];
