(() => {
"use strict";
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

/* ---------------- state ---------------- */
const S = { settings: { ...CFG.DEFAULTS }, cats: [], products: [], loaded: false, error: null };
let cart = [];
try { cart = JSON.parse(localStorage.getItem("sv_cart") || "[]"); } catch (e) { cart = []; }
const F = { cat: "", q: "", sort: "new", min: "", max: "", brand: "", stock: false };

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const st = (k) => S.settings[k] ?? CFG.DEFAULTS[k] ?? "";
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const catOf = (id) => S.cats.find((c) => c.id === id);
const prodOf = (id) => S.products.find((p) => p.id === id);
const saveCart = () => { localStorage.setItem("sv_cart", JSON.stringify(cart)); };
const disc = (p) => (p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0);

function toast(msg, err) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".4s"; setTimeout(() => t.remove(), 400); }, 3200);
}
function img(p, alt) {
  if (p && p.image_url) return `<img loading="lazy" src="${esc(p.image_url)}" alt="${esc(alt || p.name)}">`;
  const c = p && catOf(p.category_id);
  return `<div class="ph">${c ? esc(c.emoji) : "🏅"}</div>`;
}
function reveal() {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$(".reveal:not(.in)").forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + "ms"; io.observe(el); });
}

/* ---------------- data ---------------- */
async function load() {
  try {
    const [c, p, s] = await Promise.all([
      sb.from("categories").select("*").order("sort_order"),
      sb.from("products").select("*").eq("active", true).order("created_at", { ascending: false }),
      sb.from("site_settings").select("*"),
    ]);
    if (c.error) throw c.error;
    if (p.error) throw p.error;
    S.cats = c.data || [];
    S.products = (p.data || []).map((x) => ({ ...x, price: Number(x.price), mrp: x.mrp ? Number(x.mrp) : null }));
    const LOCKED = ["upi_id", "upi_name", "pay_number"]; // payment details come only from config.js, never the database
    (s.data || []).forEach((r) => { if (r.value !== null && r.value !== "" && !LOCKED.includes(r.key)) S.settings[r.key] = r.value; });
    S.error = null;
  } catch (e) {
    console.error(e);
    S.error = e.message || String(e);
  }
  S.loaded = true;
}

/* ---------------- cart ---------------- */
const cartCount = () => cart.reduce((a, i) => a + i.qty, 0);
function cartLines() {
  return cart.map((i) => ({ ...i, p: prodOf(i.id) })).filter((i) => i.p);
}
const subtotal = () => cartLines().reduce((a, i) => a + i.p.price * i.qty, 0);
function shipping(sub) {
  const free = Number(st("free_shipping_above")), fee = Number(st("shipping_fee"));
  if (!sub) return 0;
  return free > 0 && sub >= free ? 0 : fee || 0;
}
function refreshBadge(bump) {
  const b = $("#cartCount");
  b.textContent = cartCount();
  if (bump) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
}
function addToCart(id, qty = 1, size = "", silent) {
  const p = prodOf(id);
  if (!p) return false;
  if (p.stock <= 0) { toast("Sorry, this item is out of stock", true); return false; }
  const ex = cart.find((i) => i.id === id && (i.size || "") === (size || ""));
  const have = cart.filter((i) => i.id === id).reduce((a, i) => a + i.qty, 0);
  if (have + qty > p.stock) { toast(`Only ${p.stock} in stock`, true); return false; }
  if (ex) ex.qty += qty; else cart.push({ id, qty, size: size || "" });
  saveCart(); refreshBadge(true);
  if (!silent) toast("Added to cart ✓");
  return true;
}
function openDrawer() { renderDrawer(); $("#drawer").classList.add("on"); $("#overlay").classList.add("on"); }
function closeAll() { $("#drawer").classList.remove("on"); $("#overlay").classList.remove("on"); $("#nav").classList.remove("on"); const f = $(".filters"); if (f) f.classList.remove("on"); }
function renderDrawer() {
  const lines = cartLines();
  const body = $("#drawerBody"), foot = $("#drawerFoot");
  if (!lines.length) {
    body.innerHTML = `<div class="empty"><span class="em">🛒</span><p><b>Your cart is empty</b></p><p>Add some gear and let's get you game-ready!</p></div>`;
    foot.innerHTML = `<a href="#/shop" class="btn btn-gold btn-block" data-close>Start Shopping</a>`;
    return;
  }
  body.innerHTML = lines.map((i, idx) => `
    <div class="ci">
      <a href="#/product/${i.p.id}" class="ci-img" data-close>${img(i.p)}</a>
      <div><h5>${esc(i.p.name)}</h5><small>${i.size ? "Size: " + esc(i.size) + " · " : ""}${money(i.p.price)}</small>
        <div class="qty"><button data-dec="${idx}">−</button><span>${i.qty}</span><button data-inc="${idx}">+</button></div></div>
      <div style="text-align:right"><b>${money(i.p.price * i.qty)}</b><br><button class="rm" data-rm="${idx}">Remove</button></div>
    </div>`).join("");
  const sub = subtotal(), sh = shipping(sub), free = Number(st("free_shipping_above"));
  foot.innerHTML = `
    <div class="sum-r"><span>Subtotal</span><b>${money(sub)}</b></div>
    <div class="sum-r"><span>Shipping</span><b>${sh ? money(sh) : "FREE"}</b></div>
    ${free > 0 && sub < free ? `<div class="hint">Add ${money(free - sub)} more for FREE shipping!</div>` : ""}
    <div class="sum-r t"><span>Total</span><span>${money(sub + sh)}</span></div>
    <a href="#/checkout" class="btn btn-gold btn-block" style="margin-top:12px" data-close>Proceed to Order →</a>`;
}
function cartAction(e) {
  const t = e.target.closest("[data-inc],[data-dec],[data-rm],[data-close]");
  if (!t) return;
  const lines = cartLines();
  if (t.dataset.close !== undefined) { closeAll(); return; }
  const idx = +(t.dataset.inc ?? t.dataset.dec ?? t.dataset.rm);
  const line = lines[idx];
  if (!line) return;
  const real = cart.find((c) => c.id === line.id && (c.size || "") === (line.size || ""));
  if (t.dataset.inc !== undefined) { if (real.qty + 1 > line.p.stock) return toast(`Only ${line.p.stock} in stock`, true); real.qty++; }
  if (t.dataset.dec !== undefined) { real.qty--; if (real.qty <= 0) cart.splice(cart.indexOf(real), 1); }
  if (t.dataset.rm !== undefined) cart.splice(cart.indexOf(real), 1);
  saveCart(); refreshBadge(); renderDrawer();
  if (location.hash.startsWith("#/checkout")) route();
}

/* ---------------- components ---------------- */
function card(p) {
  const d = disc(p), out = p.stock <= 0;
  return `<article class="card reveal">
    <a class="card-img" href="#/product/${p.id}">${d ? `<span class="tag sale">${d}% OFF</span>` : p.featured ? `<span class="tag">BESTSELLER</span>` : ""}${out ? `<span class="tag out">SOLD OUT</span>` : ""}${img(p)}</a>
    <div class="card-b"><span class="brand-l">${esc(p.brand || (catOf(p.category_id) || {}).name || "Sports")}</span>
      <a href="#/product/${p.id}"><h4>${esc(p.name)}</h4></a>
      <div class="price"><b>${money(p.price)}</b>${d ? `<s>${money(p.mrp)}</s><i>${d}% off</i>` : ""}</div></div>
    <button class="add" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Out of Stock" : (p.sizes && p.sizes.length ? "Select Size" : "Add to Cart")}</button>
  </article>`;
}
const skeleton = (n = 8) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skel"></div>').join("")}</div>`;
function setupNotice() {
  return `<div class="notice"><b>Store is almost ready!</b><br>Could not load products from the database${S.error ? ` (<code>${esc(S.error)}</code>)` : ""}. Run <code>supabase-setup.sql</code> in the Supabase SQL Editor, then refresh this page.</div>`;
}
function footer() {
  $("#footer").innerHTML = `
  <div class="wrap foot">
    <div><img src="assets/logo.png" alt="Shree Vettrie"><p>Your one stop destination for all sports needs. Trusted by players across Avinashi and beyond.</p><p class="disp" style="color:var(--gold2);font-size:20px">For Champions. By Champions.</p></div>
    <div><h5>Shop</h5>${S.cats.slice(0, 6).map((c) => `<a href="#/shop?cat=${c.id}">${esc(c.name)}</a>`).join("") || '<a href="#/shop">All Products</a>'}</div>
    <div><h5>Help</h5><a href="#/track">Track Your Order</a><a href="#/bulk">School & College Bulk Orders</a><a href="#/contact">Contact Us</a><a href="#/shop">All Products</a></div>
    <div><h5>Visit & Contact</h5><p>📍 ${esc(st("address"))}</p><a href="tel:${esc(st("phone1").replace(/\s/g, ""))}">📞 ${esc(st("phone1"))}</a><a href="tel:${esc(st("phone2").replace(/\s/g, ""))}">📞 ${esc(st("phone2"))}</a><a href="mailto:${esc(st("email"))}">✉️ ${esc(st("email"))}</a>
      ${st("instagram") ? `<a href="${esc(st("instagram"))}" target="_blank" rel="noopener">Instagram</a>` : ""}${st("facebook") ? `<a href="${esc(st("facebook"))}" target="_blank" rel="noopener">Facebook</a>` : ""}</div>
  </div>
  <div class="foot-b"><b>TRUSTED BY PLAYERS</b><br>© ${new Date().getFullYear()} Shree Vettrie Sports Empire · GSTIN ${esc(st("gstin"))}</div>`;
  $("#waFloat").href = `https://wa.me/${st("whatsapp")}?text=${encodeURIComponent("Hi Shree Vettrie Sports Empire, I need help with sports gear.")}`;
  const a = st("announcement");
  $("#announce").innerHTML = a ? `<span>${esc(a)} &nbsp;&nbsp;•&nbsp;&nbsp; ${esc(a)}</span>` : "";
  $("#announce").style.display = a ? "" : "none";
}

/* ---------------- views ---------------- */
function viewHome() {
  if (S.error) return setupNotice();
  const feat = S.products.filter((p) => p.featured).slice(0, 8);
  const latest = S.products.slice(0, 8);
  const words = S.cats.map((c) => c.name).join(" ✦ ") || "Cricket ✦ Football ✦ Badminton ✦ Fitness";
  const [t1, ...rest] = st("hero_title").split(". ");
  return `<div class="page">
  <section class="hero"><div class="wrap hero-in">
    <div><span class="eyebrow">★ Trusted by Players</span>
      <h1>${esc(t1)}${rest.length ? ".<br><em>" + esc(rest.join(". ")) + "</em>" : ""}</h1>
      <p>${esc(st("hero_subtitle"))}</p>
      <div class="hero-cta"><a href="#/shop" class="btn btn-gold">Shop Now →</a><a href="#/bulk" class="btn btn-ghost">School & College Orders</a></div></div>
    <div class="hero-art"><div class="glow"></div><span class="orb">🏏</span><span class="orb">⚽</span><span class="orb">🏸</span><span class="orb">🏀</span><img src="assets/logo.png" alt="Shree Vettrie Sports Empire – Trusted by Players"></div>
  </div></section>
  <div class="marquee"><div class="marquee-t"><span>${esc(words)} ✦</span><span>${esc(words)} ✦</span><span>${esc(words)} ✦</span><span>${esc(words)} ✦</span></div></div>

  <section class="sec"><div class="wrap">
    <div class="sec-h reveal"><h2><small>EXPLORE</small>Shop by Sport</h2><a class="link-arrow" href="#/shop">View all products</a></div>
    <div class="cats">${S.cats.map((c) => `<a class="cat reveal" href="#/shop?cat=${c.id}"><span class="em">${esc(c.emoji)}</span><b>${esc(c.name)}</b></a>`).join("")}</div>
  </div></section>

  <section class="sec bg-soft"><div class="wrap">
    <div class="sec-h reveal"><h2><small>HANDPICKED</small>${feat.length ? "Featured Gear" : "Latest Arrivals"}</h2><a class="link-arrow" href="#/shop">Shop all →</a></div>
    ${(feat.length ? feat : latest).length ? `<div class="grid">${(feat.length ? feat : latest).map(card).join("")}</div>` : `<div class="empty"><span class="em">📦</span><p>New products are on the way. Check back soon!</p></div>`}
  </div></section>

  <section class="sec"><div class="wrap"><div class="usp reveal">
    <div><span class="em">🏅</span><b>Top Quality</b><small>Products</small></div>
    <div><span class="em">🏷️</span><b>Best Prices</b><small>Guaranteed</small></div>
    <div><span class="em">🛡️</span><b>100% Authentic</b><small>Brands</small></div>
    <div><span class="em">🛒</span><b>Wide Range</b><small>of Sports Gear</small></div>
    <div><span class="em">🎧</span><b>Expert Advice</b><small>& Support</small></div>
  </div></div></section>

  ${latest.length > 4 ? `<section class="sec bg-soft"><div class="wrap"><div class="sec-h reveal"><h2><small>JUST LANDED</small>New Arrivals</h2><a class="link-arrow" href="#/shop">See more →</a></div><div class="grid">${latest.slice(0, 4).map(card).join("")}</div></div></section>` : ""}

  <section class="sec"><div class="wrap"><div class="promo reveal">
    <div style="position:relative;z-index:1"><span class="eyebrow">School & College</span><h2 style="margin:16px 0">Bulk Orders <em>Accepted</em></h2><p style="color:#c9d4f2;margin-bottom:24px">Equip your whole team with quality gear, custom jerseys, trophies and medals — at prices that make sense.</p><a href="#/bulk" class="btn btn-gold">Request a Quote →</a></div>
    <ul class="ticks"><li>Best Quality Products</li><li>Affordable Prices</li><li>Bulk Orders for Schools & Colleges</li><li>Custom Jersey Printing</li><li>Trophy & Medal Customization</li><li>Fast Delivery</li></ul>
  </div></div></section>

  <section class="sec bg-soft"><div class="wrap founder">
    <div class="reveal"><h2 class="disp" style="font-size:clamp(36px,5vw,62px);color:var(--navy);font-weight:800"><small style="display:block;font-family:var(--body);font-size:12.5px;letter-spacing:3px;color:var(--blue)">FROM THE FOUNDERS</small>Our Mission</h2><p style="color:var(--muted);margin-top:14px">Empowering every athlete, supporting every dream.</p></div>
    <div class="founder-card reveal"><p><i>Dear Sports Enthusiasts,</i></p>
      <p>At <b style="color:var(--gold2)">Shree Vettrie Sports Empire</b>, our mission is simple – to empower every athlete, support every dream, and build a healthier, stronger community.</p>
      <p>We believe that the right equipment, guidance, and encouragement can turn passion into performance and potential into greatness. Whether you are a beginner taking your first step or a champion chasing excellence, we are here to support you at every step of your journey.</p>
      <p>Thank you for <b style="color:var(--gold2)">trusting us</b>. Together, let's Play Hard. Train Smart. <b style="color:var(--gold2)">Win Together!</b></p>
      <span class="sign">Mrs. K. Rohini</span><small>Proprietor</small><span class="sign" style="font-size:24px">Mrs. Jamuna Rajavelappan</span><small>Executive Director</small></div>
  </div></section></div>`;
}

function filtered() {
  let list = S.products.filter((p) => {
    if (F.cat && p.category_id !== F.cat) return false;
    if (F.brand && (p.brand || "") !== F.brand) return false;
    if (F.stock && p.stock <= 0) return false;
    if (F.min !== "" && p.price < +F.min) return false;
    if (F.max !== "" && p.price > +F.max) return false;
    if (F.q) { const q = F.q.toLowerCase(); if (!`${p.name} ${p.brand || ""} ${p.description || ""} ${(catOf(p.category_id) || {}).name || ""}`.toLowerCase().includes(q)) return false; }
    return true;
  });
  const by = { new: (a, b) => new Date(b.created_at) - new Date(a.created_at), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, az: (a, b) => a.name.localeCompare(b.name) };
  return list.sort(by[F.sort] || by.new);
}
function viewShop() {
  if (S.error) return setupNotice();
  const brands = [...new Set(S.products.map((p) => p.brand).filter(Boolean))].sort();
  const list = filtered();
  const title = F.q ? `Results for “${esc(F.q)}”` : F.cat ? esc((catOf(F.cat) || {}).name || "Shop") : "All Products";
  return `<div class="page"><div class="page-h"><div class="wrap"><h1>${title}</h1><p>${list.length} product${list.length === 1 ? "" : "s"} found</p></div></div>
  <div class="wrap shop">
    <aside class="filters" id="filters">
      <h5>Category</h5>
      <button class="chip ${!F.cat ? "on" : ""}" data-fcat="">All Sports</button>
      ${S.cats.map((c) => `<button class="chip ${F.cat === c.id ? "on" : ""}" data-fcat="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join("")}
      <h5>Price (₹)</h5><div class="row2"><input type="number" min="0" placeholder="Min" id="fmin" value="${esc(F.min)}"><input type="number" min="0" placeholder="Max" id="fmax" value="${esc(F.max)}"></div>
      ${brands.length ? `<h5>Brand</h5><select id="fbrand"><option value="">All brands</option>${brands.map((b) => `<option ${F.brand === b ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>` : ""}
      <h5>Availability</h5><label style="display:flex;gap:8px;font-size:14px;align-items:center"><input type="checkbox" id="fstock" ${F.stock ? "checked" : ""}> In stock only</label>
      <button class="btn btn-dark btn-block" style="margin-top:18px" id="fclear">Clear filters</button>
    </aside>
    <div><div class="shop-top"><button class="btn btn-line filter-toggle" id="ftoggle">☰ Filters</button>
      <select id="fsort"><option value="new" ${F.sort === "new" ? "selected" : ""}>Newest first</option><option value="low" ${F.sort === "low" ? "selected" : ""}>Price: Low to High</option><option value="high" ${F.sort === "high" ? "selected" : ""}>Price: High to Low</option><option value="az" ${F.sort === "az" ? "selected" : ""}>Name: A–Z</option></select></div>
      ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${list.map(card).join("")}</div>` : `<div class="empty"><span class="em">🔍</span><p><b>No products match your filters</b></p><p>Try clearing filters or searching something else.</p></div>`}</div>
  </div></div>`;
}

let pdState = { size: "", qty: 1, imgIdx: 0 };
function viewProduct(id) {
  if (S.error) return setupNotice();
  const p = prodOf(id);
  if (!p) return `<div class="wrap empty" style="padding:100px 0"><span class="em">😕</span><h2>Product not found</h2><br><a href="#/shop" class="btn btn-dark">Back to shop</a></div>`;
  const pics = [p.image_url, ...(p.gallery || [])].filter(Boolean);
  const d = disc(p), c = catOf(p.category_id);
  const rel = S.products.filter((x) => x.id !== p.id && x.category_id === p.category_id).slice(0, 4);
  return `<div class="page wrap"><div class="crumbs"><a href="#/">Home</a> / <a href="#/shop">Shop</a>${c ? ` / <a href="#/shop?cat=${c.id}">${esc(c.name)}</a>` : ""} / ${esc(p.name)}</div>
  <div class="pd"><div><div class="pd-main" id="pdMain">${pics.length ? `<img src="${esc(pics[0])}" alt="${esc(p.name)}">` : `<div class="ph" style="font-size:160px">${c ? esc(c.emoji) : "🏅"}</div>`}</div>
    ${pics.length > 1 ? `<div class="thumbs">${pics.map((u, i) => `<button class="${i ? "" : "on"}" data-pic="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join("")}</div>` : ""}</div>
    <div><span class="brand-l">${esc(p.brand || (c && c.name) || "")}</span><h1>${esc(p.name)}</h1>
      <div class="price"><b>${money(p.price)}</b>${d ? `<s>${money(p.mrp)}</s><i>${d}% off</i>` : ""}</div><small style="color:var(--muted)">Inclusive of all taxes</small>
      <p style="margin-top:10px;font-weight:700;color:${p.stock > 0 ? (p.stock <= 5 ? "#c2410c" : "#168a45") : "#e5383b"}">${p.stock > 0 ? (p.stock <= 5 ? `Hurry! Only ${p.stock} left` : "In stock") : "Out of stock"}</p>
      ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ""}
      ${p.sizes && p.sizes.length ? `<div class="opt-l">Select size</div><div class="sizes" id="sizes">${p.sizes.map((s) => `<button data-size="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
      <div class="opt-l">Quantity</div><div class="qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div>
      <div class="pd-cta"><button class="btn btn-dark" id="pdAdd" ${p.stock <= 0 ? "disabled" : ""}>Add to Cart</button><button class="btn btn-gold" id="pdBuy" ${p.stock <= 0 ? "disabled" : ""}>Buy Now →</button></div>
      <div class="trust"><div><span class="em">🛡️</span>100% Authentic</div><div><span class="em">🚚</span>Fast Delivery</div><div><span class="em">💳</span>Secure UPI Payment</div></div>
    </div></div>
  ${rel.length ? `<div class="sec-h"><h2 style="font-size:40px;color:var(--navy)">You may also like</h2></div><div class="grid" style="padding-bottom:70px">${rel.map(card).join("")}</div>` : ""}</div>`;
}
function bindProduct(id) {
  const p = prodOf(id); if (!p) return;
  pdState = { size: "", qty: 1, imgIdx: 0 };
  $$("[data-pic]").forEach((b) => b.addEventListener("click", () => { $("#pdMain img").src = b.dataset.pic; $$("[data-pic]").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("[data-size]").forEach((b) => b.addEventListener("click", () => { pdState.size = b.dataset.size; $$("[data-size]").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#qm").onclick = () => { pdState.qty = Math.max(1, pdState.qty - 1); $("#qv").textContent = pdState.qty; };
  $("#qp").onclick = () => { pdState.qty = Math.min(Math.max(p.stock, 1), pdState.qty + 1); $("#qv").textContent = pdState.qty; };
  const need = () => { if (p.sizes && p.sizes.length && !pdState.size) { toast("Please select a size", true); return false; } return true; };
  $("#pdAdd").onclick = () => { if (need() && addToCart(p.id, pdState.qty, pdState.size, true)) { toast("Added to cart ✓"); openDrawer(); } };
  $("#pdBuy").onclick = () => { if (need() && addToCart(p.id, pdState.qty, pdState.size, true)) location.hash = "#/checkout"; };
}

const PM = [
  { k: "gpay", n: "Google Pay", c: "#1a73e8", i: "G" },
  { k: "phonepe", n: "PhonePe", c: "#5f259f", i: "Pe" },
  { k: "paytm", n: "Paytm", c: "#00b9f1", i: "₹" },
  { k: "upi", n: "Any UPI app / BHIM", c: "#ff7a00", i: "U" },
];
function viewCheckout() {
  const lines = cartLines();
  if (!lines.length) return `<div class="wrap empty" style="padding:100px 0"><span class="em">🛒</span><h2>Your cart is empty</h2><br><a href="#/shop" class="btn btn-gold">Continue shopping</a></div>`;
  const sub = subtotal(), sh = shipping(sub);
  const saved = JSON.parse(localStorage.getItem("sv_cust") || "{}");
  return `<div class="page wrap"><div class="co">
  <form class="box" id="coForm" novalidate><h3>Delivery Details</h3>
    <div class="fg">
      <div><label class="f">Full name *</label><input class="in" name="customer_name" required value="${esc(saved.customer_name)}" autocomplete="name"></div>
      <div><label class="f">Mobile number *</label><input class="in" name="phone" required inputmode="numeric" maxlength="10" placeholder="10-digit number" value="${esc(saved.phone)}" autocomplete="tel"></div>
      <div class="full"><label class="f">Email (optional)</label><input class="in" type="email" name="email" value="${esc(saved.email)}" autocomplete="email"></div>
      <div class="full"><label class="f">Full address *</label><textarea class="in" name="address" required placeholder="House no, street, area, landmark">${esc(saved.address)}</textarea></div>
      <div><label class="f">City / Town *</label><input class="in" name="city" required value="${esc(saved.city || "Avinashi")}"></div>
      <div><label class="f">Pincode *</label><input class="in" name="pincode" required inputmode="numeric" maxlength="6" value="${esc(saved.pincode)}"></div>
      <div class="full"><label class="f">Order notes (size, jersey name/number, etc.)</label><input class="in" name="notes"></div>
    </div>
    <h3 style="margin-top:26px">Pay with UPI</h3>
    <p style="font-size:13.5px;color:var(--muted)">You'll be taken straight to your payment app with the exact amount filled in.</p>
    <div class="pm">${PM.map((m, i) => `<label><input type="radio" name="pm" value="${m.k}" ${i === 0 ? "checked" : ""}><span class="dot" style="background:${m.c}">${m.i}</span>${m.n}</label>`).join("")}
      <label style="grid-column:1/-1"><input type="radio" name="pm" value="qr"><span class="dot" style="background:var(--navy)">▦</span>Scan QR code (pay from another phone)</label></div>
    <button class="btn btn-gold btn-block" style="margin-top:22px;padding:17px" id="coBtn" type="submit">Place Order & Pay ${money(sub + sh)} →</button>
  </form>
  <aside class="box" style="position:sticky;top:96px"><h3>Order Summary</h3>
    ${lines.map((i) => `<div class="sum-r"><span>${esc(i.p.name)}${i.size ? " (" + esc(i.size) + ")" : ""} × ${i.qty}</span><b>${money(i.p.price * i.qty)}</b></div>`).join("")}
    <div class="sum-r" style="margin-top:12px"><span>Subtotal</span><b>${money(sub)}</b></div>
    <div class="sum-r"><span>Shipping</span><b>${sh ? money(sh) : "FREE"}</b></div>
    <div class="sum-r t"><span>Total</span><span>${money(sub + sh)}</span></div>
    <button class="btn btn-line btn-block" style="margin-top:14px" id="coEdit">Edit cart</button></aside></div></div>`;
}
function upiLink(kind, amount, orderNo) {
  const q = `pa=${encodeURIComponent(st("upi_id"))}&pn=${encodeURIComponent(st("upi_name"))}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + orderNo)}`;
  switch (kind) {
    case "gpay": return (isIOS() ? "gpay://upi/pay?" : "tez://upi/pay?") + q;
    case "phonepe": return "phonepe://pay?" + q;
    case "paytm": return "paytmmp://pay?" + q;
    default: return "upi://pay?" + q;
  }
}
function bindCheckout() {
  $("#coEdit").onclick = (e) => { e.preventDefault(); openDrawer(); };
  $("#coForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    if (d.customer_name.trim().length < 2) return toast("Please enter your name", true);
    if (!/^[6-9]\d{9}$/.test(d.phone.trim())) return toast("Enter a valid 10-digit mobile number", true);
    if (d.address.trim().length < 8) return toast("Please enter your full address", true);
    if (!/^\d{6}$/.test(d.pincode.trim())) return toast("Enter a valid 6-digit pincode", true);
    const lines = cartLines();
    for (const l of lines) if (l.qty > l.p.stock) return toast(`${l.p.name}: only ${l.p.stock} left in stock`, true);
    const sub = subtotal(), sh = shipping(sub), total = sub + sh;
    const now = new Date(), pad = (n) => String(n).padStart(2, "0");
    const order_no = `SV${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
    const id = crypto.randomUUID();
    const btn = $("#coBtn"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Placing order…';
    const row = {
      id, order_no, customer_name: d.customer_name.trim(), phone: d.phone.trim(), email: (d.email || "").trim() || null,
      address: d.address.trim(), city: d.city.trim(), pincode: d.pincode.trim(), notes: (d.notes || "").trim() || null,
      items: lines.map((l) => ({ id: l.id, name: l.p.name, price: l.p.price, qty: l.qty, size: l.size || null, image: l.p.image_url || null })),
      subtotal: sub, shipping: sh, total, payment_method: "UPI-" + d.pm, payment_status: "pending", status: "new",
    };
    const { error } = await sb.from("orders").insert(row);
    if (error) { console.error(error); btn.disabled = false; btn.textContent = "Try again"; return toast("Could not place order: " + error.message, true); }
    localStorage.setItem("sv_cust", JSON.stringify({ customer_name: row.customer_name, phone: row.phone, email: row.email || "", address: row.address, city: row.city, pincode: row.pincode }));
    sessionStorage.setItem("sv_pay", JSON.stringify({ id, order_no, total, pm: d.pm, name: row.customer_name, auto: true }));
    cart = []; saveCart(); refreshBadge();
    location.hash = "#/pay/" + order_no;
  });
}

function viewPay(orderNo) {
  let o = null;
  try { o = JSON.parse(sessionStorage.getItem("sv_pay") || "null"); } catch (e) { }
  if (!o || o.order_no !== orderNo) return `<div class="wrap empty" style="padding:100px 0"><span class="em">🔎</span><h2>Order ${esc(orderNo)}</h2><p>To see your order status, use Track Order.</p><br><a href="#/track" class="btn btn-dark">Track my order</a></div>`;
  const apps = PM.filter((m) => m.k !== "upi").concat(PM.filter((m) => m.k === "upi"));
  return `<div class="page wrap"><div class="pay" id="payWrap">
  <div class="box"><span class="eyebrow" style="background:#eef2ff;color:var(--navy);border-color:#d6defa">Order ${esc(o.order_no)}</span>
    <p style="margin-top:16px;color:var(--muted);font-weight:600">Amount to pay</p><div class="amount">${money(o.total)}</div>
    <div class="apps">${apps.map((m) => `<a class="app" style="background:${m.c}" href="${esc(upiLink(m.k, o.total, o.order_no))}" data-paylink><span class="dot">${m.i}</span>Pay with ${m.n}<span style="margin-left:auto">→</span></a>`).join("")}</div>
    <p style="font-size:12.5px;color:var(--muted)">Tap an app above on your phone. If nothing opens, scan the QR code or pay manually using the UPI ID / number.</p></div>
  <div class="box" id="payRight"><h3 style="font-size:24px">Scan & Pay</h3>
    <div class="qrbox"><div id="dynQR"></div></div>
    <div class="copy"><span>UPI ID<br><b>${esc(st("upi_id"))}</b></span><button data-copy="${esc(st("upi_id"))}">Copy</button></div>
    <div class="copy"><span>Pay to number<br><b>${esc(st("pay_number") || CFG.DEFAULTS.pay_number)}</b></span><button data-copy="${esc(st("pay_number") || CFG.DEFAULTS.pay_number)}">Copy</button></div>
    <div class="copy"><span>Amount<br><b>${money(o.total)}</b></span><button data-copy="${Number(o.total).toFixed(2)}">Copy</button></div>
    <h3 style="font-size:22px;margin:18px 0 8px">After paying</h3>
    <input class="in" id="utr" placeholder="Enter UPI Transaction ID / UTR (12 digits)" maxlength="40">
    <button class="btn btn-gold btn-block" style="margin-top:10px" id="paidBtn">I have paid ✓</button>
    <a class="btn btn-line btn-block" style="margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/${st("whatsapp")}?text=${encodeURIComponent(`Hi, I paid ${money(o.total)} for order ${o.order_no}. Sending payment screenshot.`)}">Send screenshot on WhatsApp</a></div>
  </div></div>`;
}
function bindPay(orderNo) {
  let o = null;
  try { o = JSON.parse(sessionStorage.getItem("sv_pay") || "null"); } catch (e) { }
  if (!o || o.order_no !== orderNo) return;
  const el = $("#dynQR");
  if (el && window.QRCode) new QRCode(el, { text: upiLink("upi", o.total, o.order_no), width: 200, height: 200, colorDark: "#071230", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); toast("Copied: " + b.dataset.copy); }));
  $("#paidBtn").onclick = async () => {
    const ref = $("#utr").value.trim();
    if (ref.length < 6) return toast("Please enter your UPI transaction ID / UTR", true);
    const b = $("#paidBtn"); b.disabled = true; b.innerHTML = '<span class="spin"></span> Submitting…';
    const { error } = await sb.rpc("submit_payment_ref", { p_order_id: o.id, p_ref: ref });
    if (error) { b.disabled = false; b.textContent = "I have paid ✓"; return toast(error.message, true); }
    sessionStorage.removeItem("sv_pay");
    $("#view").innerHTML = `<div class="wrap"><div class="box ok" style="max-width:620px;margin:50px auto 80px"><div class="tick">✓</div><h2 class="disp" style="font-size:44px;color:var(--navy)">Thank you, ${esc(o.name.split(" ")[0])}!</h2><p style="margin:10px 0">Your order <b>${esc(o.order_no)}</b> is placed. We'll verify your payment of <b>${money(o.total)}</b> and confirm shortly.</p><p style="color:var(--muted);font-size:14px">Keep your order number & mobile number to track the order.</p><div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap"><a href="#/track" class="btn btn-dark">Track order</a><a href="#/shop" class="btn btn-gold">Continue shopping</a></div></div></div>`;
    window.scrollTo(0, 0);
  };
  // Auto-redirect to the chosen payment app (phones only)
  if (o.auto) {
    o.auto = false; sessionStorage.setItem("sv_pay", JSON.stringify(o));
    if (o.pm !== "qr" && isMobile()) setTimeout(() => { location.href = upiLink(o.pm, o.total, o.order_no); }, 900);
    else toast(o.pm === "qr" || !isMobile() ? "Scan the QR with any UPI app to pay" : "Choose your payment app");
  }
}

function viewTrack() {
  return `<div class="page"><div class="page-h"><div class="wrap"><h1>Track Your Order</h1><p>Enter your order number and mobile number.</p></div></div>
  <div class="wrap" style="max-width:720px;padding:36px 24px 80px"><form class="box" id="trForm"><div class="fg"><div><label class="f">Order number</label><input class="in" name="no" placeholder="SV261004-1234" required></div><div><label class="f">Mobile number</label><input class="in" name="ph" inputmode="numeric" maxlength="10" required></div></div><button class="btn btn-dark btn-block" style="margin-top:16px">Track order</button></form><div id="trOut"></div></div></div>`;
}
function bindTrack() {
  $("#trForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); const out = $("#trOut");
    out.innerHTML = `<div class="empty"><span class="spin" style="display:inline-block;color:var(--navy)"></span></div>`;
    const { data, error } = await sb.rpc("track_order", { p_order_no: d.no, p_phone: d.ph });
    if (error) { out.innerHTML = ""; return toast(error.message, true); }
    if (!data || !data.length) { out.innerHTML = `<div class="empty"><span class="em">🤷</span><p><b>No order found.</b> Check the order number and mobile number.</p></div>`; return; }
    const o = data[0], steps = ["new", "confirmed", "packed", "shipped", "delivered"], labels = ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
    const idx = steps.indexOf(o.status);
    const payTxt = { pending: "Awaiting payment", submitted: "Payment under verification", paid: "Payment received ✓", failed: "Payment failed", refunded: "Refunded" }[o.payment_status] || o.payment_status;
    out.innerHTML = `<div class="box" style="margin-top:20px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 style="margin:0">${esc(o.order_no)}</h3><b>${money(o.total)}</b></div>
      <p style="color:var(--muted);font-size:14px">Placed ${new Date(o.created_at).toLocaleString("en-IN")} · ${esc(payTxt)}</p>
      ${o.status === "cancelled" ? `<p style="margin:20px 0;color:#e5383b;font-weight:700">This order was cancelled.</p>` : `<div class="tl">${steps.map((s, i) => `<div class="${i <= idx ? "done" : ""}"><i>${i <= idx ? "✓" : i + 1}</i>${labels[i]}</div>`).join("")}</div>`}
      ${(o.items || []).map((i) => `<div class="sum-r"><span>${esc(i.name)}${i.size ? " (" + esc(i.size) + ")" : ""} × ${i.qty}</span><b>${money(i.price * i.qty)}</b></div>`).join("")}</div>`;
  });
}

function viewBulk() {
  return `<div class="page"><div class="page-h"><div class="wrap"><h1>School & College Bulk Orders</h1><p>Best quality · Affordable prices · Custom jerseys · Trophies & medals · Fast delivery</p></div></div>
  <div class="wrap contact" style="padding:40px 24px 80px"><div><ul class="ticks" style="--x:0"><li style="background:var(--navy);color:#fff">Best Quality Products</li><li style="background:var(--navy);color:#fff">Affordable Prices</li><li style="background:var(--navy);color:#fff">Bulk Orders for Schools & Colleges</li><li style="background:var(--navy);color:#fff">Custom Jersey Printing</li><li style="background:var(--navy);color:#fff">Trophy & Medal Customization</li><li style="background:var(--navy);color:#fff">Fast Delivery</li></ul></div>
  <form class="box" id="bkForm"><h3>Request a Quote</h3><div class="fg"><div><label class="f">Your name *</label><input class="in" name="name" required></div><div><label class="f">Mobile *</label><input class="in" name="phone" required inputmode="numeric" maxlength="10"></div><div class="full"><label class="f">School / College / Team</label><input class="in" name="organisation"></div><div class="full"><label class="f">What do you need? *</label><textarea class="in" name="message" required placeholder="e.g. 40 jerseys with names, 5 trophies, cricket kit for 2 teams…"></textarea></div></div><button class="btn btn-gold btn-block" style="margin-top:16px">Send enquiry</button></form></div></div>`;
}
function viewContact() {
  return `<div class="page"><div class="page-h"><div class="wrap"><h1>Contact Us</h1><p>We're here to help you choose the right gear.</p></div></div>
  <div class="wrap contact" style="padding:40px 24px 80px"><div class="box">
    <div class="info-i"><span class="em">📍</span><div><b>Visit our store</b>${esc(st("address"))}<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Shree Vettrie Sports Empire " + st("address"))}">Get directions →</a></div></div>
    <div class="info-i"><span class="em">📞</span><div><b>Call us</b><a href="tel:${esc(st("phone1").replace(/\s/g, ""))}">${esc(st("phone1"))}</a><br><a href="tel:${esc(st("phone2").replace(/\s/g, ""))}">${esc(st("phone2"))}</a></div></div>
    <div class="info-i"><span class="em">✉️</span><div><b>Email</b><a href="mailto:${esc(st("email"))}">${esc(st("email"))}</a></div></div>
    <div class="info-i"><span class="em">💬</span><div><b>WhatsApp</b><a target="_blank" rel="noopener" href="https://wa.me/${st("whatsapp")}">Chat with us</a></div></div>
    <div class="info-i" style="border:0"><span class="em">🧾</span><div><b>GSTIN</b>${esc(st("gstin"))}</div></div></div>
  <div class="box" style="text-align:center"><img src="assets/logo.png" alt="" style="width:200px;margin:0 auto 10px"><h3>For Champions. By Champions.</h3><p style="color:var(--muted)">Your one stop destination for all sports needs.</p><a href="#/bulk" class="btn btn-dark" style="margin-top:16px">Bulk order enquiry</a></div></div></div>`;
}
function bindBulk() {
  $("#bkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!/^[6-9]\d{9}$/.test(d.phone.trim())) return toast("Enter a valid 10-digit mobile number", true);
    const { error } = await sb.from("enquiries").insert({ name: d.name.trim(), phone: d.phone.trim(), organisation: d.organisation.trim() || null, message: d.message.trim() });
    if (error) return toast(error.message, true);
    e.target.reset(); toast("Enquiry sent! We'll call you soon 🙌");
  });
}

/* ---------------- router ---------------- */
function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean), qs: new URLSearchParams(qs || "") };
}
function route() {
  const { parts, qs } = parseHash(), view = $("#view"), r = parts[0] || "home";
  closeAll();
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === (r === "product" ? "shop" : r)));
  if (!S.loaded) { view.innerHTML = `<div class="wrap" style="padding:60px 24px">${skeleton()}</div>`; return; }
  let after = null;
  if (r === "shop") { F.cat = qs.get("cat") || ""; F.q = qs.get("q") || ""; view.innerHTML = viewShop(); after = bindShop; }
  else if (r === "product") { view.innerHTML = viewProduct(parts[1]); after = () => bindProduct(parts[1]); }
  else if (r === "checkout") { view.innerHTML = viewCheckout(); after = () => { if (cartLines().length) bindCheckout(); }; }
  else if (r === "pay") { view.innerHTML = viewPay(parts[1]); after = () => bindPay(parts[1]); }
  else if (r === "track") { view.innerHTML = viewTrack(); after = bindTrack; }
  else if (r === "bulk") { view.innerHTML = viewBulk(); after = bindBulk; }
  else if (r === "contact") { view.innerHTML = viewContact(); }
  else { view.innerHTML = viewHome(); }
  if (after) after();
  reveal();
  window.scrollTo({ top: 0, behavior: "instant" });
  const si = $("#searchInput"); if (si && r !== "shop") si.value = "";
}
function bindShop() {
  const rerender = () => { const y = window.scrollY; $("#view").innerHTML = viewShop(); bindShop(); reveal(); window.scrollTo(0, y); };
  $$("[data-fcat]").forEach((b) => b.addEventListener("click", () => { F.cat = b.dataset.fcat; F.q = ""; rerender(); }));
  $("#fsort").onchange = (e) => { F.sort = e.target.value; rerender(); };
  const mm = () => { F.min = $("#fmin").value; F.max = $("#fmax").value; rerender(); };
  $("#fmin").onchange = mm; $("#fmax").onchange = mm;
  const fb = $("#fbrand"); if (fb) fb.onchange = (e) => { F.brand = e.target.value; rerender(); };
  $("#fstock").onchange = (e) => { F.stock = e.target.checked; rerender(); };
  $("#fclear").onclick = () => { Object.assign(F, { cat: "", q: "", sort: "new", min: "", max: "", brand: "", stock: false }); history.replaceState(null, "", "#/shop"); rerender(); };
  $("#ftoggle").onclick = () => { $("#filters").classList.add("on"); $("#overlay").classList.add("on"); };
}

/* ---------------- global events ---------------- */
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const p = prodOf(add.dataset.add);
    if (p && p.sizes && p.sizes.length) { location.hash = "#/product/" + p.id; return; }
    addToCart(add.dataset.add, 1, "");
    add.textContent = "Added ✓"; setTimeout(() => (add.textContent = "Add to Cart"), 1200);
  }
});
$("#cartBtn").onclick = openDrawer;
$("#drawerClose").onclick = closeAll;
$("#overlay").onclick = closeAll;
$("#burger").onclick = () => { $("#nav").classList.toggle("on"); $("#overlay").classList.toggle("on", $("#nav").classList.contains("on")); };
$("#drawer").addEventListener("click", cartAction);
$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#searchInput").value.trim(); location.hash = "#/shop" + (q ? "?q=" + encodeURIComponent(q) : ""); });
window.addEventListener("hashchange", route);
window.addEventListener("scroll", () => $("#header").classList.toggle("scrolled", window.scrollY > 10), { passive: true });

/* ---------------- boot ---------------- */
(async function boot() {
  refreshBadge();
  route();
  await load();
  footer();
  route();
})();
})();
