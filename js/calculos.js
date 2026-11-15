/**
 * calculos.js
 * Funções puras de cálculo, conversão e formatação.
 * Nenhuma função deste módulo acessa o DOM ou o armazenamento.
 *
 * Regra de precisão: os valores são mantidos com precisão total durante
 * todo o cálculo. Arredondamentos acontecem apenas na exibição e no preço
 * sugerido final (arredondado para cima, ao centavo, para preservar a margem).
 */

export const UNIDADES = Object.freeze({
  kg: { nome: 'Quilograma (kg)', dimensao: 'massa', fator: 1000, base: 'g' },
  g: { nome: 'Grama (g)', dimensao: 'massa', fator: 1, base: 'g' },
  L: { nome: 'Litro (L)', dimensao: 'volume', fator: 1000, base: 'ml' },
  ml: { nome: 'Mililitro (ml)', dimensao: 'volume', fator: 1, base: 'ml' },
  un: { nome: 'Unidade (un)', dimensao: 'unidade', fator: 1, base: 'un' },
});

export const ROTULOS_PERCENTUAIS = Object.freeze({
  taxas: 'Taxas sobre a venda',
  impostos: 'Impostos sobre a venda',
  margem: 'Margem de lucro desejada',
});

/* ---------- Unidades de medida ---------- */

export function unidadeValida(unidade) {
  return Object.prototype.hasOwnProperty.call(UNIDADES, unidade);
}

export function unidadesCompativeis(unidade) {
  if (!unidadeValida(unidade)) return [];
  const { dimensao } = UNIDADES[unidade];
  return Object.keys(UNIDADES).filter((u) => UNIDADES[u].dimensao === dimensao);
}

export function saoCompativeis(unidadeA, unidadeB) {
  return (
    unidadeValida(unidadeA) &&
    unidadeValida(unidadeB) &&
    UNIDADES[unidadeA].dimensao === UNIDADES[unidadeB].dimensao
  );
}

export function unidadeBase(unidade) {
  return unidadeValida(unidade) ? UNIDADES[unidade].base : '';
}

export function paraUnidadeBase(quantidade, unidade) {
  return unidadeValida(unidade) ? quantidade * UNIDADES[unidade].fator : NaN;
}

/* ---------- Custos de insumos ---------- */

/** Custo de 1 g, 1 ml ou 1 unidade do insumo, sem arredondamento. */
export function custoPorUnidadeBase(insumo) {
  if (!insumo) return NaN;
  const quantidadeBase = paraUnidadeBase(insumo.quantidade, insumo.unidade);
  if (!(quantidadeBase > 0) || !Number.isFinite(insumo.valorTotal)) return NaN;
  return insumo.valorTotal / quantidadeBase;
}

/** Custo da quantidade usada de um insumo, convertendo unidades compatíveis. */
export function custoDoIngrediente(insumo, quantidade, unidade) {
  if (!insumo || !(quantidade > 0) || !saoCompativeis(insumo.unidade, unidade)) return NaN;
  return custoPorUnidadeBase(insumo) * paraUnidadeBase(quantidade, unidade);
}

/* ---------- Arredondamento ---------- */

// toFixed(6) elimina resíduos de ponto flutuante (ex.: 2000.0000000001) antes do arredondamento.
export function arredondarCentavos(valor) {
  if (!Number.isFinite(valor)) return NaN;
  const resultado = Math.round(Number((valor * 100).toFixed(6))) / 100;
  return resultado === 0 ? 0 : resultado;
}

export function arredondarParaCimaCentavos(valor) {
  if (!Number.isFinite(valor)) return NaN;
  return Math.ceil(Number((valor * 100).toFixed(6))) / 100;
}

/* ---------- Validação de percentuais ---------- */

export function erroPercentual(valor, rotulo) {
  if (!Number.isFinite(valor)) return `${rotulo}: informe um número (use 0 se não houver).`;
  if (valor < 0) return `${rotulo}: o percentual não pode ser negativo.`;
  if (valor >= 100) return `${rotulo}: o percentual precisa ser menor que 100%.`;
  return null;
}

export function somarPercentuais({ taxas, impostos, margem }) {
  return Number((taxas + impostos + margem).toFixed(6));
}

export function mensagemSomaInvalida(percentuais) {
  const soma = somarPercentuais(percentuais);
  return (
    `A soma de taxas (${formatarNumero(percentuais.taxas)}%), impostos (${formatarNumero(percentuais.impostos)}%) ` +
    `e margem (${formatarNumero(percentuais.margem)}%) é ${formatarNumero(soma)}%. Ela precisa ficar abaixo de 100%: ` +
    'com 100% ou mais, nenhum preço consegue cobrir o custo do produto. Reduza a margem desejada ou revise os percentuais.'
  );
}

/* ---------- Preço, lucro e margem ---------- */

/**
 * Preço de venda = custo unitário / (1 − taxas − impostos − margem), com os
 * percentuais convertidos para decimais. A margem é calculada sobre o
 * faturamento (preço de venda), não é um markup aplicado sobre o custo.
 */
export function calcularPrecoSugerido(custoUnitario, percentuais) {
  const { taxas, impostos, margem } = percentuais;
  if (![custoUnitario, taxas, impostos, margem].every(Number.isFinite)) {
    return { ok: false, erro: 'Preencha todos os valores numéricos antes de calcular.' };
  }
  if (!(custoUnitario > 0)) {
    return { ok: false, erro: 'O custo total por unidade precisa ser maior que zero.' };
  }
  const soma = somarPercentuais(percentuais);
  if (soma >= 100) return { ok: false, erro: mensagemSomaInvalida(percentuais) };

  const divisor = (100 - soma) / 100;
  const precoExato = custoUnitario / divisor;
  return { ok: true, divisor, precoExato, preco: arredondarParaCimaCentavos(precoExato) };
}

/** Lucro e margem reais para um preço de venda qualquer. */
export function analisarVenda(preco, custoUnitario, { taxas, impostos }) {
  if (!(preco > 0) || !Number.isFinite(custoUnitario)) return null;
  const taxasValor = (preco * taxas) / 100;
  const impostosValor = (preco * impostos) / 100;
  const lucro = preco - custoUnitario - taxasValor - impostosValor;
  return {
    preco,
    taxasValor,
    impostosValor,
    lucro,
    margem: lucro / preco,
    markup: custoUnitario > 0 ? preco / custoUnitario : NaN,
  };
}

/**
 * Calcula a ficha técnica completa de um produto.
 * `buscarInsumo(id)` deve devolver o insumo ATUAL, garantindo que alterações
 * nos insumos se reflitam imediatamente nos produtos.
 */
export function calcularFichaTecnica(produto, buscarInsumo) {
  const pendencias = [];
  const avisos = [];
  const ingredientes = Array.isArray(produto.ingredientes) ? produto.ingredientes : [];

  const itens = ingredientes.map((ingrediente) => {
    const insumo = ingrediente.insumoId ? buscarInsumo(ingrediente.insumoId) : null;
    const item = {
      insumoId: ingrediente.insumoId,
      nome: insumo ? insumo.nome : '',
      quantidade: ingrediente.quantidade,
      unidade: ingrediente.unidade,
      custo: NaN,
      problema: null,
    };
    if (!ingrediente.insumoId) item.problema = 'Selecione o insumo de cada linha da ficha técnica.';
    else if (!insumo) item.problema = 'Um insumo desta ficha técnica não existe mais. Selecione outro insumo.';
    else if (!Number.isFinite(ingrediente.quantidade) || ingrediente.quantidade <= 0)
      item.problema = `Informe uma quantidade maior que zero para "${insumo.nome}".`;
    else if (!saoCompativeis(insumo.unidade, ingrediente.unidade))
      item.problema = `A unidade escolhida para "${insumo.nome}" não é compatível com o cadastro do insumo.`;
    else item.custo = custoDoIngrediente(insumo, ingrediente.quantidade, ingrediente.unidade);

    if (item.problema) pendencias.push(item.problema);
    return item;
  });

  if (itens.length === 0) pendencias.push('Adicione pelo menos um ingrediente à ficha técnica.');

  const vistos = new Set();
  itens.forEach((item) => {
    if (!item.insumoId) return;
    if (vistos.has(item.insumoId)) {
      pendencias.push(`"${item.nome}" aparece mais de uma vez. Junte as quantidades em uma única linha.`);
    }
    vistos.add(item.insumoId);
  });

  const rendimento = produto.rendimento;
  if (!Number.isFinite(rendimento) || rendimento <= 0) {
    pendencias.push('Informe quantas unidades a receita rende (valor maior que zero).');
  }

  const custosPorUnidade = {
    embalagem: produto.embalagem,
    outrosCustos: produto.outrosCustos,
    custoFixoUnitario: produto.custoFixoUnitario,
  };
  const rotulosCustos = {
    embalagem: 'Custo da embalagem',
    outrosCustos: 'Outros custos variáveis',
    custoFixoUnitario: 'Custo fixo rateado',
  };
  Object.entries(custosPorUnidade).forEach(([campo, valor]) => {
    if (!Number.isFinite(valor) || valor < 0) {
      pendencias.push(`${rotulosCustos[campo]}: informe um valor igual ou maior que zero.`);
    }
  });

  const percentuais = { taxas: produto.taxas, impostos: produto.impostos, margem: produto.margem };
  const errosPercentuais = Object.keys(percentuais)
    .map((campo) => erroPercentual(percentuais[campo], ROTULOS_PERCENTUAIS[campo]))
    .filter(Boolean);
  pendencias.push(...errosPercentuais);
  const somaPercentual = errosPercentuais.length === 0 ? somarPercentuais(percentuais) : NaN;
  if (somaPercentual >= 100) pendencias.push(mensagemSomaInvalida(percentuais));

  const precoInformado = produto.precoVenda !== null && produto.precoVenda !== undefined;
  if (precoInformado && (!Number.isFinite(produto.precoVenda) || produto.precoVenda <= 0)) {
    pendencias.push('Preço de venda definido: informe um valor maior que zero ou deixe o campo em branco.');
  }

  const valorOuZero = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const custoIngredientesReceita = itens.reduce((soma, item) => soma + (Number.isFinite(item.custo) ? item.custo : 0), 0);
  const custoIngredientesUnidade = rendimento > 0 ? custoIngredientesReceita / rendimento : NaN;
  const embalagem = valorOuZero(produto.embalagem);
  const outrosCustos = valorOuZero(produto.outrosCustos);
  const custoFixoUnitario = valorOuZero(produto.custoFixoUnitario);
  const custoUnitario = custoIngredientesUnidade + embalagem + outrosCustos + custoFixoUnitario;

  let sugestao = null;
  if (pendencias.length === 0) {
    sugestao = calcularPrecoSugerido(custoUnitario, percentuais);
    if (!sugestao.ok) pendencias.push(sugestao.erro);
  }

  const completo = pendencias.length === 0;
  const precoSugerido = completo ? sugestao.preco : NaN;
  const precoDefinido = precoInformado && produto.precoVenda > 0 ? produto.precoVenda : null;
  const precoReferencia = completo ? precoDefinido ?? precoSugerido : NaN;
  const venda = completo ? analisarVenda(precoReferencia, custoUnitario, percentuais) : null;

  if (completo && precoDefinido !== null) {
    if (venda.lucro < 0) {
      avisos.push('Com o preço definido, o produto gera prejuízo: o valor não cobre custos, taxas e impostos.');
    } else if (precoDefinido < precoSugerido) {
      avisos.push('O preço definido está abaixo do sugerido. A margem real ficará menor que a desejada.');
    }
  }

  return {
    completo,
    pendencias: [...new Set(pendencias)],
    avisos,
    itens,
    rendimento,
    custoIngredientesReceita,
    custoIngredientesUnidade,
    embalagem,
    outrosCustos,
    custoFixoUnitario,
    custoUnitario: completo ? custoUnitario : NaN,
    percentuais,
    somaPercentual,
    divisor: completo ? sugestao.divisor : NaN,
    precoSugerido,
    precoDefinido,
    precoReferencia,
    origemPreco: precoDefinido !== null ? 'definido' : 'sugerido',
    venda,
  };
}

/* ---------- Conversão de texto digitado ---------- */

/**
 * Aceita "1,5", "1.5", "1.234,56", "R$ 40,00" e "30%".
 * Retorna NaN para textos vazios ou inválidos.
 */
export function interpretarNumero(entrada) {
  if (typeof entrada === 'number') return entrada;
  if (entrada === null || entrada === undefined) return NaN;
  let texto = String(entrada).trim().replace(/\s|R\$|%/g, '');
  if (texto === '') return NaN;
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(texto)) return NaN;
  return Number(texto);
}

export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/* ---------- Formatação (pt-BR) ---------- */

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoMoedaPrecisa = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const formatoPercentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export function formatarMoeda(valor) {
  return Number.isFinite(valor) ? formatoMoeda.format(arredondarCentavos(valor)) : '—';
}

/** Usado apenas para custo unitário de insumos (ex.: R$ 0,016 por ml). */
export function formatarMoedaPrecisa(valor) {
  return Number.isFinite(valor) ? formatoMoedaPrecisa.format(valor) : '—';
}

/** Recebe uma fração (0,3) e exibe "30%". */
export function formatarPercentual(fracao) {
  return Number.isFinite(fracao) ? formatoPercentual.format(fracao) : '—';
}

export function formatarNumero(valor, casas = 3) {
  if (!Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(valor);
}

/** Valor para campos de formulário: 40.5 → "40,5". */
export function numeroParaCampo(valor) {
  if (!Number.isFinite(valor)) return '';
  return String(Number(valor.toFixed(6))).replace('.', ',');
}

/* ---------- Texto para a área de transferência ---------- */

export function gerarTextoResultado(nomeProduto, resultado) {
  const { percentuais, venda } = resultado;
  const linhas = [
    'PreçoCerto — Resultado da precificação',
    '',
    `Produto: ${nomeProduto}`,
    `Custo total por unidade: ${formatarMoeda(resultado.custoUnitario)}`,
    `Preço sugerido: ${formatarMoeda(resultado.precoSugerido)}`,
  ];
  if (resultado.precoDefinido !== null) {
    linhas.push(`Preço de venda definido: ${formatarMoeda(resultado.precoDefinido)}`);
  }
  const base = resultado.origemPreco === 'definido' ? 'preço definido' : 'preço sugerido';
  linhas.push(
    `Lucro estimado por unidade: ${formatarMoeda(venda.lucro)} (com o ${base})`,
    `Margem de lucro estimada: ${formatarPercentual(venda.margem)} sobre o preço de venda`,
    `Parâmetros: taxas ${formatarNumero(percentuais.taxas)}%, impostos ${formatarNumero(percentuais.impostos)}%, margem desejada ${formatarNumero(percentuais.margem)}%`,
    '',
    'Valores estimados a partir dos dados informados. Não representam garantia de lucro.'
  );
  return linhas.join('\n').replace(/ /g, ' ');
}
