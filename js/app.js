/**
 * app.js
 * Ponto de entrada: inicializa o estado, a interface e a navegação,
 * e controla o menu lateral em telas pequenas.
 */

import { iniciarEstado, assinar } from './estado.js';
import { iniciarNavegacao } from './navegacao.js';
import { iniciarInterface, renderizarTudo, aoMudarRota, mostrarSituacaoArmazenamento } from './interface.js';

const consultaTelaGrande = window.matchMedia('(min-width: 1024px)');

function configurarMenuMovel() {
  const botaoAbrir = document.getElementById('botao-menu');
  const botaoFechar = document.getElementById('botao-fechar-menu');
  const sombra = document.getElementById('sombra-menu');
  const menu = document.getElementById('menu-lateral');

  const abrir = () => {
    document.body.classList.add('menu-aberto');
    botaoAbrir.setAttribute('aria-expanded', 'true');
    sombra.hidden = false;
    const linkAtivo = menu.querySelector('[aria-current="page"]') || menu.querySelector('a');
    linkAtivo.focus();
  };

  const fechar = ({ devolverFoco = false } = {}) => {
    if (!document.body.classList.contains('menu-aberto')) return;
    document.body.classList.remove('menu-aberto');
    botaoAbrir.setAttribute('aria-expanded', 'false');
    sombra.hidden = true;
    if (devolverFoco) botaoAbrir.focus();
  };

  botaoAbrir.addEventListener('click', abrir);
  botaoFechar.addEventListener('click', () => fechar({ devolverFoco: true }));
  sombra.addEventListener('click', () => fechar({ devolverFoco: true }));
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fechar({ devolverFoco: true });
  });
  consultaTelaGrande.addEventListener('change', (evento) => {
    if (evento.matches) fechar();
  });

  return fechar;
}

function configurarLinkPularConteudo() {
  // O link não pode alterar o hash, pois o hash controla as rotas.
  document.querySelector('[data-pular-conteudo]').addEventListener('click', (evento) => {
    evento.preventDefault();
    const titulo = document.querySelector('.tela:not([hidden]) h1');
    (titulo || document.getElementById('conteudo')).focus();
  });
}

function iniciar() {
  const situacaoArmazenamento = iniciarEstado();
  iniciarInterface();
  assinar(() => renderizarTudo());

  const fecharMenu = configurarMenuMovel();
  configurarLinkPularConteudo();

  iniciarNavegacao((rota) => {
    aoMudarRota(rota);
    fecharMenu();
  });

  mostrarSituacaoArmazenamento(situacaoArmazenamento);
}

iniciar();
