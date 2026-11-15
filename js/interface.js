/**
 * interface.js
 * Renderização das telas, formulários, diálogos e avisos.
 * Toda informação vinda do usuário passa por `escapar()` antes de ir para o HTML.
 */

import * as estado from './estado.js';
import {
  UNIDADES,
  unidadesCompativeis,
  unidadeBase,
  custoPorUnidadeBase,
  interpretarNumero,
  formatarMoeda,
  formatarMoedaPrecisa,
  formatarPercentual,
  formatarNumero,
  numeroParaCampo,
  gerarTextoResultado,
  normalizarTexto,
  somarPercentuais,
} from './calculos.js';
import { substituirRota } from './navegacao.js';

const el = {};
let rotaAtual = 'inicio';
let insumoEmEdicaoId = null;
let produtoEmEdicaoId = null;
let formularioProdutoAlterado = false;
let contadorLinhas = 0;
let ultimoCalculo = null;

const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/* =========================================================
   Utilidades
   ========================================================= */

function escapar(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function icone(nome) {
  return `<svg class="icone" aria-hidden="true"><use href="#i-${nome}"></use></svg>`;
}

function plural(quantidade, singular, pluralTexto) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

function seloDemo(item) {
  return item.demo ? '<span class="selo selo-demo" title="Dado de demonstração">Demonstração</span>' : '';
}

function media(valores) {
  return valores.length ? valores.reduce((soma, v) => soma + v, 0) / valores.length : NaN;
}

function classeMargem(margem, margemDesejada) {
  if (!Number.isFinite(margem)) return 'pilula-neutra';
  if (margem < 0) return 'pilula-negativa';
  if (Number.isFinite(margemDesejada) && margem + 1e-9 < margemDesejada / 100) return 'pilula-alerta';
  return 'pilula-positiva';
}

function valorCampoOpcional(texto) {
  return texto.trim() === '' ? 0 : interpretarNumero(texto);
}

function avisarSeNaoSalvou(resultado) {
  if (resultado && resultado.salvo === false) {
    mostrarAviso('Não foi possível gravar no navegador (armazenamento cheio ou bloqueado). As alterações valem só enquanto esta aba estiver aberta.', 'erro');
  }
}

/* ---------- Erros de formulário ---------- */

function aplicarErros(formulario, erros = {}) {
  let primeiroCampo = null;
  formulario.querySelectorAll('[data-erro]').forEach((alvo) => {
    const campo = alvo.dataset.erro;
    const mensagem = erros[campo] || '';
    alvo.textContent = mensagem;
    alvo.hidden = !mensagem;
    const entrada = formulario.elements[campo];
    if (entrada && typeof entrada.setAttribute === 'function') {
      if (mensagem) {
        entrada.setAttribute('aria-invalid', 'true');
        primeiroCampo = primeiroCampo || entrada;
      } else {
        entrada.removeAttribute('aria-invalid');
      }
    }
  });
  return primeiroCampo;
}

function limparErroDoCampo(campo) {
  if (!campo || campo.getAttribute('aria-invalid') !== 'true') return;
  campo.removeAttribute('aria-invalid');
  (campo.getAttribute('aria-describedby') || '').split(/\s+/).forEach((id) => {
    const alvo = id && document.getElementById(id);
    if (alvo && alvo.classList.contains('erro-campo')) {
      alvo.hidden = true;
      alvo.textContent = '';
    }
  });
}

/* =========================================================
   Avisos (toasts) e diálogos
   ========================================================= */

export function mostrarAviso(mensagem, tipo = 'sucesso') {
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;
  const nomeIcone = tipo === 'erro' ? 'alerta' : tipo === 'info' ? 'sobre' : 'check';
  aviso.innerHTML = `${icone(nomeIcone)}<p>${escapar(mensagem)}</p>
    <button type="button" class="botao-icone" aria-label="Fechar aviso">${icone('fechar')}</button>`;
  const remover = () => {
    aviso.classList.add('saindo');
    setTimeout(() => aviso.remove(), 200);
  };
  aviso.querySelector('button').addEventListener('click', remover);
  el.areaAvisos.append(aviso);
  setTimeout(remover, tipo === 'erro' ? 7000 : 4500);
}

function confirmar({ titulo, mensagemHtml, textoConfirmar = 'Confirmar', perigo = true, apenasInformar = false }) {
  const dialogo = el.dialogoConfirmacao;
  el.dialogoConfirmacaoTitulo.textContent = titulo;
  el.dialogoConfirmacaoCorpo.innerHTML = mensagemHtml;
  el.dialogoConfirmacaoBotao.textContent = textoConfirmar;
  el.dialogoConfirmacaoBotao.className = `botao ${perigo ? 'botao-perigo' : 'botao-primario'}`;
  el.dialogoConfirmacaoCancelar.hidden = apenasInformar;
  dialogo.returnValue = '';
  const formulario = dialogo.querySelector('form');
  return new Promise((resolve) => {
    let resolvido = false;
    const aoClicar = (evento) => {
      const botao = evento.target.closest('button[value]');
      if (botao) finalizar(botao.value === 'confirmar');
    };
    const aoFechar = () => finalizar(dialogo.returnValue === 'confirmar');
    // Responde no clique (síncrono); o evento "close" cobre Esc e clique no fundo.
    function finalizar(valor) {
      if (resolvido) return;
      resolvido = true;
      formulario.removeEventListener('click', aoClicar);
      dialogo.removeEventListener('close', aoFechar);
      resolve(valor);
    }
    formulario.addEventListener('click', aoClicar);
    dialogo.addEventListener('close', aoFechar);
    dialogo.showModal();
    (apenasInformar || !perigo ? el.dialogoConfirmacaoBotao : el.dialogoConfirmacaoCancelar).focus();
  });
}

function configurarDialogos() {
  document.querySelectorAll('dialog').forEach((dialogo) => {
    // Clique no fundo escurecido fecha o diálogo.
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  });
}

/* =========================================================
   Área de transferência (Clipboard API)
   ========================================================= */

async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return { ok: true };
    } catch (erro) {
      console.warn('Clipboard API recusou a cópia:', erro);
    }
  }
  // Alternativa para contextos sem HTTPS/localhost ou navegadores antigos.
  try {
    const areaTexto = document.createElement('textarea');
    areaTexto.value = texto;
    areaTexto.setAttribute('readonly', '');
    areaTexto.style.position = 'fixed';
    areaTexto.style.opacity = '0';
    document.body.append(areaTexto);
    areaTexto.select();
    const copiou = document.execCommand('copy');
    areaTexto.remove();
    if (copiou) return { ok: true };
  } catch {
    /* segue para a cópia manual */
  }
  return {
    ok: false,
    motivo: window.isSecureContext
      ? 'O navegador não permitiu o acesso à área de transferência.'
      : 'A cópia automática exige uma conexão segura (HTTPS) ou o endereço localhost.',
  };
}

async function copiarComFeedback(texto, botao) {
  const resultado = await copiarTexto(texto);
  if (resultado.ok) {
    if (botao) {
      const rotulo = botao.querySelector('span');
      const uso = botao.querySelector('use');
      botao.dataset.textoOriginal = botao.dataset.textoOriginal || rotulo.textContent;
      rotulo.textContent = 'Copiado!';
      uso.setAttribute('href', '#i-check');
      botao.classList.add('copiado');
      clearTimeout(Number(botao.dataset.temporizador));
      botao.dataset.temporizador = String(
        setTimeout(() => {
          rotulo.textContent = botao.dataset.textoOriginal;
          uso.setAttribute('href', '#i-copiar');
          botao.classList.remove('copiado');
        }, 2200)
      );
    }
    mostrarAviso('Resultado copiado para a área de transferência.');
    return;
  }
  el.dialogoCopiaMotivo.textContent = `${resultado.motivo} Selecione o texto abaixo e copie com Ctrl+C (ou toque e segure no celular).`;
  el.textoCopiaManual.value = texto;
  el.dialogoCopiaManual.showModal();
  el.textoCopiaManual.focus();
  el.textoCopiaManual.select();
}

/* =========================================================
   Tela 1 — Início
   ========================================================= */

function calcularTodosOsProdutos() {
  return estado.listarProdutos().map((produto) => ({ produto, resultado: estado.calcularProduto(produto) }));
}

function renderizarInicio(calculados) {
  const validos = calculados.filter((c) => c.resultado.completo);
  const incompletos = calculados.length - validos.length;
  const totalInsumos = estado.listarInsumos().length;

  const custoMedio = media(validos.map((c) => c.resultado.custoUnitario));
  const precoMedio = media(validos.map((c) => c.resultado.precoReferencia));
  const margemMedia = media(validos.map((c) => c.resultado.venda.margem));

  const detalheProdutos = [plural(totalInsumos, 'insumo cadastrado', 'insumos cadastrados')];
  if (incompletos > 0) detalheProdutos.push(`${incompletos} com ficha incompleta (fora das médias)`);

  const indicadores = [
    { icone: 'produtos', rotulo: 'Produtos cadastrados', valor: String(calculados.length), detalhe: detalheProdutos.join(' · ') },
    { icone: 'caixa', rotulo: 'Custo médio por unidade', valor: formatarMoeda(custoMedio), detalhe: 'Ingredientes, embalagem e demais custos' },
    { icone: 'moeda', rotulo: 'Preço médio de venda', valor: formatarMoeda(precoMedio), detalhe: 'Preço definido ou, se ausente, o sugerido' },
    { icone: 'grafico', rotulo: 'Margem média estimada', valor: formatarPercentual(margemMedia), detalhe: 'Sobre o faturamento (média simples)', destaque: true },
  ];

  el.indicadores.innerHTML = indicadores
    .map(
      (item) => `
      <article class="indicador${item.destaque ? ' indicador-destaque' : ''}">
        <span class="indicador-icone">${icone(item.icone)}</span>
        <p class="indicador-rotulo">${item.rotulo}</p>
        <p class="indicador-valor">${item.valor}</p>
        <p class="indicador-detalhe">${escapar(item.detalhe)}</p>
      </article>`
    )
    .join('');

  if (calculados.length === 0) {
    const mensagem =
      totalInsumos > 0
        ? `Você já cadastrou ${plural(totalInsumos, 'insumo', 'insumos')}. Agora monte a primeira ficha técnica na calculadora.`
        : 'Comece cadastrando seus insumos (ingredientes e embalagens) e depois monte a primeira ficha técnica na calculadora.';
    el.listaRecentes.innerHTML = `
      <div class="estado-vazio">
        <span class="estado-vazio-icone">${icone('frasco')}</span>
        <h3>Nenhum produto precificado ainda</h3>
        <p>${mensagem}</p>
        <div class="acoes-formulario">
          ${totalInsumos > 0 ? '' : '<a class="botao botao-primario" href="#insumos">Cadastrar insumos</a>'}
          <a class="botao ${totalInsumos > 0 ? 'botao-primario' : 'botao-secundario'}" href="#calculadora">Abrir calculadora</a>
        </div>
      </div>`;
  } else {
    const recentes = [...calculados].sort((a, b) => b.produto.atualizadoEm - a.produto.atualizadoEm).slice(0, 5);
    el.listaRecentes.innerHTML = `<ul class="lista-recentes">${recentes
      .map(({ produto, resultado }) => {
        const preco = resultado.completo ? formatarMoeda(resultado.precoReferencia) : '—';
        const margem = resultado.completo ? formatarPercentual(resultado.venda.margem) : 'Incompleta';
        const classe = resultado.completo ? classeMargem(resultado.venda.margem, produto.margem) : 'pilula-neutra';
        return `
        <li>
          <div class="recente-info">
            <p class="recente-nome">${escapar(produto.nome)} ${seloDemo(produto)}</p>
            <p class="texto-suave">${escapar(produto.categoria)} · atualizado em ${formatoData.format(produto.atualizadoEm)}</p>
          </div>
          <div class="recente-valores">
            <span class="recente-preco">${preco}</span>
            <span class="pilula ${classe}">${margem}</span>
          </div>
          <button class="botao-icone" type="button" data-acao="detalhes-produto" data-id="${escapar(produto.id)}">
            ${icone('olho')}<span class="visualmente-oculto">Ver detalhes de ${escapar(produto.nome)}</span>
          </button>
        </li>`;
      })
      .join('')}</ul>`;
  }

  el.blocoDemo.innerHTML = estado.possuiDemonstracao()
    ? `<p><strong>Dados de demonstração carregados.</strong> Eles aparecem com o selo <span class="selo selo-demo">Demonstração</span> e podem ser removidos sem afetar seus cadastros.</p>
       <button class="botao botao-secundario botao-pequeno" type="button" data-acao="remover-demo">${icone('lixeira')} Remover dados de demonstração</button>`
    : `<p><strong>Quer ver o sistema funcionando?</strong> Carregue exemplos de hambúrguer, pizza e brigadeiro. Eles ficam identificados e podem ser removidos depois.</p>
       <button class="botao botao-secundario botao-pequeno" type="button" data-acao="carregar-demo">${icone('mais')} Carregar dados de demonstração</button>`;
}

/* =========================================================
   Tela 2 — Insumos
   ========================================================= */

function configurarInsumos() {
  el.formInsumo.elements.categoria.innerHTML =
    '<option value="">Selecione…</option>' +
    estado.CATEGORIAS_INSUMO.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
  el.formInsumo.elements.unidade.innerHTML =
    '<option value="">Selecione…</option>' +
    Object.entries(UNIDADES).map(([sigla, info]) => `<option value="${sigla}">${info.nome}</option>`).join('');

  const aoEditar = (evento) => {
    limparErroDoCampo(evento.target);
    atualizarPreviaInsumo();
  };
  el.formInsumo.addEventListener('input', aoEditar);
  el.formInsumo.addEventListener('change', aoEditar);
  el.formInsumo.addEventListener('submit', (evento) => {
    evento.preventDefault();
    salvarFormularioInsumo();
  });
  el.botaoCancelarInsumo.addEventListener('click', limparFormularioInsumo);
  el.buscaInsumos.addEventListener('input', renderizarInsumos);
}

function lerFormularioInsumo() {
  const campos = el.formInsumo.elements;
  return {
    id: insumoEmEdicaoId,
    nome: campos.nome.value,
    categoria: campos.categoria.value,
    quantidade: interpretarNumero(campos.quantidade.value),
    unidade: campos.unidade.value,
    valorTotal: interpretarNumero(campos.valorTotal.value),
  };
}

function atualizarPreviaInsumo() {
  const entrada = lerFormularioInsumo();
  const destino = el.previaCustoInsumo.querySelector('strong');
  const valido = entrada.quantidade > 0 && entrada.valorTotal > 0 && UNIDADES[entrada.unidade];
  if (!valido) {
    destino.textContent = '—';
    el.previaCustoInsumo.classList.remove('ativa');
    return;
  }
  const custo = custoPorUnidadeBase(entrada);
  const base = unidadeBase(entrada.unidade);
  let texto = `${formatarMoedaPrecisa(custo)} por ${base}`;
  if (entrada.unidade === 'kg' || entrada.unidade === 'L') {
    texto += ` (${formatarMoeda(custo * 1000)} por ${entrada.unidade})`;
  }
  destino.textContent = texto;
  el.previaCustoInsumo.classList.add('ativa');
}

function salvarFormularioInsumo() {
  const entrada = lerFormularioInsumo();
  const resultado = estado.salvarInsumo(entrada);
  if (!resultado.ok) {
    const campo = aplicarErros(el.formInsumo, resultado.erros);
    if (campo) campo.focus();
    return;
  }
  const nome = resultado.item.nome;
  let mensagem = resultado.criado ? `Insumo "${nome}" cadastrado.` : `Insumo "${nome}" atualizado.`;
  if (resultado.produtosAfetados > 0) {
    mensagem += ` ${plural(resultado.produtosAfetados, 'produto foi recalculado', 'produtos foram recalculados')} com o novo custo.`;
  }
  mostrarAviso(mensagem);
  avisarSeNaoSalvou(resultado);
  limparFormularioInsumo();
  el.formInsumo.elements.nome.focus();
}

function limparFormularioInsumo() {
  insumoEmEdicaoId = null;
  el.formInsumo.reset();
  aplicarErros(el.formInsumo, {});
  el.tituloFormInsumo.textContent = 'Novo insumo';
  el.botaoSalvarInsumo.querySelector('span').textContent = 'Salvar insumo';
  el.botaoCancelarInsumo.hidden = true;
  el.formInsumo.classList.remove('em-edicao');
  atualizarPreviaInsumo();
  renderizarInsumos();
}

function editarInsumo(id) {
  const insumo = estado.buscarInsumo(id);
  if (!insumo) return;
  insumoEmEdicaoId = id;
  const campos = el.formInsumo.elements;
  campos.nome.value = insumo.nome;
  campos.categoria.value = insumo.categoria;
  campos.quantidade.value = numeroParaCampo(insumo.quantidade);
  campos.unidade.value = insumo.unidade;
  campos.valorTotal.value = numeroParaCampo(insumo.valorTotal);
  aplicarErros(el.formInsumo, {});
  el.tituloFormInsumo.textContent = 'Editar insumo';
  el.botaoSalvarInsumo.querySelector('span').textContent = 'Salvar alterações';
  el.botaoCancelarInsumo.hidden = false;
  el.formInsumo.classList.add('em-edicao');
  atualizarPreviaInsumo();
  renderizarInsumos();
  el.formInsumo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  campos.nome.focus({ preventScroll: true });
}

async function excluirInsumo(id) {
  const insumo = estado.buscarInsumo(id);
  if (!insumo) return;
  const usadoEm = estado.produtosQueUsam(id);
  if (usadoEm.length > 0) {
    await confirmar({
      titulo: 'Este insumo está em uso',
      mensagemHtml: `<p>"<strong>${escapar(insumo.nome)}</strong>" faz parte da ficha técnica de:</p>
        <ul class="lista-marcada">${usadoEm.map((p) => `<li>${escapar(p.nome)}</li>`).join('')}</ul>
        <p>Para excluí-lo, primeiro remova-o dessas fichas técnicas (ou exclua os produtos). Assim nenhum produto fica com custo incompleto.</p>`,
      textoConfirmar: 'Entendi',
      perigo: false,
      apenasInformar: true,
    });
    return;
  }
  const confirmado = await confirmar({
    titulo: 'Excluir insumo?',
    mensagemHtml: `<p>O insumo "<strong>${escapar(insumo.nome)}</strong>" será excluído permanentemente. Esta ação não pode ser desfeita.</p>`,
    textoConfirmar: 'Excluir insumo',
  });
  if (!confirmado) return;
  const resultado = estado.excluirInsumo(id);
  if (resultado.ok) {
    if (insumoEmEdicaoId === id) limparFormularioInsumo();
    mostrarAviso(`Insumo "${insumo.nome}" excluído.`);
    avisarSeNaoSalvou(resultado);
  } else {
    mostrarAviso(resultado.mensagem || 'Não foi possível excluir o insumo.', 'erro');
  }
}

function renderizarInsumos() {
  const todos = estado.listarInsumos();
  const termo = normalizarTexto(el.buscaInsumos.value);
  const filtrados = termo
    ? todos.filter((i) => normalizarTexto(i.nome).includes(termo) || normalizarTexto(i.categoria).includes(termo))
    : todos;

  el.contagemInsumos.textContent = termo
    ? `${filtrados.length} de ${plural(todos.length, 'insumo', 'insumos')}`
    : plural(todos.length, 'insumo cadastrado', 'insumos cadastrados');

  if (todos.length === 0) {
    el.listaInsumos.innerHTML = `
      <div class="estado-vazio estado-vazio-compacto">
        <span class="estado-vazio-icone">${icone('insumos')}</span>
        <h3>Nenhum insumo cadastrado</h3>
        <p>Use o formulário para cadastrar o primeiro ingrediente, embalagem ou material.</p>
      </div>`;
    return;
  }
  if (filtrados.length === 0) {
    el.listaInsumos.innerHTML = `<p class="sem-resultados">Nenhum insumo encontrado para "${escapar(el.buscaInsumos.value)}".</p>`;
    return;
  }

  el.listaInsumos.innerHTML = `
    <table class="tabela tabela-responsiva">
      <thead>
        <tr>
          <th scope="col">Insumo</th>
          <th scope="col">Categoria</th>
          <th scope="col" class="num">Compra</th>
          <th scope="col" class="num">Valor pago</th>
          <th scope="col" class="num">Custo unitário</th>
          <th scope="col">Uso</th>
          <th scope="col"><span class="visualmente-oculto">Ações</span></th>
        </tr>
      </thead>
      <tbody>
        ${filtrados
          .map((insumo) => {
            const usos = estado.produtosQueUsam(insumo.id).length;
            return `
            <tr class="${insumo.id === insumoEmEdicaoId ? 'linha-em-edicao' : ''}">
              <th scope="row" data-rotulo="Insumo"><span class="celula-nome">${escapar(insumo.nome)}</span> ${seloDemo(insumo)}</th>
              <td data-rotulo="Categoria">${escapar(insumo.categoria)}</td>
              <td data-rotulo="Compra" class="num">${formatarNumero(insumo.quantidade)} ${insumo.unidade}</td>
              <td data-rotulo="Valor pago" class="num">${formatarMoeda(insumo.valorTotal)}</td>
              <td data-rotulo="Custo unitário" class="num"><strong>${formatarMoedaPrecisa(custoPorUnidadeBase(insumo))}</strong> / ${unidadeBase(insumo.unidade)}</td>
              <td data-rotulo="Uso">${usos > 0 ? plural(usos, 'produto', 'produtos') : '<span class="texto-suave">Não usado</span>'}</td>
              <td class="celula-acoes">
                <div class="acoes-linha">
                  <button class="botao botao-pequeno botao-secundario" type="button" data-acao="editar-insumo" data-id="${escapar(insumo.id)}">
                    ${icone('editar')} Editar<span class="visualmente-oculto"> ${escapar(insumo.nome)}</span>
                  </button>
                  <button class="botao botao-pequeno botao-perigo-suave" type="button" data-acao="excluir-insumo" data-id="${escapar(insumo.id)}">
                    ${icone('lixeira')} Excluir<span class="visualmente-oculto"> ${escapar(insumo.nome)}</span>
                  </button>
                </div>
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

/* =========================================================
   Tela 3 — Calculadora
   ========================================================= */

function configurarCalculadora() {
  const aoEditar = (evento) => {
    const alvo = evento.target;
    if (alvo.dataset.campo === 'insumo') atualizarUnidadesLinha(alvo.closest('.linha-ingrediente'));
    limparErroDoCampo(alvo);
    el.erroGeralProduto.hidden = true;
    formularioProdutoAlterado = true;
    atualizarCalculo();
  };
  el.formProduto.addEventListener('input', aoEditar);
  el.formProduto.addEventListener('change', aoEditar);
  el.formProduto.addEventListener('submit', (evento) => {
    evento.preventDefault();
    salvarFormularioProduto();
  });

  el.botaoAdicionarIngrediente.addEventListener('click', () => {
    const linha = criarLinhaIngrediente();
    formularioProdutoAlterado = true;
    atualizarCalculo();
    linha.querySelector('select').focus();
  });
  el.botaoNovoProduto.addEventListener('click', iniciarNovoProduto);
  el.botaoLimparProduto.addEventListener('click', iniciarNovoProduto);
  el.botaoCopiarResultado.addEventListener('click', copiarResultadoDaCalculadora);
  el.botaoSalvarPadrao.addEventListener('click', salvarPercentuaisPadrao);
  el.botaoAplicarRateio.addEventListener('click', aplicarRateio);
  el.botaoVerResultado.addEventListener('click', () => {
    const titulo = document.getElementById('titulo-resultado');
    titulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function criarLinhaIngrediente(dados = {}) {
  contadorLinhas += 1;
  const n = contadorLinhas;
  const linha = document.createElement('div');
  linha.className = 'linha-ingrediente';
  linha.innerHTML = `
    <div class="campo campo-insumo">
      <label for="ing-insumo-${n}">Insumo</label>
      <select id="ing-insumo-${n}" data-campo="insumo" aria-describedby="ing-erro-${n}"></select>
    </div>
    <div class="campo campo-quantidade">
      <label for="ing-qtd-${n}">Quantidade</label>
      <input id="ing-qtd-${n}" data-campo="quantidade" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-describedby="ing-erro-${n}">
    </div>
    <div class="campo campo-unidade">
      <label for="ing-un-${n}">Unidade</label>
      <select id="ing-un-${n}" data-campo="unidade"></select>
    </div>
    <div class="custo-linha"><span>Custo</span><strong data-custo>—</strong></div>
    <button class="botao-icone botao-remover-linha" type="button" data-acao="remover-ingrediente">
      ${icone('lixeira')}<span class="visualmente-oculto">Remover ingrediente</span>
    </button>
    <p class="erro-campo erro-linha" id="ing-erro-${n}" data-erro-linha hidden></p>`;
  el.listaIngredientes.append(linha);

  preencherOpcoesInsumo(linha.querySelector('[data-campo="insumo"]'), dados.insumoId || '');
  atualizarUnidadesLinha(linha, dados.unidade);
  if (Number.isFinite(dados.quantidade)) linha.querySelector('[data-campo="quantidade"]').value = numeroParaCampo(dados.quantidade);
  return linha;
}

function preencherOpcoesInsumo(select, valorSelecionado) {
  const insumos = estado.listarInsumos();
  const grupos = estado.CATEGORIAS_INSUMO.map((categoria) => ({
    categoria,
    itens: insumos.filter((i) => i.categoria === categoria),
  })).filter((grupo) => grupo.itens.length > 0);

  select.innerHTML =
    `<option value="">${insumos.length ? 'Selecione um insumo…' : 'Nenhum insumo cadastrado'}</option>` +
    grupos
      .map(
        (grupo) => `<optgroup label="${escapar(grupo.categoria)}">${grupo.itens
          .map(
            (i) =>
              `<option value="${escapar(i.id)}">${escapar(i.nome)}${i.demo ? ' (demo)' : ''} —${formatarMoedaPrecisa(custoPorUnidadeBase(i))}/${unidadeBase(i.unidade)}</option>`
          )
          .join('')}</optgroup>`
      )
      .join('');
  select.value = insumos.some((i) => i.id === valorSelecionado) ? valorSelecionado : '';
}

function atualizarUnidadesLinha(linha, unidadePreferida) {
  const seletorInsumo = linha.querySelector('[data-campo="insumo"]');
  const seletorUnidade = linha.querySelector('[data-campo="unidade"]');
  const unidadeAtual = unidadePreferida ?? seletorUnidade.value;
  const insumo = estado.buscarInsumo(seletorInsumo.value);
  if (!insumo) {
    seletorUnidade.innerHTML = '<option value="">—</option>';
    seletorUnidade.disabled = true;
    return;
  }
  const opcoes = unidadesCompativeis(insumo.unidade);
  seletorUnidade.disabled = false;
  seletorUnidade.innerHTML = opcoes.map((u) => `<option value="${u}">${u}</option>`).join('');
  seletorUnidade.value = opcoes.includes(unidadeAtual) ? unidadeAtual : unidadeBase(insumo.unidade);
}

function linhasDeIngredientes() {
  return [...el.listaIngredientes.querySelectorAll('.linha-ingrediente')];
}

function lerFormularioProduto() {
  const campos = el.formProduto.elements;
  const precoTexto = campos.precoVenda.value.trim();
  return {
    id: produtoEmEdicaoId,
    nome: campos.nome.value.trim(),
    categoria: campos.categoria.value.trim(),
    rendimento: interpretarNumero(campos.rendimento.value),
    ingredientes: linhasDeIngredientes().map((linha) => ({
      insumoId: linha.querySelector('[data-campo="insumo"]').value,
      quantidade: interpretarNumero(linha.querySelector('[data-campo="quantidade"]').value),
      unidade: linha.querySelector('[data-campo="unidade"]').value,
    })),
    embalagem: valorCampoOpcional(campos.embalagem.value),
    outrosCustos: valorCampoOpcional(campos.outrosCustos.value),
    custoFixoUnitario: valorCampoOpcional(campos.custoFixoUnitario.value),
    taxas: interpretarNumero(campos.taxas.value),
    impostos: interpretarNumero(campos.impostos.value),
    margem: interpretarNumero(campos.margem.value),
    precoVenda: precoTexto === '' ? null : interpretarNumero(precoTexto),
  };
}

function atualizarCalculo() {
  const entrada = lerFormularioProduto();
  const resultado = estado.calcularProduto(entrada);
  ultimoCalculo = { entrada, resultado };

  linhasDeIngredientes().forEach((linha, indice) => {
    const item = resultado.itens[indice];
    linha.querySelector('[data-custo]').textContent = item && Number.isFinite(item.custo) ? formatarMoeda(item.custo) : '—';
  });
  el.totalIngredientes.textContent = formatarMoeda(resultado.custoIngredientesReceita);

  renderizarMedidorPercentuais(entrada);
  el.resultadoCalculo.innerHTML = resultado.completo ? htmlResultado(resultado) : htmlPendencias(resultado);
  el.resumoMovelPreco.textContent = resultado.completo ? formatarMoeda(resultado.precoSugerido) : 'Ficha incompleta';

  if (produtoEmEdicaoId && !formularioProdutoAlterado) {
    el.resultadoCalculo.insertAdjacentHTML(
      'beforeend',
      `<p class="resultado-salvo">${icone('check')} Produto salvo. <a href="#produtos">Ver produtos cadastrados</a></p>`
    );
  }
}

function renderizarMedidorPercentuais({ taxas, impostos, margem }) {
  const validos = [taxas, impostos, margem].every((v) => Number.isFinite(v) && v >= 0);
  if (!validos) {
    el.medidorPercentuais.innerHTML = '<p class="medidor-texto">Preencha taxas, impostos e margem (use 0 quando não houver).</p>';
    return;
  }
  const soma = somarPercentuais({ taxas, impostos, margem });
  const excedeu = soma >= 100;
  const largura = (v) => `${Math.min(100, (v / Math.max(100, soma)) * 100)}%`;
  el.medidorPercentuais.innerHTML = `
    <div class="medidor-barra${excedeu ? ' medidor-excedido' : ''}" aria-hidden="true">
      <span class="seg-taxas" style="width:${largura(taxas)}"></span>
      <span class="seg-impostos" style="width:${largura(impostos)}"></span>
      <span class="seg-margem" style="width:${largura(margem)}"></span>
    </div>
    <p class="medidor-texto${excedeu ? ' texto-erro' : ''}">
      ${
        excedeu
          ? `Soma de ${formatarNumero(soma)}%: precisa ficar abaixo de 100% para ser possível calcular o preço.`
          : `Taxas + impostos + margem = <strong>${formatarNumero(soma)}%</strong> do preço. Os outros <strong>${formatarNumero(100 - soma)}%</strong> cobrem o custo do produto.`
      }
    </p>`;
}

function htmlPendencias(resultado) {
  const lista = resultado.pendencias.slice(0, 6).map((p) => `<li>${escapar(p)}</li>`).join('');
  const restantes = resultado.pendencias.length > 6 ? `<li>…e mais ${resultado.pendencias.length - 6}.</li>` : '';
  return `
    <div class="resultado-pendente">
      <p class="resultado-pendente-titulo">${icone('alerta')} Para calcular o preço, falta:</p>
      <ul>${lista}${restantes}</ul>
    </div>`;
}

function htmlComposicao(resultado) {
  const { venda, percentuais, custoUnitario, precoReferencia } = resultado;
  if (venda.lucro < 0) return '';
  const partes = [
    { classe: 'seg-custo', rotulo: 'Custo', valor: custoUnitario / precoReferencia },
    { classe: 'seg-taxas', rotulo: 'Taxas', valor: percentuais.taxas / 100 },
    { classe: 'seg-impostos', rotulo: 'Impostos', valor: percentuais.impostos / 100 },
    { classe: 'seg-margem', rotulo: 'Lucro', valor: venda.lucro / precoReferencia },
  ];
  return `
    <div class="composicao">
      <p class="composicao-titulo">Para onde vai cada ${formatarMoeda(precoReferencia)}</p>
      <div class="composicao-barra" aria-hidden="true">
        ${partes.map((p) => `<span class="${p.classe}" style="width:${Math.max(0, p.valor * 100)}%"></span>`).join('')}
      </div>
      <ul class="composicao-legenda">
        ${partes.map((p) => `<li><span class="marcador ${p.classe}"></span>${p.rotulo} ${formatarPercentual(p.valor)}</li>`).join('')}
      </ul>
    </div>`;
}

function htmlResultado(resultado) {
  const { percentuais, venda } = resultado;
  const decimal = (v) => formatarNumero(v / 100, 4);
  const formula = `${formatarMoeda(resultado.custoUnitario)} ÷ (1 − ${decimal(percentuais.taxas)} − ${decimal(percentuais.impostos)} − ${decimal(percentuais.margem)}) = ${formatarMoeda(resultado.custoUnitario)} ÷ ${formatarNumero(resultado.divisor, 4)}`;
  const origem = resultado.origemPreco === 'definido' ? 'seu preço' : 'preço sugerido';
  const avisos = resultado.avisos.map((a) => `<p class="resultado-aviso">${icone('alerta')} ${escapar(a)}</p>`).join('');

  return `
    <div class="resultado-preco">
      <span class="resultado-rotulo">Preço sugerido por unidade</span>
      <strong class="resultado-valor">${formatarMoeda(resultado.precoSugerido)}</strong>
      <span class="resultado-formula">${formula}</span>
    </div>

    <dl class="resultado-lista">
      <div><dt>Ingredientes por unidade</dt><dd>${formatarMoeda(resultado.custoIngredientesUnidade)}</dd></div>
      <div><dt>Embalagem</dt><dd>${formatarMoeda(resultado.embalagem)}</dd></div>
      <div><dt>Outros custos variáveis</dt><dd>${formatarMoeda(resultado.outrosCustos)}</dd></div>
      ${resultado.custoFixoUnitario > 0 ? `<div><dt>Custo fixo rateado</dt><dd>${formatarMoeda(resultado.custoFixoUnitario)}</dd></div>` : ''}
      <div class="linha-total"><dt>Custo total por unidade</dt><dd>${formatarMoeda(resultado.custoUnitario)}</dd></div>
    </dl>

    ${htmlComposicao(resultado)}

    <dl class="resultado-lista resultado-venda">
      <div><dt>Preço considerado <small>(${origem})</small></dt><dd>${formatarMoeda(venda.preco)}</dd></div>
      <div><dt>Taxas e impostos</dt><dd>− ${formatarMoeda(venda.taxasValor + venda.impostosValor)}</dd></div>
      <div><dt>Custo total</dt><dd>− ${formatarMoeda(resultado.custoUnitario)}</dd></div>
      <div class="linha-destaque"><dt>Lucro estimado por unidade</dt><dd class="${venda.lucro < 0 ? 'texto-negativo' : ''}">${formatarMoeda(venda.lucro)}</dd></div>
      <div class="linha-destaque"><dt>Margem estimada <small>(sobre a venda)</small></dt><dd><span class="pilula ${classeMargem(venda.margem, percentuais.margem)}">${formatarPercentual(venda.margem)}</span></dd></div>
      <div><dt>Markup equivalente <small>(preço ÷ custo)</small></dt><dd>${formatarNumero(venda.markup, 2)}×</dd></div>
    </dl>
    ${avisos}
    <p class="resultado-nota">Preço arredondado para cima ao centavo para preservar a margem mínima. Valores estimados: não garantem lucro real.</p>`;
}

function aplicarErrosIngredientes(erros = {}) {
  let primeiro = null;
  linhasDeIngredientes().forEach((linha, indice) => {
    const mensagem = erros[indice] || '';
    const destino = linha.querySelector('[data-erro-linha]');
    destino.textContent = mensagem;
    destino.hidden = !mensagem;
    const seletor = linha.querySelector('[data-campo="insumo"]');
    const quantidade = linha.querySelector('[data-campo="quantidade"]');
    [seletor, quantidade].forEach((campo) => {
      if (mensagem) campo.setAttribute('aria-invalid', 'true');
      else campo.removeAttribute('aria-invalid');
    });
    if (mensagem && !primeiro) primeiro = seletor.value ? quantidade : seletor;
  });
  return primeiro;
}

function salvarFormularioProduto() {
  const entrada = lerFormularioProduto();
  const resultado = estado.salvarProduto(entrada);
  if (!resultado.ok) {
    const campoComErro = aplicarErros(el.formProduto, resultado.erros);
    const linhaComErro = aplicarErrosIngredientes(resultado.errosIngredientes);
    el.erroGeralProduto.textContent = resultado.erros.geral || 'Revise os campos destacados antes de salvar.';
    el.erroGeralProduto.hidden = false;
    const foco = campoComErro || linhaComErro;
    if (foco) foco.focus();
    return;
  }
  aplicarErros(el.formProduto, {});
  aplicarErrosIngredientes({});
  el.erroGeralProduto.hidden = true;
  produtoEmEdicaoId = resultado.item.id;
  formularioProdutoAlterado = false;
  substituirRota(`calculadora/${encodeURIComponent(resultado.item.id)}`);
  atualizarCabecalhoCalculadora(resultado.item.nome);
  atualizarCalculo();
  mostrarAviso(resultado.criado ? `Produto "${resultado.item.nome}" salvo.` : `Alterações em "${resultado.item.nome}" salvas.`);
  avisarSeNaoSalvou(resultado);
}

function atualizarCabecalhoCalculadora(nome) {
  const editando = Boolean(produtoEmEdicaoId);
  el.sobretituloCalculadora.textContent = editando ? 'Editando produto' : 'Ficha técnica';
  el.tituloCalculadora.textContent = editando ? `Editar: ${nome}` : 'Calculadora de precificação';
  el.botaoSalvarProduto.querySelector('span').textContent = editando ? 'Salvar alterações' : 'Salvar produto';
}

function novoProduto() {
  const config = estado.obterConfiguracoes();
  produtoEmEdicaoId = null;
  el.formProduto.reset();
  el.formProduto.elements.taxas.value = numeroParaCampo(config.taxas);
  el.formProduto.elements.impostos.value = numeroParaCampo(config.impostos);
  el.formProduto.elements.margem.value = numeroParaCampo(config.margem);
  el.listaIngredientes.innerHTML = '';
  criarLinhaIngrediente();
  aplicarErros(el.formProduto, {});
  el.erroGeralProduto.hidden = true;
  el.erroRateio.hidden = true;
  formularioProdutoAlterado = false;
  atualizarCabecalhoCalculadora();
  atualizarCalculo();
}

function preencherFormularioProduto(produto) {
  const campos = el.formProduto.elements;
  const opcional = (v) => (v ? numeroParaCampo(v) : '');
  el.formProduto.reset();
  campos.nome.value = produto.nome;
  campos.categoria.value = produto.categoria;
  campos.rendimento.value = numeroParaCampo(produto.rendimento);
  campos.embalagem.value = opcional(produto.embalagem);
  campos.outrosCustos.value = opcional(produto.outrosCustos);
  campos.custoFixoUnitario.value = opcional(produto.custoFixoUnitario);
  campos.taxas.value = numeroParaCampo(produto.taxas);
  campos.impostos.value = numeroParaCampo(produto.impostos);
  campos.margem.value = numeroParaCampo(produto.margem);
  campos.precoVenda.value = produto.precoVenda ? numeroParaCampo(produto.precoVenda) : '';
  el.listaIngredientes.innerHTML = '';
  produto.ingredientes.forEach((item) => criarLinhaIngrediente(item));
  if (produto.ingredientes.length === 0) criarLinhaIngrediente();
  produtoEmEdicaoId = produto.id;
  formularioProdutoAlterado = false;
  aplicarErros(el.formProduto, {});
  el.erroGeralProduto.hidden = true;
  atualizarCabecalhoCalculadora(produto.nome);
  atualizarCalculo();
}

async function iniciarNovoProduto() {
  if (formularioProdutoAlterado) {
    const descartar = await confirmar({
      titulo: 'Descartar alterações?',
      mensagemHtml: '<p>As informações preenchidas que ainda não foram salvas serão perdidas.</p>',
      textoConfirmar: 'Descartar',
    });
    if (!descartar) return;
  }
  novoProduto();
  substituirRota('calculadora');
  el.formProduto.elements.nome.focus();
}

function prepararCalculadora(idProduto) {
  if (idProduto) {
    if (idProduto === produtoEmEdicaoId) return;
    const produto = estado.buscarProduto(idProduto);
    if (!produto) {
      mostrarAviso('Produto não encontrado. Ele pode ter sido excluído.', 'erro');
      substituirRota('calculadora');
      novoProduto();
      return;
    }
    preencherFormularioProduto(produto);
  } else if (produtoEmEdicaoId) {
    novoProduto();
  }
}

async function copiarResultadoDaCalculadora() {
  atualizarCalculo();
  const { entrada, resultado } = ultimoCalculo;
  if (!entrada.nome) {
    mostrarAviso('Informe o nome do produto para copiar o resultado.', 'erro');
    el.formProduto.elements.nome.focus();
    return;
  }
  if (!resultado.completo) {
    mostrarAviso(`Complete a ficha técnica antes de copiar: ${resultado.pendencias[0]}`, 'erro');
    return;
  }
  await copiarComFeedback(gerarTextoResultado(entrada.nome, resultado), el.botaoCopiarResultado);
}

function salvarPercentuaisPadrao() {
  const { taxas, impostos, margem } = lerFormularioProduto();
  const resultado = estado.salvarConfiguracoes({ taxas, impostos, margem });
  if (!resultado.ok) {
    mostrarAviso(Object.values(resultado.erros)[0], 'erro');
    return;
  }
  mostrarAviso(`Padrão salvo: taxas ${formatarNumero(taxas)}%, impostos ${formatarNumero(impostos)}% e margem ${formatarNumero(margem)}%.`);
  avisarSeNaoSalvou(resultado);
}

function aplicarRateio() {
  const mensal = interpretarNumero(el.rateioMensal.value);
  const unidades = interpretarNumero(el.rateioUnidades.value);
  let erro = '';
  if (!Number.isFinite(mensal) || mensal < 0) erro = 'Informe os custos fixos do mês (valor igual ou maior que zero).';
  else if (!Number.isFinite(unidades) || unidades <= 0) erro = 'Informe quantas unidades você vende por mês (maior que zero).';
  el.erroRateio.textContent = erro;
  el.erroRateio.hidden = !erro;
  if (erro) return;
  const porUnidade = mensal / unidades;
  el.formProduto.elements.custoFixoUnitario.value = numeroParaCampo(porUnidade);
  formularioProdutoAlterado = true;
  atualizarCalculo();
  mostrarAviso(`Custo fixo de ${formatarMoedaPrecisa(porUnidade)} por unidade aplicado.`, 'info');
}

function atualizarOpcoesDosIngredientes() {
  linhasDeIngredientes().forEach((linha) => {
    const seletor = linha.querySelector('[data-campo="insumo"]');
    preencherOpcoesInsumo(seletor, seletor.value);
    atualizarUnidadesLinha(linha);
  });
  const semInsumos = estado.listarInsumos().length === 0;
  el.avisoSemInsumos.hidden = !semInsumos;
  el.avisoSemInsumos.innerHTML = semInsumos
    ? `<p class="faixa-info">${icone('sobre')} Você ainda não cadastrou insumos. <a href="#insumos">Cadastre seus insumos</a> para montar a ficha técnica.</p>`
    : '';
}

function atualizarSugestoesCategorias() {
  const existentes = estado.listarProdutos().map((p) => p.categoria);
  const categorias = [...new Set([...estado.CATEGORIAS_PRODUTO_SUGERIDAS, ...existentes])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  el.sugestoesCategorias.innerHTML = categorias.map((c) => `<option value="${escapar(c)}"></option>`).join('');
}

function sincronizarCalculadora() {
  if (produtoEmEdicaoId && !estado.buscarProduto(produtoEmEdicaoId)) {
    // O produto em edição foi excluído: o formulário vira um rascunho novo.
    produtoEmEdicaoId = null;
    formularioProdutoAlterado = true;
    atualizarCabecalhoCalculadora();
    if (rotaAtual === 'calculadora') substituirRota('calculadora');
  }
  atualizarOpcoesDosIngredientes();
  atualizarSugestoesCategorias();
  atualizarCalculo();
}

/* =========================================================
   Tela 4 — Produtos
   ========================================================= */

function configurarProdutos() {
  el.buscaProdutos.addEventListener('input', () => renderizarProdutos(calcularTodosOsProdutos()));
  el.filtroCategoria.addEventListener('change', () => renderizarProdutos(calcularTodosOsProdutos()));
}

function renderizarProdutos(calculados) {
  const categorias = [...new Set(calculados.map((c) => c.produto.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const selecionada = el.filtroCategoria.value;
  el.filtroCategoria.innerHTML =
    '<option value="">Todas as categorias</option>' +
    categorias.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
  el.filtroCategoria.value = categorias.includes(selecionada) ? selecionada : '';

  const termo = normalizarTexto(el.buscaProdutos.value);
  const categoria = el.filtroCategoria.value;
  const filtrados = calculados
    .filter(({ produto }) => (!termo || normalizarTexto(produto.nome).includes(termo)) && (!categoria || produto.categoria === categoria))
    .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'));

  el.contagemProdutos.textContent =
    termo || categoria
      ? `${filtrados.length} de ${plural(calculados.length, 'produto', 'produtos')}`
      : plural(calculados.length, 'produto', 'produtos');

  if (calculados.length === 0) {
    el.listaProdutos.innerHTML = `
      <div class="estado-vazio">
        <span class="estado-vazio-icone">${icone('produtos')}</span>
        <h3>Nenhum produto cadastrado</h3>
        <p>Use a calculadora para montar a ficha técnica e salvar seu primeiro produto.</p>
        <div class="acoes-formulario"><a class="botao botao-primario" href="#calculadora">Abrir calculadora</a></div>
      </div>`;
    return;
  }
  if (filtrados.length === 0) {
    el.listaProdutos.innerHTML = '<p class="sem-resultados">Nenhum produto corresponde à pesquisa ou ao filtro selecionado.</p>';
    return;
  }

  el.listaProdutos.innerHTML = `
    <table class="tabela tabela-responsiva tabela-produtos">
      <thead>
        <tr>
          <th scope="col">Produto</th>
          <th scope="col">Categoria</th>
          <th scope="col" class="num">Custo unit.</th>
          <th scope="col" class="num">Preço sugerido</th>
          <th scope="col" class="num">Preço definido</th>
          <th scope="col" class="num">Lucro/un.</th>
          <th scope="col" class="num">Margem</th>
          <th scope="col"><span class="visualmente-oculto">Ações</span></th>
        </tr>
      </thead>
      <tbody>
        ${filtrados
          .map(({ produto, resultado }) => {
            const ok = resultado.completo;
            const nome = escapar(produto.nome);
            const incompleta = ok
              ? ''
              : `<span class="selo selo-alerta" title="${escapar(resultado.pendencias[0])}">Ficha incompleta</span>`;
            return `
            <tr>
              <th scope="row" data-rotulo="Produto"><span class="celula-nome">${nome}</span> ${seloDemo(produto)} ${incompleta}</th>
              <td data-rotulo="Categoria">${escapar(produto.categoria)}</td>
              <td data-rotulo="Custo unitário" class="num">${ok ? formatarMoeda(resultado.custoUnitario) : '—'}</td>
              <td data-rotulo="Preço sugerido" class="num">${ok ? formatarMoeda(resultado.precoSugerido) : '—'}</td>
              <td data-rotulo="Preço definido" class="num">${resultado.precoDefinido !== null ? formatarMoeda(resultado.precoDefinido) : '<span class="texto-suave">Não informado</span>'}</td>
              <td data-rotulo="Lucro por unidade" class="num ${ok && resultado.venda.lucro < 0 ? 'texto-negativo' : ''}">${ok ? formatarMoeda(resultado.venda.lucro) : '—'}</td>
              <td data-rotulo="Margem" class="num">${ok ? `<span class="pilula ${classeMargem(resultado.venda.margem, produto.margem)}">${formatarPercentual(resultado.venda.margem)}</span>` : '—'}</td>
              <td class="celula-acoes">
                <div class="acoes-linha">
                  <button class="botao botao-pequeno botao-secundario" type="button" data-acao="detalhes-produto" data-id="${escapar(produto.id)}">
                    ${icone('olho')} Detalhes<span class="visualmente-oculto"> de ${nome}</span>
                  </button>
                  <a class="botao botao-pequeno botao-secundario" href="#calculadora/${encodeURIComponent(produto.id)}">
                    ${icone('editar')} Editar<span class="visualmente-oculto"> ${nome}</span>
                  </a>
                  <button class="botao botao-pequeno botao-perigo-suave" type="button" data-acao="excluir-produto" data-id="${escapar(produto.id)}">
                    ${icone('lixeira')} Excluir<span class="visualmente-oculto"> ${nome}</span>
                  </button>
                </div>
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
    <p class="nota-tabela">Lucro e margem usam o preço definido quando ele existe; caso contrário, o preço sugerido.</p>`;
}

function abrirDetalhesProduto(id) {
  const produto = estado.buscarProduto(id);
  if (!produto) {
    mostrarAviso('Produto não encontrado.', 'erro');
    return;
  }
  const r = estado.calcularProduto(produto);
  const { percentuais } = r;

  const linhasFicha = r.itens
    .map(
      (item) => `
      <tr>
        <th scope="row">${item.nome ? escapar(item.nome) : '<span class="texto-erro">Insumo removido</span>'}</th>
        <td class="num">${formatarNumero(item.quantidade)} ${escapar(item.unidade)}</td>
        <td class="num">${formatarMoeda(item.custo)}</td>
      </tr>`
    )
    .join('');

  const pendencias = r.completo
    ? ''
    : `<div class="resultado-pendente resultado-pendente-claro"><p class="resultado-pendente-titulo">${icone('alerta')} Ficha técnica incompleta</p>
       <ul>${r.pendencias.map((p) => `<li>${escapar(p)}</li>`).join('')}</ul>
       <p>Edite o produto para corrigir.</p></div>`;

  const resumo = r.completo
    ? `<dl class="grade-detalhes">
        <div><dt>Custo total por unidade</dt><dd>${formatarMoeda(r.custoUnitario)}</dd></div>
        <div><dt>Preço sugerido</dt><dd>${formatarMoeda(r.precoSugerido)}</dd></div>
        <div><dt>Preço definido</dt><dd>${r.precoDefinido !== null ? formatarMoeda(r.precoDefinido) : 'Não informado'}</dd></div>
        <div><dt>Lucro estimado por unidade</dt><dd class="${r.venda.lucro < 0 ? 'texto-negativo' : ''}">${formatarMoeda(r.venda.lucro)}</dd></div>
        <div><dt>Margem estimada</dt><dd><span class="pilula ${classeMargem(r.venda.margem, percentuais.margem)}">${formatarPercentual(r.venda.margem)}</span></dd></div>
        <div><dt>Markup equivalente</dt><dd>${formatarNumero(r.venda.markup, 2)}×</dd></div>
      </dl>`
    : '';

  el.dialogoDetalhesTitulo.textContent = produto.nome;
  el.dialogoDetalhesCorpo.innerHTML = `
    <p class="chips">
      <span class="selo">${escapar(produto.categoria)}</span>
      <span class="selo">Rende ${formatarNumero(produto.rendimento)} ${produto.rendimento === 1 ? 'unidade' : 'unidades'}</span>
      ${seloDemo(produto)}
    </p>
    ${pendencias}
    ${resumo}
    <h3>Ficha técnica (receita completa)</h3>
    <div class="tabela-rolagem">
      <table class="tabela tabela-compacta">
        <thead><tr><th scope="col">Insumo</th><th scope="col" class="num">Quantidade</th><th scope="col" class="num">Custo</th></tr></thead>
        <tbody>${linhasFicha || '<tr><td colspan="3">Nenhum ingrediente.</td></tr>'}</tbody>
        <tfoot>
          <tr><th scope="row" colspan="2">Total da receita</th><td class="num">${formatarMoeda(r.custoIngredientesReceita)}</td></tr>
          <tr><th scope="row" colspan="2">Ingredientes por unidade (÷ ${formatarNumero(produto.rendimento)})</th><td class="num">${formatarMoeda(r.custoIngredientesUnidade)}</td></tr>
        </tfoot>
      </table>
    </div>
    <dl class="grade-detalhes grade-detalhes-pequena">
      <div><dt>Embalagem</dt><dd>${formatarMoeda(r.embalagem)}</dd></div>
      <div><dt>Outros custos</dt><dd>${formatarMoeda(r.outrosCustos)}</dd></div>
      <div><dt>Custo fixo rateado</dt><dd>${formatarMoeda(r.custoFixoUnitario)}</dd></div>
      <div><dt>Taxas</dt><dd>${formatarNumero(percentuais.taxas)}%</dd></div>
      <div><dt>Impostos</dt><dd>${formatarNumero(percentuais.impostos)}%</dd></div>
      <div><dt>Margem desejada</dt><dd>${formatarNumero(percentuais.margem)}%</dd></div>
    </dl>
    <p class="texto-suave">Criado em ${formatoData.format(produto.criadoEm)} · atualizado em ${formatoData.format(produto.atualizadoEm)}. Valores recalculados com os custos atuais dos insumos.</p>`;

  el.dialogoDetalhesAcoes.innerHTML = `
    ${r.completo ? `<button class="botao botao-secundario" type="button" data-acao="copiar-produto" data-id="${escapar(produto.id)}">${icone('copiar')}<span>Copiar resultado</span></button>` : ''}
    <a class="botao botao-primario" href="#calculadora/${encodeURIComponent(produto.id)}">${icone('editar')} Editar produto</a>`;

  if (!el.dialogoDetalhes.open) el.dialogoDetalhes.showModal();
}

async function copiarProduto(id, botao) {
  const produto = estado.buscarProduto(id);
  if (!produto) return;
  const resultado = estado.calcularProduto(produto);
  if (!resultado.completo) {
    mostrarAviso('Complete a ficha técnica deste produto antes de copiar.', 'erro');
    return;
  }
  await copiarComFeedback(gerarTextoResultado(produto.nome, resultado), botao);
}

async function excluirProduto(id) {
  const produto = estado.buscarProduto(id);
  if (!produto) return;
  const confirmado = await confirmar({
    titulo: 'Excluir produto?',
    mensagemHtml: `<p>"<strong>${escapar(produto.nome)}</strong>" e sua ficha técnica serão excluídos permanentemente. Os insumos cadastrados não são afetados.</p><p>Esta ação não pode ser desfeita.</p>`,
    textoConfirmar: 'Excluir produto',
  });
  if (!confirmado) return;
  const resultado = estado.excluirProduto(id);
  if (resultado.ok) {
    mostrarAviso(`Produto "${produto.nome}" excluído.`);
    avisarSeNaoSalvou(resultado);
  }
}

/* =========================================================
   Dados (demonstração e limpeza) e Tela 5
   ========================================================= */

function carregarDemonstracao() {
  const resultado = estado.carregarDemonstracao();
  if (!resultado.ok) {
    mostrarAviso(resultado.mensagem, 'erro');
    return;
  }
  mostrarAviso(`Dados de demonstração carregados: ${resultado.insumos} insumos e ${resultado.produtos} produtos.`);
  avisarSeNaoSalvou(resultado);
}

async function removerDemonstracao() {
  const confirmado = await confirmar({
    titulo: 'Remover dados de demonstração?',
    mensagemHtml: '<p>Os produtos e insumos marcados como <strong>Demonstração</strong> serão excluídos. Seus próprios cadastros não serão alterados.</p>',
    textoConfirmar: 'Remover exemplos',
  });
  if (!confirmado) return;
  const resultado = estado.removerDemonstracao();
  let mensagem = `Demonstração removida: ${plural(resultado.produtosRemovidos, 'produto', 'produtos')} e ${plural(resultado.insumosRemovidos, 'insumo', 'insumos')}.`;
  if (resultado.mantidos.length > 0) {
    mensagem += ` Mantidos por estarem em uso nos seus produtos: ${resultado.mantidos.join(', ')}.`;
  }
  mostrarAviso(mensagem, resultado.mantidos.length > 0 ? 'info' : 'sucesso');
  avisarSeNaoSalvou(resultado);
}

async function apagarTudo() {
  const confirmado = await confirmar({
    titulo: 'Apagar todos os dados?',
    mensagemHtml: '<p>Todos os insumos, produtos e configurações salvos <strong>neste navegador</strong> serão apagados permanentemente.</p><p>Esta ação não pode ser desfeita.</p>',
    textoConfirmar: 'Apagar tudo',
  });
  if (!confirmado) return;
  estado.apagarTodosOsDados();
  limparFormularioInsumo();
  novoProduto();
  if (rotaAtual === 'calculadora') substituirRota('calculadora');
  mostrarAviso('Todos os dados foram apagados.');
}

function renderizarResumoDados() {
  const insumos = estado.listarInsumos().length;
  const produtos = estado.listarProdutos().length;
  const partes = [`${plural(insumos, 'insumo', 'insumos')} e ${plural(produtos, 'produto', 'produtos')} salvos neste navegador`];
  if (estado.possuiDemonstracao()) partes.push('(inclui dados de demonstração)');
  if (!estado.armazenamentoAtivo()) partes.push('— armazenamento local indisponível: os dados não serão mantidos ao fechar a página');
  el.resumoDados.textContent = `${partes.join(' ')}.`;
}

export function mostrarSituacaoArmazenamento(situacao) {
  if (situacao === 'indisponivel') {
    el.faixaArmazenamento.hidden = false;
    el.faixaArmazenamento.innerHTML = `${icone('alerta')}<p>O armazenamento local está bloqueado neste navegador. Você pode usar o PreçoCerto, mas os dados serão perdidos ao fechar ou atualizar a página.</p>`;
  }
  if (situacao === 'corrompido') {
    mostrarAviso('Os dados salvos estavam ilegíveis e não puderam ser carregados. Uma cópia foi preservada no navegador e o sistema começou vazio.', 'erro');
  }
}

/* =========================================================
   Ações globais (delegação de eventos)
   ========================================================= */

function configurarAcoes() {
  document.addEventListener('click', (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo) return;
    const { acao, id } = alvo.dataset;
    switch (acao) {
      case 'editar-insumo':
        editarInsumo(id);
        break;
      case 'excluir-insumo':
        excluirInsumo(id);
        break;
      case 'remover-ingrediente': {
        alvo.closest('.linha-ingrediente').remove();
        if (linhasDeIngredientes().length === 0) criarLinhaIngrediente();
        formularioProdutoAlterado = true;
        atualizarCalculo();
        el.botaoAdicionarIngrediente.focus();
        break;
      }
      case 'detalhes-produto':
        abrirDetalhesProduto(id);
        break;
      case 'copiar-produto':
        copiarProduto(id, alvo);
        break;
      case 'excluir-produto':
        excluirProduto(id);
        break;
      case 'fechar-dialogo':
        alvo.closest('dialog').close();
        break;
      case 'carregar-demo':
        carregarDemonstracao();
        break;
      case 'remover-demo':
        removerDemonstracao();
        break;
      case 'apagar-tudo':
        apagarTudo();
        break;
      default:
        break;
    }
  });
}

/* =========================================================
   Inicialização e integração com a navegação
   ========================================================= */

function mapearElementos() {
  const porId = (id) => document.getElementById(id);
  Object.assign(el, {
    indicadores: porId('indicadores'),
    listaRecentes: porId('lista-recentes'),
    blocoDemo: porId('bloco-demo'),
    formInsumo: porId('form-insumo'),
    tituloFormInsumo: porId('titulo-form-insumo'),
    previaCustoInsumo: porId('previa-custo-insumo'),
    botaoSalvarInsumo: porId('botao-salvar-insumo'),
    botaoCancelarInsumo: porId('botao-cancelar-insumo'),
    buscaInsumos: porId('busca-insumos'),
    listaInsumos: porId('lista-insumos'),
    contagemInsumos: porId('contagem-insumos'),
    sobretituloCalculadora: porId('sobretitulo-calculadora'),
    tituloCalculadora: porId('titulo-calculadora'),
    botaoNovoProduto: porId('botao-novo-produto'),
    formProduto: porId('form-produto'),
    sugestoesCategorias: porId('sugestoes-categorias'),
    avisoSemInsumos: porId('aviso-sem-insumos'),
    listaIngredientes: porId('lista-ingredientes'),
    botaoAdicionarIngrediente: porId('botao-adicionar-ingrediente'),
    totalIngredientes: porId('total-ingredientes'),
    rateioMensal: porId('rateio-mensal'),
    rateioUnidades: porId('rateio-unidades'),
    botaoAplicarRateio: porId('botao-aplicar-rateio'),
    erroRateio: porId('erro-rateio'),
    medidorPercentuais: porId('medidor-percentuais'),
    botaoSalvarPadrao: porId('botao-salvar-padrao'),
    resultadoCalculo: porId('resultado-calculo'),
    resumoMovelPreco: porId('resumo-movel-preco'),
    botaoVerResultado: porId('botao-ver-resultado'),
    erroGeralProduto: porId('erro-geral-produto'),
    botaoSalvarProduto: porId('botao-salvar-produto'),
    botaoCopiarResultado: porId('botao-copiar-resultado'),
    botaoLimparProduto: porId('botao-limpar-produto'),
    buscaProdutos: porId('busca-produtos'),
    filtroCategoria: porId('filtro-categoria'),
    contagemProdutos: porId('contagem-produtos'),
    listaProdutos: porId('lista-produtos'),
    resumoDados: porId('resumo-dados'),
    faixaArmazenamento: porId('faixa-armazenamento'),
    areaAvisos: porId('area-avisos'),
    dialogoConfirmacao: porId('dialogo-confirmacao'),
    dialogoConfirmacaoTitulo: porId('dialogo-confirmacao-titulo'),
    dialogoConfirmacaoCorpo: porId('dialogo-confirmacao-corpo'),
    dialogoConfirmacaoBotao: porId('dialogo-confirmacao-confirmar'),
    dialogoConfirmacaoCancelar: porId('dialogo-confirmacao-cancelar'),
    dialogoDetalhes: porId('dialogo-detalhes'),
    dialogoDetalhesTitulo: porId('dialogo-detalhes-titulo'),
    dialogoDetalhesCorpo: porId('dialogo-detalhes-corpo'),
    dialogoDetalhesAcoes: porId('dialogo-detalhes-acoes'),
    dialogoCopiaManual: porId('dialogo-copia-manual'),
    dialogoCopiaMotivo: porId('dialogo-copia-motivo'),
    textoCopiaManual: porId('texto-copia-manual'),
  });
}

export function iniciarInterface() {
  mapearElementos();
  configurarDialogos();
  configurarInsumos();
  configurarCalculadora();
  configurarProdutos();
  configurarAcoes();
  novoProduto();
  renderizarTudo();
}

export function renderizarTudo() {
  const calculados = calcularTodosOsProdutos();
  if (insumoEmEdicaoId && !estado.buscarInsumo(insumoEmEdicaoId)) limparFormularioInsumo();
  renderizarInicio(calculados);
  renderizarInsumos();
  renderizarProdutos(calculados);
  sincronizarCalculadora();
  renderizarResumoDados();
}

export function aoMudarRota({ nome, parametros }) {
  rotaAtual = nome;
  // Diálogos não devem ficar abertos sobre outra tela (ex.: ao usar o botão Voltar).
  [el.dialogoDetalhes, el.dialogoCopiaManual].forEach((dialogo) => {
    if (dialogo.open) dialogo.close();
  });
  if (nome === 'calculadora') prepararCalculadora(parametros[0]);
}
