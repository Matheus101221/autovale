/* ==========================================================
   AUTO VALE MULTIMARCAS — DASHBOARD COMERCIAL
   ========================================================== */

let dadosComerciaisCarregados = false;
let dadosMarketingCarregados = false;
let dadosVendedoresCarregados = false;
let dadosOutrosCarregados = false;
let criativosCarregados = false;

/* Último erro de cada fonte (null = última leitura funcionou). Usado para avisar na tela
   em vez de mostrar zeros como se fossem dados reais. */
const errosCarga = { comercial: null, marketing: null, vendedores: null, outros: null, criativos: null };
const ROTULOS_FONTES = { comercial: "Comercial", marketing: "Marketing", vendedores: "Vendedores", outros: "Outros", criativos: "Criativos Campeões" };
let ultimaAtualizacao = null;
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

/* ---------- FORMATAÇÃO ---------- */
function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPercentual(valor) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
}

function formatarNumero(valor) {
  return valor.toLocaleString("pt-BR");
}

function formatarDataBR(dataIso) {
  if (!dataIso) return "";
  const partes = dataIso.split("-");
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  return dataIso;
}

function formatarPorTipo(valor, formato) {
  if (formato === "moeda") return formatarMoeda(valor);
  if (formato === "percentual") return formatarPercentual(valor);
  return formatarNumero(valor);
}

function animarValor(elemento, valorFinal, formato, duracao = 500) {
  if (!elemento) return;
  const inicio = performance.now();

  function passo(agora) {
    const progresso = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - progresso, 3);
    const atual = valorFinal * suavizado;
    elemento.textContent = formatarPorTipo(atual, formato);
    if (progresso < 1) requestAnimationFrame(passo);
    else elemento.textContent = formatarPorTipo(valorFinal, formato);
  }

  requestAnimationFrame(passo);
}

function iniciaisDoNome(nome) {
  return nome
    .split(" ")
    .map((parte) => parte[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function calcularTotais(sdrs) {
  return sdrs.reduce(
    (acc, sdr) => {
      acc.contratos += sdr.contratos;
      acc.faturamento += sdr.faturamento;
      return acc;
    },
    { contratos: 0, faturamento: 0 }
  );
}

function calcularParticipacao(sdr, totalContratos) {
  if (!totalContratos) return 0;
  return (sdr.contratos / totalContratos) * 100;
}

function sdrPossuiDados(sdr) {
  return sdr.contratos > 0 || sdr.faturamento > 0 || sdr.retorno > 0 || sdr.tac > 0;
}

function ordenarRanking(sdrs) {
  return [...sdrs].sort((a, b) => {
    if (b.contratos !== a.contratos) return b.contratos - a.contratos;
    return b.faturamento - a.faturamento;
  });
}

/* ---------- RENDERIZAÇÃO ---------- */
function exibirEstadoVazio(container, mensagem) {
  container.innerHTML = `<p class="empty-state">${mensagem}</p>`;
}

function exibirCarregamento(container, quantidade = 3) {
  container.innerHTML = "";
  for (let i = 0; i < quantidade; i += 1) {
    const card = document.createElement("div");
    card.className = "loading-card";
    card.innerHTML = '<span class="loading-card__line loading-card__line--short"></span><span class="loading-card__line"></span>';
    container.appendChild(card);
  }
}

/* Bloco "vs período anterior": selo de variação, valor anterior e barras Atual x Anterior.
   A seta mostra o sentido da variação; a cor mostra se foi bom ou ruim:
   - padrão ("maior é melhor"): subir = verde, cair = vermelho
   - direcao "menor_melhor" (custos): subir = vermelho, cair = verde
   - direcao "neutra" (ex.: investimento): sempre cinza, sem julgamento
   Indicadores em % variam em pontos percentuais. */
function criarComparativoPeriodo(item, valor, valorAnterior) {
  const ehPercentual = item.format === "percentual";
  const anterior = valorAnterior || 0;
  const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

  let sentido = "igual";
  let texto = "0%";

  if (ehPercentual) {
    const diff = valor - anterior;
    if (Math.abs(diff) >= 0.005) {
      sentido = diff > 0 ? "up" : "down";
      texto = `${diff > 0 ? "+" : "-"}${fmt(Math.abs(diff))} p.p.`;
    } else {
      texto = "0 p.p.";
    }
  } else if (!anterior) {
    if (valor > 0) { sentido = "up"; texto = "Novo"; }
  } else {
    const variacao = calcularVariacaoPercentual(valor, anterior);
    if (Math.abs(variacao) >= 0.05) {
      sentido = variacao > 0 ? "up" : "down";
      texto = `${variacao > 0 ? "+" : "-"}${fmt(Math.abs(variacao))}%`;
    }
  }

  let tom = "neutro";
  if (sentido !== "igual" && item.direcao !== "neutra") {
    // Sem base anterior ("Novo") em um custo não é bom nem ruim: fica neutro.
    if (!(texto === "Novo" && item.direcao === "menor_melhor")) {
      const subiuEhBom = item.direcao !== "menor_melhor";
      tom = (sentido === "up") === subiuEhBom ? "bom" : "ruim";
    }
  }

  const seta = sentido === "up" ? "▲" : sentido === "down" ? "▼" : "•";
  const maiorValor = Math.max(Math.abs(valor), Math.abs(anterior), 1);

  const wrap = document.createElement("div");
  wrap.className = "comparativo-periodo";
  wrap.innerHTML = `
    <div class="comparativo-periodo__topo">
      <span class="comparativo-periodo__badge comparativo-periodo__badge--${tom}">${seta} ${texto}</span>
      <span class="comparativo-periodo__anterior">Anterior: ${formatarPorTipo(anterior, item.format)}</span>
    </div>
    <div class="kpi-card__comparativo-visual">
      <div><span>Atual</span><i><b class="kpi-card__barra-atual" style="width: ${(Math.abs(valor) / maiorValor) * 100}%"></b></i></div>
      <div><span>Anterior</span><i><b class="kpi-card__barra-anterior" style="width: ${(Math.abs(anterior) / maiorValor) * 100}%"></b></i></div>
    </div>
  `;
  return wrap;
}

function renderizarVisaoGeral(indicadores, temDados = true, carregando = false, indicadoresAnterior = null) {
  const grid = document.getElementById("visao-geral-grid") || document.querySelector(".visao-geral-grid") || document.querySelector(".overview-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (carregando) {
    exibirCarregamento(grid, 3);
    return;
  }
  if (!temDados) {
    exibirEstadoVazio(grid, "Nenhum resultado comercial para o período selecionado.");
    return;
  }

  cardsVisaoGeral.forEach((item) => {
    const valor = indicadores[item.key] ?? 0;
    const card = document.createElement("div");
    card.className = "overview-card" + (item.featured ? " overview-card--featured" : "");

    const label = document.createElement("p");
    label.className = "overview-card__label";
    label.textContent = item.label;

    const valorEl = document.createElement("p");
    valorEl.className = "overview-card__value";
    valorEl.textContent = formatarPorTipo(0, item.format);

    card.appendChild(label);
    card.appendChild(valorEl);
    if (indicadoresAnterior) {
      card.appendChild(criarComparativoPeriodo(item, valor, indicadoresAnterior[item.key]));
    }
    grid.appendChild(card);

    animarValor(valorEl, valor, item.format);
  });
}

function renderizarIndicadoresFinanceiros(indicadores, temDados = true, carregando = false, indicadoresAnterior = null) {
  const grid = document.getElementById("indicadores-grid") || document.querySelector(".ind-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (carregando) {
    exibirCarregamento(grid, 7);
    return;
  }
  if (!temDados) {
    exibirEstadoVazio(grid, "Não há indicadores financeiros para este período.");
    return;
  }

  cardsIndicadoresFinanceiros.forEach((item, index) => {
    const valor = indicadores[item.key] ?? 0;
    const card = document.createElement("div");
    card.className = "ind-card";
    card.style.setProperty("--i", index);

    const label = document.createElement("p");
    label.className = "ind-card__label";
    label.textContent = item.label;

    const valorEl = document.createElement("p");
    valorEl.className = "ind-card__value";
    valorEl.textContent = formatarPorTipo(0, item.format);

    card.appendChild(label);
    card.appendChild(valorEl);

    if (item.description) {
      const desc = document.createElement("p");
      desc.className = "ind-card__desc";
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    if (indicadoresAnterior) {
      card.appendChild(criarComparativoPeriodo(item, valor, indicadoresAnterior[item.key]));
    }

    grid.appendChild(card);
    animarValor(valorEl, valor, item.format);
  });
}

function descreverArco(cx, cy, raio, inicio, fim) {
  const coordenada = (angulo) => {
    const radianos = (angulo - 90) * Math.PI / 180;
    return { x: cx + raio * Math.cos(radianos), y: cy + raio * Math.sin(radianos) };
  };
  const pontoInicial = coordenada(inicio);
  const pontoFinal = coordenada(fim);
  const arcoLongo = fim - inicio > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${pontoInicial.x} ${pontoInicial.y} A ${raio} ${raio} 0 ${arcoLongo} 1 ${pontoFinal.x} ${pontoFinal.y} Z`;
}

const CORES_BANCOS = {
  pan: "#06ACF4",
  omni: "#E8541A",
  bv: "#99274F",
  santander: "#E40104",
  motrix: "#01C9C1",
  c6: "#FAD471"
};

// Cores usadas quando o banco não está no mapa acima
const CORES_BANCOS_FALLBACK = ["#7C5CFF", "#22C55E", "#F97316", "#38BDF8", "#EC4899", "#A3A3A3"];

function normalizarNomeBanco(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function corDoBanco(nome, indice) {
  const normalizado = normalizarNomeBanco(nome);
  const tokens = normalizado.split(" ");
  for (const chave of Object.keys(CORES_BANCOS)) {
    if (tokens.includes(chave) || normalizado.replace(/\s/g, "") === chave) return CORES_BANCOS[chave];
  }
  return CORES_BANCOS_FALLBACK[indice % CORES_BANCOS_FALLBACK.length];
}

function renderizarBancos(bancos, temDados = true, carregando = false) {
  const card = document.getElementById("banco-card");
  if (!card) return;
  card.innerHTML = "";

  if (carregando) {
    exibirCarregamento(card, 1);
    return;
  }
  if (!temDados || !bancos.length) {
    exibirEstadoVazio(card, "Nenhum lançamento bancário para o período selecionado.");
    return;
  }

  const total = bancos.reduce((soma, banco) => soma + banco.lancamentos, 0);
  const visual = document.createElement("div");
  visual.className = "banco-chart";

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Distribuição de ${total} lançamento(s) por banco`);

  const titulo = document.createElementNS(svgNs, "title");
  titulo.textContent = "Distribuição de lançamentos por banco";
  svg.appendChild(titulo);

  const tooltip = document.createElement("div");
  tooltip.className = "banco-chart__tooltip";
  tooltip.setAttribute("role", "status");
  tooltip.setAttribute("aria-live", "polite");

  const atualizarPosicaoTooltip = (evento) => {
    const limites = visual.getBoundingClientRect();
    tooltip.style.left = `${evento.clientX - limites.left + 14}px`;
    tooltip.style.top = `${evento.clientY - limites.top + 14}px`;
  };

  const exibirTooltip = (evento, banco, percentual, fatia) => {
    visual.querySelectorAll(".banco-chart__slice.is-active").forEach((item) => item.classList.remove("is-active"));
    fatia.classList.add("is-active");
    tooltip.innerHTML = "";
    const nome = document.createElement("strong");
    nome.textContent = banco.nome;
    const valor = document.createElement("span");
    valor.textContent = `${formatarNumero(banco.lancamentos)} lançamento(s) · ${formatarPercentual(percentual)}`;
    tooltip.append(nome, valor);
    tooltip.classList.add("is-visible");
    atualizarPosicaoTooltip(evento);
  };

  const ocultarTooltip = (fatia) => {
    fatia.classList.remove("is-active");
    tooltip.classList.remove("is-visible");
  };

  let angulo = 0;
  bancos.forEach((banco, indice) => {
    const proximoAngulo = angulo + (banco.lancamentos / total) * 360;
    const fatia = document.createElementNS(svgNs, "path");
    fatia.setAttribute("class", "banco-chart__slice");
    fatia.style.fill = corDoBanco(banco.nome, indice);
    fatia.setAttribute("d", proximoAngulo - angulo >= 359.999
      ? "M 100 30 A 70 70 0 1 1 99.99 30 Z"
      : descreverArco(100, 100, 70, angulo, proximoAngulo));
    fatia.setAttribute("tabindex", "0");
    fatia.setAttribute("aria-label", `${banco.nome}: ${banco.lancamentos} lançamento(s)`);
    const percentual = (banco.lancamentos / total) * 100;
    fatia.addEventListener("pointerenter", (evento) => exibirTooltip(evento, banco, percentual, fatia));
    fatia.addEventListener("pointermove", atualizarPosicaoTooltip);
    fatia.addEventListener("pointerleave", () => ocultarTooltip(fatia));
    fatia.addEventListener("focus", () => {
      exibirTooltip({ clientX: 120, clientY: 100 }, banco, percentual, fatia);
    });
    fatia.addEventListener("blur", () => ocultarTooltip(fatia));
    svg.appendChild(fatia);
    angulo = proximoAngulo;
  });

  visual.appendChild(svg);

  const detalhes = document.createElement("div");
  detalhes.className = "banco-chart__details";
  const resumo = document.createElement("p");
  resumo.className = "banco-chart__summary";
  resumo.innerHTML = `<strong>${formatarNumero(total)}</strong><span>${total === 1 ? "lançamento" : "lançamentos"}</span>`;

  const legenda = document.createElement("ul");
  legenda.className = "banco-chart__legend";
  bancos.forEach((banco, indice) => {
    const percentual = (banco.lancamentos / total) * 100;
    const item = document.createElement("li");
    item.innerHTML = `<span class="banco-chart__marker" style="background:${corDoBanco(banco.nome, indice)}"></span><span class="banco-chart__name"></span><strong>${formatarNumero(banco.lancamentos)} · ${formatarPercentual(percentual)}</strong>`;
    item.querySelector(".banco-chart__name").textContent = banco.nome;
    legenda.appendChild(item);
  });

  detalhes.append(resumo, legenda);
  visual.append(detalhes, tooltip);
  card.appendChild(visual);
}

function criarCardSDR(sdr, participacao) {
  const card = document.createElement("div");
  card.className = "sdr-card";
  const possuiDados = sdrPossuiDados(sdr);

  card.innerHTML = `
    <div class="sdr-card__head">
      <div class="sdr-card__avatar">${iniciaisDoNome(sdr.nome)}</div>
      <div>
        <p class="sdr-card__name">${sdr.nome}</p>
        <p class="sdr-card__role">${sdr.cargo || "SDR"}</p>
      </div>
    </div>
  `;

  if (!possuiDados) {
    const vazio = document.createElement("p");
    vazio.className = "sdr-card__empty";
    vazio.textContent = "Sem dados no período";
    card.appendChild(vazio);
    return card;
  }

  const stats = document.createElement("div");
  stats.className = "sdr-card__stats";
  stats.innerHTML = `
    <div><p class="sdr-stat__label">Contratos</p><p class="sdr-stat__value" data-stat="contratos">0</p></div>
    <div><p class="sdr-stat__label">Faturamento</p><p class="sdr-stat__value" data-stat="faturamento">R$ 0</p></div>
    <div><p class="sdr-stat__label">Retorno</p><p class="sdr-stat__value" data-stat="retorno">R$ 0</p></div>
    <div><p class="sdr-stat__label">TAC</p><p class="sdr-stat__value" data-stat="tac">R$ 0</p></div>
    <div><p class="sdr-stat__label">Ticket médio</p><p class="sdr-stat__value" data-stat="ticketMedio">R$ 0</p></div>
  `;
  card.appendChild(stats);

  const participacaoWrap = document.createElement("div");
  participacaoWrap.className = "sdr-card__participacao";
  participacaoWrap.innerHTML = `
    <div class="sdr-participacao__label">
      <span>Participação nos contratos</span>
      <span class="sdr-participacao__value">${formatarPercentual(participacao)}</span>
    </div>
    <div class="sdr-participacao__track">
      <div class="sdr-participacao__fill"></div>
    </div>
  `;
  card.appendChild(participacaoWrap);

  animarValor(card.querySelector('[data-stat="contratos"]'), sdr.contratos, "numero");
  animarValor(card.querySelector('[data-stat="faturamento"]'), sdr.faturamento, "moeda");
  animarValor(card.querySelector('[data-stat="retorno"]'), sdr.retorno, "moeda");
  animarValor(card.querySelector('[data-stat="tac"]'), sdr.tac, "moeda");
  animarValor(card.querySelector('[data-stat="ticketMedio"]'), sdr.ticketMedio, "moeda");

  requestAnimationFrame(() => {
    const fill = card.querySelector(".sdr-participacao__fill");
    if (fill) fill.style.width = `${Math.min(participacao, 100)}%`;
  });

  return card;
}

function renderizarSDRs(sdrs, totalContratos) {
  const grid = document.getElementById("sdr-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!sdrs.length) {
    grid.innerHTML = `<p class="sdr-card__empty">Nenhum registro para este período.</p>`;
    return;
  }
  sdrs.forEach((sdr) => {
    const participacao = calcularParticipacao(sdr, totalContratos);
    grid.appendChild(criarCardSDR(sdr, participacao));
  });
}

const NOMES_VENDEDORES = ["Rafaella", "Wesley", "Vinicius", "Luan", "Sérgio", "Moisés"];

function agruparDesempenhoVendedores(lancamentos, custoPorAprovado = 0) {
  const agrupados = new Map(NOMES_VENDEDORES.map((nome) => [nome, {
    nome,
    aprovados: 0,
    vendas: 0,
    faturamento: 0,
    ticketMedio: 0
  }]));

  lancamentos.forEach((lancamento) => {
    const nome = lancamento.vendedor;
    if (!agrupados.has(nome)) {
      agrupados.set(nome, { nome, aprovados: 0, vendas: 0, faturamento: 0, ticketMedio: 0 });
    }
    const vendedor = agrupados.get(nome);
    vendedor.aprovados += lancamento.aprovados;
    vendedor.vendas += lancamento.vendas;
    vendedor.faturamento += lancamento.faturamento;
  });

  return [...agrupados.values()].map((vendedor) => ({
    ...vendedor,
    ticketMedio: vendedor.vendas > 0 ? vendedor.faturamento / vendedor.vendas : 0,
    // Custo total investido nos aprovados desse vendedor, com base no
    // custo por aprovado (global) calculado na aba Marketing.
    custoAprovados: vendedor.aprovados * custoPorAprovado,
    // Quantos dos aprovados desse vendedor viraram venda.
    conversaoAprovados: vendedor.aprovados > 0 ? (vendedor.vendas / vendedor.aprovados) * 100 : 0
  }));
}

function criarCardVendedor(vendedor, totalVendas) {
  const nd = vendedor.indisponivel ? "—" : null;
  const participacao = totalVendas > 0 ? (vendedor.vendas / totalVendas) * 100 : 0;
  const card = document.createElement("article");
  card.className = "vendedor-card";
  card.innerHTML = `
    <div class="vendedor-card__head">
      <span class="vendedor-card__avatar">${iniciaisDoNome(vendedor.nome)}</span>
      <h3>${vendedor.nome}</h3>
    </div>
    <div class="vendedor-card__metrics">
      <div><span>Aprovados</span><strong>${nd || formatarNumero(vendedor.aprovados)}</strong></div>
      <div><span>Vendas</span><strong>${nd || formatarNumero(vendedor.vendas)}</strong></div>
      <div><span>Custo dos aprovados</span><strong>${nd || formatarMoeda(vendedor.custoAprovados)}</strong></div>
      <div><span>Valor da venda</span><strong>${nd || formatarMoeda(vendedor.faturamento)}</strong></div>
      <div><span>Ticket médio</span><strong>${nd || formatarMoeda(vendedor.ticketMedio)}</strong></div>
    </div>
    <div class="vendedor-card__participacao">
      <div><span>Participação nas vendas</span><strong>${nd || formatarPercentual(participacao)}</strong></div>
      <div class="vendedor-card__track"><i style="width:${nd ? 0 : Math.min(participacao, 100)}%"></i></div>
    </div>
    <div class="vendedor-card__participacao">
      <div><span>Conversão aprovados → vendas</span><strong>${nd || formatarPercentual(vendedor.conversaoAprovados)}</strong></div>
      <div class="vendedor-card__track"><i style="width:${nd ? 0 : Math.min(vendedor.conversaoAprovados, 100)}%"></i></div>
    </div>
  `;
  return card;
}

/* Aviso acima dos cards de vendedores: falhas de leitura e divergências entre as fontes. */
function atualizarAvisoVendedores(grid, avisos) {
  let aviso = document.getElementById("vendedores-aviso");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "vendedores-aviso";
    aviso.className = "aviso-dados";
    aviso.setAttribute("role", "status");
    grid.insertAdjacentElement("beforebegin", aviso);
  }
  aviso.hidden = avisos.length === 0;
  aviso.innerHTML = avisos.map((mensagem) => `<p>${mensagem}</p>`).join("");
}

function renderizarVendedores(dataInicio, dataFim, indicadoresMkt) {
  const grid = document.getElementById("vendedores-grid");
  if (!grid) return;

  const custoPorAprovado = indicadoresMkt ? indicadoresMkt.custoPorAprovado : 0;
  const avisos = [];
  const vendedoresSemDados = Boolean(errosCarga.vendedores) && !todosLancamentosVendedores.length;
  const outrosSemDados = Boolean(errosCarga.outros) && !todosLancamentosOutros.length;

  if (errosCarga.vendedores) {
    avisos.push(vendedoresSemDados
      ? "Não foi possível carregar o desempenho dos vendedores (aba MARKETING, colunas H:O)."
      : "A última atualização dos vendedores falhou; exibindo os dados carregados anteriormente.");
  }
  if (errosCarga.outros) {
    avisos.push(outrosSemDados
      ? "Não foi possível carregar os dados de Outros (aba MARKETING, colunas Q:T)."
      : "A última atualização de Outros falhou; exibindo os dados carregados anteriormente.");
  }

  const lancamentos = filtrarVendedoresPorIntervalo(dataInicio, dataFim);
  const vendedores = agruparDesempenhoVendedores(lancamentos, custoPorAprovado);
  const outros = filtrarOutrosPorIntervalo(dataInicio, dataFim).reduce((acc, l) => ({
    aprovados: acc.aprovados + l.aprovados,
    vendas: acc.vendas + l.vendas,
    faturamento: acc.faturamento + l.faturamento
  }), { aprovados: 0, vendas: 0, faturamento: 0 });

  /* Conferência: o card de Marketing vem da tabela diária; os vendedores vêm de outra tabela.
     Se as duas não fecharem, alguém digitou algo diferente em uma delas. */
  const tudoCarregado = dadosVendedoresCarregados && dadosOutrosCarregados && dadosMarketingCarregados;
  const semErros = !errosCarga.vendedores && !errosCarga.outros && !errosCarga.marketing;
  if (tudoCarregado && semErros && indicadoresMkt) {
    const somaVendas = vendedores.reduce((t, v) => t + v.vendas, 0) + outros.vendas;
    const somaAprovados = vendedores.reduce((t, v) => t + v.aprovados, 0) + outros.aprovados;
    const confere = (rotulo, somaVendedores, totalMarketing) => {
      const dif = Math.round(somaVendedores) - Math.round(totalMarketing);
      if (dif !== 0) {
        avisos.push(`${rotulo}: vendedores + Outros somam ${formatarNumero(somaVendedores)}, mas o card de Marketing mostra ${formatarNumero(totalMarketing)} (diferença de ${formatarNumero(Math.abs(dif))}). Confira a planilha.`);
      }
    };
    confere("Aprovados", somaAprovados, indicadoresMkt.aprovacoes);
    confere("Vendas", somaVendas, indicadoresMkt.vendas);
  }

  atualizarAvisoVendedores(grid, avisos);

  if (vendedoresSemDados) {
    exibirEstadoVazio(grid, "Desempenho dos vendedores indisponível no momento.");
    return;
  }

  const totalVendas = vendedores.reduce((total, vendedor) => total + vendedor.vendas, 0) + outros.vendas;
  grid.innerHTML = "";

  vendedores.forEach((vendedor) => grid.appendChild(criarCardVendedor(vendedor, totalVendas)));
  grid.appendChild(criarCardVendedor(outrosSemDados ? { nome: "Outros", indisponivel: true } : {
    nome: "Outros",
    aprovados: outros.aprovados,
    vendas: outros.vendas,
    faturamento: outros.faturamento,
    ticketMedio: outros.vendas > 0 ? outros.faturamento / outros.vendas : 0,
    custoAprovados: outros.aprovados * custoPorAprovado,
    conversaoAprovados: outros.aprovados > 0 ? (outros.vendas / outros.aprovados) * 100 : 0
  }, totalVendas));
}

function renderizarComparativo(sdrs, totalContratos) {
  const tbody = document.getElementById("comparativo-tbody");
  const cardsWrap = document.getElementById("comparativo-cards");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (cardsWrap) cardsWrap.innerHTML = "";

  if (!sdrs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty-state">Nenhum resultado para o período selecionado.</td></tr>';
    if (cardsWrap) exibirEstadoVazio(cardsWrap, "Nenhum resultado para o período selecionado.");
    return;
  }

  sdrs.forEach((sdr) => {
    const participacao = calcularParticipacao(sdr, totalContratos);

    const linha = document.createElement("tr");
    linha.innerHTML = `
      <td class="destaque-sdr">${sdr.nome}</td>
      <td>${formatarNumero(sdr.contratos)}</td>
      <td>${formatarMoeda(sdr.faturamento)}</td>
      <td>${formatarMoeda(sdr.ticketMedio)}</td>
      <td>${formatarMoeda(sdr.retorno)}</td>
      <td>${formatarMoeda(sdr.tac)}</td>
      <td>${formatarPercentual(participacao)}</td>
    `;
    tbody.appendChild(linha);

    if (cardsWrap) {
      const card = document.createElement("div");
      card.className = "comparativo-card";
      card.innerHTML = `
        <p class="comparativo-card__nome">${sdr.nome}</p>
        <div class="comparativo-card__linha"><span>Contratos</span><span>${formatarNumero(sdr.contratos)}</span></div>
        <div class="comparativo-card__linha"><span>Faturamento</span><span>${formatarMoeda(sdr.faturamento)}</span></div>
        <div class="comparativo-card__linha"><span>Ticket médio</span><span>${formatarMoeda(sdr.ticketMedio)}</span></div>
        <div class="comparativo-card__linha"><span>Retorno</span><span>${formatarMoeda(sdr.retorno)}</span></div>
        <div class="comparativo-card__linha"><span>TAC</span><span>${formatarMoeda(sdr.tac)}</span></div>
        <div class="comparativo-card__linha"><span>Participação</span><span>${formatarPercentual(participacao)}</span></div>
      `;
      cardsWrap.appendChild(card);
    }
  });
}

function renderizarRanking(ranking) {
  const lista = document.getElementById("ranking-lista");
  if (!lista) return;
  lista.innerHTML = "";

  if (!ranking.length) {
    lista.innerHTML = `<p class="sdr-card__empty">Sem dados de ranking no período.</p>`;
    return;
  }

  ranking.forEach((sdr, index) => {
    const item = document.createElement("div");
    item.className = "ranking-item" + (index === 0 && sdr.contratos > 0 ? " ranking-item--top" : "");
    item.style.setProperty("--i", index);

    item.innerHTML = `
      <div class="ranking-item__pos">${index + 1}º</div>
      <div>
        <p class="ranking-item__nome">${sdr.nome}</p>
        <p class="ranking-item__meta">${sdr.contratos > 0 ? formatarNumero(sdr.contratos) + " contrato(s)" : "Sem vendas no período"}</p>
      </div>
      <div class="ranking-item__valor">${sdr.faturamento > 0 ? formatarMoeda(sdr.faturamento) : "—"}</div>
    `;
    lista.appendChild(item);
  });
}

/* ---------- MARKETING ---------- */
function calcularStatusMeta(valor, metaValor, direcao) {
  if (direcao === "maior_melhor") return valor >= metaValor ? "ok" : "alerta";
  return valor <= metaValor ? "ok" : "alerta";
}

function textoStatusMeta(status, direcao) {
  if (status === "ok") return "Dentro da meta";
  return direcao === "maior_melhor" ? "Abaixo do esperado" : "Acima da meta";
}

function criarKpiCard(item, valor, indicadores, indicadoresAnterior) {
  const card = document.createElement("div");
  card.className = "kpi-card";

  const label = document.createElement("p");
  label.className = "kpi-card__label";
  label.textContent = item.label;

  const valorEl = document.createElement("p");
  valorEl.className = "kpi-card__value";
  valorEl.textContent = formatarPorTipo(0, item.format);

  card.appendChild(label);
  card.appendChild(valorEl);

  if (item.percentualKey) {
    const percentualValor = (indicadores && indicadores[item.percentualKey]) ?? 0;
    const sub = document.createElement("p");
    sub.className = "kpi-card__sub";
    sub.textContent = `${formatarPercentual(percentualValor)}${item.percentualLabel ? " " + item.percentualLabel : ""}`;
    card.appendChild(sub);
  }

  if (item.comparar && indicadoresAnterior) {
    card.appendChild(criarComparativoPeriodo(item, valor, indicadoresAnterior[item.key]));
  }

  if (item.metaValor !== undefined) {
    const status = calcularStatusMeta(valor, item.metaValor, item.direcao);

    const metaWrap = document.createElement("div");
    metaWrap.className = "kpi-card__meta";

    const metaLabel = document.createElement("span");
    metaLabel.className = "kpi-card__meta-label";
    metaLabel.textContent = `${item.metaLabel} ${formatarPorTipo(item.metaValor, item.format)}`;

    const badge = document.createElement("span");
    badge.className = `kpi-card__meta-badge kpi-card__meta-badge--${status}`;
    badge.textContent = textoStatusMeta(status, item.direcao);

    metaWrap.appendChild(metaLabel);
    metaWrap.appendChild(badge);
    card.appendChild(metaWrap);
  }

  animarValor(valorEl, valor, item.format);
  return card;
}

function renderizarMarketing(indicadores, indicadoresAnterior, temDados = true, carregando = false) {
  const grid = document.getElementById("marketing-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (carregando) {
    exibirCarregamento(grid, cardsMarketing.length);
    return;
  }
  if (!temDados) {
    exibirEstadoVazio(grid, "Nenhum resultado de Marketing para o período selecionado.");
    return;
  }

  cardsMarketing.forEach((item, index) => {
    const valor = indicadores[item.key] ?? 0;
    const card = criarKpiCard(item, valor, indicadores, indicadoresAnterior);
    card.style.setProperty("--i", index);
    grid.appendChild(card);
  });
}

function renderizarCriativosCampeoes() {
  const grid = document.getElementById("criativos-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!criativosCarregados) {
    exibirCarregamento(grid, 2);
    return;
  }
  if (errosCarga.criativos) {
    exibirEstadoVazio(grid, `Não foi possível carregar os criativos: ${errosCarga.criativos}`);
    return;
  }
  if (!criativosCampeoes.length) {
    exibirEstadoVazio(grid, "Nenhum criativo cadastrado na planilha.");
    return;
  }
  const tabela = document.createElement("table");
  tabela.className = "criativos-table";
  tabela.innerHTML = `
    <thead><tr><th scope="col" class="criativos-table__rank-heading">#</th><th scope="col">LINK</th><th scope="col">QUANTIDADE APROVADOS</th></tr></thead>
    <tbody></tbody>
  `;
  const corpo = tabela.querySelector("tbody");
  const ordenados = [...criativosCampeoes].sort((a, b) => b.quantidade - a.quantidade);
  ordenados.forEach((criativo) => {
    let url;
    try { url = new URL(criativo.link); } catch { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    const linha = document.createElement("tr");
    const celulaRank = document.createElement("td");
    celulaRank.className = "criativos-table__rank-cell";
    celulaRank.dataset.label = "RANKING";
    const posicao = document.createElement("span");
    const colocacao = corpo.children.length + 1;
    posicao.className = `criativo-rank${colocacao <= 3 ? ` criativo-rank--top-${colocacao}` : ""}`;
    posicao.textContent = String(colocacao);
    celulaRank.appendChild(posicao);

    const celulaLink = document.createElement("td");
    celulaLink.dataset.label = "LINK";
    const link = document.createElement("a");
    link.className = "criativo-link";
    link.href = url.href;
    link.textContent = criativo.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    celulaLink.appendChild(link);

    const celulaQuantidade = document.createElement("td");
    celulaQuantidade.dataset.label = "QUANTIDADE APROVADOS";
    const quantidade = document.createElement("span");
    quantidade.className = "criativo-quantidade";
    quantidade.textContent = formatarNumero(criativo.quantidade);
    celulaQuantidade.appendChild(quantidade);
    linha.append(celulaRank, celulaLink, celulaQuantidade);
    corpo.appendChild(linha);
  });
  grid.appendChild(tabela);
}

function renderizarFunil(etapas, temDados = true, carregando = false) {
  const wrap = document.getElementById("funil-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (carregando) {
    exibirCarregamento(wrap, 3);
    return;
  }

  if (!temDados) {
    exibirEstadoVazio(wrap, "Não há dados suficientes para montar o funil neste período.");
    return;
  }

  if (!etapas || !etapas.length) return;

  const maiorValor = Math.max(...etapas.map((e) => e.valor), 1);

  etapas.forEach((etapa, index) => {
    if (index > 0) {
      const conexao = document.createElement("div");
      conexao.className = "funil-conexao";
      conexao.innerHTML = `
        <span class="funil-conexao__seta">↓</span>
        <span class="funil-conexao__texto">${formatarPercentual(etapa.percentual)} de conversão</span>
      `;
      wrap.appendChild(conexao);
    }

    const linha = document.createElement("div");
    linha.className = "funil-etapa";
    linha.style.setProperty("--i", index);
    linha.innerHTML = `
      <div class="funil-etapa__info">
        <span class="funil-etapa__label">${etapa.label}</span>
        <span class="funil-etapa__valor">${formatarNumero(etapa.valor)}</span>
      </div>
      <div class="funil-etapa__track">
        <div class="funil-etapa__fill"></div>
      </div>
      <span class="funil-etapa__percentual">${formatarPercentual(etapa.percentual)}</span>
    `;
    wrap.appendChild(linha);

    requestAnimationFrame(() => {
      const fill = linha.querySelector(".funil-etapa__fill");
      const largura = (etapa.valor / maiorValor) * 100;
      if (fill) fill.style.width = `${Math.max(largura, 3)}%`;
    });
  });
}

/* Recebe o mesmo período do filtro único do cabeçalho e atualiza a aba Marketing.
   Retorna os indicadores calculados para que outras seções (ex: cards de
   vendedores) possam reaproveitar valores como o custo por aprovado. */
function atualizarMarketingPorData(inicioVal, fimVal) {
  const dadosMkt = filtrarMarketingPorIntervalo(inicioVal, fimVal);
  const temDados = dadosMkt.totalRegistros > 0;
  const carregando = !dadosMarketingCarregados;
  renderizarMarketing(dadosMkt.indicadores, dadosMkt.indicadoresAnterior, temDados, carregando);

  const subMkt = document.querySelector("#painel-marketing .marketing-heading p");
  if (subMkt) {
    subMkt.textContent = dadosMkt.temComparacao
      ? `Investimentos, metas de CAC e métricas de ${formatarDataBR(inicioVal)} a ${formatarDataBR(fimVal)}, comparado com ${formatarDataBR(dadosMkt.periodoAnterior.inicio)} a ${formatarDataBR(dadosMkt.periodoAnterior.fim)}.`
      : "Investimentos, metas de CAC e métricas do período. Selecione De e Até para comparar com o período anterior.";
  }
  renderizarFunil(dadosMkt.funil, temDados, carregando);
  return dadosMkt.indicadores;
}

/* ---------- CALENDÁRIO CUSTOMIZADO (substitui o <input type="date"> nativo) ---------- */
const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_SEMANA_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

function paraIso(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function fecharTodosOsCalendarios() {
  document.querySelectorAll(".date-calendar.is-visible").forEach((p) => p.classList.remove("is-visible"));
  document.querySelectorAll(".date-picker-wrap.is-open").forEach((w) => w.classList.remove("is-open"));
  const backdrop = document.querySelector(".date-calendar-backdrop");
  if (backdrop) backdrop.classList.remove("is-visible");
}

function obterBackdropCalendario() {
  let backdrop = document.querySelector(".date-calendar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "date-calendar-backdrop";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", fecharTodosOsCalendarios);
  }
  return backdrop;
}

function criarDatePicker(input) {
  const wrap = input.closest(".date-picker-wrap");
  if (!wrap || wrap.dataset.pickerReady) return;
  wrap.dataset.pickerReady = "true";

  const popup = document.createElement("div");
  popup.className = "date-calendar";
  popup.innerHTML = `
    <div class="date-calendar__header">
      <button type="button" class="date-calendar__nav-btn" data-nav="-1" aria-label="Mês anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="date-calendar__label"></span>
      <button type="button" class="date-calendar__nav-btn" data-nav="1" aria-label="Próximo mês">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="date-calendar__weekdays">${DIAS_SEMANA_PT.map((d) => `<span class="date-calendar__weekday">${d}</span>`).join("")}</div>
    <div class="date-calendar__days"></div>
    <div class="date-calendar__footer">
      <button type="button" class="date-calendar__today-btn">Hoje</button>
    </div>
  `;
  /* O popup é anexado diretamente ao <body> (fora do header) porque o header
     usa backdrop-filter, o que cria um novo contexto de empilhamento e também
     um "containing block" para elementos position:fixed. Se o popup ficasse
     dentro do header, ele nunca conseguiria ficar visualmente acima do
     .date-calendar-backdrop (que fica no <body>) nem manter o position:fixed
     relativo à tela — era exatamente isso que causava o calendário cortado
     e sem resposta a toques no celular. */
  document.body.appendChild(popup);

  const label = popup.querySelector(".date-calendar__label");
  const diasContainer = popup.querySelector(".date-calendar__days");
  const btnHoje = popup.querySelector(".date-calendar__today-btn");

  const hoje = new Date();
  let mesVisivel = hoje.getMonth();
  let anoVisivel = hoje.getFullYear();

  function isoAtual() {
    return input.dataset.iso || "";
  }

  function selecionarData(iso) {
    input.dataset.iso = iso;
    input.value = formatarDataBR(iso);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    fecharPopup();
  }

  function renderizarDias() {
    label.textContent = `${MESES_PT[mesVisivel]} de ${anoVisivel}`;
    diasContainer.innerHTML = "";

    const primeiroDiaSemana = new Date(anoVisivel, mesVisivel, 1).getDay();
    const totalDiasMes = new Date(anoVisivel, mesVisivel + 1, 0).getDate();
    const totalDiasMesAnterior = new Date(anoVisivel, mesVisivel, 0).getDate();
    const selecionado = isoAtual();
    const hojeIso = paraIso(hoje);

    const celulas = [];
    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      celulas.push(totalDiasMesAnterior - i);
    }
    const diasNoPassado = celulas.length;
    for (let d = 1; d <= totalDiasMes; d++) celulas.push(d);
    const diasAteAgora = celulas.length;
    let proximoDia = 1;
    while (celulas.length % 7 !== 0) {
      celulas.push(proximoDia);
      proximoDia++;
    }

    celulas.forEach((dia, i) => {
      const fora = i < diasNoPassado || i >= diasAteAgora;
      let mes = mesVisivel;
      let ano = anoVisivel;
      if (i < diasNoPassado) { mes -= 1; if (mes < 0) { mes = 11; ano -= 1; } }
      else if (i >= diasAteAgora) { mes += 1; if (mes > 11) { mes = 0; ano += 1; } }

      const iso = paraIso(new Date(ano, mes, dia));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-calendar__day";
      btn.textContent = dia;
      if (fora) btn.classList.add("date-calendar__day--outside");
      if (iso === hojeIso) btn.classList.add("date-calendar__day--today");
      if (iso === selecionado) btn.classList.add("date-calendar__day--selected");
      btn.addEventListener("click", () => selecionarData(iso));
      diasContainer.appendChild(btn);
    });
  }

  function posicionarPopup() {
    // Acima de 640px a posição é calculada em relação ao input (como um
    // dropdown). Em telas menores o CSS assume (calendário centralizado
    // na tela via media query), então limpamos qualquer estilo inline.
   const retangulo = wrap.getBoundingClientRect();
const larguraPopup = 280;
const margem = 12;

let esquerda = retangulo.left;

// Se não couber à direita, alinha o calendário pela borda direita do campo.
if (esquerda + larguraPopup > window.innerWidth - margem) {
  esquerda = retangulo.right - larguraPopup;
}

// Garante uma margem mínima também à esquerda.
esquerda = Math.max(margem, esquerda);

popup.style.top = `${retangulo.bottom + 8}px`;
popup.style.left = `${esquerda}px`;
  }

  function abrirPopup() {
    if (isoAtual()) {
      const [a, m] = isoAtual().split("-");
      anoVisivel = parseInt(a, 10);
      mesVisivel = parseInt(m, 10) - 1;
    } else {
      anoVisivel = hoje.getFullYear();
      mesVisivel = hoje.getMonth();
    }
    renderizarDias();
    fecharTodosOsCalendarios();
    posicionarPopup();
    popup.classList.add("is-visible");
    wrap.classList.add("is-open");
    obterBackdropCalendario().classList.add("is-visible");
  }

  function fecharPopup() {
    popup.classList.remove("is-visible");
    wrap.classList.remove("is-open");
    obterBackdropCalendario().classList.remove("is-visible");
  }

  input.addEventListener("click", (e) => {
    e.stopPropagation();
    popup.classList.contains("is-visible") ? fecharPopup() : abrirPopup();
  });

  popup.addEventListener("click", (e) => e.stopPropagation());

  popup.querySelectorAll(".date-calendar__nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mesVisivel += parseInt(btn.dataset.nav, 10);
      if (mesVisivel < 0) { mesVisivel = 11; anoVisivel -= 1; }
      if (mesVisivel > 11) { mesVisivel = 0; anoVisivel += 1; }
      renderizarDias();
    });
  });

  btnHoje.addEventListener("click", () => selecionarData(paraIso(hoje)));

  window.addEventListener("click", fecharPopup);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharPopup();
  });
  window.addEventListener("resize", () => {
    if (popup.classList.contains("is-visible")) posicionarPopup();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (popup.classList.contains("is-visible")) posicionarPopup();
    },
    true
  );
}

function inicializarDatePickers() {
  document.querySelectorAll(".date-picker-wrap .date-input").forEach(criarDatePicker);
}

/* ---------- ABAS ---------- */
function inicializarAbas() {
  const botoes = document.querySelectorAll(".tab-btn");
  const paineis = document.querySelectorAll(".tab-panel");
  if (!botoes.length) return;

  botoes.forEach((btn) => {
    btn.addEventListener("click", () => {
      botoes.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      paineis.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      const alvo = document.getElementById(btn.dataset.tab);
      if (alvo) alvo.classList.add("active");
    });
  });
}

/* ---------- FILTRAGEM & ATUALIZAÇÃO DA TELA ---------- */
function atualizarDashboardPorData() {
  const inputInicio = document.getElementById("data-inicio");
  const inputFim = document.getElementById("data-fim");

  const inicioVal = inputInicio ? (inputInicio.dataset.iso || "") : "";
  const fimVal = inputFim ? (inputFim.dataset.iso || "") : "";

  // Atualiza a legenda da Visão Geral
  const subtituloVisaoGeral = document.querySelector(".section__subtitle");
  if (subtituloVisaoGeral) {
    if (inicioVal && fimVal) {
      const ant = calcularPeriodoAnteriorEquivalente(inicioVal, fimVal);
      subtituloVisaoGeral.textContent = `Resumo dos resultados comerciais de ${formatarDataBR(inicioVal)} a ${formatarDataBR(fimVal)}, comparado com ${formatarDataBR(ant.inicio)} a ${formatarDataBR(ant.fim)}.`;
    } else {
      subtituloVisaoGeral.textContent = "Resumo dos resultados comerciais do período selecionado. Selecione De e Até para comparar com o período anterior.";
    }
  }

  const dados = filtrarDadosPorIntervalo(inicioVal, fimVal);
  const totais = calcularTotais(dados.sdrs);
  const totalContratos = dados.indicadores.contratos || totais.contratos;

  const temDados = dados.totalRegistros > 0;
  const carregando = !dadosComerciaisCarregados;
  const anteriorComercial = dados.temComparacao ? dados.indicadoresAnterior : null;
  renderizarVisaoGeral(dados.indicadores, temDados, carregando, anteriorComercial);
  renderizarIndicadoresFinanceiros(dados.indicadores, temDados, carregando, anteriorComercial);
  renderizarBancos(dados.bancos, temDados, carregando);
  renderizarSDRs(dados.sdrs, totalContratos);
  renderizarComparativo(dados.sdrs, totalContratos);

  const ranking = ordenarRanking(dados.sdrs);
  renderizarRanking(ranking);

  // O mesmo período selecionado no cabeçalho também filtra a aba Marketing.
  // O custo por aprovado calculado ali é reaproveitado nos cards de vendedores.
  const indicadoresMkt = atualizarMarketingPorData(inicioVal, fimVal);
  renderizarVendedores(inicioVal, fimVal, indicadoresMkt);
}

function inicializarFiltrosDeData() {
  const inputInicio = document.getElementById("data-inicio");
  const inputFim = document.getElementById("data-fim");

  if (!inputInicio || !inputFim) return;

  inputInicio.removeEventListener("change", atualizarDashboardPorData);
  inputFim.removeEventListener("change", atualizarDashboardPorData);

  inputInicio.addEventListener("change", atualizarDashboardPorData);
  inputFim.addEventListener("change", atualizarDashboardPorData);

  const btnLimpar = document.getElementById("limpar-filtros");
  const atualizarVisibilidadeLimpar = () => {
    btnLimpar.hidden = !(inputInicio.dataset.iso || inputFim.dataset.iso);
  };

  inputInicio.addEventListener("change", atualizarVisibilidadeLimpar);
  inputFim.addEventListener("change", atualizarVisibilidadeLimpar);

  if (btnLimpar && !btnLimpar.dataset.inicializado) {
    btnLimpar.dataset.inicializado = "true";
    btnLimpar.addEventListener("click", () => {
      inputInicio.value = "";
      inputFim.value = "";
      delete inputInicio.dataset.iso;
      delete inputFim.dataset.iso;
      atualizarVisibilidadeLimpar();
      atualizarDashboardPorData();
    });
  }

  atualizarDashboardPorData();
  atualizarVisibilidadeLimpar();
}

/* ---------- EVENTOS GLOBAIS DE CARREGAMENTO ----------
   Os callbacks só registram sucesso/erro de cada fonte. A tela é redesenhada UMA vez,
   em carregarTudo(), quando as quatro leituras terminam. */
const mensagemDeErro = (erro) => (erro && erro.message) || "conexão indisponível";

window.aoCarregarDados = function () {
  dadosComerciaisCarregados = true;
  errosCarga.comercial = null;
};
window.aoFalharCarregamento = function (erro) {
  dadosComerciaisCarregados = true;
  errosCarga.comercial = mensagemDeErro(erro);
};

window.aoCarregarDadosMarketing = function () {
  dadosMarketingCarregados = true;
  errosCarga.marketing = null;
};
window.aoCarregarDadosCriativos = function () {
  criativosCarregados = true;
  errosCarga.criativos = null;
  renderizarCriativosCampeoes();
};
window.aoFalharCarregamentoCriativos = function (erro) {
  criativosCarregados = true;
  errosCarga.criativos = mensagemDeErro(erro);
  renderizarCriativosCampeoes();
};
window.aoFalharCarregamentoMarketing = function (erro) {
  dadosMarketingCarregados = true;
  errosCarga.marketing = mensagemDeErro(erro);
};

window.aoCarregarDadosVendedores = function () {
  dadosVendedoresCarregados = true;
  errosCarga.vendedores = null;
};
window.aoFalharCarregamentoVendedores = function (erro) {
  dadosVendedoresCarregados = true;
  errosCarga.vendedores = mensagemDeErro(erro);
  console.error("Painel de vendedores indisponível:", erro);
};

window.aoCarregarDadosOutros = function () {
  dadosOutrosCarregados = true;
  errosCarga.outros = null;
};
window.aoFalharCarregamentoOutros = function (erro) {
  dadosOutrosCarregados = true;
  errosCarga.outros = mensagemDeErro(erro);
  console.error("Campo Outros indisponível:", erro);
};

function atualizarStatusSincronizacao() {
  const hora = ultimaAtualizacao
    ? ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const falhas = Object.keys(errosCarga).filter((chave) => errosCarga[chave]);

  const statusEl = document.querySelector(".header__updated");
  const caixa = document.querySelector(".status-box");
  if (statusEl) {
    statusEl.textContent = falhas.length
      ? `Falha ao atualizar (${falhas.map((k) => ROTULOS_FONTES[k]).join(", ")}) às ${hora}`
      : `Atualizado às ${hora}`;
    statusEl.title = falhas.map((k) => `${ROTULOS_FONTES[k]}: ${errosCarga[k]}`).join("\n");
  }
  if (caixa) caixa.classList.toggle("status-box--erro", falhas.length > 0);

  const marketingEl = document.getElementById("marketing-status");
  if (marketingEl) {
    marketingEl.textContent = errosCarga.marketing
      ? `Erro ao carregar Meta Ads: ${errosCarga.marketing}`
      : `Atualizado às ${hora}`;
  }
}

let carregandoAgora = false;

async function carregarTudo() {
  if (carregandoAgora) return;
  carregandoAgora = true;
  try {
    await Promise.allSettled([
      carregarDadosDaPlanilha(),
      carregarDadosMarketing(),
      carregarDadosVendedores(),
      carregarDadosOutros(),
      carregarDadosCriativos()
    ]);
  } finally {
    carregandoAgora = false;
  }
  ultimaAtualizacao = new Date();
  atualizarStatusSincronizacao();
  atualizarDashboardPorData();
}

function iniciarAtualizacaoAutomatica() {
  setInterval(() => {
    if (!document.hidden) carregarTudo();
  }, INTERVALO_ATUALIZACAO_MS);

  // Ao voltar para a aba depois de um tempo, atualiza na hora.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ultimaAtualizacao && Date.now() - ultimaAtualizacao.getTime() > INTERVALO_ATUALIZACAO_MS) {
      carregarTudo();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarAbas();
  inicializarDatePickers();
  inicializarFiltrosDeData();   // primeiro desenho, com os cards em estado de carregamento
  renderizarCriativosCampeoes();
  carregarTudo();
  iniciarAtualizacaoAutomatica();
});
