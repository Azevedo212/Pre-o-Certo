/**
 * navegacao.js
 * Rotas por hash (#inicio, #insumos, #calculadora, #produtos, #sobre).
 * A rota da calculadora aceita um parâmetro: #calculadora/<id-do-produto>.
 * Mantém URL, menu ativo (aria-current) e tela visível sincronizados,
 * inclusive com os botões Voltar e Avançar do navegador.
 */

export const ROTAS = Object.freeze({
  inicio: 'Início',
  insumos: 'Insumos',
  calculadora: 'Calculadora',
  produtos: 'Produtos',
  sobre: 'Sobre o projeto',
});

const ROTA_PADRAO = 'inicio';
let aoMudarRota = () => {};
let rotaAtual = null;

export function lerRota(hash = window.location.hash) {
  let conteudo = hash.replace(/^#\/?/, '');
  try {
    conteudo = decodeURIComponent(conteudo);
  } catch {
    conteudo = '';
  }
  const [nome = '', ...parametros] = conteudo.split('/').filter(Boolean);
  return { nome, parametros };
}

function aplicarRota({ primeiraCarga = false } = {}) {
  let { nome, parametros } = lerRota();

  if (!Object.prototype.hasOwnProperty.call(ROTAS, nome)) {
    // Rota inexistente ou vazia: corrige a URL sem criar uma nova entrada no histórico.
    history.replaceState(null, '', `#${ROTA_PADRAO}`);
    nome = ROTA_PADRAO;
    parametros = [];
  }

  const mudouDeTela = rotaAtual !== nome;
  rotaAtual = nome;

  document.querySelectorAll('[data-tela]').forEach((tela) => {
    tela.hidden = tela.dataset.tela !== nome;
  });

  document.querySelectorAll('[data-link-rota]').forEach((link) => {
    if (link.dataset.linkRota === nome) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.title = `${ROTAS[nome]} · PreçoCerto`;

  aoMudarRota({ nome, parametros, primeiraCarga });

  if (mudouDeTela && !primeiraCarga) {
    window.scrollTo({ top: 0 });
    // Leva o foco ao título da nova tela (importante para leitores de tela).
    const titulo = document.querySelector(`[data-tela="${nome}"] h1`);
    if (titulo) titulo.focus({ preventScroll: true });
  }
}

export function iniciarNavegacao(callback) {
  aoMudarRota = callback;
  window.addEventListener('hashchange', () => aplicarRota());
  aplicarRota({ primeiraCarga: true });
}

export function navegarPara(rota) {
  window.location.hash = rota;
}

/** Atualiza a URL sem disparar nova navegação (ex.: após salvar um produto novo). */
export function substituirRota(rota) {
  history.replaceState(null, '', `#${rota}`);
}

export function obterRotaAtual() {
  return rotaAtual;
}
