/**
 * estado.js
 * Cadastro, atualização, exclusão e persistência (localStorage) de insumos,
 * produtos e configurações.
 *
 * Os produtos guardam apenas os dados de entrada da ficha técnica (insumo,
 * quantidade, unidade, percentuais...). Custos e preços são sempre
 * recalculados a partir dos insumos atuais, evitando valores desatualizados.
 */

import {
  ROTULOS_PERCENTUAIS,
  unidadeValida,
  unidadesCompativeis,
  saoCompativeis,
  erroPercentual,
  somarPercentuais,
  mensagemSomaInvalida,
  calcularFichaTecnica,
  normalizarTexto,
} from './calculos.js';

const CHAVE_ARMAZENAMENTO = 'precocerto:dados:v1';
const VERSAO_DADOS = 1;

export const CATEGORIAS_INSUMO = Object.freeze([
  'Carnes e proteínas',
  'Laticínios',
  'Panificação e massas',
  'Hortifrúti',
  'Molhos e temperos',
  'Doces e confeitaria',
  'Bebidas',
  'Embalagens',
  'Descartáveis',
  'Outros',
]);

export const CATEGORIAS_PRODUTO_SUGERIDAS = Object.freeze([
  'Lanches',
  'Pizzas',
  'Doces',
  'Bolos e tortas',
  'Salgados',
  'Bebidas',
  'Porções',
  'Pratos',
  'Outros',
]);

const CONFIG_PADRAO = Object.freeze({ taxas: 0, impostos: 0, margem: 30 });

let dados = criarDadosVazios();
let armazenamentoDisponivel = true;
const ouvintes = new Set();

/* ---------- Utilidades internas ---------- */

function criarDadosVazios() {
  return { insumos: [], produtos: [], config: { ...CONFIG_PADRAO } };
}

function gerarId(prefixo) {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return `${prefixo}_${crypto.randomUUID()}`;
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function numero(valor, padrao = NaN) {
  if (valor === null || valor === undefined || valor === '') return padrao;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : padrao;
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
}

function lista(valor) {
  return Array.isArray(valor) ? valor : [];
}

function copiar(objeto) {
  return objeto ? structuredClone(objeto) : null;
}

function ordenarPorNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
}

function insumoInterno(id) {
  return dados.insumos.find((insumo) => insumo.id === id) || null;
}

function produtoInterno(id) {
  return dados.produtos.find((produto) => produto.id === id) || null;
}

/* ---------- Sanitização (dados lidos do localStorage) ---------- */

function sanitizarInsumo(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const insumo = {
    id: texto(bruto.id),
    nome: texto(bruto.nome),
    categoria: CATEGORIAS_INSUMO.includes(bruto.categoria) ? bruto.categoria : 'Outros',
    quantidade: numero(bruto.quantidade),
    unidade: bruto.unidade,
    valorTotal: numero(bruto.valorTotal),
    demo: bruto.demo === true,
    criadoEm: numero(bruto.criadoEm, Date.now()),
    atualizadoEm: numero(bruto.atualizadoEm, Date.now()),
  };
  const valido = insumo.id && insumo.nome && unidadeValida(insumo.unidade) && insumo.quantidade > 0 && insumo.valorTotal > 0;
  return valido ? insumo : null;
}

function sanitizarProduto(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const produto = {
    id: texto(bruto.id),
    nome: texto(bruto.nome),
    categoria: texto(bruto.categoria) || 'Outros',
    rendimento: numero(bruto.rendimento),
    ingredientes: lista(bruto.ingredientes)
      .map((item) => ({
        insumoId: texto(item && item.insumoId),
        quantidade: numero(item && item.quantidade),
        unidade: item && unidadeValida(item.unidade) ? item.unidade : '',
      }))
      .filter((item) => item.insumoId),
    embalagem: numero(bruto.embalagem, 0),
    outrosCustos: numero(bruto.outrosCustos, 0),
    custoFixoUnitario: numero(bruto.custoFixoUnitario, 0),
    taxas: numero(bruto.taxas, 0),
    impostos: numero(bruto.impostos, 0),
    margem: numero(bruto.margem, 0),
    precoVenda: numero(bruto.precoVenda, null),
    demo: bruto.demo === true,
    criadoEm: numero(bruto.criadoEm, Date.now()),
    atualizadoEm: numero(bruto.atualizadoEm, Date.now()),
  };
  return produto.id && produto.nome ? produto : null;
}

function sanitizarConfig(bruto) {
  const config = { ...CONFIG_PADRAO };
  if (!bruto || typeof bruto !== 'object') return config;
  Object.keys(CONFIG_PADRAO).forEach((campo) => {
    const valor = numero(bruto[campo]);
    if (!erroPercentual(valor, campo)) config[campo] = valor;
  });
  if (somarPercentuais(config) >= 100) return { ...CONFIG_PADRAO };
  return config;
}

/* ---------- Persistência ---------- */

/** @returns {'ok'|'vazio'|'corrompido'|'indisponivel'} */
function carregar() {
  let bruto;
  try {
    bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
  } catch {
    armazenamentoDisponivel = false;
    dados = criarDadosVazios();
    return 'indisponivel';
  }
  if (!bruto) {
    dados = criarDadosVazios();
    return 'vazio';
  }
  try {
    const objeto = JSON.parse(bruto);
    dados = {
      insumos: lista(objeto.insumos).map(sanitizarInsumo).filter(Boolean),
      produtos: lista(objeto.produtos).map(sanitizarProduto).filter(Boolean),
      config: sanitizarConfig(objeto.config),
    };
    return 'ok';
  } catch {
    // Guarda uma cópia do conteúdo ilegível antes que ele seja sobrescrito.
    try {
      localStorage.setItem(`${CHAVE_ARMAZENAMENTO}:corrompido`, bruto);
    } catch {
      /* sem espaço: segue sem a cópia */
    }
    dados = criarDadosVazios();
    return 'corrompido';
  }
}

function persistir() {
  if (!armazenamentoDisponivel) return false;
  try {
    const pacote = { versao: VERSAO_DADOS, salvoEm: Date.now(), ...dados };
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(pacote));
    return true;
  } catch (erro) {
    console.error('PreçoCerto: não foi possível salvar no localStorage.', erro);
    return false;
  }
}

function confirmarAlteracao(motivo) {
  const salvo = persistir();
  ouvintes.forEach((ouvinte) => ouvinte(motivo));
  return salvo;
}

export function iniciarEstado() {
  const situacao = carregar();
  // Mantém abas diferentes sincronizadas.
  window.addEventListener('storage', (evento) => {
    if (evento.key === CHAVE_ARMAZENAMENTO || evento.key === null) {
      carregar();
      ouvintes.forEach((ouvinte) => ouvinte('outra-aba'));
    }
  });
  return situacao;
}

export function assinar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function armazenamentoAtivo() {
  return armazenamentoDisponivel;
}

/* ---------- Consultas ---------- */

export function listarInsumos() {
  return dados.insumos.map(copiar).sort(ordenarPorNome);
}

export function buscarInsumo(id) {
  return copiar(insumoInterno(id));
}

export function listarProdutos() {
  return dados.produtos.map(copiar).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

export function buscarProduto(id) {
  return copiar(produtoInterno(id));
}

export function produtosQueUsam(insumoId) {
  return dados.produtos
    .filter((produto) => produto.ingredientes.some((item) => item.insumoId === insumoId))
    .map(copiar)
    .sort(ordenarPorNome);
}

/** Calcula um produto (salvo ou em edição) sempre com os insumos atuais. */
export function calcularProduto(produto) {
  return calcularFichaTecnica(produto, insumoInterno);
}

/* ---------- Insumos ---------- */

export function validarInsumo(entrada) {
  const erros = {};
  const id = entrada.id || null;
  const nome = texto(entrada.nome);

  if (!nome) erros.nome = 'Informe o nome do insumo.';
  else if (nome.length > 80) erros.nome = 'Use no máximo 80 caracteres.';
  else if (dados.insumos.some((i) => i.id !== id && normalizarTexto(i.nome) === normalizarTexto(nome))) {
    erros.nome = 'Já existe um insumo com esse nome. Edite o cadastro existente ou use um nome diferente.';
  }

  if (!CATEGORIAS_INSUMO.includes(entrada.categoria)) erros.categoria = 'Selecione uma categoria.';

  if (!Number.isFinite(entrada.quantidade)) erros.quantidade = 'Informe a quantidade comprada (somente números).';
  else if (entrada.quantidade <= 0) erros.quantidade = 'A quantidade deve ser maior que zero.';

  if (!unidadeValida(entrada.unidade)) {
    erros.unidade = 'Selecione a unidade de medida.';
  } else if (id) {
    const atual = insumoInterno(id);
    const usadoEm = produtosQueUsam(id);
    if (atual && usadoEm.length > 0 && !saoCompativeis(atual.unidade, entrada.unidade)) {
      const permitidas = unidadesCompativeis(atual.unidade).join(' ou ');
      erros.unidade = `Este insumo é usado em ${usadoEm.length} produto(s). Para não invalidar as fichas técnicas, use ${permitidas}.`;
    }
  }

  if (!Number.isFinite(entrada.valorTotal)) erros.valorTotal = 'Informe o valor total pago (somente números).';
  else if (entrada.valorTotal < 0) erros.valorTotal = 'O valor pago não pode ser negativo.';
  else if (entrada.valorTotal === 0) erros.valorTotal = 'O valor pago deve ser maior que zero.';

  return erros;
}

export function salvarInsumo(entrada) {
  const erros = validarInsumo(entrada);
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const agora = Date.now();
  const campos = {
    nome: texto(entrada.nome),
    categoria: entrada.categoria,
    quantidade: entrada.quantidade,
    unidade: entrada.unidade,
    valorTotal: entrada.valorTotal,
  };

  if (entrada.id) {
    const atual = insumoInterno(entrada.id);
    if (!atual) return { ok: false, erros: { geral: 'Este insumo não existe mais. Ele pode ter sido excluído em outra aba.' } };
    Object.assign(atual, campos, { atualizadoEm: agora });
    // Nada a copiar nos produtos: eles são recalculados a partir do insumo atualizado.
    const afetados = dados.produtos.filter((p) => p.ingredientes.some((i) => i.insumoId === atual.id));
    const salvo = confirmarAlteracao('insumo-atualizado');
    return { ok: true, criado: false, item: copiar(atual), produtosAfetados: afetados.length, salvo };
  }

  const novo = { id: gerarId('ins'), ...campos, demo: false, criadoEm: agora, atualizadoEm: agora };
  dados.insumos.push(novo);
  const salvo = confirmarAlteracao('insumo-criado');
  return { ok: true, criado: true, item: copiar(novo), produtosAfetados: 0, salvo };
}

export function excluirInsumo(id) {
  const insumo = insumoInterno(id);
  if (!insumo) return { ok: false, mensagem: 'Insumo não encontrado.' };
  const usadoEm = produtosQueUsam(id);
  if (usadoEm.length > 0) return { ok: false, emUso: usadoEm.map((p) => p.nome) };
  dados.insumos = dados.insumos.filter((i) => i.id !== id);
  const salvo = confirmarAlteracao('insumo-excluido');
  return { ok: true, item: copiar(insumo), salvo };
}

/* ---------- Produtos ---------- */

export function validarProduto(entrada) {
  const erros = {};
  const errosIngredientes = {};
  const id = entrada.id || null;
  const nome = texto(entrada.nome);

  if (!nome) erros.nome = 'Informe o nome do produto.';
  else if (nome.length > 80) erros.nome = 'Use no máximo 80 caracteres.';
  else if (dados.produtos.some((p) => p.id !== id && normalizarTexto(p.nome) === normalizarTexto(nome))) {
    erros.nome = 'Já existe um produto com esse nome. Abra o produto existente para editá-lo ou use outro nome.';
  }

  if (texto(entrada.categoria).length > 40) erros.categoria = 'Use no máximo 40 caracteres.';

  if (!Number.isFinite(entrada.rendimento)) erros.rendimento = 'Informe quantas unidades a receita rende.';
  else if (entrada.rendimento <= 0) erros.rendimento = 'O rendimento deve ser maior que zero.';

  const ingredientes = lista(entrada.ingredientes);
  if (ingredientes.length === 0) erros.ingredientes = 'Adicione pelo menos um ingrediente à ficha técnica.';
  const usados = new Set();
  ingredientes.forEach((item, indice) => {
    const insumo = item.insumoId ? insumoInterno(item.insumoId) : null;
    if (!item.insumoId) errosIngredientes[indice] = 'Selecione um insumo.';
    else if (!insumo) errosIngredientes[indice] = 'Este insumo não existe mais. Selecione outro.';
    else if (usados.has(item.insumoId)) errosIngredientes[indice] = 'Insumo repetido. Some as quantidades em uma única linha.';
    else if (!Number.isFinite(item.quantidade) || item.quantidade <= 0)
      errosIngredientes[indice] = 'Informe uma quantidade maior que zero.';
    else if (!saoCompativeis(insumo.unidade, item.unidade)) errosIngredientes[indice] = 'Unidade incompatível com o insumo.';
    if (item.insumoId) usados.add(item.insumoId);
  });

  const rotulosCustos = {
    embalagem: 'O custo da embalagem',
    outrosCustos: 'Outros custos',
    custoFixoUnitario: 'O custo fixo rateado',
  };
  Object.entries(rotulosCustos).forEach(([campo, rotulo]) => {
    const valor = entrada[campo];
    if (!Number.isFinite(valor)) erros[campo] = 'Valor inválido. Use somente números ou deixe em branco.';
    else if (valor < 0) erros[campo] = `${rotulo} não pode ser negativo.`;
  });

  Object.keys(ROTULOS_PERCENTUAIS).forEach((campo) => {
    const erro = erroPercentual(entrada[campo], ROTULOS_PERCENTUAIS[campo]);
    if (erro) erros[campo] = erro.replace(`${ROTULOS_PERCENTUAIS[campo]}: `, '');
  });
  if (!erros.taxas && !erros.impostos && !erros.margem && somarPercentuais(entrada) >= 100) {
    erros.margem = mensagemSomaInvalida(entrada);
  }

  const precoInformado = entrada.precoVenda !== null && entrada.precoVenda !== undefined;
  if (precoInformado && (!Number.isFinite(entrada.precoVenda) || entrada.precoVenda <= 0)) {
    erros.precoVenda = 'Informe um valor maior que zero ou deixe em branco para usar o preço sugerido.';
  }

  if (Object.keys(erros).length === 0 && Object.keys(errosIngredientes).length === 0) {
    const resultado = calcularProduto(entrada);
    if (!resultado.completo) erros.geral = resultado.pendencias[0];
  }

  return { erros, errosIngredientes };
}

export function salvarProduto(entrada) {
  const { erros, errosIngredientes } = validarProduto(entrada);
  if (Object.keys(erros).length > 0 || Object.keys(errosIngredientes).length > 0) {
    return { ok: false, erros, errosIngredientes };
  }

  const agora = Date.now();
  const campos = {
    nome: texto(entrada.nome),
    categoria: texto(entrada.categoria) || 'Outros',
    rendimento: entrada.rendimento,
    ingredientes: entrada.ingredientes.map((item) => ({
      insumoId: item.insumoId,
      quantidade: item.quantidade,
      unidade: item.unidade,
    })),
    embalagem: entrada.embalagem,
    outrosCustos: entrada.outrosCustos,
    custoFixoUnitario: entrada.custoFixoUnitario,
    taxas: entrada.taxas,
    impostos: entrada.impostos,
    margem: entrada.margem,
    precoVenda: entrada.precoVenda ?? null,
  };

  if (entrada.id) {
    const atual = produtoInterno(entrada.id);
    if (!atual) return { ok: false, erros: { geral: 'Este produto não existe mais. Ele pode ter sido excluído.' }, errosIngredientes: {} };
    Object.assign(atual, campos, { atualizadoEm: agora });
    const salvo = confirmarAlteracao('produto-atualizado');
    return { ok: true, criado: false, item: copiar(atual), salvo };
  }

  const novo = { id: gerarId('prd'), ...campos, demo: false, criadoEm: agora, atualizadoEm: agora };
  dados.produtos.push(novo);
  const salvo = confirmarAlteracao('produto-criado');
  return { ok: true, criado: true, item: copiar(novo), salvo };
}

export function excluirProduto(id) {
  const produto = produtoInterno(id);
  if (!produto) return { ok: false, mensagem: 'Produto não encontrado.' };
  dados.produtos = dados.produtos.filter((p) => p.id !== id);
  const salvo = confirmarAlteracao('produto-excluido');
  return { ok: true, item: copiar(produto), salvo };
}

/* ---------- Configurações ---------- */

export function obterConfiguracoes() {
  return { ...dados.config };
}

export function salvarConfiguracoes(config) {
  const erros = {};
  Object.keys(CONFIG_PADRAO).forEach((campo) => {
    const erro = erroPercentual(config[campo], ROTULOS_PERCENTUAIS[campo]);
    if (erro) erros[campo] = erro;
  });
  if (Object.keys(erros).length === 0 && somarPercentuais(config) >= 100) erros.margem = mensagemSomaInvalida(config);
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  dados.config = { taxas: config.taxas, impostos: config.impostos, margem: config.margem };
  const salvo = confirmarAlteracao('config');
  return { ok: true, salvo };
}

/* ---------- Dados de demonstração ---------- */

// Valores escolhidos para reproduzir o exemplo do hambúrguer (custo R$ 13,00 → preço R$ 21,67).
const DEMO_INSUMOS = [
  { chave: 'pao', nome: 'Pão de hambúrguer', categoria: 'Panificação e massas', quantidade: 12, unidade: 'un', valorTotal: 24 },
  { chave: 'carne', nome: 'Carne bovina moída', categoria: 'Carnes e proteínas', quantidade: 1, unidade: 'kg', valorTotal: 40 },
  { chave: 'queijo', nome: 'Queijo muçarela', categoria: 'Laticínios', quantidade: 1, unidade: 'kg', valorTotal: 40 },
  { chave: 'bacon', nome: 'Bacon fatiado', categoria: 'Carnes e proteínas', quantidade: 1, unidade: 'kg', valorTotal: 50 },
  { chave: 'molho', nome: 'Molho especial da casa', categoria: 'Molhos e temperos', quantidade: 1, unidade: 'L', valorTotal: 16 },
  { chave: 'farinha', nome: 'Farinha de trigo', categoria: 'Panificação e massas', quantidade: 5, unidade: 'kg', valorTotal: 30 },
  { chave: 'tomate', nome: 'Molho de tomate', categoria: 'Molhos e temperos', quantidade: 340, unidade: 'g', valorTotal: 4.08 },
  { chave: 'leite', nome: 'Leite condensado', categoria: 'Doces e confeitaria', quantidade: 395, unidade: 'g', valorTotal: 7.9 },
  { chave: 'chocolate', nome: 'Chocolate em pó 50%', categoria: 'Doces e confeitaria', quantidade: 200, unidade: 'g', valorTotal: 8 },
  { chave: 'manteiga', nome: 'Manteiga sem sal', categoria: 'Laticínios', quantidade: 200, unidade: 'g', valorTotal: 10 },
  { chave: 'granulado', nome: 'Granulado de chocolate', categoria: 'Doces e confeitaria', quantidade: 500, unidade: 'g', valorTotal: 15 },
];

const DEMO_PRODUTOS = [
  {
    nome: 'Brigadeiro tradicional',
    categoria: 'Doces',
    rendimento: 25,
    ingredientes: [['leite', 395, 'g'], ['chocolate', 30, 'g'], ['manteiga', 15, 'g'], ['granulado', 60, 'g']],
    embalagem: 0.1, outrosCustos: 0, custoFixoUnitario: 0,
    taxas: 0, impostos: 6, margem: 35, precoVenda: 1.5,
  },
  {
    nome: 'Pizza muçarela grande',
    categoria: 'Pizzas',
    rendimento: 1,
    ingredientes: [['farinha', 300, 'g'], ['tomate', 150, 'g'], ['queijo', 350, 'g']],
    embalagem: 2.5, outrosCustos: 0.5, custoFixoUnitario: 0,
    taxas: 12, impostos: 6, margem: 25, precoVenda: 39.9,
  },
  {
    nome: 'Hambúrguer artesanal com bacon',
    categoria: 'Lanches',
    rendimento: 1,
    ingredientes: [['pao', 1, 'un'], ['carne', 125, 'g'], ['queijo', 37.5, 'g'], ['bacon', 50, 'g'], ['molho', 50, 'ml']],
    embalagem: 1.2, outrosCustos: 0, custoFixoUnitario: 0,
    taxas: 5, impostos: 5, margem: 30, precoVenda: null,
  },
];

export function possuiDemonstracao() {
  return dados.insumos.some((i) => i.demo) || dados.produtos.some((p) => p.demo);
}

export function carregarDemonstracao() {
  if (possuiDemonstracao()) return { ok: false, mensagem: 'Os dados de demonstração já estão carregados.' };

  // Se o usuário já tem um item com o mesmo nome, o exemplo recebe o sufixo "(exemplo)"
  // para nunca se misturar ou duplicar um cadastro real.
  const nomeLivre = (nome, lista) => {
    const ocupados = new Set(lista.map((item) => normalizarTexto(item.nome)));
    if (!ocupados.has(normalizarTexto(nome))) return nome;
    const alternativo = `${nome} (exemplo)`;
    return ocupados.has(normalizarTexto(alternativo)) ? null : alternativo;
  };
  const nomesInsumos = DEMO_INSUMOS.map((item) => nomeLivre(item.nome, dados.insumos));
  const nomesProdutos = DEMO_PRODUTOS.map((item) => nomeLivre(item.nome, dados.produtos));
  if ([...nomesInsumos, ...nomesProdutos].includes(null)) {
    return { ok: false, mensagem: 'Já existem cadastros com os nomes usados nos exemplos. Os dados de demonstração não foram carregados.' };
  }

  const inicio = Date.now();
  const ids = {};
  DEMO_INSUMOS.forEach(({ chave, ...campos }, indice) => {
    ids[chave] = gerarId('ins');
    dados.insumos.push({
      id: ids[chave],
      ...campos,
      nome: nomesInsumos[indice],
      demo: true,
      criadoEm: inicio + indice,
      atualizadoEm: inicio + indice,
    });
  });
  DEMO_PRODUTOS.forEach(({ ingredientes, ...campos }, indice) => {
    const momento = inicio + 100 + indice;
    dados.produtos.push({
      id: gerarId('prd'),
      ...campos,
      nome: nomesProdutos[indice],
      ingredientes: ingredientes.map(([chave, quantidade, unidade]) => ({ insumoId: ids[chave], quantidade, unidade })),
      demo: true,
      criadoEm: momento,
      atualizadoEm: momento,
    });
  });
  const salvo = confirmarAlteracao('demo-carregada');
  return { ok: true, insumos: DEMO_INSUMOS.length, produtos: DEMO_PRODUTOS.length, salvo };
}

export function removerDemonstracao() {
  const produtosRemovidos = dados.produtos.filter((p) => p.demo).length;
  dados.produtos = dados.produtos.filter((p) => !p.demo);

  const emUso = new Set(dados.produtos.flatMap((p) => p.ingredientes.map((i) => i.insumoId)));
  const mantidos = dados.insumos.filter((i) => i.demo && emUso.has(i.id));
  const insumosRemovidos = dados.insumos.filter((i) => i.demo && !emUso.has(i.id)).length;
  dados.insumos = dados.insumos.filter((i) => !i.demo || emUso.has(i.id));

  const salvo = confirmarAlteracao('demo-removida');
  return { ok: true, produtosRemovidos, insumosRemovidos, mantidos: mantidos.map((i) => i.nome), salvo };
}

export function apagarTodosOsDados() {
  dados = criarDadosVazios();
  if (armazenamentoDisponivel) {
    try {
      localStorage.removeItem(CHAVE_ARMAZENAMENTO);
    } catch {
      /* ignora: os dados em memória já foram limpos */
    }
  }
  ouvintes.forEach((ouvinte) => ouvinte('dados-apagados'));
  return { ok: true };
}
