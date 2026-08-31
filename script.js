/* ==========================================================
   AUTO VALE MULTIMARCAS — DASHBOARD COMERCIAL
   ========================================================== */

/* ---------- TEMA ---------- */
const TEMA_STORAGE_KEY = "autovale-tema";

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
function renderizarVisaoGeral(indicadores) {
  const grid = document.getElementById("visao-geral-grid") || document.querySelector(".visao-geral-grid") || document.querySelector(".overview-grid");
  if (!grid) return;
  grid.innerHTML = "";

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

function renderizarIndicadoresFinanceiros(indicadores) {
  const grid = document.getElementById("indicadores-grid") || document.querySelector(".ind-grid");
  if (!grid) return;
  grid.innerHTML = "";

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

/* ---------- FILTRAGEM & ATUALIZAÇÃO DA TELA ---------- */
function atualizarDashboardPorData() {
  const inputInicio = document.getElementById("data-inicio");
  const inputFim = document.getElementById("data-fim");

  const inicioVal = inputInicio ? inputInicio.value : "";
  const fimVal = inputFim ? inputFim.value : "";

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

  renderizarVisaoGeral(dados.indicadores);
  renderizarIndicadoresFinanceiros(dados.indicadores);
  renderizarSDRs(dados.sdrs, totalContratos);
  renderizarComparativo(dados.sdrs, totalContratos);

  const ranking = ordenarRanking(dados.sdrs);
  renderizarRanking(ranking);
}

function inicializarFiltrosDeData() {
  const inputInicio = document.getElementById("data-inicio");
  const inputFim = document.getElementById("data-fim");

  if (!inputInicio || !inputFim) return;

  // Se a planilha retornou dados, define as datas mínima e máxima automaticamente se os campos estiverem vazios
  if (todosLancamentos.length > 0) {
    const datas = todosLancamentos.map((l) => l.dataISO).filter(Boolean).sort();
    if (datas.length > 0) {
      if (!inputInicio.value) inputInicio.value = datas[0];
      if (!inputFim.value) inputFim.value = datas[datas.length - 1];
    }
  }

  inputInicio.removeEventListener("change", atualizarDashboardPorData);
  inputFim.removeEventListener("change", atualizarDashboardPorData);

  inputInicio.addEventListener("change", atualizarDashboardPorData);
  inputFim.addEventListener("change", atualizarDashboardPorData);

  atualizarDashboardPorData();
}

/* ---------- EVENTOS GLOBAIS DE CARREGAMENTO ---------- */
window.aoCarregarDados = function () {
  const statusEl = document.querySelector(".header__updated");
  if (statusEl) statusEl.textContent = "Sincronizado via Google Sheets";
  inicializarFiltrosDeData();
};

window.aoFalharCarregamento = function (erro) {
  const statusEl = document.querySelector(".header__updated");
  if (statusEl) statusEl.textContent = "Erro de conexão com a planilha";
  atualizarDashboardPorData();
};

document.addEventListener("DOMContentLoaded", () => {
  iniciarTema();
  inicializarFiltrosDeData();
  carregarDadosDaPlanilha();
});
