/* ==========================================================
   AUTO VALE MULTIMARCAS — DADOS & INTEGRAÇÃO GOOGLE SHEETS
   ========================================================== */

const SPREADSHEET_ID = "1ENHM9qsHOBJKkPMngiM0Mu2opupp19rfkIP1n9GzjD0";
const NOME_ABA = "LANCAMENTOS";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA)}`;

let todosLancamentos = [];

const cardsVisaoGeral = [
  { key: "faturamento", label: "Faturamento", format: "moeda", featured: true },
  { key: "contratos",   label: "Contratos",   format: "numero" },
  { key: "ticketMedio", label: "Ticket médio", format: "moeda" },
  { key: "porcentagem", label: "Porcentagem",  format: "percentual" }
];

const cardsIndicadoresFinanceiros = [
  { key: "retorno",        label: "Retorno",          format: "moeda" },
  { key: "tac",            label: "TAC",              format: "moeda" },
  { key: "retornoTac",     label: "Retorno + TAC",    format: "moeda" },
  { key: "consorcio",      label: "Consórcio",        format: "moeda" },
  { key: "servicos",       label: "Serviços",         format: "moeda" },
  { key: "medioTac",       label: "Médio TAC",        format: "moeda", description: "Média de TAC por contrato" },
  { key: "mediaRetorno",   label: "Média retorno",    format: "moeda", description: "Média de retorno por contrato" },
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
    servicos: 9
  };

  if (json.table && json.table.cols) {
    json.table.cols.forEach((col, idx) => {
      if (!col || !col.label) return;
      const label = col.label.toLowerCase().trim();
      if (label.includes("data")) mapa.data = idx;
      else if (label.includes("sdr") || label.includes("vendedor")) mapa.sdr = idx;
      else if (label.includes("contrato")) mapa.contratos = idx;
      else if (label.includes("faturamento")) mapa.faturamento = idx;
      else if (label.includes("retorno")) mapa.retorno = idx;
      else if (label.includes("tac")) mapa.tac = idx;
      else if (label.includes("consór") || label.includes("consor")) mapa.consorcio = idx;
      else if (label.includes("serviço") || label.includes("servico")) mapa.servicos = idx;
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

    registros.push({ dataISO, sdr, contratos, faturamento, retorno, tac, consorcio, servicos });
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

function calcularIndicadoresPeriodo(lancamentos) {
  const ind = {
    faturamento: 0, retorno: 0, porcentagem: 0, contratos: 0,
    ticketMedio: 0, tac: 0, retornoTac: 0, consorcio: 0,
    servicos: 0, medioTac: 0, mediaRetorno: 0, mediaPonderada: 0
  };

  lancamentos.forEach((l) => {
    ind.faturamento += l.faturamento;
    ind.contratos   += l.contratos;
    ind.retorno     += l.retorno;
    ind.tac         += l.tac;
    ind.consorcio   += l.consorcio;
    ind.servicos    += l.servicos;
  });

  ind.ticketMedio    = ind.contratos > 0 ? ind.faturamento / ind.contratos : 0;
  ind.retornoTac     = ind.retorno + ind.tac;
  ind.porcentagem    = ind.faturamento > 0 ? (ind.retorno / ind.faturamento) * 100 : 0;
  ind.medioTac       = ind.contratos > 0 ? ind.tac / ind.contratos : 0;
  ind.mediaRetorno   = ind.contratos > 0 ? ind.retorno / ind.contratos : 0;
  ind.mediaPonderada = ind.faturamento > 0 ? (ind.retornoTac / ind.faturamento) * 100 : 0;

  return ind;
}

function filtrarDadosPorIntervalo(dataInicio, dataFim) {
  const filtrados = todosLancamentos.filter((l) => {
    if (dataInicio && l.dataISO < dataInicio) return false;
    if (dataFim && l.dataISO > dataFim) return false;
    return true;
  });

  return {
    indicadores: calcularIndicadoresPeriodo(filtrados),
    sdrs: agruparPorSDR(filtrados)
  };
}

async function carregarDadosDaPlanilha() {
  try {
    const resposta = await fetch(SHEET_URL);
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