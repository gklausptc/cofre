/**
 * Palavras que indicam a categoria quando o comerciante não está no dicionário (camada de
 * confiança 0,7). Casam como início de palavra na descrição normalizada ("FARMA" pega
 * "FARMACIA" e "FARMA LTDA"); com espaço no fim, só a palavra inteira ("BAR " não pega
 * "BARBEARIA"); com espaço no meio, também colada ("AUTO POSTO" pega "AUTOPOSTO"). A mais
 * longa ganha. Separadas por saída e entrada.
 */
export const PALAVRAS_CHAVE_DESPESA: { categoria: string; palavras: string[] }[] = [
  {
    categoria: 'Mercado',
    palavras: [
      'SUPERMERC', 'SUPER MERCADO', 'SUPER ', 'HIPER ', 'HIPERMERC', 'MERCADINHO', 'MINIMERCADO', 'MINI MERCADO', 'MERCADO ',
      'MERCADOS ', 'MERCEARIA', 'ATACAD', 'ATACAREJO', 'HORTIFRUT', 'HORTI FRUTI', 'SACOLAO', 'VAREJAO', 'QUITANDA', 'FEIRA ',
      'ACOUGUE', 'CASA DE CARNES', 'MERCADO DE CARNES', 'CARNES ', 'FRIGORIFICO', 'PEIXARIA', 'EMPORIO', 'DISTRIBUIDORA DE ALIMENTOS',
      'CESTA BASICA',
    ],
  },
  {
    categoria: 'Delivery',
    palavras: ['DELIVERY', 'DELIVERI', 'ENTREGA DE COMIDA', 'APP DE ENTREGA'],
  },
  {
    categoria: 'Alimentação',
    palavras: [
      'PADARIA', 'PANIFICADORA', 'PANIFIC', 'PADOCA', 'CONFEITARIA', 'DOCERIA', 'DOCES ', 'DOCE ', 'BOLOS ', 'BOLO ',
      'BRIGADEIRO', 'CHOCOLATE', 'BOMBONIERE', 'RESTAURANTE', 'RESTAURANT', 'LANCHONETE', 'LANCHES', 'LANCHE ', 'SNACK',
      'PIZZARIA', 'PIZZA', 'PIZZAS', 'HAMBURG', 'BURGER', 'BURGUER', 'SANDUICHE', 'SORVETERIA', 'SORVETE', 'GELATO', 'ACAI',
      'CAFETERIA', 'CAFE ', 'CAFES ', 'COFFEE', 'CHOPERIA', 'CHOPP', 'CERVEJARIA', 'BEER ', 'BAR ', 'BARES ', 'BOTECO', 'PETISCARIA',
      'ADEGA', 'SUSHI', 'TEMAKI', 'JAPONES', 'CHURRASCARIA', 'CHURRASCO', 'ESPETO', 'ESPETINHO', 'PASTELARIA', 'PASTEL',
      'ESFIHA', 'ESFIRRA', 'SALGADOS', 'SALGADINHO', 'COXINHA', 'MARMITA', 'MARMITEX', 'QUENTINHA', 'REFEICAO', 'REFEICOES',
      'COMIDA', 'COMIDAS', 'FOOD ', 'FOODS ', 'GASTRONOMIA', 'BISTRO', 'CANTINA', 'TRATTORIA', 'GRILL ', 'STEAK', 'TAPIOCA',
      'CREPE', 'CREPERIA', 'CHURROS', 'PAMONHA', 'YAKISSOBA', 'ASSADOS', 'ROTISSERIA', 'FRANGO ', 'GALETERIA', 'BUFFET',
      'SELF SERVICE', 'POR QUILO', 'CALDO ', 'SUCOS', 'SUCO ', 'CONVENIENCIA', 'DISTRIBUIDORA DE BEBIDAS', 'BEBIDAS',
      'DELICATESSEN',
    ],
  },
  {
    categoria: 'Combustível',
    palavras: ['POSTO ', 'POSTOS ', 'AUTO POSTO', 'AUTOPOSTO', 'COMBUSTIV', 'GASOLINA', 'ETANOL', 'GNV '],
  },
  {
    categoria: 'Estacionamento e pedágio',
    palavras: ['ESTACION', 'ESTAC ', 'PARK', 'VALET', 'MANOBRISTA', 'PEDAGIO', 'ZONA AZUL', 'ROTATIVO', 'GARAGEM'],
  },
  {
    categoria: 'Veículo',
    palavras: [
      'OFICINA', 'AUTO PECAS', 'AUTOPECAS', 'PNEU', 'LAVA JATO', 'LAVAJATO', 'LAVA RAPIDO', 'LAVAGEM', 'MECANICA', 'BORRACHARIA',
      'FUNILARIA', 'IPVA', 'LICENCIAMENTO', 'AUTO CENTER', 'AUTOCENTER', 'SEGURO AUTO', 'VISTORIA', 'AUTO ESCOLA', 'AUTOESCOLA',
      'MOTO PECAS', 'MOTOPECAS', 'AUTOMOTIV',
    ],
  },
  {
    categoria: 'Transporte',
    palavras: ['TAXI', 'METRO ', 'ONIBUS', 'VIACAO', 'RODOVIARIA', 'BILHETE', 'TRANSPORTE', 'MOBILIDADE', 'PATINETE'],
  },
  {
    categoria: 'Farmácia',
    palavras: ['FARMA', 'DROGARIA', 'DROGA ', 'DROGAS ', 'DROGAO', 'MANIPULACAO'],
  },
  {
    categoria: 'Saúde',
    palavras: [
      'CLINICA', 'HOSPITAL', 'LABORATORIO', 'ODONTO', 'DENTISTA', 'MEDIC', 'OTICA', 'PSICOLOG', 'FISIOTERAP', 'ACADEMIA',
      'NUTRI', 'PILATES', 'CROSSFIT', 'EXAMES', 'VETERINAR', 'CONSULTORIO', 'SAUDE',
    ],
  },
  {
    categoria: 'Moradia',
    palavras: [
      'CONDOMINIO', 'ALUGUEL', 'IPTU', 'ENERGIA', 'ELETRICIDADE', 'AGUA E ESGOTO', 'SANEAMENTO', 'GAS ', 'INTERNET',
      'TELECOM', 'TELEFONIA', 'FIBRA', 'MATERIAL DE CONSTRUCAO', 'MAT CONSTRUCAO', 'HOME CENTER', 'MOVEIS', 'ELETRICISTA',
      'ENCANADOR', 'DIARISTA', 'LAVANDERIA', 'CHAVEIRO', 'DEDETIZ', 'MATERIAIS DE CONSTRUCAO', 'CASA E CONSTRUCAO', 'VIDRACARIA',
      'MARCENARIA', 'SERRALHERIA',
    ],
  },
  {
    categoria: 'Educação',
    palavras: [
      'ESCOLA', 'COLEGIO', 'FACULDADE', 'UNIVERSIDADE', 'CURSO', 'LIVRARIA', 'PAPELARIA', 'MENSALIDADE ESCOLAR', 'EDUCACAO',
      'EDUCACIONAL', 'ENSINO', 'IDIOMAS',
    ],
  },
  {
    categoria: 'Lazer',
    palavras: [
      'CINEMA', 'TEATRO', 'SHOW ', 'INGRESSO', 'HOTEL', 'POUSADA', 'RESORT', 'PARQUE', 'CLUBE', 'VIAGEM', 'TURISMO', 'PASSAGEM',
      'AGENCIA DE VIAGEM', 'BOLICHE', 'KARAOKE', 'PUB ', 'BALADA', 'GAMES', 'JOGOS',
    ],
  },
  {
    categoria: 'Compras online',
    palavras: ['MARKETPLACE', 'MKTPLACE', 'E COMMERCE', 'ECOMMERCE', 'LOJA VIRTUAL', 'LOJA ONLINE', 'COMPRA ONLINE'],
  },
  {
    categoria: 'Compras',
    palavras: [
      'LOJA', 'LOJAS', 'MAGAZINE', 'MODA', 'CALCADOS', 'VESTUARIO', 'CONFECC', 'PERFUMARIA', 'COSMETICOS', 'ELETRONICOS', 'ELETRO',
      'PET SHOP', 'PETSHOP', 'BRINQUEDOS', 'PRESENTES', 'JOALHERIA', 'FLORICULTURA', 'SHOPPING', 'BAZAR', 'UTILIDADES', 'ARMARINHO',
      'INFORMATICA', 'CELULARES', 'ACESSORIOS', 'BOUTIQUE', 'STORE ', 'SHOP ', 'OUTLET', 'MULTIMARCAS',
    ],
  },
  {
    categoria: 'Saque em dinheiro',
    palavras: ['SAQUE', 'SAQ ', 'BANCO24HORAS', 'BANCO 24 HORAS', 'BANCO24H', 'CAIXA ELETRONICO', 'ATM '],
  },
  {
    categoria: 'Tarifas e juros',
    palavras: [
      'TARIFA', 'TAR ', 'IOF', 'JUROS', 'ANUIDADE', 'ENCARGOS', 'MULTA', 'CESTA DE SERVICOS', 'PACOTE DE SERVICOS',
      'TAXA DE MANUTENCAO', 'ADICIONAL CHEQUE ESPECIAL',
    ],
  },
  {
    categoria: 'Outros gastos',
    palavras: ['SEGURO', 'CARTORIO', 'IMPOSTO', 'TRIBUTO', 'DOACAO', 'IGREJA', 'DIZIMO'],
  },
];

export const PALAVRAS_CHAVE_RECEITA: { categoria: string; palavras: string[] }[] = [
  {
    categoria: 'Salário',
    palavras: ['SALARIO', 'FOLHA DE PAGAMENTO', 'FOLHA PGTO', 'PROVENTOS', 'PAGTO SALARIO', 'PAG SALARIO', 'VENCIMENTOS', 'PRO LABORE'],
  },
  {
    categoria: 'Rendimentos',
    palavras: ['RENDIMENTO', 'RENDIMENTOS', 'REND ', 'REMUNERACAO', 'JUROS', 'DIVIDENDO', 'JCP '],
  },
  {
    categoria: 'Reembolsos e estornos',
    palavras: ['CASHBACK', 'REEMBOLSO', 'ESTORNO', 'DEVOLUCAO', 'DEVOLUC', 'DEVOLVID', 'CREDITO DE COMPRA', 'CANCELAMENTO'],
  },
  {
    categoria: 'Outras receitas',
    palavras: ['DEPOSITO DE VENDAS', 'VENDAS ', 'VENDA ', 'RECEBIMENTO DE VENDAS', 'ANTECIPACAO DE VENDAS'],
  },
];

/**
 * Categoria que o banco põe no arquivo (coluna "Categoria" da fatura do C6, "category" da
 * fatura antiga do Nubank) → categoria do app. Casa por trecho, sem acento e em maiúsculas;
 * vale o primeiro da lista que aparecer. Categorias genéricas ("Serviços", "Outros") ficam de fora.
 */
export const CATEGORIAS_DOS_BANCOS: { trecho: string; categoria: string }[] = [
  { trecho: 'SUPERMERCADO', categoria: 'Mercado' },
  { trecho: 'RESTAURANTE', categoria: 'Alimentação' },
  { trecho: 'LANCHONETE', categoria: 'Alimentação' },
  { trecho: 'ALIMENTACAO', categoria: 'Alimentação' },
  { trecho: 'PADARIA', categoria: 'Alimentação' },
  { trecho: 'DELIVERY', categoria: 'Delivery' },
  { trecho: 'POSTO', categoria: 'Combustível' },
  { trecho: 'COMBUSTIVEL', categoria: 'Combustível' },
  { trecho: 'TRANSPORTE', categoria: 'Transporte' },
  { trecho: 'AUTOMOTIVO', categoria: 'Veículo' },
  { trecho: 'ESTACIONAMENTO', categoria: 'Estacionamento e pedágio' },
  { trecho: 'PEDAGIO', categoria: 'Estacionamento e pedágio' },
  { trecho: 'ASSISTENCIA MEDICA', categoria: 'Saúde' },
  { trecho: 'ODONTO', categoria: 'Saúde' },
  { trecho: 'SAUDE', categoria: 'Saúde' },
  { trecho: 'FARMACIA', categoria: 'Farmácia' },
  { trecho: 'DROGARIA', categoria: 'Farmácia' },
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
