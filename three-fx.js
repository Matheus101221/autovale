/* ==========================================================
   AUTO VALE MULTIMARCAS — CAMADA 3D (Three.js)
   Não altera a lógica do dashboard: apenas "escuta" as funções
   de renderização já existentes (ranking e funil) e adiciona:
     1. Pódio 3D dos SDRs (barras de contratos) — Comercial
     2. Funil 3D com fluxo de leads — Marketing
     3. Cards com inclinação 3D ao passar o mouse
     4. Barra "Ir para" fixa, com seção ativa destacada
   Se o Three.js ou o WebGL não estiverem disponíveis, o dashboard
   continua funcionando normalmente, só sem os efeitos.
   ========================================================== */
(function () {
  "use strict";

  if (typeof THREE === "undefined") {
    document.documentElement.classList.add("fx-off");
    console.warn("[fx] Three.js não carregou — o dashboard segue sem 3D.");
    return;
  }

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

  /* ---------------------------------------------------------
     2. PALCO 3D REUTILIZÁVEL (pódio e funil)
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
            <button type="button" data-acao="girar" aria-pressed="true">Movimento automático</button>
            <button type="button" data-acao="reset">Recentralizar</button>
          </div>
        </div>
        <div class="fx-stage__view">
          <canvas class="fx-stage__canvas" role="img" aria-label="${op.rotulo}"></canvas>
          <div class="fx-stage__tip" hidden></div>
          <div class="fx-stage__msg">Carregando…</div>
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
      this.auto = true;
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

      this.host.querySelector('[data-acao="girar"]').addEventListener("click", (e) => {
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
     4. CENA: FUNIL
     --------------------------------------------------------- */
  function montarFunil(palco, etapas) {
    palco.limpar();
    const lista = etapas || [];
    if (!lista.length) { palco.mensagem("Não há dados suficientes para montar o funil neste período."); return; }

    const max = Math.max(...lista.map((e) => e.valor), 1);
    const raio = (e) => 0.75 + 2.25 * Math.sqrt(Math.max(e.valor, 0) / max);
    const altSeg = 1.1, vao = 0.1, n = lista.length;
    const alturaTotal = n * altSeg + (n - 1) * vao;
    const topo = alturaTotal / 2;
    const perfil = [];

    const itens = lista.map((e, i) => {
      const rTopo = raio(e);
      const rBase = i < n - 1 ? raio(lista[i + 1]) : rTopo * 0.72;
      const yMeio = topo - altSeg / 2 - i * (altSeg + vao);
      perfil.push({ yTopo: yMeio + altSeg / 2, yBase: yMeio - altSeg / 2, rTopo, rBase });

      const cor = gradiente(n > 1 ? i / (n - 1) : 0);
      const geo = new THREE.CylinderGeometry(rTopo, rBase, altSeg, 56, 1, false);
      const mat = new THREE.MeshStandardMaterial({ color: cor, metalness: 0.2, roughness: 0.35, emissive: cor, emissiveIntensity: 0.18, transparent: true, opacity: 0.85 });
      const seg = new THREE.Mesh(geo, mat);
      seg.position.y = yMeio;
      seg.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })));
      palco.grupo.add(seg);

      const txt = criarRotulo(fmtNum(e.valor), e.label, 56);
      txt.position.set(0, yMeio, 0);
      palco.grupo.add(txt);

      return {
        rotulo: e.label,
        forte: fmtNum(e.valor),
        sub: i === 0 ? "Entrada do funil" : `${fmtPct(e.percentual)} de conversão`,
        cor: "#" + cor.getHexString(),
        meshes: [seg],
        ativo: 0,
        passo(age) {
          const g = REDUZIDO ? 1 : easeOut(clamp((age - i * 0.15) / 0.7, 0, 1));
          const pop = 1 + 0.05 * this.ativo;
          const s = Math.max(0.001, g * pop);
          seg.scale.set(s, 1, s);
          mat.opacity = 0.35 + 0.55 * g;
          mat.emissiveIntensity = 0.18 + 0.6 * this.ativo;
          txt.material.opacity = g;
        }
      };
    });

    /* Fluxo de leads descendo pelo funil */
    const raioEm = (y) => {
      const p = perfil.find((s) => y <= s.yTopo && y >= s.yBase) || (y > perfil[0].yTopo ? perfil[0] : perfil[perfil.length - 1]);
      const k = clamp((p.yTopo - y) / (p.yTopo - p.yBase), 0, 1);
      return lerp(p.rTopo, p.rBase, k);
    };
    const qtd = 70;
    const fluxo = Array.from({ length: qtd }, () => ({ k: Math.random(), ang: Math.random() * Math.PI * 2, v: 0.08 + Math.random() * 0.1, r: 0.2 + Math.random() * 0.65 }));
    const buf = new Float32Array(qtd * 3);
    const geoFluxo = new THREE.BufferGeometry();
    geoFluxo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
    const pts = new THREE.Points(geoFluxo, new THREE.PointsMaterial({ color: COR.gold, size: 0.12, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    palco.grupo.add(pts);
    const atualizarFluxo = (dt) => {
      fluxo.forEach((p, i) => {
        if (!REDUZIDO) p.k = (p.k + dt * p.v) % 1;
        const y = topo - p.k * alturaTotal;
        const r = raioEm(y) * p.r;
        buf[i * 3] = Math.cos(p.ang + p.k * 6) * r;
        buf[i * 3 + 1] = y;
        buf[i * 3 + 2] = Math.sin(p.ang + p.k * 6) * r;
      });
      geoFluxo.attributes.position.needsUpdate = true;
    };
    atualizarFluxo(0);
    palco.extra = (t, dt) => atualizarFluxo(dt);

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
     INICIALIZAÇÃO
     --------------------------------------------------------- */
  const stages = [];
  let palcoPodio = null;
  let palcoFunil = null;
  let palcoPodioVend = null;
  let ultimoRankingVend = null;
  let ultimoRanking = null;
  let ultimoFunil = null;

  /* Escuta as funções do script.js sem modificá-lo */
  function escutar(nome, fn) {
    const original = window[nome];
    if (typeof original !== "function") return;
    window[nome] = function () {
      const r = original.apply(this, arguments);
      try { fn.apply(null, arguments); } catch (e) { console.error("[fx]", nome, e); }
      return r;
    };
  }

  function atualizarPodio() {
    if (!palcoPodio || palcoPodio.morto || !ultimoRanking) return;
    montarPodio(palcoPodio, ultimoRanking);
  }

  function atualizarFunil() {
    if (!palcoFunil || palcoFunil.morto || !ultimoFunil) return;
    const [etapas, temDados, carregando] = ultimoFunil;
    if (carregando) return palcoFunil.mensagem("Carregando funil…");
    if (temDados === false) return palcoFunil.mensagem("Não há dados suficientes para montar o funil neste período.");
    montarFunil(palcoFunil, etapas);
  }

  const UNIDADE_VENDAS = { plural: "vendas", vazio: "Nenhuma venda registrada no período selecionado." };
  function atualizarPodioVendedores() {
    if (!palcoPodioVend || palcoPodioVend.morto || !ultimoRankingVend) return;
    /* Reaproveita o pódio dos SDRs: "contratos" aqui representa as vendas do vendedor */
    const adaptado = ultimoRankingVend.map((v) => ({ nome: v.nome, contratos: v.vendas || 0, faturamento: v.faturamento || 0 }));
    montarPodio(palcoPodioVend, adaptado, UNIDADE_VENDAS);
  }

  escutar("renderizarRanking", (ranking) => { ultimoRanking = ranking; atualizarPodio(); });
  escutar("renderizarRankingVendedores", (ranking) => { ultimoRankingVend = ranking; atualizarPodioVendedores(); });
  escutar("renderizarFunil", (etapas, temDados, carregando) => { ultimoFunil = [etapas, temDados, carregando]; atualizarFunil(); });

  function iniciar() {
    const hostPodio = document.getElementById("fx-podio");
    const hostFunil = document.getElementById("fx-funil");

    if (hostPodio) {
      palcoPodio = new Palco(hostPodio, {
        rotulo: "Pódio 3D de contratos por SDR",
        dica: "Arraste para girar · passe o mouse nas barras para ver os detalhes",
        cam: { y: 4.6, z: 12.5, ty: 2 },
        rotX0: 0, rotXMin: -0.2, rotXMax: 0.5, auto: "orbita"
      });
      if (!palcoPodio.morto) palcoPodio.mensagem("Carregando ranking…");
    }
    const hostPodioVend = document.getElementById("fx-podio-vendedores");
    if (hostPodioVend) {
      palcoPodioVend = new Palco(hostPodioVend, {
        rotulo: "Pódio 3D de vendas por vendedor",
        dica: "Arraste para girar · passe o mouse nas barras para ver os detalhes",
        cam: { y: 4.6, z: 12.5, ty: 2 },
        rotX0: 0, rotXMin: -0.2, rotXMax: 0.5, auto: "orbita"
      });
      if (!palcoPodioVend.morto) palcoPodioVend.mensagem("Carregando ranking…");
    }
    if (hostFunil) {
      palcoFunil = new Palco(hostFunil, {
        rotulo: "Funil 3D de conversão",
        dica: "Arraste para inclinar · passe o mouse em cada etapa para ver a conversão",
        cam: { y: 3.2, z: 12.5, ty: 0 },
        rotX0: 0.3, rotXMin: -0.1, rotXMax: 1.0, auto: "inclinar"
      });
      if (!palcoFunil.morto) palcoFunil.mensagem("Carregando funil…");
    }

    atualizarPodio();
    atualizarPodioVendedores();
    atualizarFunil();
    iniciarInclinacao();
    iniciarNavegacaoSecoes();

    let anterior = performance.now();
    (function loop(agora) {
      requestAnimationFrame(loop);
      if (document.hidden) { anterior = agora; return; }
      const dt = Math.min((agora - anterior) / 1000, 0.05);
      anterior = agora;
      const t = agora / 1000;
      stages.forEach((p) => p.tick(t, dt));
    })(anterior);
  }

  iniciar();
})();
