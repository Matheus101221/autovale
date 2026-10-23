/* ==========================================================
   AUTO VALE MULTIMARCAS — CAMADA 3D (Three.js)
   Não altera a lógica do dashboard: apenas "escuta" as funções
   de renderização já existentes (ranking) e adiciona:
     1. Pódio dos SDRs e dos vendedores
          · desktop: pódio 3D (barras), com o Three.js baixado sob demanda
          · celular (até 768px) ou sem WebGL/Three.js: pódio simples em
            HTML/CSS (top 3), sem baixar o Three.js
     2. Cards com inclinação 3D ao passar o mouse
     3. Barra "Ir para" fixa, com seção ativa destacada
   ========================================================== */
(function () {
  "use strict";

  const REDUZIDO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COR = { teal: 0x008197, cyan: 0x19d9ef, gold: 0xf5b434, deep: 0x031038 };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const fmtMoeda = (v) => (typeof formatarMoeda === "function" ? formatarMoeda(v) : "R$ " + Number(v || 0).toFixed(2));
  const fmtNum = (v) => (typeof formatarNumero === "function" ? formatarNumero(v) : String(v));
  const fmtPct = (v) => (typeof formatarPercentual === "function" ? formatarPercentual(v) : Number(v || 0).toFixed(1) + "%");

  /* Gradiente da marca: teal → ciano → dourado */
  function gradiente(t) {
    t = clamp(t, 0, 1);
    const c = new THREE.Color();
    if (t < 0.5) c.set(COR.teal).lerp(new THREE.Color(COR.cyan), t * 2);
    else c.set(COR.cyan).lerp(new THREE.Color(COR.gold), (t - 0.5) * 2);
    return c;
  }

  function criarRenderer(canvas, opcoes) {
    try {
      return new THREE.WebGLRenderer(Object.assign({ canvas, alpha: true, antialias: true }, opcoes || {}));
    } catch (e) {
      return null;
    }
  }

  /* Sprite de texto (sempre de frente para a câmera) */
  function criarRotulo(principal, secundario, tamanho) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,10,40,.9)";
    ctx.shadowBlur = 10;

    let px = tamanho || 58;
    do {
      ctx.font = `700 ${px}px Sora, Inter, sans-serif`;
      px -= 2;
    } while (ctx.measureText(principal).width > 236 && px > 18);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(principal, 128, secundario ? 48 : 64);

    if (secundario) {
      ctx.font = "500 26px Inter, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.78)";
      ctx.fillText(secundario, 128, 96);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 1.2, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function criarSkeletonPodio() {
    const el = document.createElement("span");
    el.className = "podio-skeleton";
    el.setAttribute("aria-hidden", "true");
    el.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    return el;
  }

  /* ---------------------------------------------------------
     2. PALCO 3D REUTILIZÁVEL (pódio)
     --------------------------------------------------------- */
  class Palco {
    constructor(host, op) {
      this.host = host;
      this.op = op;
      host.classList.add("fx-stage");
      host.innerHTML = `
        <div class="fx-stage__hud">
          <span class="fx-stage__hint">${op.dica}</span>
          <div class="fx-stage__btns">
            ${op.auto === false ? "" : '<button type="button" data-acao="girar" aria-pressed="true">Movimento automático</button>'}
            <button type="button" data-acao="reset">Recentralizar</button>
          </div>
        </div>
        <div class="fx-stage__view">
          <canvas class="fx-stage__canvas" role="img" aria-label="${op.rotulo}"></canvas>
          <div class="fx-stage__tip" hidden></div>
          <div class="fx-stage__msg"><span class="podio-skeleton" aria-hidden="true"><i></i><i></i><i></i></span></div>
        </div>
        <ul class="fx-stage__legend" aria-label="${op.rotulo} — detalhes"></ul>`;

      this.view = host.querySelector(".fx-stage__view");
      this.canvas = host.querySelector("canvas");
      this.tip = host.querySelector(".fx-stage__tip");
      this.msg = host.querySelector(".fx-stage__msg");
      this.legenda = host.querySelector(".fx-stage__legend");

      this.renderer = criarRenderer(this.canvas);
      if (!this.renderer) { host.hidden = true; this.morto = true; return; }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      this.grupo = new THREE.Group();
      this.scene.add(this.grupo);

      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(5, 8, 6);
      this.scene.add(dir);
      const luzOuro = new THREE.PointLight(COR.gold, 0.8, 30);
      luzOuro.position.set(-7, 3, 5);
      this.scene.add(luzOuro);
      const luzCiano = new THREE.PointLight(COR.cyan, 1, 30);
      luzCiano.position.set(7, -2, 4);
      this.scene.add(luzCiano);

      this.raycaster = new THREE.Raycaster();
      this.itens = [];
      this.pickables = [];
      this.extra = null;
      this.age = 0;
      this.ativo = -1;
      this.auto = op.auto !== false;
      this.visivel = false;
      this.arrastando = false;
      this.ultimoToque = 0;
      this.rotY = 0;
      this.rotX = op.rotX0;

      this.ligarEventos();
      this.enquadrar();
      stages.push(this);
    }

    ligarEventos() {
      const view = this.view;
      view.addEventListener("pointerdown", (e) => {
        this.arrastando = true;
        this.ult = { x: e.clientX, y: e.clientY };
        view.classList.add("is-drag");
        view.setPointerCapture(e.pointerId);
        this.ultimoToque = performance.now();
      });
      view.addEventListener("pointermove", (e) => {
        if (this.arrastando) {
          this.rotY += (e.clientX - this.ult.x) * 0.01;
          this.rotX = clamp(this.rotX + (e.clientY - this.ult.y) * 0.005, this.op.rotXMin, this.op.rotXMax);
          this.ult = { x: e.clientX, y: e.clientY };
          this.ultimoToque = performance.now();
          this.esconderTip();
          return;
        }
        this.passar(e);
      });
      const fim = () => { this.arrastando = false; view.classList.remove("is-drag"); };
      view.addEventListener("pointerup", fim);
      view.addEventListener("pointercancel", fim);
      view.addEventListener("pointerleave", () => {
        if (this.arrastando) return;
        this.esconderTip();
        this.definirAtivo(-1);
      });

      const btnGirar = this.host.querySelector('[data-acao="girar"]');
      if (btnGirar) btnGirar.addEventListener("click", (e) => {
        this.auto = !this.auto;
        e.currentTarget.setAttribute("aria-pressed", String(this.auto));
      });
      this.host.querySelector('[data-acao="reset"]').addEventListener("click", () => {
        this.rotY = 0;
        this.rotX = this.op.rotX0;
        this.ultimoToque = performance.now();
      });

      new ResizeObserver(() => this.redimensionar()).observe(view);
      new IntersectionObserver(([en]) => { this.visivel = en.isIntersecting; }).observe(this.host);
    }

    redimensionar() {
      const w = this.view.clientWidth, h = this.view.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.enquadrar();
    }

    /* Afasta a câmera em telas estreitas para tudo continuar visível */
    enquadrar() {
      const cam = this.op.cam;
      const fator = clamp(1.7 / (this.camera.aspect || 1.7), 1, 2.2);
      this.camera.position.set(0, cam.y * fator, cam.z * fator);
      this.camera.lookAt(0, cam.ty, 0);
    }

    limpar() {
      this.itens = [];
      this.pickables = [];
      this.extra = null;
      this.age = 0;
      this.ativo = -1;
      while (this.grupo.children.length) {
        const o = this.grupo.children[0];
        this.grupo.remove(o);
        o.traverse((n) => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) {
            (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          }
        });
      }
      this.legenda.innerHTML = "";
    }

    mensagem(texto) {
      this.limpar();
      this.msg.textContent = texto || "";
      this.msg.hidden = !texto;
    }

    /* Skeleton enquanto o ranking ainda não chegou */
    aguardar() {
      this.limpar();
      this.msg.replaceChildren(criarSkeletonPodio());
      this.msg.hidden = false;
    }

    /* Recebe a lista de itens já criada pelo construtor de cena */
    publicar(itens) {
      this.msg.hidden = true;
      this.itens = itens;
      this.legenda.innerHTML = "";
      itens.forEach((it, i) => {
        it.ativo = 0;
        it.meshes.forEach((m) => { m.userData.index = i; this.pickables.push(m); });
        const li = document.createElement("li");
        li.tabIndex = 0;
        const marca = document.createElement("i");
        marca.style.background = it.cor;
        marca.style.color = it.cor;
        const bloco = document.createElement("div");
        const nome = document.createElement("b");
        nome.textContent = it.rotulo;
        const sub = document.createElement("small");
        sub.textContent = it.sub;
        bloco.append(nome, sub);
        const forte = document.createElement("strong");
        forte.textContent = it.forte;
        li.append(marca, bloco, forte);
        li.addEventListener("pointerenter", () => this.definirAtivo(i));
        li.addEventListener("pointerleave", () => this.definirAtivo(-1));
        li.addEventListener("focus", () => this.definirAtivo(i));
        li.addEventListener("blur", () => this.definirAtivo(-1));
        this.legenda.appendChild(li);
      });
    }

    definirAtivo(i) {
      if (i === this.ativo) return;
      this.ativo = i;
      [...this.legenda.children].forEach((li, k) => li.classList.toggle("is-active", k === i));
    }

    passar(e) {
      if (!this.pickables.length) return;
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      if (!hit) { this.esconderTip(); this.definirAtivo(-1); return; }
      const i = hit.object.userData.index;
      this.definirAtivo(i);
      const it = this.itens[i];
      this.tip.replaceChildren();
      const b = document.createElement("b"); b.textContent = it.rotulo;
      const s = document.createElement("span"); s.textContent = it.forte;
      const em = document.createElement("em"); em.textContent = it.sub;
      this.tip.append(b, s, em);
      this.tip.hidden = false;
      const x = clamp(e.clientX - r.left + 16, 8, r.width - 170);
      const y = clamp(e.clientY - r.top + 16, 8, r.height - 80);
      this.tip.style.transform = `translate(${x}px, ${y}px)`;
    }

    esconderTip() { this.tip.hidden = true; }

    tick(t, dt) {
      if (this.morto || !this.visivel || !this.renderer) return;
      this.age += dt;
      const ocioso = performance.now() - this.ultimoToque > 2500 && !this.arrastando;
      if (this.auto && ocioso && !REDUZIDO) {
        if (this.op.auto === "orbita") this.rotY += dt * 0.3;
        else this.rotX = lerp(this.rotX, this.op.rotX0 + Math.sin(t * 0.5) * 0.22, 0.03);
      }
      this.grupo.rotation.y = lerp(this.grupo.rotation.y, this.rotY, 0.12);
      this.grupo.rotation.x = lerp(this.grupo.rotation.x, this.rotX, 0.12);

      this.itens.forEach((it, i) => {
        it.ativo = lerp(it.ativo, i === this.ativo ? 1 : 0, 0.18);
        it.passo(this.age, dt, t);
      });
      if (this.extra) this.extra(t, dt);
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ---------------------------------------------------------
     3. CENA: PÓDIO DOS SDRs
     --------------------------------------------------------- */
  function montarPodio(palco, ranking, unidade) {
    palco.limpar();
    const un = unidade || { plural: "contratos", vazio: "Nenhum contrato fechado no período selecionado." };
    const lista = (ranking || []).slice(0, 8);
    const total = lista.reduce((s, x) => s + (x.contratos || 0), 0);
    if (!lista.length || total === 0) {
      palco.mensagem(lista.length ? un.vazio : "Sem dados de ranking no período.");
      return;
    }

    const max = Math.max(...lista.map((s) => s.contratos), 1);
    const gap = Math.min(2.3, 13 / lista.length);
    const larg = gap * 0.62;
    const x0 = -((lista.length - 1) * gap) / 2;

    const grade = new THREE.GridHelper(Math.max(10, lista.length * gap + 3), 14, COR.cyan, COR.cyan);
    grade.material.transparent = true;
    grade.material.opacity = 0.16;
    palco.grupo.add(grade);

    const itens = lista.map((s, i) => {
      const lider = i === 0 && s.contratos > 0;
      const cor = lider ? new THREE.Color(COR.gold) : gradiente(0.1 + (i / Math.max(1, lista.length - 1)) * 0.45);
      const altura = Math.max(0.14, (s.contratos / max) * 5);

      const geo = new THREE.BoxGeometry(larg, altura, larg);
      geo.translate(0, altura / 2, 0);
      const mat = new THREE.MeshStandardMaterial({ color: cor, metalness: 0.35, roughness: 0.3, emissive: cor, emissiveIntensity: 0.18, transparent: true, opacity: 0.93 });
      const barra = new THREE.Mesh(geo, mat);
      barra.position.x = x0 + i * gap;
      barra.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));
      palco.grupo.add(barra);

      const numero = criarRotulo(String(s.contratos), un.plural, 62);
      numero.position.x = barra.position.x;
      palco.grupo.add(numero);

      const nome = criarRotulo(String(s.nome || "—"), "", 44);
      nome.scale.set(2.2, 1.1, 1);
      nome.position.set(barra.position.x, -0.55, 0.4);
      palco.grupo.add(nome);

      let coroa = null;
      if (lider) {
        coroa = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28),
          new THREE.MeshStandardMaterial({ color: COR.gold, emissive: COR.gold, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.25 })
        );
        coroa.position.x = barra.position.x;
        palco.grupo.add(coroa);
      }

      return {
        rotulo: `${i + 1}º ${s.nome}`,
        forte: String(s.contratos),
        sub: s.faturamento > 0 ? fmtMoeda(s.faturamento) : "Sem faturamento",
        cor: "#" + cor.getHexString(),
        meshes: [barra],
        ativo: 0,
        passo(age, dt, t) {
          const g = REDUZIDO ? 1 : easeOut(clamp((age - i * 0.12) / 0.8, 0, 1));
          const pop = 1 + 0.1 * this.ativo;
          barra.scale.set(pop, Math.max(0.001, g), pop);
          mat.emissiveIntensity = 0.18 + 0.6 * this.ativo;
          numero.position.y = altura * g + 0.85;
          numero.material.opacity = g;
          nome.material.opacity = g;
          if (coroa) {
            coroa.position.y = altura * g + 1.75 + Math.sin(t * 2) * 0.1;
            coroa.rotation.y = t * 2;
            coroa.scale.setScalar(Math.max(0.001, g));
          }
        }
      };
    });
    palco.publicar(itens);
  }

  /* ---------------------------------------------------------
     5. CARDS COM INCLINAÇÃO 3D
     --------------------------------------------------------- */
  function iniciarInclinacao() {
    if (REDUZIDO) return;
    const SEL = ".overview-card, .ind-card, .kpi-card, .sdr-card"; // .vendedor-card fica de fora: ele vira (flip) ao clicar
    let atual = null;
    const soltar = (el) => { if (el) { el.style.transform = ""; el.style.transition = ""; } };

    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const el = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (el !== atual) {
        soltar(atual);
        atual = el;
        if (el) el.style.transition = "transform .12s ease-out, border-color .2s ease, box-shadow .2s ease";
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(800px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-3px)`;
    }, { passive: true });

    document.documentElement.addEventListener("pointerleave", () => { soltar(atual); atual = null; });
  }

  /* ---------------------------------------------------------
     6. BARRA "IR PARA" (navegação por seções)
     --------------------------------------------------------- */
  function iniciarNavegacaoSecoes() {
    document.querySelectorAll(".tab-panel").forEach((painel) => {
      const secoes = [...painel.querySelectorAll(":scope > section")].filter((s) => s.querySelector("h2"));
      if (secoes.length < 2) return;

      const nav = document.createElement("nav");
      nav.className = "fx-jump";
      nav.setAttribute("aria-label", "Ir para seção");
      const links = new Map();

      secoes.forEach((sec, i) => {
        if (!sec.id) sec.id = `${painel.id}-secao-${i}`;
        const a = document.createElement("a");
        a.href = "#" + sec.id;
        a.textContent = sec.querySelector("h2").textContent.trim();
        a.addEventListener("click", (e) => {
          e.preventDefault();
          sec.scrollIntoView({ behavior: REDUZIDO ? "auto" : "smooth", block: "start" });
        });
        nav.appendChild(a);
        links.set(sec, a);
      });
      painel.insertBefore(nav, painel.firstChild);

      const obs = new IntersectionObserver((entradas) => {
        entradas.forEach((en) => {
          if (!en.isIntersecting) return;
          links.forEach((a) => a.classList.remove("is-active"));
          links.get(en.target).classList.add("is-active");
        });
      }, { rootMargin: "-20% 0px -65% 0px" });
      secoes.forEach((s) => obs.observe(s));
    });
  }

  /* ---------------------------------------------------------
     PÓDIO SIMPLES (celular / sem WebGL) — top 3 em HTML/CSS
     --------------------------------------------------------- */
  function montarPodioSimples(el, ranking, un, rotulo) {
    el.replaceChildren();
    el.classList.remove("podio-simples--vazio");

    if (!ranking) {                       // ainda carregando
      el.classList.add("podio-simples--carregando");
      el.setAttribute("aria-busy", "true");
      el.appendChild(criarSkeletonPodio());
      return;
    }
    el.classList.remove("podio-simples--carregando");
    el.removeAttribute("aria-busy");

    const lista = ranking.filter((x) => (x.contratos || 0) > 0).slice(0, 3);
    if (!lista.length) {
      el.classList.add("podio-simples--vazio");
      const p = document.createElement("p");
      p.className = "podio-simples__vazio";
      p.textContent = ranking.length ? un.vazio : "Sem dados de ranking no período.";
      el.appendChild(p);
      return;
    }

    const max = Math.max(...lista.map((x) => x.contratos), 1);
    /* Ordem clássica de pódio: 2º, 1º, 3º */
    const ordem = lista.length >= 3 ? [1, 0, 2] : lista.length === 2 ? [1, 0] : [0];

    const palco = document.createElement("ol");
    palco.className = "podio-simples__palco";
    palco.setAttribute("aria-label", rotulo);

    ordem.forEach((i) => {
      const x = lista[i];
      const li = document.createElement("li");
      li.className = `podio-simples__col podio-simples__col--${i + 1}`;
      li.style.setProperty("--h", String(Math.max(26, Math.round((x.contratos / max) * 100))));

      const nome = document.createElement("span");
      nome.className = "podio-simples__nome";
      nome.textContent = String(x.nome || "—");

      const valor = document.createElement("strong");
      valor.className = "podio-simples__valor";
      valor.textContent = fmtNum(x.contratos);

      const unid = document.createElement("small");
      unid.className = "podio-simples__unid";
      unid.textContent = x.contratos === 1 ? un.singular : un.plural;

      const bloco = document.createElement("div");
      bloco.className = "podio-simples__bloco";
      const pos = document.createElement("b");
      pos.textContent = `${i + 1}º`;
      bloco.appendChild(pos);

      li.append(nome, valor, unid, bloco);
      palco.appendChild(li);
    });
    el.appendChild(palco);
  }

  /* ---------------------------------------------------------
     INICIALIZAÇÃO
     --------------------------------------------------------- */
  const stages = [];
  const MQ_SIMPLES = window.matchMedia("(max-width: 768px)");
  const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  let estadoThree = typeof THREE !== "undefined" ? "ok" : "ocioso"; // ocioso | carregando | ok | erro

  const UNIDADE_CONTRATOS = { singular: "contrato", plural: "contratos", vazio: "Nenhum contrato fechado no período selecionado." };
  const UNIDADE_VENDAS = { singular: "venda", plural: "vendas", vazio: "Nenhuma venda registrada no período selecionado." };

  const PALCO_OPCOES = {
    cam: { y: 4.6, z: 12.5, ty: 2 },
    rotX0: 0, rotXMin: -0.2, rotXMax: 0.5, auto: false,
    dica: "Arraste para girar · passe o mouse nas barras para ver os detalhes"
  };

  /* Cada pódio: host do 3D, contêiner do pódio simples, ranking mais recente e (quando existir) o palco 3D */
  const podios = [
    {
      id: "sdr", hostId: "fx-podio", rotulo: "Pódio de contratos por SDR", unidade: UNIDADE_CONTRATOS,
      adaptar: (r) => r
    },
    {
      id: "vend", hostId: "fx-podio-vendedores", rotulo: "Pódio de vendas por vendedor", unidade: UNIDADE_VENDAS,
      /* Reaproveita o pódio dos SDRs: "contratos" aqui representa as vendas do vendedor */
      adaptar: (r) => r.map((v) => ({ nome: v.nome, contratos: v.vendas || 0, faturamento: v.faturamento || 0 }))
    }
  ];
  podios.forEach((p) => { p.host = null; p.simples = null; p.palco = null; p.ranking = null; });

  /* Baixa o Three.js só quando o pódio 3D é realmente necessário (desktop) */
  function garantirThree() {
    if (estadoThree !== "ocioso") return;
    estadoThree = "carregando";
    new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = THREE_URL;
      el.async = true;
      el.onload = () => (typeof THREE !== "undefined" ? resolve() : reject(new Error("THREE indisponível")));
      el.onerror = () => reject(new Error("Falha ao baixar o Three.js"));
      document.head.appendChild(el);
    }).then(() => {
      estadoThree = "ok";
      atualizarPodios();
    }).catch((e) => {
      estadoThree = "erro";
      document.documentElement.classList.add("fx-off");
      console.warn("[fx] Three.js não carregou — usando o pódio simples.", e);
      atualizarPodios();
    });
  }

  function carregandoRanking(p) {
    if (p.id === "sdr") return typeof dadosComerciaisCarregados !== "undefined" && !dadosComerciaisCarregados;
    return typeof dadosVendasCarregadas !== "undefined" && !dadosVendasCarregadas;
  }

  let loopAtivo = false;
  function iniciarLoop() {
    if (loopAtivo) return;
    loopAtivo = true;
    let anterior = performance.now();
    (function loop(agora) {
      requestAnimationFrame(loop);
      if (document.hidden) { anterior = agora; return; }
      const dt = Math.min((agora - anterior) / 1000, 0.05);
      anterior = agora;
      const t = agora / 1000;
      stages.forEach((st) => st.tick(t, dt));
    })(anterior);
  }

  function atualizarPodio(p) {
    if (!p.host) return;
    const dados = !p.ranking || carregandoRanking(p) ? null : p.adaptar(p.ranking);
    const simples = MQ_SIMPLES.matches || estadoThree === "erro" || (p.palco && p.palco.morto);

    if (simples) {
      p.host.hidden = true;
      p.simples.hidden = false;
      montarPodioSimples(p.simples, dados, p.unidade, p.rotulo);
      return;
    }

    garantirThree();
    if (estadoThree !== "ok") {          // baixando o Three.js: skeleton no mesmo espaço
      p.host.hidden = true;
      p.simples.hidden = false;
      montarPodioSimples(p.simples, null, p.unidade, p.rotulo);
      return;
    }

    p.simples.hidden = true;
    p.host.hidden = false;
    if (!p.palco) {
      p.palco = new Palco(p.host, Object.assign({ rotulo: `${p.rotulo} (3D)` }, PALCO_OPCOES));
      if (p.palco.morto) { atualizarPodio(p); return; } // sem WebGL: cai no pódio simples
      iniciarLoop();
    }
    if (dados) montarPodio(p.palco, dados, p.unidade);
    else p.palco.aguardar();
  }

  function atualizarPodios() { podios.forEach(atualizarPodio); }

  /* Escuta as funções do script.js sem modificá-las */
  function escutar(nome, fn) {
    const original = window[nome];
    if (typeof original !== "function") return;
    window[nome] = function () {
      const r = original.apply(this, arguments);
      try { fn.apply(null, arguments); } catch (e) { console.error("[fx]", nome, e); }
      return r;
    };
  }

  escutar("renderizarRanking", (ranking) => { podios[0].ranking = ranking; atualizarPodio(podios[0]); });
  escutar("renderizarRankingVendedores", (ranking) => { podios[1].ranking = ranking; atualizarPodio(podios[1]); });

  function iniciar() {
    podios.forEach((p) => {
      p.host = document.getElementById(p.hostId);
      if (!p.host) return;
      p.simples = document.createElement("div");
      p.simples.className = "podio-simples";
      p.simples.hidden = true;
      p.simples.setAttribute("role", "group");
      p.simples.setAttribute("aria-label", p.rotulo);
      p.host.insertAdjacentElement("afterend", p.simples);
    });

    if (MQ_SIMPLES.addEventListener) MQ_SIMPLES.addEventListener("change", atualizarPodios);
    else if (MQ_SIMPLES.addListener) MQ_SIMPLES.addListener(atualizarPodios);

    atualizarPodios();
    iniciarInclinacao();
    iniciarNavegacaoSecoes();
  }

  iniciar();
})();
