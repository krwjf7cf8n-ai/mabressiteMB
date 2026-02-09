(function () {
  const WHATSAPP_NUMBERS = [
    "5515997284640", // WhatsApp 1 (padrão)
    "5515991183202"  // WhatsApp 2
  ];

  const WHATSAPP_DEFAULT_TEXT =
    "Olá! Vim pelo site da Mabres Negócios Imobiliários. Quero atendimento, por favor.";

  let activeWaIndex = 0;

  const elGrid = document.getElementById("listingsGrid");
  const elCount = document.getElementById("resultsCount");
  const elStatCount = document.getElementById("statCount");
  const elYear = document.getElementById("year");

  const form = document.getElementById("searchForm");
  const qLocation = document.getElementById("qLocation");
  const qZone = document.getElementById("qZone");
  const qType = document.getElementById("qType");
  const qBeds = document.getElementById("qBeds");
  const qPrice = document.getElementById("qPrice");
  const chips = document.getElementById("activeChips");
  const btnClear = document.getElementById("clearFilters");

  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  const linksWhats = [
    document.getElementById("whatsFloat"),
    document.getElementById("whatsTop"),
    document.getElementById("whatsCta"),
    document.getElementById("whatsContact")
  ].filter(Boolean);

  const elWhatsNumber = document.getElementById("whatsNumber");
  const waBtn1 = document.getElementById("waBtn1");
  const waBtn2 = document.getElementById("waBtn2");

  function currentWaNumber() {
    return WHATSAPP_NUMBERS[activeWaIndex] || WHATSAPP_NUMBERS[0];
  }

  function waLink(text) {
    const t = encodeURIComponent(text || WHATSAPP_DEFAULT_TEXT);
    return `https://wa.me/${currentWaNumber()}?text=${t}`;
  }

  function formatPhoneBR(num) {
    const n = String(num).replace(/\D/g, "");
    if (n.length >= 13) {
      const ddd = n.slice(2, 4);
      const part1 = n.slice(4, 9);
      const part2 = n.slice(9, 13);
      return `+55 ${ddd} ${part1}-${part2}`;
    }
    return `+${n}`;
  }

  function refreshWhatsLinks() {
    linksWhats.forEach(a => a.setAttribute("href", waLink(WHATSAPP_DEFAULT_TEXT)));
    if (elWhatsNumber) elWhatsNumber.textContent = formatPhoneBR(currentWaNumber());
  }

  function setActiveWa(index) {
    activeWaIndex = index === 1 ? 1 : 0;
    if (waBtn1 && waBtn2) {
      waBtn1.classList.toggle("is-active", activeWaIndex === 0);
      waBtn2.classList.toggle("is-active", activeWaIndex === 1);
    }
    refreshWhatsLinks();

    // Re-render cards para atualizar links de WhatsApp dentro de cada imóvel
    const f = getFilters();
    const all = (window.LISTINGS || []).slice();
    const filtered = all.filter(item => matches(item, f));
    render(filtered.length ? filtered : all.filter(x => x.featured !== false));
  }

  function formatBRL(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }

  function safeText(s) {
    return String(s ?? "").replace(/[<>]/g, "");
  }

  function parsePriceRange(v) {
    if (!v) return null;
    const parts = v.split("-").map(Number);
    if (parts.length !== 2) return null;
    const [min, max] = parts;
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
    return null;
  }

  function applyChips(filters) {
    chips.innerHTML = "";
    const items = [];

    if (filters.zone) items.push(["Zona", filters.zone]);
    if (filters.location) items.push(["Local", filters.location]);
    if (filters.type) items.push(["Tipo", filters.type]);
    if (filters.beds) items.push(["Quartos", `${filters.beds}+`]);
    if (filters.price) items.push(["Preço", filters.priceLabel]);

    items.forEach(([k, v]) => {
      const span = document.createElement("span");
      span.className = "chip2";
      span.textContent = `${k}: ${v}`;
      chips.appendChild(span);
    });
  }

  function getFilters() {
    const location = safeText(qLocation.value).trim();
    const type = qType.value;
    const beds = qBeds.value ? Number(qBeds.value) : null;
    const range = parsePriceRange(qPrice.value);

    let priceLabel = "";
    if (qPrice.value) priceLabel = qPrice.options[qPrice.selectedIndex]?.textContent || "";

        const zone = qZone ? qZone.value : "";

    return { location, zone, type, beds, range, price: qPrice.value, priceLabel };
  }

  function matches(item, filters) {
    if (filters.zone && String(item.zone || "") !== filters.zone) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.beds && Number(item.beds || 0) < filters.beds) return false;

    if (filters.range) {
      const p = Number(item.price || 0);
      if (p < filters.range.min || p > filters.range.max) return false;
    }

    if (filters.location) {
      const hay = `${item.location} ${item.title} ${item.type}`.toLowerCase();
      const needle = filters.location.toLowerCase();
      if (!hay.includes(needle)) return false;
    }

    return true;
  }

  
  function carouselTemplate(item){
    const imgs = (item.images && item.images.length ? item.images : [item.cover || "assets/placeholder.jpg"]);
    const slides = imgs.map((src) => `
      <div class="carousel__slide">
        <img src="${safeText(src)}" alt="${safeText(item.title)}" loading="lazy">
      </div>
    `).join("");
    const dots = imgs.map((_,i)=>`<span class="carousel__dot ${i===0?'is-active':''}" data-i="${i}"></span>`).join("");
    return `
      <div class="carousel" data-carousel="${safeText(item.id)}">
        <div class="carousel__track">${slides}</div>
        ${imgs.length>1?`<button class="carousel__nav prev" type="button" aria-label="Foto anterior">‹</button>
        <button class="carousel__nav next" type="button" aria-label="Próxima foto">›</button>
        <div class="carousel__dots" aria-hidden="true">${dots}</div>`:""}
      </div>
    `;
  }

function cardTemplate(item) {
    const price = formatBRL(item.price);
    const rentSuffix = "";
    const cover = item.cover || "assets/placeholder.jpg";

    const text = item.whatsappMessage || `Olá! Tenho interesse no imóvel ${item.id}. Pode me enviar mais detalhes?`;
    const link = waLink(text);

    return `
      <article class="card" data-id="${safeText(item.id)}">
        
        <div class="card__img">
          <a href="detalhe.html?id=${safeText(item.id)}" aria-label="Abrir anúncio completo">
            ${carouselTemplate(item)}
          </a>
        </div>
        <div class="card__body">
          <div class="card__top">
            <span class="tag">${safeText(item.status)} • ${safeText(item.type)}</span>
            <span class="price">${price}${rentSuffix}</span>
          </div>

          <h3 class="title"><a href="detalhe.html?id=${safeText(item.id)}">${safeText(item.title)}</a></h3>
          <div class="meta">${safeText(item.location)}</div>
          <div class="specs">
            <span class="spec">🛏 ${Number(item.beds || 0)} quartos</span>
            <span class="spec">🛁 ${Number(item.baths || 0)} banh.</span>
            <span class="spec">📐 ${Number(item.area || 0)} m²</span>
            <span class="spec">🚗 ${Number(item.parking || 0)} vaga(s)</span>
          </div>

          <div class="meta">${safeText(item.description || "")}</div>

          <div class="card__actions">
            <a class="btn2" href="detalhe.html?id=${safeText(item.id)}">Ver detalhes</a>
            <a class="btn2" href="${link}" target="_blank" rel="noopener">WhatsApp</a>
            <button class="btn2" type="button" data-copy="${safeText(item.id)}">Copiar código</button>
          </div>
        </div>
      </article>
    `;
  }

  
  function initCarousels(){
    elGrid.querySelectorAll("[data-carousel]").forEach((root)=>{
      const track = root.querySelector(".carousel__track");
      const prev = root.querySelector(".carousel__nav.prev");
      const next = root.querySelector(".carousel__nav.next");
      const dots = Array.from(root.querySelectorAll(".carousel__dot"));
      if(!track || !prev || !next) return;

      const slideW = ()=> track.getBoundingClientRect().width || 1;
      const setActive = ()=>{
        const i = Math.round(track.scrollLeft / slideW());
        dots.forEach((d,idx)=> d.classList.toggle("is-active", idx===i));
      };

      track.addEventListener("scroll", ()=> window.requestAnimationFrame(setActive), {passive:true});
      prev.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); track.scrollBy({left:-slideW(), behavior:"smooth"}); });
      next.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); track.scrollBy({left: slideW(), behavior:"smooth"}); });
    });
  }

  function render(list) {
    elGrid.innerHTML = list.map(cardTemplate).join("");
    initCarousels();
    elCount.textContent = `${list.length} resultado(s)`;

    elGrid.querySelectorAll("button[data-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const code = btn.getAttribute("data-copy");
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = "Copiado!";
          setTimeout(() => (btn.textContent = "Copiar código"), 1200);
        } catch {
          btn.textContent = "Falhou";
          setTimeout(() => (btn.textContent = "Copiar código"), 1200);
        }
      });
    });
  }

  function initMenu() {
    if (!navToggle || !navMenu) return;

    navToggle.addEventListener("click", () => {
      const open = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });

    navMenu.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initFormWhats() {
    const leadForm = document.getElementById("leadForm");
    if (!leadForm) return;

    leadForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(leadForm);
      const name = String(data.get("name") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const message = String(data.get("message") || "").trim();

      const text =
`Olá! Vim pelo site da Mabres Negócios Imobiliários.
Nome: ${name}
Telefone: ${phone}
Mensagem: ${message}`;

      window.open(waLink(text), "_blank", "noopener");
      leadForm.reset();
    });
  }

  function animateCount(total) {
    const start = 0;
    const end = Math.max(0, Number(total || 0));
    const duration = 650;
    const t0 = performance.now();

    function step(t) {
      const p = Math.min(1, (t - t0) / duration);
      const val = Math.floor(start + (end - start) * p);
      elStatCount.textContent = `+${val}`;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initFiltering() {
    const all = (window.LISTINGS || []).slice();
    const initial = all.filter(x => x.featured !== false);

    render(initial);
    animateCount(all.length);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = getFilters();
      const filtered = all.filter(item => matches(item, f));
      applyChips({
        zone: f.zone || "",
        location: f.location || "",
        type: f.type || "",
        beds: f.beds || "",
        price: f.price || "",
        priceLabel: f.priceLabel || ""
      });
      render(filtered);
    });

    btnClear.addEventListener("click", () => {
      qZone.value = "";
      qLocation.value = "";
      qType.value = "";
      qBeds.value = "";
      qPrice.value = "";
      chips.innerHTML = "";
      render(initial);
    });
  }

  function initWaSwitcher() {
    if (waBtn1) waBtn1.addEventListener("click", () => setActiveWa(0));
    if (waBtn2) waBtn2.addEventListener("click", () => setActiveWa(1));
    refreshWhatsLinks();
  }

  // Start
  if (elYear) elYear.textContent = String(new Date().getFullYear());
  initMenu();
  initFormWhats();
  initFiltering();
  initWaSwitcher();
})();