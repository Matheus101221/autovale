/* ==========================================================
   AUTO VALE MULTIMARCAS — RELATÓRIO DE MARKETING VIA WHATSAPP
   Botão "WhatsApp" na barra de filtros: monta o relatório do
   período selecionado (De/Até) e abre o WhatsApp com o texto pronto.
   Sem período selecionado, usa o dia de hoje.
   ========================================================== */

/* >>> CONFIGURE AQUI <<<
   Número que recebe o relatório: só dígitos, com 55 + DDD (ex.: "5535999999999").
   Deixe vazio ("") para o WhatsApp perguntar para quem enviar. */
const WHATSAPP_NUMERO = "";

/* Metas usadas no relatório */
const META_SIMULACOES_PCT = 60;   // % esperado de simulações sobre os leads
const META_APROVACOES_PCT = 20;   // % meta de aprovações sobre as simulações
const META_CUSTO_APROVADO_PADRAO = 35; // R$ (usa a meta do dashboard, se existir)

function wppMoeda(valor) {
  return "R$ " + Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wppPercentual(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%";
}

function wppDataCurta(iso) {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function wppHojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wppMetaCustoAprovado() {
  if (typeof cardsMarketing !== "undefined") {
    const card = cardsMarketing.find((c) => c.key === "custoPorAprovado");
    if (card && card.metaValor) return card.metaValor;
  }
  return META_CUSTO_APROVADO_PADRAO;
}

/* Monta o texto do relatório a partir dos indicadores de marketing */
function montarRelatorioMarketing(ind, inicioIso, fimIso) {
  const titulo = inicioIso === fimIso
    ? wppDataCurta(inicioIso)
    : `${wppDataCurta(inicioIso)} a ${wppDataCurta(fimIso)}`;
  const esperadoSimulacoes = Math.round(ind.leads * META_SIMULACOES_PCT / 100);

  return [
    `Relatório ${titulo}`,
    `Investimento ${wppMoeda(ind.investimento)}`,
    `Leads ${ind.leads}`,
    `Custo por Lead ${wppMoeda(ind.custoPorLead)}`,
    `Simulações ${ind.simulacoes} (${wppPercentual(ind.simulacoesPct)}) Esperado ${esperadoSimulacoes} (${wppPercentual(META_SIMULACOES_PCT)})`,
    `Aprovações ${ind.aprovacoes} (${wppPercentual(ind.aprovacoesPct)}) Meta (${wppPercentual(META_APROVACOES_PCT)})`,
    `Custo por Aprovado ${wppMoeda(ind.custoPorAprovado)} Meta ${wppMoeda(wppMetaCustoAprovado())}`
  ].join("\n");
}

function enviarRelatorioWhatsApp() {
  if (typeof dadosMarketingCarregados !== "undefined" && !dadosMarketingCarregados) {
    alert("Os dados de Marketing ainda estão carregando. Tente novamente em alguns segundos.");
    return;
  }

  const inputInicio = document.getElementById("data-inicio");
  const inputFim = document.getElementById("data-fim");
  let inicio = (inputInicio && inputInicio.dataset.iso) || "";
  let fim = (inputFim && inputFim.dataset.iso) || "";

  if (!inicio && !fim) { inicio = fim = wppHojeIso(); }
  else if (!inicio) { inicio = fim; }
  else if (!fim) { fim = inicio; }

  const dados = filtrarMarketingPorIntervalo(inicio, fim);
  if (dados.totalRegistros === 0) {
    alert("Não há lançamentos de Marketing no período selecionado.");
    return;
  }

  const texto = montarRelatorioMarketing(dados.indicadores, inicio, fim);
  const numero = String(WHATSAPP_NUMERO || "").replace(/\D/g, "");
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener");
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("enviar-whatsapp");
    if (btn) btn.addEventListener("click", enviarRelatorioWhatsApp);
  });
}

if (typeof module !== "undefined") module.exports = { montarRelatorioMarketing };
