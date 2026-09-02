/* ==========================================================
   AUTO VALE MULTIMARCAS — DASHBOARD COMERCIAL
   ========================================================== */

/* ---------- TEMA ---------- */
const TEMA_STORAGE_KEY = "autovale-tema";
let dadosComerciaisCarregados = false;
let dadosMarketingCarregados = false;

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  localStorage.setItem(TEMA_STORAGE_KEY, tema);
}

function iniciarTema() {
  const salvo = localStorage.getItem(TEMA_STORAGE_KEY);
  aplicarTema(salvo === "light" ? "light" : "dark");

  const btnTheme = document.getElementById("theme-toggle");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const atual = document.documentElement.getAttribute("data-theme");
      aplicarTema(atual === "dark" ? "light" : "dark");
    });
  }
}

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

function renderizarVisaoGeral(indicadores, temDados = true, carregando = false) {
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
    grid.appendChild(card);

    animarValor(valorEl, valor, item.format);
  });
}

function renderizarIndicadoresFinanceiros(indicadores, temDados = true, carregando = false) {
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

    grid.appendChild(card);
    animarValor(valorEl, valor, item.format);
  });
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

  if (item.comparar) {
    const valorAnterior = (indicadoresAnterior && indicadoresAnterior[item.key]) ?? 0;
    const variacao = calcularVariacaoPercentual(valor, valorAnterior);
    const subiu = variacao >= 0;

    // Em métricas de custo (direcao "menor_melhor"), subir é ruim e cair é bom —
    // a cor da seta reflete se a variação foi boa ou ruim, não apenas a direção.
    const melhorou = item.direcao === "menor_melhor" ? variacao <= 0 : variacao >= 0;

    const comparativo = document.createElement("div");
    comparativo.className = `kpi-card__comparativo kpi-card__comparativo--${melhorou ? "up" : "down"}`;
    comparativo.innerHTML = `
      <span class="kpi-card__comparativo-linha">
        <span class="kpi-card__comparativo-seta">${subiu ? "↑" : "↓"}</span>
        <span>${formatarPercentual(Math.abs(variacao))}</span>
      </span>
      <span class="kpi-card__comparativo-detalhe">vs período anterior <span class="kpi-card__comparativo-abs">(${formatarPorTipo(valorAnterior, item.format)})</span></span>
    `;

    const maiorValor = Math.max(Math.abs(valor), Math.abs(valorAnterior), 1);
    const visual = document.createElement("div");
    visual.className = "kpi-card__comparativo-visual";
    visual.innerHTML = `
      <div><span>Atual</span><i><b class="kpi-card__barra-atual" style="width: ${(Math.abs(valor) / maiorValor) * 100}%"></b></i></div>
      <div><span>Anterior</span><i><b class="kpi-card__barra-anterior" style="width: ${(Math.abs(valorAnterior) / maiorValor) * 100}%"></b></i></div>
    `;
    card.appendChild(comparativo);
    card.appendChild(visual);
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
    exibirCarregamento(grid, 8);
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

/* Recebe o mesmo período do filtro único do cabeçalho e atualiza a aba Marketing */
function atualizarMarketingPorData(inicioVal, fimVal) {
  const dadosMkt = filtrarMarketingPorIntervalo(inicioVal, fimVal);
  const temDados = dadosMkt.totalRegistros > 0;
  const carregando = !dadosMarketingCarregados;
  renderizarMarketing(dadosMkt.indicadores, dadosMkt.indicadoresAnterior, temDados, carregando);
  renderizarFunil(dadosMkt.funil, temDados, carregando);
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
      subtituloVisaoGeral.textContent = `Resumo dos resultados comerciais de ${formatarDataBR(inicioVal)} a ${formatarDataBR(fimVal)}.`;
    } else {
      subtituloVisaoGeral.textContent = "Resumo dos resultados comerciais do período selecionado.";
    }
  }

  const dados = filtrarDadosPorIntervalo(inicioVal, fimVal);
  const totais = calcularTotais(dados.sdrs);
  const totalContratos = dados.indicadores.contratos || totais.contratos;

  const temDados = dados.totalRegistros > 0;
  const carregando = !dadosComerciaisCarregados;
  renderizarVisaoGeral(dados.indicadores, temDados, carregando);
  renderizarIndicadoresFinanceiros(dados.indicadores, temDados, carregando);
  renderizarSDRs(dados.sdrs, totalContratos);
  renderizarComparativo(dados.sdrs, totalContratos);

  const ranking = ordenarRanking(dados.sdrs);
  renderizarRanking(ranking);

  // O mesmo período selecionado no cabeçalho também filtra a aba Marketing
  atualizarMarketingPorData(inicioVal, fimVal);
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

/* ---------- EVENTOS GLOBAIS DE CARREGAMENTO ---------- */
window.aoCarregarDados = function () {
  dadosComerciaisCarregados = true;
  const statusEl = document.querySelector(".header__updated");
  if (statusEl) statusEl.textContent = "Sincronizado via Google Sheets";
  inicializarFiltrosDeData();
};

window.aoFalharCarregamento = function (erro) {
  dadosComerciaisCarregados = true;
  const statusEl = document.querySelector(".header__updated");
  if (statusEl) statusEl.textContent = `Erro ao carregar planilha: ${erro.message || "conexão indisponível"}`;
  atualizarDashboardPorData();
};

window.aoCarregarDadosMarketing = function () {
  dadosMarketingCarregados = true;
  const statusEl = document.getElementById("marketing-status");
  if (statusEl) statusEl.textContent = "Sincronizado via Google Sheets";
  inicializarFiltrosDeData();
};

window.aoFalharCarregamentoMarketing = function (erro) {
  dadosMarketingCarregados = true;
  const statusEl = document.getElementById("marketing-status");
  if (statusEl) statusEl.textContent = `Erro ao carregar Meta Ads: ${erro.message || "conexão indisponível"}`;
  atualizarDashboardPorData();
};

document.addEventListener("DOMContentLoaded", () => {
  iniciarTema();
  inicializarAbas();
  inicializarDatePickers();
  inicializarFiltrosDeData();
  carregarDadosDaPlanilha();
  carregarDadosMarketing();
});
