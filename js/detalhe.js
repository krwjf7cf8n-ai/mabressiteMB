
(function(){
  const WHATSAPP_NUMBERS = ["5515997284640","5515991183202"];
  const DEFAULT_TEXT = "Olá! Vim pelo site da Mabres Negócios Imobiliários. Quero atendimento, por favor.";

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const item = (window.LISTINGS || []).find(x => x.id === id) || (window.LISTINGS || [])[0];

  const root = document.getElementById("detailRoot");
  const year = document.getElementById("year");
  if(year) year.textContent = String(new Date().getFullYear());

  function safeText(v){
    return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function formatBRL(value){
    return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
  }
  function waLink(text){
    const t = encodeURIComponent(text || DEFAULT_TEXT);
    return `https://wa.me/${WHATSAPP_NUMBERS[0]}?text=${t}`;
  }

  if(!item){
    root.innerHTML = "<p>Imóvel não encontrado.</p>";
    return;
  }

  const waBtn = document.getElementById("whatsDetail");
  const msg = item.whatsappMessage || `Olá! Tenho interesse no imóvel ${item.id} (${item.title}). Pode me enviar mais detalhes e fotos?`;
  if(waBtn) waBtn.href = waLink(msg);

  const imgs = (item.images && item.images.length ? item.images : [item.cover || "assets/placeholder.jpg"]);
  const slides = imgs.map((src)=>`
    <div class="carousel__slide"><img src="${safeText(src)}" alt="${safeText(item.title)}"></div>
  `).join("");
  const dots = imgs.map((_,i)=>`<span class="carousel__dot ${i===0?'is-active':''}"></span>`).join("");

  root.innerHTML = `
    <div class="detail__grid">
      <div>
        <div class="card" style="border-radius: var(--radius2); overflow:hidden">
          <div class="card__img" style="height: 420px">
            <div class="carousel" data-carousel="detail">
              <div class="carousel__track" style="height:420px">${slides}</div>
              ${imgs.length>1?`<button class="carousel__nav prev" type="button" aria-label="Foto anterior">‹</button>
              <button class="carousel__nav next" type="button" aria-label="Próxima foto">›</button>
              <div class="carousel__dots" aria-hidden="true">${dots}</div>`:""}
            </div>
          </div>
        </div>

        <div class="detailCard" style="margin-top:14px">
          <span class="tag">${safeText(item.status)} • ${safeText(item.type)}</span>
          <h1 style="margin:10px 0 8px">${safeText(item.title)}</h1>
          <div class="meta">${safeText(item.location)} • ${safeText(item.zone || "")}</div>
          <p class="meta" style="margin-top:10px">${safeText(item.descriptionLong || item.description || "")}</p>
          ${item.features && item.features.length ? `
            <ul class="checklist">
              ${item.features.map(f=>`<li>${safeText(f)}</li>`).join("")}
            </ul>
          `:""}
        </div>
      </div>

      <aside class="detailCard">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start">
          <div>
            <div class="meta">Código</div>
            <div class="title" style="margin-top:4px">${safeText(item.id)}</div>
          </div>
          <div style="text-align:right">
            <div class="meta">Preço</div>
            <div class="title" style="margin-top:4px">${safeText(formatBRL(item.price))}${item.status==="Locação"?" / mês":""}</div>
          </div>
        </div>

        <div class="kv">
          <div class="kvRow"><span>Quartos</span><strong>${Number(item.beds||0)}</strong></div>
          <div class="kvRow"><span>Banheiros</span><strong>${Number(item.baths||0)}</strong></div>
          <div class="kvRow"><span>Área</span><strong>${Number(item.area||0)} m²</strong></div>
          <div class="kvRow"><span>Vagas</span><strong>${Number(item.parking||0)}</strong></div>
        </div>

        <a class="btn" style="width:100%; margin-top:12px" href="${safeText(waLink(msg))}" rel="noopener">Falar no WhatsApp</a>
        <p class="form__hint" style="margin-top:10px">Dica: envie o código <strong>${safeText(item.id)}</strong> para atendimento mais rápido.</p>
      </aside>
    </div>
  `;

  // init carousel
  const rootCar = document.querySelector('[data-carousel="detail"]');
  if(rootCar){
    const track = rootCar.querySelector(".carousel__track");
    const prev = rootCar.querySelector(".carousel__nav.prev");
    const next = rootCar.querySelector(".carousel__nav.next");
    const dotEls = Array.from(rootCar.querySelectorAll(".carousel__dot"));
    const slideW = ()=> track.getBoundingClientRect().width || 1;

    const setActive = ()=>{
      const i = Math.round(track.scrollLeft / slideW());
      dotEls.forEach((d,idx)=> d.classList.toggle("is-active", idx===i));
    };

    track.addEventListener("scroll", ()=> window.requestAnimationFrame(setActive), {passive:true});
    if(prev) prev.addEventListener("click", ()=> track.scrollBy({left:-slideW(), behavior:"smooth"}));
    if(next) next.addEventListener("click", ()=> track.scrollBy({left: slideW(), behavior:"smooth"}));
  }
})();
