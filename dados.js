/* ==========================================================
   AUTO VALE MULTIMARCAS — DADOS & INTEGRAÇÃO GOOGLE SHEETS
   ========================================================== */

const SPREADSHEET_ID = "1ENHM9qsHOBJKkPMngiM0Mu2opupp19rfkIP1n9GzjD0";
const NOME_ABA = "LANCAMENTOS";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA)}`;

const NOME_ABA_MARKETING = "MARKETING";
const SHEET_URL_MARKETING = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA_MARKETING)}`;

let todosLancamentos = [];
let todosLancamentosMarketing = [];

/* Cards do dashboard de Marketing.
   direcao "maior_melhor": bate a meta quando o valor é >= metaValor (taxas de conversão).
   direcao "menor_melhor": bate a meta quando o valor é <= metaValor (custos). */
const cardsMarketing = [
  { key: "investimento",      label: "Investimento",       format: "moeda",      comparar: true },
  { key: "leads",              label: "Leads",               format: "numero",     comparar: true },
  { key: "custoPorLead",       label: "Custo por lead",      format: "moeda",      comparar: true,  direcao: "menor_melhor" },
  { key: "simulacoes",         label: "Simulações",          format: "numero",     percentualKey: "simulacoesPct", percentualLabel: "dos leads", comparar: true },
  { key: "aprovacoes",         label: "Aprovações",          format: "numero",     percentualKey: "aprovacoesPct", percentualLabel: "das simulações", comparar: true },
  { key: "custoPorAprovado",   label: "Custo por aprovado",  format: "moeda",      metaLabel: "Meta",     metaValor: 35,  direcao: "menor_melhor" },
  { key: "vendas",             label: "Vendas",              format: "numero",     percentualKey: "vendasPct", percentualLabel: "das aprovações", comparar: true },
  { key: "custoPorVenda",      label: "Custo por venda",     format: "moeda",      metaLabel: "Meta",     metaValor: 150, direcao: "menor_melhor", comparar: true }
];

const cardsVisaoGeral = [
  { key: "faturamento", label: "Faturamento", format: "moeda", featured: true },
  { key: "contratos",   label: "Contratos",   format: "numero" },
  { key: "ticketMedio", label: "Ticket médio", format: "moeda" }
];

const cardsIndicadoresFinanceiros = [
  { key: "retorno",        label: "Retorno",          format: "moeda" },
  { key: "tac",            label: "TAC",              format: "moeda" },
  { key: "retornoTac",     label: "Retorno + TAC",    format: "moeda" },
  { key: "medioTac",       label: "Médio TAC",        format: "moeda", description: "Média de TAC por contrato" },
  { key: "mediaRetorno",   label: "Média retorno",    format: "moeda", description: "Média de retorno por contrato" },
  { key: "percentualMedioRetorno", label: "Porcentagem Média Retorno", format: "percentual", description: "Manual: média das porcentagens da planilha, ponderada pela quantidade de contratos de cada lançamento" },
  { key: "mediaPonderada", label: "Média ponderada",  format: "percentual" }
];

/* Trata datas vindas do Google Sheets (Date(AAAA,MM,DD) ou strings) */
function parsearDataIso(celula) {
  if (!celula) return null;

  let val = typeof celula === "object" ? (celula.f || celula.v || "") : celula;
  val = String(val).trim();
  if (!val) return null;

  if (val.includes("Date(")) {
    const match = val.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const ano = match[1];
      const mes = String(parseInt(match[2], 10) + 1).padStart(2, "0");
      const dia = String(match[3]).padStart(2, "0");
      return `${ano}-${mes}-${dia}`;
    }
  }

  const partes = val.split(" ")[0].split(/[\/\-\.]/);
  if (partes.length === 3) {
    if (partes[0].length === 4) {
      return `${partes[0]}-${partes[1].padStart(2, "0")}-${partes[2].padStart(2, "0")}`;
    }
    if (partes[2].length === 4 || partes[2].length === 2) {
      const dia = partes[0].padStart(2, "0");
      const mes = partes[1].padStart(2, "0");
      const ano = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
      return `${ano}-${mes}-${dia}`;
    }
  }

  return null;
}

/* Converte qualquer entrada (números, "R$ 60.000,00", "60000,00") em float válido */
function parsearNumero(celula) {
  if (!celula) return 0;
  let val = celula.v !== undefined && celula.v !== null ? celula.v : celula.f;
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;

  let str = String(val).replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").trim();
  let num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/* Converte a coluna manual de porcentagem. Se a célula estiver formatada como %
   no Google Sheets, o valor "v" vem como fração (ex: 0.085 para 8,5%), então
   priorizamos o texto formatado "f" (ex: "8,50%") quando ele existir. */
function parsearPercentualManual(celula) {
  if (!celula) return 0;

  if (celula.f && String(celula.f).includes("%")) {
    const str = String(celula.f).replace("%", "").replace(",", ".").trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  const val = celula.v !== undefined && celula.v !== null ? celula.v : celula.f;
  if (typeof val === "number") {
    // Se vier como fração (célula formatada como % mas sem "f" com "%"), normaliza
    return Math.abs(val) <= 1 ? val * 100 : val;
  }

  return parsearNumero(celula);
}

/* Localiza dinamicamente as colunas pelos nomes dos cabeçalhos na planilha */
function encontrarIndicesColunas(json) {
  const mapa = {
    data: 0,
    sdr: 1,
    contratos: 4,
    faturamento: 5,
    retorno: 6,
    tac: 7,
    consorcio: 8,
    servicos: 9,
    percentualManual: 10,
    banco: 11
  };

  if (json.table && json.table.cols) {
    json.table.cols.forEach((col, idx) => {
      if (!col || !col.label) return;
      const label = col.label.toLowerCase().trim();
      if (label.includes("porcentagem") || label.includes("percentual") || label.includes("%")) mapa.percentualManual = idx;
      else if (label.includes("data")) mapa.data = idx;
      else if (label.includes("sdr") || label.includes("vendedor")) mapa.sdr = idx;
      else if (label.includes("contrato")) mapa.contratos = idx;
      else if (label.includes("faturamento")) mapa.faturamento = idx;
      else if (label.includes("retorno")) mapa.retorno = idx;
      else if (label.includes("tac")) mapa.tac = idx;
      else if (label.includes("consór") || label.includes("consor")) mapa.consorcio = idx;
      else if (label.includes("serviço") || label.includes("servico")) mapa.servicos = idx;
      else if (label.includes("banco") || label.includes("instituição") || label.includes("instituicao")) mapa.banco = idx;
    });
  }

  return mapa;
}

function parsearRespostaGoogleSheets(texto) {
  const jsonText = texto.substring(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  const json = JSON.parse(jsonText);
  const linhas = json.table.rows || [];
  const idx = encontrarIndicesColunas(json);

  const registros = [];

  linhas.forEach((row) => {
    if (!row.c) return;

    const dataISO = parsearDataIso(row.c[idx.data]);
    const sdrCell = row.c[idx.sdr];
    const sdr = sdrCell && (sdrCell.v || sdrCell.f) ? String(sdrCell.v || sdrCell.f).trim() : "";

    if (!sdr || sdr.toLowerCase() === "sdr" || sdr.toLowerCase() === "vendedor") return;
    if (!dataISO) return;

    const contratos   = parsearNumero(row.c[idx.contratos]);
    const faturamento = parsearNumero(row.c[idx.faturamento]);
    const retorno     = parsearNumero(row.c[idx.retorno]);
    const tac         = parsearNumero(row.c[idx.tac]);
    const consorcio   = parsearNumero(row.c[idx.consorcio]);
    const servicos    = parsearNumero(row.c[idx.servicos]);
    const percentualManual = parsearPercentualManual(row.c[idx.percentualManual]);
    const bancoCell = row.c[idx.banco];
    const banco = bancoCell && (bancoCell.v || bancoCell.f) ? String(bancoCell.v || bancoCell.f).trim() : "Não informado";

    registros.push({ dataISO, sdr, contratos, faturamento, retorno, tac, consorcio, servicos, percentualManual, banco });
  });

  return registros;
}

function agruparPorSDR(lancamentos) {
  const mapaSDRs = {};

  lancamentos.forEach((l) => {
    if (!mapaSDRs[l.sdr]) {
      mapaSDRs[l.sdr] = {
        id: l.sdr.toLowerCase().replace(/\s+/g, "_"),
        nome: l.sdr,
        cargo: "SDR",
        contratos: 0,
        faturamento: 0,
        retorno: 0,
        tac: 0,
        ticketMedio: 0
      };
    }

    const sdrObj = mapaSDRs[l.sdr];
    sdrObj.contratos += l.contratos;
    sdrObj.faturamento += l.faturamento;
    sdrObj.retorno += l.retorno;
    sdrObj.tac += l.tac;
  });

  return Object.values(mapaSDRs).map((sdr) => ({
    ...sdr,
    ticketMedio: sdr.contratos > 0 ? sdr.faturamento / sdr.contratos : 0
  }));
}

function agruparPorBanco(lancamentos) {
  const bancos = {};

  lancamentos.forEach((l) => {
    const nome = l.banco || "Não informado";
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (!bancos[chave]) bancos[chave] = { nome, lancamentos: 0 };
    bancos[chave].lancamentos += 1;
  });

  return Object.values(bancos)
    .sort((a, b) => b.lancamentos - a.lancamentos || a.nome.localeCompare(b.nome, "pt-BR"));
}

function calcularIndicadoresPeriodo(lancamentos) {
  const ind = {
    faturamento: 0, retorno: 0, porcentagem: 0, contratos: 0,
    ticketMedio: 0, tac: 0, retornoTac: 0, consorcio: 0,
    servicos: 0, medioTac: 0, mediaRetorno: 0, mediaPonderada: 0,
    percentualMedioRetorno: 0
  };

  let somaPercentualPonderada = 0;

  lancamentos.forEach((l) => {
    ind.faturamento += l.faturamento;
    ind.contratos   += l.contratos;
    ind.retorno     += l.retorno;
    ind.tac         += l.tac;
    ind.consorcio   += l.consorcio;
    ind.servicos    += l.servicos;

    if (l.percentualManual) {
      somaPercentualPonderada += l.percentualManual * l.contratos;
    }
  });

  ind.ticketMedio    = ind.contratos > 0 ? ind.faturamento / ind.contratos : 0;
  ind.retornoTac     = ind.retorno + ind.tac;
  ind.porcentagem    = ind.faturamento > 0 ? ((ind.retorno + ind.tac) / ind.faturamento) * 100 : 0;
  ind.medioTac       = ind.contratos > 0 ? ind.tac / ind.contratos : 0;
  ind.mediaRetorno   = ind.contratos > 0 ? ind.retorno / ind.contratos : 0;
  ind.mediaPonderada = ind.faturamento > 0 ? (ind.retornoTac / ind.faturamento) * 100 : 0;

  /* Porcentagem Média Retorno (manual): média ponderada das porcentagens digitadas
     na planilha, onde cada porcentagem é ponderada pela quantidade de contratos
     do próprio lançamento, dividida pelo total de contratos do período */
  ind.percentualMedioRetorno = ind.contratos > 0 ? somaPercentualPonderada / ind.contratos : 0;

  return ind;
}

function filtrarDadosPorIntervalo(dataInicio, dataFim) {
  const filtrados = todosLancamentos.filter((l) => {
    if (dataInicio && l.dataISO < dataInicio) return false;
    if (dataFim && l.dataISO > dataFim) return false;
    return true;
  });

  return {
    totalRegistros: filtrados.length,
    indicadores: calcularIndicadoresPeriodo(filtrados),
    sdrs: agruparPorSDR(filtrados),
    bancos: agruparPorBanco(filtrados)
  };
}

async function carregarDadosDaPlanilha() {
  try {
    const resposta = await fetch(SHEET_URL);
    if (!resposta.ok) {
      throw new Error(`Planilha Comercial indisponível (HTTP ${resposta.status})`);
    }
    const texto = await resposta.text();
    todosLancamentos = parsearRespostaGoogleSheets(texto);

    if (typeof window.aoCarregarDados === "function") {
      window.aoCarregarDados();
    }
  } catch (erro) {
    console.error("Erro ao carregar dados da planilha Google Sheets:", erro);
    if (typeof window.aoFalharCarregamento === "function") {
      window.aoFalharCarregamento(erro);
    }
  }
}

/* ---------- MARKETING: leitura e cálculo ---------- */

function encontrarIndicesColunasMarketing(json) {
  const mapa = {
    data: 0,
    investimento: 1,
    leads: 2,
    simulacoes: 3,
    aprovacoes: 4,
    vendas: 5
  };

  if (json.table && json.table.cols) {
    json.table.cols.forEach((col, idx) => {
      if (!col || !col.label) return;
      const label = col.label.toLowerCase().trim();
      if (label.includes("data")) mapa.data = idx;
      else if (label.includes("investi")) mapa.investimento = idx;
      else if (label.includes("lead")) mapa.leads = idx;
      else if (label.includes("simula")) mapa.simulacoes = idx;
      else if (label.includes("aprova")) mapa.aprovacoes = idx;
      else if (label.includes("venda")) mapa.vendas = idx;
    });
  }

  return mapa;
}

function parsearRespostaMarketing(texto) {
  const jsonText = texto.substring(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  const json = JSON.parse(jsonText);
  const linhas = json.table.rows || [];
  const idx = encontrarIndicesColunasMarketing(json);

  const registros = [];

  linhas.forEach((row) => {
    if (!row.c) return;

    const dataISO = parsearDataIso(row.c[idx.data]);
    if (!dataISO) return;

    registros.push({
      dataISO,
      investimento: parsearNumero(row.c[idx.investimento]),
      leads: parsearNumero(row.c[idx.leads]),
      simulacoes: parsearNumero(row.c[idx.simulacoes]),
      aprovacoes: parsearNumero(row.c[idx.aprovacoes]),
      vendas: parsearNumero(row.c[idx.vendas])
    });
  });

  return registros;
}

/* Funil: Simulações são % dos Leads; Aprovações são % das Simulações; Vendas são % das Aprovações */
function calcularIndicadoresMarketing(lancamentos) {
  const ind = {
    investimento: 0, leads: 0, simulacoes: 0, aprovacoes: 0, vendas: 0,
    custoPorLead: 0, simulacoesPct: 0, aprovacoesPct: 0,
    custoPorAprovado: 0, vendasPct: 0, custoPorVenda: 0
  };

  lancamentos.forEach((l) => {
    ind.investimento += l.investimento;
    ind.leads        += l.leads;
    ind.simulacoes    += l.simulacoes;
    ind.aprovacoes    += l.aprovacoes;
    ind.vendas         += l.vendas;
  });

  ind.custoPorLead     = ind.leads > 0 ? ind.investimento / ind.leads : 0;
  ind.simulacoesPct    = ind.leads > 0 ? (ind.simulacoes / ind.leads) * 100 : 0;
  ind.aprovacoesPct    = ind.simulacoes > 0 ? (ind.aprovacoes / ind.simulacoes) * 100 : 0;
  ind.custoPorAprovado = ind.aprovacoes > 0 ? ind.investimento / ind.aprovacoes : 0;
  ind.vendasPct        = ind.aprovacoes > 0 ? (ind.vendas / ind.aprovacoes) * 100 : 0;
  ind.custoPorVenda    = ind.vendas > 0 ? ind.investimento / ind.vendas : 0;

  return ind;
}

/* Calcula o período imediatamente anterior, com a mesma duração em dias do período informado */
function calcularPeriodoAnteriorEquivalente(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { inicio: "", fim: "" };

  const inicio = new Date(`${dataInicio}T00:00:00`);
  const fim = new Date(`${dataFim}T00:00:00`);
  const duracaoDias = Math.round((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;

  const fimAnterior = new Date(inicio);
  fimAnterior.setDate(fimAnterior.getDate() - 1);

  const inicioAnterior = new Date(fimAnterior);
  inicioAnterior.setDate(inicioAnterior.getDate() - (duracaoDias - 1));

  const paraIso = (d) => {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  };

  return { inicio: paraIso(inicioAnterior), fim: paraIso(fimAnterior) };
}

/* Variação percentual entre o valor atual e o valor do período anterior */
function calcularVariacaoPercentual(atual, anterior) {
  if (!anterior) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

/* Monta as etapas do funil de Marketing com quantidade e percentual de conversão de cada etapa */
function calcularFunilMarketing(ind) {
  return [
    { key: "leads",       label: "Leads",       valor: ind.leads,       percentual: 100 },
    { key: "simulacoes",  label: "Simulações",  valor: ind.simulacoes,  percentual: ind.simulacoesPct },
    { key: "aprovacoes",  label: "Aprovações",  valor: ind.aprovacoes,  percentual: ind.aprovacoesPct },
    { key: "vendas",      label: "Vendas",      valor: ind.vendas,      percentual: ind.vendasPct }
  ];
}

function filtrarMarketingPorIntervalo(dataInicio, dataFim) {
  const filtrados = todosLancamentosMarketing.filter((l) => {
    if (dataInicio && l.dataISO < dataInicio) return false;
    if (dataFim && l.dataISO > dataFim) return false;
    return true;
  });
  const indicadores = calcularIndicadoresMarketing(filtrados);

  const periodoAnterior = calcularPeriodoAnteriorEquivalente(dataInicio, dataFim);
  const filtradosAnterior = todosLancamentosMarketing.filter((l) => {
    if (periodoAnterior.inicio && l.dataISO < periodoAnterior.inicio) return false;
    if (periodoAnterior.fim && l.dataISO > periodoAnterior.fim) return false;
    return true;
  });
  const indicadoresAnterior = calcularIndicadoresMarketing(filtradosAnterior);

  return {
    totalRegistros: filtrados.length,
    indicadores,
    indicadoresAnterior,
    funil: calcularFunilMarketing(indicadores)
  };
}

async function carregarDadosMarketing() {
  try {
    const resposta = await fetch(SHEET_URL_MARKETING);
    if (!resposta.ok) {
      throw new Error(`Planilha de Marketing indisponível (HTTP ${resposta.status})`);
    }
    const texto = await resposta.text();
    todosLancamentosMarketing = parsearRespostaMarketing(texto);

    if (typeof window.aoCarregarDadosMarketing === "function") {
      window.aoCarregarDadosMarketing();
    }
  } catch (erro) {
    console.error("Erro ao carregar dados de Marketing da planilha:", erro);
    if (typeof window.aoFalharCarregamentoMarketing === "function") {
      window.aoFalharCarregamentoMarketing(erro);
    }
  }
}
