# PreçoCerto — Sistema Inteligente de Precificação para Pequenos Negócios

> Projeto acadêmico da disciplina de **Desenvolvimento Web**.
> Aplicação web estática feita com HTML5, CSS3 e JavaScript puro (ES Modules), sem frameworks e sem backend.

---

## 1. Nome do projeto

**PreçoCerto — Sistema Inteligente de Precificação para Pequenos Negócios.**

## 2. Descrição do problema

Muitos pequenos empreendedores do setor de alimentação (hamburguerias, pizzarias, confeitarias, restaurantes e vendedores autônomos) definem seus preços observando a concorrência ou aplicando valores arbitrários, sem conhecer o custo real de cada produto. O resultado são prejuízos invisíveis, margens insuficientes e dificuldade para manter o negócio sustentável.

## 3. Justificativa

Calcular corretamente um preço de venda exige considerar o custo proporcional de cada ingrediente, embalagens, taxas de cartão ou aplicativos de delivery, impostos e a margem de lucro desejada. Planilhas genéricas exigem conhecimento financeiro que boa parte desses empreendedores não possui. Uma ferramenta simples, gratuita, que roda no navegador e não exige cadastro reduz essa barreira e incentiva decisões de preço baseadas em dados.

## 4. Objetivo geral

Desenvolver uma aplicação web responsiva que permita ao pequeno empreendedor cadastrar seus insumos, montar fichas técnicas de produtos e obter automaticamente o custo unitário, o preço de venda sugerido, o lucro estimado e a margem de lucro de cada produto.

## 5. Público-alvo

Proprietários de restaurantes, lanchonetes, hamburguerias, pizzarias, confeitarias, docerias e vendedores de alimentos em geral, especialmente microempreendedores sem formação na área financeira.

## 6. Funcionalidades

| Tela | Rota | O que faz |
|---|---|---|
| **Início (Dashboard)** | `#inicio` | Quantidade de produtos, custo médio, preço médio de venda, margem média estimada, últimos produtos cadastrados, botão "Calcular preço de venda", mensagem de boas-vindas quando não há produtos e controle dos dados de demonstração. |
| **Insumos** | `#insumos` | Cadastro de ingredientes, embalagens e materiais (nome, categoria, quantidade comprada, unidade kg/g/L/ml/un e valor pago). Calcula o custo por grama, mililitro ou unidade em tempo real. Permite pesquisar, editar e excluir (com confirmação). |
| **Calculadora** | `#calculadora` e `#calculadora/<id>` | Ficha técnica do produto: ingredientes cadastrados com conversão de unidades (kg↔g, L↔ml), rendimento da receita, embalagem, outros custos variáveis, custo fixo rateado por unidade (com assistente de rateio), taxas, impostos, margem desejada e preço praticado opcional. Mostra o resultado em tempo real, salva o produto e copia o resultado. |
| **Produtos** | `#produtos` | Lista de produtos com custo unitário, preço sugerido, preço definido, lucro por unidade e margem; pesquisa por nome, filtro por categoria, detalhes, edição e exclusão. |
| **Sobre** | `#sobre` | Apresentação, problema, objetivo, público-alvo, funcionalidades, equipe, informações acadêmicas, aviso de privacidade e opção de apagar todos os dados. |

### Regras de cálculo

- **Custo unitário do insumo** = valor pago ÷ quantidade convertida para a unidade base (g, ml ou un).
  Ex.: 1 kg de queijo por R$ 40,00 → R$ 40,00 ÷ 1000 g = **R$ 0,04 por grama**.
- **Custo do ingrediente** = custo unitário × quantidade usada (convertida para a unidade base).
- **Custo total por unidade** = (soma dos ingredientes da receita ÷ rendimento) + embalagem + outros custos variáveis + custo fixo rateado.
- **Preço sugerido** = custo total unitário ÷ (1 − taxas − impostos − margem), com os percentuais convertidos para decimais e o resultado **arredondado para cima ao centavo** para preservar a margem mínima.
  Ex.: R$ 13,00 ÷ (1 − 0,05 − 0,05 − 0,30) = R$ 13,00 ÷ 0,60 = **R$ 21,67**.
- **Lucro por unidade** = preço − custo total − (preço × taxas) − (preço × impostos).
- **Margem estimada** = lucro ÷ preço de venda (**margem sobre o faturamento**, e não markup sobre o custo). O sistema exibe também o markup equivalente (preço ÷ custo) para deixar a diferença clara.
- Se a soma de taxas + impostos + margem for **igual ou maior que 100%**, o cálculo é bloqueado com uma mensagem explicativa.
- Custos fixos só entram no cálculo quando informados **por unidade**. A calculadora oferece um assistente que divide o custo fixo mensal pelas unidades vendidas no mês.
- Os cálculos usam precisão total; os valores só são arredondados na exibição (duas casas decimais). A exceção é o custo unitário de insumos, exibido com até quatro casas (ex.: R$ 0,016/ml), para não distorcer custos muito pequenos.
- Os produtos guardam apenas os dados de entrada da ficha técnica. Custos e preços são **sempre recalculados a partir dos insumos atuais**, então alterar o preço de um insumo atualiza imediatamente todos os produtos que o utilizam.

### Validações implementadas

- Nome obrigatório para insumos e produtos; nomes duplicados bloqueados (ignorando maiúsculas, acentos e espaços extras).
- Quantidades e rendimento maiores que zero; valores monetários não negativos; valor pago do insumo maior que zero.
- Percentuais entre 0 e 99,99% e soma abaixo de 100%.
- Ingrediente sem insumo selecionado, insumo repetido na mesma ficha ou unidade incompatível.
- Exclusão de insumo usado em produtos é bloqueada (o sistema lista os produtos que o utilizam).
- Troca de unidade de um insumo em uso só é permitida dentro da mesma grandeza (kg↔g, L↔ml).
- O cálculo não é exibido enquanto a ficha estiver incompleta: o painel lista o que falta.
- Depois de salvo, o produto passa para o modo de edição, evitando que um novo clique em "Salvar" crie uma duplicata.

## 7. Recursos nativos utilizados

- **Clipboard API** (`navigator.clipboard.writeText`): botão "Copiar resultado" na calculadora e nos detalhes do produto. O texto copiado contém o nome do produto, o custo total, o preço sugerido, o lucro estimado e a margem. Há confirmação visual (botão muda para "Copiado!" e um aviso aparece). Se o navegador bloquear a cópia ou o site não estiver em contexto seguro (HTTPS ou localhost), o sistema tenta um método alternativo e, por fim, abre uma janela com o texto selecionado para cópia manual.
- **localStorage**: insumos, produtos e configurações (percentuais padrão) ficam salvos no navegador e permanecem após atualizar ou fechar a página. Os dados são validados ao carregar; se estiverem corrompidos, uma cópia é preservada e o sistema inicia vazio, avisando o usuário. Abas diferentes são sincronizadas pelo evento `storage`.
- **History/Hash API**: navegação por hash sincronizada com os botões Voltar e Avançar.
- **`<dialog>` nativo**: confirmações de exclusão e detalhes do produto.
- **`Intl.NumberFormat`**: formatação monetária em reais (R$) e de percentuais no padrão brasileiro.

Nenhum dado pessoal, senha ou token é coletado ou armazenado.

## 8. Tecnologias

- HTML5 semântico (landmarks, `fieldset`/`legend`, `dialog`, `aria-current`, `aria-invalid`, `aria-live`)
- CSS3 (variáveis, Grid, Flexbox, container queries, media queries, `:has()`)
- JavaScript puro com **ES Modules**
- APIs nativas do navegador (Clipboard, localStorage, History, Intl)
- Ícones SVG próprios, desenhados para o projeto (sem bibliotecas nem imagens de terceiros)

Não há etapa de compilação, dependências externas ou backend. O projeto funciona como site estático e pode ser publicado no GitHub Pages.

## 9. Organização dos arquivos

```
preco-certo/
├── index.html          # Estrutura das 5 telas, diálogos e ícones SVG
├── README.md
├── css/
│   └── style.css       # Estilização e responsividade
├── js/
│   ├── app.js          # Inicialização e integração dos módulos; menu móvel
│   ├── navegacao.js    # Rotas por hash, menu ativo (aria-current) e foco
│   ├── estado.js       # Cadastro, edição, exclusão, validação e persistência
│   ├── interface.js    # Renderização das telas, formulários, diálogos e avisos
│   └── calculos.js     # Cálculos de custo, preço, lucro e margem; formatação
└── assets/
    └── images/
        ├── logo.svg
        └── favicon.svg
```

## 10. Como executar o projeto

Por usar **ES Modules**, o projeto precisa ser aberto por um servidor HTTP. Abrir o `index.html` com duplo clique (`file://`) faz o navegador bloquear os módulos.

Escolha uma das opções a partir da pasta do projeto:

**Opção A — VS Code + Live Server**
1. Instale a extensão *Live Server*.
2. Clique com o botão direito em `index.html` → *Open with Live Server*.

**Opção B — Python**
```bash
python -m http.server 5500
```

**Opção C — Node.js**
```bash
npx serve .
```

Depois, acesse `http://localhost:5500` (ou o endereço indicado no terminal). Em `localhost` a Clipboard API funciona normalmente.

### Publicação no GitHub Pages

1. Crie um repositório no GitHub e envie o conteúdo do projeto para a raiz do repositório (o `index.html` deve ficar na raiz).
2. No repositório, acesse **Settings → Pages**.
3. Em **Build and deployment**, selecione **Source: Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`. Clique em **Save**.
4. Aguarde alguns minutos; o endereço ficará disponível no formato `https://<usuario>.github.io/<repositorio>/`.

Como todos os caminhos do projeto são relativos e a navegação usa hash (`#inicio`, `#produtos`…), não é necessária nenhuma configuração extra. O GitHub Pages usa HTTPS, o que garante o funcionamento da Clipboard API.

Link do repositório: `[preencher]` · Link publicado: `[preencher]`

### Roteiro de testes manuais

| # | Teste | Resultado esperado |
|---|---|---|
| 1 | Abrir o site sem dados. | Painel com indicadores zerados e mensagem convidando ao primeiro cadastro. |
| 2 | Em **Insumos**, clicar em "Salvar insumo" com o formulário vazio. | Mensagens de erro em todos os campos obrigatórios. |
| 3 | Cadastrar "Queijo muçarela", Laticínios, 1, kg, 40,00. | Prévia mostra "R$ 0,04 por g"; insumo aparece na lista. |
| 4 | Cadastrar outro insumo com o nome "queijo MUÇARELA". | Erro de nome duplicado. |
| 5 | Informar quantidade 0 ou valor -5. | Erros de quantidade/valor; nada é salvo. |
| 6 | No **Painel**, clicar em "Carregar dados de demonstração". | 3 produtos e 11 insumos com o selo "Demonstração" (um exemplo com nome repetido recebe o sufixo "(exemplo)"). |
| 7 | Em **Produtos**, conferir o hambúrguer. | Custo R$ 13,00, preço sugerido R$ 21,67, lucro R$ 6,50, margem 30%. |
| 8 | Na **Calculadora**, criar um produto: nome, ingrediente com 50 g de queijo, taxas 5, impostos 5, margem 30. | Custo e preço calculados em tempo real; fórmula exibida. |
| 9 | Trocar a unidade do ingrediente para kg e digitar 0,05. | Mesmo custo do passo 8 (conversão de unidades). |
| 10 | Definir taxas 50, impostos 20 e margem 30. | Erro explicando que a soma (100%) precisa ser menor que 100%; preço não é calculado. |
| 11 | Voltar aos percentuais válidos e clicar em "Salvar produto". | Aviso de sucesso; título muda para "Editar: …"; URL vira `#calculadora/<id>`. |
| 12 | Clicar em "Novo produto" e tentar salvar outro com o mesmo nome. | Erro de produto duplicado. |
| 13 | Clicar em "Copiar resultado" e colar (Ctrl+V) num editor de texto. | Botão mostra "Copiado!"; o texto contém nome, custo, preço sugerido, lucro e margem. |
| 14 | Informar um preço de venda abaixo do sugerido. | Lucro e margem recalculados para esse preço, com aviso de margem menor que a desejada (ou de prejuízo). |
| 15 | Em **Insumos**, editar o valor pago do queijo de 40 para 60. | Aviso informando quantos produtos foram recalculados; em **Produtos**, o custo e o preço dos itens com queijo aumentam. |
| 16 | Tentar excluir um insumo usado em algum produto. | Exclusão bloqueada, com a lista dos produtos que o utilizam. |
| 17 | Em **Produtos**, pesquisar "pizza" e filtrar por categoria. | Lista filtrada e contador "X de Y produtos". |
| 18 | Clicar em "Detalhes" e depois em "Editar produto". | Diálogo com a ficha técnica; a edição abre a calculadora já preenchida. |
| 19 | Excluir um produto, primeiro cancelando e depois confirmando. | Cancelar mantém o produto; confirmar remove. |
| 20 | Navegar entre as telas e usar Voltar/Avançar do navegador. | URL, menu destacado e tela exibida sempre sincronizados. |
| 21 | Acessar `#rota-inexistente`. | Redireciona para `#inicio`. |
| 22 | Fechar o navegador e abrir o site novamente. | Insumos, produtos e percentuais padrão continuam salvos. |
| 23 | Redimensionar para celular (ou usar o modo dispositivo do DevTools). | Menu vira gaveta (botão ☰), tabelas viram cartões e um resumo fixo do preço aparece na calculadora. |
| 24 | Clicar em "Remover dados de demonstração" e, em **Sobre**, em "Apagar todos os dados". | Apenas os exemplos são removidos no primeiro caso; tudo é apagado (após confirmação) no segundo. |

## 11. Integrantes

- Maria Eduarda Strelow
- Pedro Henrique Azevedo
- Thiago Henrique Fonseca

| | |
|---|---|
| **Instituição** | AFYA São Lucas |
| **Curso** | Ciência da Computação |
| **Disciplina** | Desenvolvimento Web |
| **Professor** | Romário Vitorino Ferreira |

## 12. Divisão preliminar das responsabilidades

| Integrante | Responsabilidade |
|---|---|
| Maria Eduarda Strelow | Estrutura HTML, identidade visual e responsividade (`index.html`, `style.css`, ícones e logotipo) |
| Pedro Henrique Azevedo | Regras de negócio, cálculos, validações e persistência (`calculos.js`, `estado.js`) |
| Thiago Henrique Fonseca | Navegação, interface, Clipboard API, testes manuais e documentação (`navegacao.js`, `interface.js`, `app.js`, `README.md`) |

*Divisão sugerida; ajustar conforme a organização real da equipe.*

## 13. Limitações da versão inicial

- Os dados ficam apenas no navegador e no dispositivo em que foram cadastrados; limpar os dados do navegador apaga as informações e não há sincronização entre dispositivos.
- Não há exportação/importação de backup.
- Os percentuais (taxas, impostos e margem) são estimativas informadas pelo usuário; o sistema não calcula tributos conforme o regime fiscal.
- Não são considerados automaticamente perdas, desperdícios, fator de correção de ingredientes, variações de preço dos fornecedores ou custos indiretos não informados.
- Os resultados são **estimativas** e não representam garantia de lucro real.
- Edições do mesmo dado em duas abas ao mesmo tempo seguem a regra "último a salvar prevalece".

## 14. Melhorias futuras

- Exportação e importação dos dados (JSON/CSV) e geração de relatório em PDF.
- Fator de correção/perdas por ingrediente e cálculo de rendimento por peso.
- Histórico de preços dos insumos e alerta quando a margem de um produto cair abaixo da desejada.
- Simulador de preços por canal de venda (balcão, delivery próprio, aplicativos).
- Cálculo de ponto de equilíbrio a partir dos custos fixos mensais.
- Funcionamento offline como PWA (Service Worker e manifesto).
- Sincronização opcional em nuvem com autenticação.

---

**Aviso:** o PreçoCerto é um projeto acadêmico. Os valores apresentados dependem da precisão das informações fornecidas pelo usuário e devem ser usados como apoio à decisão, não como garantia de resultado financeiro.
