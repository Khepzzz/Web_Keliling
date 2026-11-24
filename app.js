﻿﻿﻿﻿// Ganti dengan URL Web App Apps Script (berakhiran /exec)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7BaH87ogbbpuKYctBx8k1lRjJd1yFM0SttL2hPoiqEj7y7mX90tNCidWPRY6lZl4v/exec";

const STATUS = ["Menolak","Ragu-ragu","Tertarik","Siap Ambil","SPK"];
const COL = {"Menolak":"#b3372f","Ragu-ragu":"#c98400","Tertarik":"#2f6fd0","Siap Ambil":"#1b7a4b","SPK":"#7a3fb5"};
const HINT = {"Menolak":"Tidak mau.","Ragu-ragu":"Masih pikir-pikir.","Tertarik":"Mau, tapi belum berani ambil. Menunggu konfirmasi perajin.","Siap Ambil":"Sudah pasti, tinggal diambil.","SPK":"Sudah ambil / sudah SPK."};
const NEXT = {"Tertarik":"Siap Ambil","Siap Ambil":"SPK"};
const NEXT_LABEL = {"Tertarik":"Naikkan ke Siap Ambil","Siap Ambil":"Jadikan SPK"};
const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const FU_ST = ["Tertarik","Ragu-ragu"];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}); };
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleDateString("id-ID",{dateStyle:"medium"}); };
const badge = s => `<span class="badge" style="--c:${COL[s]||"#666"}">${esc(s)}</span>`;
const thumb = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

// ----- Foto cadangan lewat Apps Script + cache (IndexedDB) -----
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const fotoMem = new Map(), badIds = new Set(), fotoQ = [], fotoWait = new Map();
let fotoRun = 0;

const idb = new Promise(res => { try{ const q = indexedDB.open("keliling-foto",1);
  q.onupgradeneeded = () => q.result.createObjectStore("f");
  q.onsuccess = () => res(q.result); q.onerror = () => res(null); }catch(e){ res(null); } });
const idbGet = id => idb.then(db => !db ? null : new Promise(res => { try{
  const q = db.transaction("f").objectStore("f").get(id); q.onsuccess = () => res(q.result||null); q.onerror = () => res(null); }catch(e){ res(null); } }));
const idbPut = (id, v) => idb.then(db => { if(db) try{ db.transaction("f","readwrite").objectStore("f").put(v,id); }catch(e){} });

// Perkecil ke 400px supaya ringan disimpan dan dimuat
const kecil = src => new Promise((ok,no) => { const i = new Image();
  i.onload = () => { const s = Math.min(1,400/Math.max(i.width,i.height)), c = document.createElement("canvas");
    c.width = Math.round(i.width*s); c.height = Math.round(i.height*s); c.getContext("2d").drawImage(i,0,0,c.width,c.height);
    ok(c.toDataURL("image/jpeg",.7)); };
  i.onerror = () => no(new Error("Foto tidak bisa dibaca.")); i.src = src; });

async function fetchFoto(id){
  let err;
  for(let i=0;i<3;i++){
    try{ return await kecil((await api({action:"foto",id})).data); }
    catch(e){ err = e; await new Promise(r => setTimeout(r, 800*(i+1))); }
  }
  throw err;
}
function pumpFoto(){
  while(fotoRun < 2 && fotoQ.length){
    const j = fotoQ.shift(); fotoRun++;
    fetchFoto(j.id).then(j.ok, j.no).finally(() => { fotoRun--; pumpFoto(); });
  }
}
function getFoto(id){
  if(fotoMem.has(id)) return Promise.resolve(fotoMem.get(id));
  if(fotoWait.has(id)) return fotoWait.get(id);
  const p = (async () => {
    let v = await idbGet(id);
    if(!v){ v = await new Promise((ok,no) => { fotoQ.push({id,ok,no}); pumpFoto(); }); idbPut(id, v); }
    fotoMem.set(id, v); return v;
  })().finally(() => fotoWait.delete(id));
  fotoWait.set(id, p); return p;
}
function pakaiCadangan(img){
  const id = img.dataset.fid; if(!id || img.dataset.fb) return;
  img.dataset.fb = "1"; badIds.add(id); img.classList.add("ph-wait");
  getFoto(id).then(src => { img.src = src; img.classList.remove("ph-wait"); })
    .catch(() => { img.classList.remove("ph-wait"); img.classList.add("ph-fail"); img.dataset.fb = ""; img.title = "Foto gagal dimuat. Ketuk untuk coba lagi."; });
}
const FOTO_PUBLIK = true;   // samakan dengan FOTO_PUBLIK di Apps Script
const fimg = id => { const fb = !FOTO_PUBLIK || badIds.has(id);
  return `<img loading="lazy" data-fid="${id}" src="${fb ? PIXEL : thumb(id,300)}"${fb ? ' data-need="1"' : ""} alt="Foto">`; };

document.addEventListener("error", e => { if(e.target.tagName==="IMG") pakaiCadangan(e.target); }, true);
document.addEventListener("click", e => { const i = e.target.closest("img.ph-fail");
  if(i){ e.preventDefault(); i.classList.remove("ph-fail"); pakaiCadangan(i); } }, true);
new MutationObserver(() => document.querySelectorAll("img[data-need]").forEach(i => { delete i.dataset.need; pakaiCadangan(i); }))
  .observe(document.body,{childList:true,subtree:true});
const mapUrl = r => (r.lat != null && r.lng != null) ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : (/^https?:\/\//i.test(r.maps || "") ? r.maps : "");

let password = sessionStorage.getItem("pw") || "";
let D = [], K = [], S = [], A = [], cur = "dash", detailId = null, page = 1;

function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2800); }

// ---------- Penyimpanan Lokal (Cache & Offline Queue) ----------
const CACHE_KEY = "keliling_data_cache_v2";
const QUEUE_KEY = "keliling_offline_queue_v2";

function loadFromLocalCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return false;
    const c = JSON.parse(raw);
    if(c && Array.isArray(c.D)){
      D = c.D || []; K = c.K || []; S = c.S || []; A = c.A || [];
      loaded = true;
      updateSyncStatus("synced");
      return true;
    }
  }catch(e){ console.warn("Cache lokal gagal dimuat:", e); }
  return false;
}

function saveToLocalCache(){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({D, K, S, A, ts: Date.now()})); }
  catch(e){ console.warn("Gagal simpan cache lokal:", e); }
}

function updateSyncStatus(st){
  const el = $("syncBadge");
  if(!el) return;
  const q = getOfflineQueue();
  if(q.length > 0){
    el.className = "sync-badge pending";
    el.textContent = `Menunggu sinyal (${q.length} draft)`;
    return;
  }
  if(st === "syncing"){
    el.className = "sync-badge syncing";
    el.textContent = "Menyinkronkan data…";
  }else if(st === "offline"){
    el.className = "sync-badge pending";
    el.textContent = "Mode Offline (Data lokal)";
  }else{
    el.className = "sync-badge";
    if (typeof lastSyncTime !== 'undefined' && lastSyncTime) {
      const m = Math.floor((Date.now() - lastSyncTime) / 60000);
      el.textContent = m < 1 ? "Tersinkron barusan" : m < 60 ? "Sinkron " + m + " mnt lalu" : "Sinkron " + Math.floor(m/60) + " jam lalu";
    } else {
      el.textContent = "Data lokal aktif & siap";
    }
  }
}

function getOfflineQueue(){
  try{ return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }catch(e){ return []; }
}
function setOfflineQueue(q){
  try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }catch(e){}
  updateSyncStatus();
}
function addToOfflineQueue(item){
  const q = getOfflineQueue(); q.push(item); setOfflineQueue(q);
}

let draining = false;
async function drainOfflineQueue(){
  if(draining || !navigator.onLine) return;
  const q = getOfflineQueue();
  if(!q.length) return;
  draining = true; updateSyncStatus("syncing");
  const remaining = []; let count = 0;
  for(const item of q){
    try{
      const res = await api(item.payload);
      count++;
      if(item.tempId && res.rec){
        const idx = D.findIndex(x => x.id === item.tempId);
        if(idx >= 0) D[idx] = res.rec;
      }
    }catch(err){
      remaining.push(item);
    }
  }
  setOfflineQueue(remaining);
  draining = false;
  if(count > 0){
    saveToLocalCache(); renderAll();
    toast(`${count} data offline berhasil disinkronkan ke server!`);
  }
  updateSyncStatus(remaining.length > 0 ? "pending" : "synced");
}
window.addEventListener("online", drainOfflineQueue);

async function api(payload){
  if(!SCRIPT_URL.startsWith("https://script.google.com/")) throw new Error("SCRIPT_URL belum diisi.");
  const res = await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({...payload,password})});
  if(!res.ok) throw new Error("Server membalas error "+res.status);
  const data = await res.json();
  if(data.status !== "success") throw new Error(data.message || "Terjadi kesalahan.");
  return data;
}
async function busy(btn, fn){
  if(btn.disabled) return;
  const t = btn.textContent; btn.disabled = true; btn.textContent = "Memproses...";
  try{ await fn(); } finally { btn.disabled = false; btn.textContent = t; }
}

// ---------- Login ----------
function showApp(){
  $("loginSection").classList.add("hidden");
  $("mainSection").classList.remove("hidden");
  const hasCache = loadFromLocalCache();
  if(hasCache){
    renderAll();
    muat(true); // sinkronisasi tenang di latar belakang tanpa layar loading
  }else{
    muat(false);
  }
}
$("loginBtn").onclick = () => busy($("loginBtn"), async () => {
  $("loginErr").textContent = ""; password = $("passInput").value;
  try{ await api({action:"login"}); sessionStorage.setItem("pw",password); showApp(); }
  catch(e){ password=""; $("loginErr").textContent = e.message; }
});
$("passInput").onkeydown = e => { if(e.key==="Enter") $("loginBtn").click(); };
$("eyeBtn").onclick = () => { const p = $("passInput"), show = p.type === "password";
  p.type = show ? "text" : "password"; $("eyeBtn").classList.toggle("on", show);
  $("eyeBtn").setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password"); };
$("logoutBtn").onclick = () => { sessionStorage.removeItem("pw"); sessionStorage.removeItem("view"); sessionStorage.removeItem("did"); location.reload(); };

if($("syncBtn")) $("syncBtn").onclick = () => {
  toast("Menyinkronkan data...");
  muat(false);
};

let loaded = false, loading = false, loadErr = "";

const skeletonCards = (count = 3) => Array.from({length: count}).map(() => `
  <div class="sk-card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="sk sk-title" style="width:45%"></div>
      <div class="sk" style="width:75px;height:20px;border-radius:99px"></div>
    </div>
    <div class="sk sk-line" style="width:65%"></div>
    <div class="sk sk-line" style="width:85%"></div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <div class="sk" style="width:90px;height:28px;border-radius:8px"></div>
      <div class="sk" style="width:110px;height:28px;border-radius:8px"></div>
    </div>
  </div>
`).join("");

const skeletonStats = () => `
  <div class="sk-grid">
    ${Array.from({length: 6}).map(() => `
      <div class="sk-stat">
        <div class="sk sk-title" style="width:60%"></div>
        <div class="sk sk-num"></div>
      </div>
    `).join("")}
  </div>
`;

const statusBox = () => (loading || !loaded) ? skeletonCards(3)
  : loadErr ? `<div class="card" style="text-align:center"><p class="err" style="margin:0 0 10px">Gagal memuat data: ${esc(loadErr)}</p><button data-act="reload">Coba lagi</button></div>` : "";

async function muat(silent = false){
  if(loading) return;
  loading = true;
  if(!silent){ loadErr = ""; renderAll(); }
  updateSyncStatus("syncing");
  let err, r;
  for(let i=0;i<3;i++){
    try{ r = await api({action:"list"}); break; }
    catch(e){ err = e; if(/password/i.test(e.message) || i===2) break; await new Promise(ok => setTimeout(ok, 1200*(i+1))); }
  }
  loading = false;
  if(r){
    D = r.data; K = r.kroscek; S = r.spk || []; A = r.ambil || [];
    loaded = true; loadErr = "";
    saveToLocalCache();
    lastSyncTime = Date.now();
    updateSyncStatus("synced");
    drainOfflineQueue();
  }else{
    if(loaded && D.length > 0){
      updateSyncStatus("offline");
      if(!silent) toast("Mode offline: Menggunakan salinan data lokal");
    }else{
      loadErr = err ? err.message : "Terjadi kesalahan.";
      updateSyncStatus("offline");
    }
  }
  renderAll();
}

// ---------- Foto ----------
const compress = (f, stamp) => new Promise((res,rej) => {
  const img = new Image(), u = URL.createObjectURL(f);
  img.onload = () => { const s = Math.min(1,1280/Math.max(img.width,img.height)), c = document.createElement("canvas");
    c.width = img.width*s; c.height = img.height*s; c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    if(stamp) stampFoto(c, stamp);
    URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg",.75)); };
  img.onerror = () => rej(new Error("Foto tidak bisa dibaca.")); img.src = u;
});
// ---------- Stempel foto kamera: nama + alamat + koordinat ----------
const cariLokasi = ms => new Promise(ok => {
  if(!navigator.geolocation) return ok(null);
  let done = false; const fin = v => { if(!done){ done = true; ok(v); } };
  setTimeout(() => fin(null), ms);
  navigator.geolocation.getCurrentPosition(p => fin({lat:p.coords.latitude, lng:p.coords.longitude}), () => fin(null),
    {enableHighAccuracy:true, timeout:ms, maximumAge:30000});
});
const geoMem = new Map();
async function cariAlamat(lat, lng){
  const k = lat.toFixed(4)+","+lng.toFixed(4);
  if(geoMem.has(k)) return geoMem.get(k);
  try{
    const r = await Promise.race([api({action:"geo",lat,lng}), new Promise((_,no) => setTimeout(() => no(new Error("timeout")), 7000))]);
    const a = String(r.alamat||"").replace(/,\s*Indonesia$/i,"");
    if(a) geoMem.set(k,a);
    return a;
  }catch(e){ return ""; }
}
async function buatStempel(c, job){
  let g = job ? await job : null;
  const punyaSimpan = c.lat != null && c.lng != null;
  if(!g && !punyaSimpan) g = await cariLokasi(6000);   // GPS sempat terhenti saat kamera terbuka, coba sekali lagi
  let lat = null, lng = null, src = "";
  if(g){ lat = g.lat; lng = g.lng; src = "GPS"; }
  else if(punyaSimpan){ lat = Number(c.lat); lng = Number(c.lng); src = "Lokasi tersimpan"; }
  const tglStr = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const st = {nama:c.nama, alamat:"", koor:"", tgl: "Tanggal: " + tglStr};
  if(lat != null){
    st.koor = `${lat.toFixed(6)}, ${lng.toFixed(6)} (${src})`;
    st.alamat = await cariAlamat(lat, lng);
  }
  return st;
}
function stampFoto(c, s){
  const g = c.getContext("2d"), W = c.width, fs = Math.max(14, Math.round(W/38)), pad = Math.round(fs*.7), lh = Math.round(fs*1.3);
  const wrap = (t, font, max) => { g.font = font; const lines = []; let cur = "";
    String(t).split(/\s+/).forEach(w => { const x = cur ? cur+" "+w : w;
      if(g.measureText(x).width > W-2*pad && cur){ lines.push(cur); cur = w; } else cur = x; });
    if(cur) lines.push(cur); return lines.slice(0,max); };
  const fb = `bold ${fs}px sans-serif`, fn = `${Math.round(fs*.85)}px sans-serif`, rows = [];
  if(s.tgl) rows.push({t: s.tgl, f: fn});
  wrap(s.nama, fb, 2).forEach(t => rows.push({t, f:fb}));
  if(s.alamat) wrap(s.alamat, fn, 3).forEach(t => rows.push({t, f:fn}));
  if(s.koor) wrap(s.koor, fn, 2).forEach(t => rows.push({t, f:fn}));
  const h = rows.length*lh + pad*2, top = c.height - h;
  g.fillStyle = "rgba(0,0,0,.58)"; g.fillRect(0, top, W, h);
  g.fillStyle = "#fff"; g.textBaseline = "top";
  rows.forEach((r,i) => { g.font = r.f; g.fillText(r.t, pad, top + pad + i*lh); });
}

const photoHtml = p => `<div class="btn-row"><button type="button" class="btn-s" id="${p}cam">Ambil foto</button><button type="button" class="btn-s" id="${p}gal">Dari galeri</button></div>
<input type="file" accept="image/*" capture="environment" id="${p}fc" class="hidden"><input type="file" accept="image/*" multiple id="${p}fg" class="hidden"><div class="th" id="${p}prev"></div>`;
function initPhotos(p, initial = [], ctx = null){
  let list = initial.map(x => typeof x === "string" ? {id:x} : x);
  const draw = () => $(p+"prev").innerHTML = list.map((f,i) => `<div class="ph">${f.data ? `<img src="${f.data}" alt="">` : fimg(f.id)}<button type="button" data-i="${i}" aria-label="Hapus foto">×</button></div>`).join("");
  $(p+"prev").onclick = e => { const b = e.target.closest("button"); if(b){ list.splice(+b.dataset.i,1); draw(); } };
  let gpsJob = null;
  $(p+"cam").onclick = () => {
    if(ctx){
      if(!ctx().nama) return toast("Isi nama dulu sebelum ambil foto.");
      gpsJob = cariLokasi(8000);   // GPS mulai dicari sambil kamera terbuka
    }
    $(p+"fc").click();
  };
  $(p+"gal").onclick = () => $(p+"fg").click();
  const addCam = async e => {
    const files = [...e.target.files]; e.target.value = "";
    try{
      let st = null;
      if(ctx){ toast("Menambahkan stempel..."); st = await buatStempel(ctx(), gpsJob); }
      for(const f of files) list.push({data: await compress(f, st)});
    }catch(x){ toast(x.message); }
    gpsJob = null; draw();
  };
  const add = async e => { try{ for(const f of e.target.files) list.push({data: await compress(f)}); }catch(x){ toast(x.message); } e.target.value = ""; draw(); };
  $(p+"fc").onchange = add; $(p+"fg").onchange = add; draw();
  return { count: () => list.length, items: () => list.slice(),
    async upload(){ for(const f of list){ if(!f.id){ f.id = (await api({action:"upload",data:f.data})).id; delete f.data; } } return list.map(f => f.id); } };
}
const thumbs = (ids, dl) => ids.length ? `<div class="th">${ids.map(id => `<div class="ph"><a href="${thumb(id,1600)}" data-lb="${id}">${fimg(id)}</a>${dl?`<button type="button" data-act="dlfoto" data-id="${id}" title="Unduh foto" aria-label="Unduh foto"><svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/></svg></button>`:""}</div>`).join("")}</div>` : "";
async function downloadFoto(id){
  const {data} = await api({action:"foto",id});
  const a = document.createElement("a"); a.href = data; a.download = `foto_${id}.jpg`; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- Tampilan foto besar ----------
const bigMem = new Map(), lb = {ids:[], i:0, tok:0};
async function besar(id){
  if(bigMem.has(id)) return bigMem.get(id);
  let err;
  for(let n=0;n<3;n++){
    try{ const d = (await api({action:"foto",id})).data; bigMem.set(id,d);
      if(bigMem.size>8) bigMem.delete(bigMem.keys().next().value); return d; }
    catch(e){ err = e; await new Promise(r => setTimeout(r, 700*(n+1))); }
  }
  throw err;
}
function lbShow(){
  const id = lb.ids[lb.i], tok = ++lb.tok, img = $("lbImg"), multi = lb.ids.length > 1;
  img.classList.add("hidden"); $("lbMsg").textContent = "Memuat…";
  $("lbC").textContent = multi ? `${lb.i+1} / ${lb.ids.length}` : "";
  $("lbP").classList.toggle("hidden", !multi); $("lbN").classList.toggle("hidden", !multi);
  besar(id).then(src => { if(tok!==lb.tok) return; img.src = src; img.classList.remove("hidden"); $("lbMsg").textContent = ""; })
    .catch(() => { if(tok===lb.tok) $("lbMsg").textContent = "Foto gagal dimuat. Coba lagi nanti."; });
}
function lbOpen(ids, i){ lb.ids = ids; lb.i = i; $("lb").classList.add("on"); document.documentElement.style.overflow = "hidden"; lbShow(); }
function lbClose(){ lb.tok++; $("lb").classList.remove("on"); $("lbImg").removeAttribute("src"); document.documentElement.style.overflow = ""; }
const lbGo = d => { if(lb.ids.length<2) return; lb.i = (lb.i+d+lb.ids.length) % lb.ids.length; lbShow(); };
$("lbX").onclick = lbClose; $("lbP").onclick = () => lbGo(-1); $("lbN").onclick = () => lbGo(1);
$("lb").onclick = e => { if(e.target.id==="lb") lbClose(); };
$("lbDl").onclick = async () => { const id = lb.ids[lb.i];
  try{ const data = await besar(id), a = document.createElement("a");
    a.href = data; a.download = `foto_${id}.jpg`; document.body.appendChild(a); a.click(); a.remove(); }
  catch(err){ toast("Gagal: "+err.message); } };
document.addEventListener("keydown", e => { if(!$("lb").classList.contains("on")) return;
  if(e.key==="Escape") lbClose(); else if(e.key==="ArrowLeft") lbGo(-1); else if(e.key==="ArrowRight") lbGo(1); });
let tx = null;
$("lb").addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, {passive:true});
$("lb").addEventListener("touchend", e => { if(tx==null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
  if(Math.abs(dx)>60) lbGo(dx<0 ? 1 : -1); }, {passive:true});
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-lb]"); if(!a) return;
  e.preventDefault();
  const ids = [...a.closest(".th").querySelectorAll("a[data-lb]")].map(x => x.dataset.lb);
  lbOpen(ids, Math.max(0, ids.indexOf(a.dataset.lb)));
});

async function bagikan(text, ids) {
  try {
    if (ids.length && navigator.canShare) {
      const files = [];
      for (const id of ids.slice(0, 10)) {
        const b = await (await fetch(await besar(id))).blob();
        files.push(new File([b], `foto_${id}.jpg`, { type: "image/jpeg" }));
      }
      if (navigator.canShare({ files })) {
        await navigator.share({ text, files });
        return;
      }
    }
  } catch (e) {
    if (e.name === "AbortError") return;
  }
  if (ids.length)
    toast(
      "Foto tidak bisa dilampirkan otomatis di browser ini. Unduh foto lalu kirim manual.",
    );
  const u = "https://wa.me/?text=" + encodeURIComponent(text);
  if (!window.open(u, "_blank")) location.href = u;
}

// ---------- Form (4 blok: Data klien, Status, Lokasi + foto rumah, Catatan) ----------
const formHtml = (p) => `
<div class="blk"><h3>Data klien</h3>
  <label>Nama calon klien / toko *</label><input id="${p}nama" maxlength="100">
  <label>Alamat</label><input id="${p}alamat" maxlength="200">
  <label>No HP / WA</label><input id="${p}hp" type="tel" inputmode="tel" placeholder="08123456789">
</div>
<div class="blk"><h3>Status</h3>
  <label>Status</label><select id="${p}st">${STATUS.map((s) => `<option>${s}</option>`).join("")}</select><p class="hint" id="${p}hint"></p>
  <div id="${p}wEst"><label>Estimasi kirim per minggu</label><input id="${p}est" maxlength="60" placeholder="Contoh: 5 dus"></div>
  <div id="${p}wFu"><label>Tanggal follow-up</label><input id="${p}fu" type="date"></div>
</div>
<div class="blk"><h3>Lokasi dan foto rumah</h3>
  <label>Lokasi (opsional)</label><input id="${p}mp" placeholder="Tempel link Google Maps">
  <button type="button" class="btn-s sm" id="${p}gps" style="margin-top:6px">Ambil lokasi saya sekarang</button><div class="hint" id="${p}gi"></div>
  <label>Foto (opsional)</label>${photoHtml(p)}
</div>
<div class="blk"><h3>Catatan</h3>
  <label>Catatan hasil obrolan</label><textarea id="${p}cat" rows="3" maxlength="800"></textarea>
</div>
<p class="err" id="${p}err"></p>`;

function initForm(p, r = {}) {
  const g = (id) => $(p + id);
  let lat = r.lat ?? null,
    lng = r.lng ?? null;
  g("nama").value = r.nama || "";
  g("alamat").value = r.alamat || "";
  g("hp").value = r.hp || "";
  g("st").value = r.status || "Tertarik";
  g("est").value = r.estimasi && r.estimasi !== "-" ? r.estimasi : "";
  g("fu").value = r.fu || "";
  g("mp").value = r.maps || "";
  g("cat").value = r.catatan || "";
  const sync = () => {
    const s = g("st").value;
    g("wEst").classList.toggle(
      "hidden",
      !["Tertarik", "Siap Ambil", "SPK"].includes(s),
    );
    g("wFu").classList.toggle("hidden", !FU_ST.includes(s));
    g("hint").textContent = HINT[s];
  };
  g("st").onchange = sync;
  sync();
  g("mp").oninput = () => {
    lat = lng = null;
    g("gi").textContent = "";
  };
  g("gps").onclick = () => {
    if (!navigator.geolocation)
      return toast("GPS tidak didukung di browser ini.");
    g("gi").textContent = "Mencari lokasi...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = +pos.coords.latitude.toFixed(6);
        lng = +pos.coords.longitude.toFixed(6);
        g("mp").value = `https://www.google.com/maps?q=${lat},${lng}`;
        g("gi").textContent = "Lokasi berhasil diambil.";
      },
      () =>
        (g("gi").textContent =
          "Gagal mengambil lokasi. Izinkan akses lokasi di browser."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const ph = initPhotos(p, r.foto || [], () => ({
    nama: g("nama").value.trim(),
    lat,
    lng,
  }));
  return {
    async collect() {
      g("err").textContent = "";
      const nama = g("nama").value.trim(),
        hp = g("hp").value.trim();
      if (!nama) throw new Error("Nama wajib diisi.");
      if (hp && !/^\+?[\d\s-]{8,16}$/.test(hp))
        throw new Error("No HP harus 8-16 angka.");
      const s = g("st").value,
        foto = await ph.upload();
      return {
        nama,
        alamat: g("alamat").value,
        hp,
        status: s,
        estimasi: ["Tertarik", "Siap Ambil", "SPK"].includes(s)
          ? g("est").value
          : "",
        fu: FU_ST.includes(s) ? g("fu").value : "",
        maps: g("mp").value.trim(),
        lat,
        lng,
        catatan: g("cat").value,
        foto,
      };
    },
    err: (m) => (g("err").textContent = m),
  };
}

let FI,
  FE,
  editing = null;
function resetInput() {
  $("formInput").innerHTML = formHtml("i_");
  FI = initForm("i_");
}
$("saveBtn").onclick = () =>
  busy($("saveBtn"), async () => {
    try {
      const rec = await FI.collect();
      try {
        const res = await api({ action: "save", ...rec });
        D.unshift(res.rec);
        saveToLocalCache();
        renderAll();
        toast("Data tersimpan");
        resetInput();
      } catch (netErr) {
        if (!navigator.onLine || /fetch|network|offline|failed/i.test(netErr.message)) {
          const tempId = "draft_" + Date.now().toString(36);
          const localRec = {
            id: tempId,
            waktu: new Date().toISOString(),
            nama: rec.nama,
            alamat: rec.alamat || "",
            hp: rec.hp || "",
            status: rec.status,
            estimasi: rec.estimasi || "-",
            catatan: rec.catatan || "",
            maps: rec.maps || "",
            lat: rec.lat || null,
            lng: rec.lng || null,
            foto: rec.foto || [],
            tglSpk: rec.status === "SPK" ? new Date().toISOString() : "",
            fu: rec.fu || "",
            fuDone: "",
            kHari: "",
            kNext: ""
          };
          D.unshift(localRec);
          saveToLocalCache();
          addToOfflineQueue({ payload: { action: "save", ...rec }, tempId });
          renderAll();
          toast("Sinyal tidak ada: Tersimpan lokal di HP & otomatis terkirim saat online");
          resetInput();
        } else {
          throw netErr;
        }
      }
    } catch (e) {
      FI.err(e.message);
    }
  });
function openEdit(r) {
  editing = r;
  $("mBody").innerHTML = formHtml("e_");
  FE = initForm("e_", r);
  $("modal").showModal();
}
$("mCancel").onclick = () => $("modal").close();
$("mSave").onclick = () =>
  busy($("mSave"), async () => {
    try {
      const rec = await FE.collect();
      const res = await api({ action: "update", id: editing.id, ...rec });
      const idx = D.findIndex((x) => x.id === editing.id);
      if (idx >= 0) D[idx] = res.rec;
      saveToLocalCache();
      renderAll();
      $("modal").close();
      toast("Perubahan tersimpan");
    } catch (e) {
      FE.err(e.message);
    }
  });

const payload = (r) => ({
  id: r.id,
  nama: r.nama,
  alamat: r.alamat,
  hp: r.hp,
  status: r.status,
  estimasi: r.estimasi === "-" ? "" : r.estimasi,
  catatan: r.catatan,
  maps: r.maps,
  lat: r.lat,
  lng: r.lng,
  foto: r.foto,
  fu: r.fu,
});
async function promote(r) {
  const old = { ...r },
    st = NEXT[r.status];
  if (!st) return;
  if (st === "SPK") return openSpk(r.id, null, true);
  if (!confirm(`Ubah status "${r.nama}" menjadi ${st}?`)) return;
  r.status = st;
  renderAll();
  try {
    await api({ action: "update", ...payload(r) });
    toast("Status diperbarui");
  } catch (e) {
    Object.assign(r, old);
    renderAll();
    toast("Gagal: " + e.message);
  }
}

// ---------- Follow-up: Sudah dikunjungi ----------
async function setFuDone(r, done) {
  const old = r.fuDone;
  r.fuDone = done ? todayStr() : "";
  renderAll();
  try {
    const res = await api({ action: "fuDone", id: r.id, done });
    r.fuDone = res.fuDone;
    renderAll();
    toast(done ? "Ditandai sudah dikunjungi" : "Tanda dikunjungi dibatalkan");
  } catch (e) {
    r.fuDone = old;
    renderAll();
    toast("Gagal: " + e.message);
  }
}

// ---------- Rumus pengambilan (satu fungsi untuk layar, Excel, PDF) ----------
const sOf = (id) =>
  S.filter((s) => s.sid === id).sort((a, b) => a.mulai.localeCompare(b.mulai));
const ambilOf = (spkId) => A.filter((a) => a.spk === spkId);
function hitung(sp) {
  const L = ambilOf(sp.id),
    target = sp.target || 0,
    awal = L.filter((a) => a.jenis === "Cek awal"),
    ulang = L.filter((a) => a.jenis === "Cek ulang");
  const terangkut = L.reduce((n, a) => n + a.diambil, 0),
    ditolak = L.reduce((n, a) => n + a.ditolak, 0);
  const service =
    awal.reduce((n, a) => n + a.siap - a.diambil, 0) -
    ulang.reduce((n, a) => n + a.diambil + a.ditolak, 0);
  return {
    target,
    terangkut,
    ditolak,
    service,
    sisa: Math.max(0, target - terangkut),
    selesai: target > 0 && terangkut >= target,
    n: L.length,
  };
}
const statusSpk = (h) => (h.selesai ? "Selesai" : "Berjalan");
// Sejak kapan barang menunggu cek ulang (FIFO: cek ulang menghabiskan batch tertua dulu)
function umurService(sid) {
  let oldest = null;
  sOf(sid).forEach((sp) => {
    const L = ambilOf(sp.id)
        .slice()
        .sort((a, b) => a.tgl.localeCompare(b.tgl)),
      q = [];
    L.filter((a) => a.jenis === "Cek awal" && a.siap - a.diambil > 0).forEach(
      (a) => q.push({ t: a.tgl, n: a.siap - a.diambil }),
    );
    let o = L.filter((a) => a.jenis === "Cek ulang").reduce(
      (n, a) => n + a.diambil + a.ditolak,
      0,
    );
    while (o > 0 && q.length) {
      const u = Math.min(q[0].n, o);
      q[0].n -= u;
      o -= u;
      if (!q[0].n) q.shift();
    }
    if (q.length && (!oldest || q[0].t < oldest)) oldest = q[0].t;
  });
  return oldest;
}

// ---------- Tanggal ----------
const todayStr = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const ld = (iso) => {
  const d = new Date(iso);
  return isNaN(d)
    ? ""
    : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
const addDays = (s, n) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
const dow = (s) => new Date(s + "T00:00:00").getDay();

// ---------- Jadwal kroscek (hari tetap mingguan, bebas pilih berapa hari) ----------
const runSpk = (sid) =>
  sOf(sid)
    .filter((s) => {
      const h = hitung(s);
      return !h.selesai && (h.target > 0 || s.selesai >= todayStr());
    })
    .pop();
function jadwalK(r) {
  const sp = runSpk(r.id);
  if (!sp) return null;
  const hari = (r.kHari || "")
      .split(",")
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
    t = todayStr();
  const mon = addDays(t, -((dow(t) + 6) % 7)),
    minggu = K.filter((k) => k.sid === r.id && ld(k.waktu) >= mon).length;
  const hariIni = hari.includes(dow(t)),
    sudah = K.some((k) => k.sid === r.id && ld(k.waktu) === t);
  let next = "";
  for (let i = 1; i <= 7 && !next && hari.length; i++) {
    const c = addDays(t, i);
    if (hari.includes(dow(c))) next = c;
  }
  return { sp, hari, hariIni, sudah, next, minggu };
}
const jadwalTxt = (j) =>
  !j.hari.length
    ? "Hari kroscek belum diatur"
    : j.hariIni
      ? j.sudah
        ? "Kroscek hari ini sudah dilakukan"
        : "Kroscek hari ini"
      : `Tiap ${j.hari.map((h) => HARI[h]).join(", ")} · berikutnya ${fmtDay(j.next)}`;

// ---------- Tampilan ----------
const hpCell = (hp) => {
  const t = String(hp ?? "").replace(/^'/, "");
  let n = t.replace(/\D/g, "");
  if (!n) return "";
  n = n.startsWith("0") ? "62" + n.slice(1) : n.startsWith("8") ? "62" + n : n;
  return `<span class="hpw"><span class="hp">${esc(t)}</span><a class="abtn wb" href="https://wa.me/${n}" target="_blank" rel="noopener">Chat WA</a></span>`;
};
const mapBtns = (r) => {
  const u = mapUrl(r);
  if (!u) return "";
  return `<span class="hpw"><a class="abtn" href="${esc(u)}" target="_blank" rel="noopener">Buka di Maps</a><button type="button" class="btn-s sm" data-act="shareloc" data-id="${esc(r.id)}">Bagikan ke WA</button></span>`;
};

const mapMini = (r) => {
  const u = mapUrl(r);
  return u
    ? `<a class="abtn" data-act="maps" href="${esc(u)}" target="_blank" rel="noopener">Maps</a>`
    : "";
};

const card = (r) => `<div class="rec" style="--c:${COL[r.status]}">
  <div class="rh"><b>${esc(r.nama)}</b>${badge(r.status)}</div>
  <div class="muted">${fmtTime(r.waktu)}${r.alamat ? " · " + esc(r.alamat) : ""}</div>
  <div class="rl">${hpCell(r.hp)}${mapBtns(r)}</div>
  ${r.estimasi && r.estimasi !== "-" ? `<div>Estimasi/minggu: ${esc(r.estimasi)}</div>` : ""}
  ${r.fu ? `<div>Follow-up: ${fmtDay(r.fu)}${r.fuDone ? ` · <b>sudah dikunjungi ${fmtDay(r.fuDone)}</b>` : ""}</div>` : ""}
  ${r.catatan ? `<div class="note">${esc(r.catatan)}</div>` : ""}
  ${thumbs(r.foto)}
  <div class="acts">
    ${FU_ST.includes(r.status) && r.fu && !r.fuDone ? `<button class="sm" data-act="fudone" data-id="${esc(r.id)}">Sudah dikunjungi</button>` : ""}
    ${r.fuDone ? `<button class="btn-s sm" data-act="fuundo" data-id="${esc(r.id)}">Batalkan dikunjungi</button>` : ""}
    ${NEXT[r.status] ? `<button class="sm" data-act="promote" data-id="${esc(r.id)}">${NEXT_LABEL[r.status]}</button>` : ""}
    ${r.status === "SPK" ? `<button class="sm" data-act="detail" data-id="${esc(r.id)}">Buka halaman supplier</button>` : ""}
    <button class="btn-s sm" data-act="edit" data-id="${esc(r.id)}">Edit</button>
    <button class="btn-d sm" data-act="del" data-id="${esc(r.id)}">Hapus</button>
  </div></div>`;

function inPeriod(rows) {
  const d = +$("period").value;
  if (!d) return rows;
  const min = Date.now() - d * 864e5;
  return rows.filter((r) => new Date(r.waktu) >= min);
}

// ---------- Jarak dari posisi saya ----------
let myPos = null;
const urut = { fu: "tgl", k: "tgl" };
function posisiSaya() {
  return new Promise((ok, no) => {
    if (myPos && Date.now() - myPos.t < 120000) return ok(myPos);
    if (!navigator.geolocation)
      return no(new Error("GPS tidak didukung di browser ini."));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        myPos = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          t: Date.now(),
        };
        ok(myPos);
      },
      () =>
        no(
          new Error("Gagal mengambil lokasi. Izinkan akses lokasi di browser."),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
const jarakKm = (r) => {
  if (!myPos || r.lat == null || r.lng == null || r.lat === "" || r.lng === "")
    return null;
  const rad = Math.PI / 180,
    dLa = (Number(r.lat) - myPos.lat) * rad,
    dLn = (Number(r.lng) - myPos.lng) * rad,
    a =
      Math.sin(dLa / 2) ** 2 +
      Math.cos(myPos.lat * rad) *
        Math.cos(Number(r.lat) * rad) *
        Math.sin(dLn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};
const jarakInfo = (r) => {
  if (!myPos) return "";
  const k = jarakKm(r);
  return k == null
    ? " · lokasi belum ada"
    : " · " +
        (k < 1
          ? Math.round(k * 1000) + " m"
          : k.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " km");
};
const urutDekat = (rows, w, get = (x) => x) =>
  urut[w] !== "jarak"
    ? rows
    : rows.slice().sort((a, b) => {
        const x = jarakKm(get(a)),
          y = jarakKm(get(b));
        return x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y;
      });
const urutBtn = (w) =>
  `<div class="acts" style="margin:0 0 6px"><button class="btn-s sm" data-act="urut" data-w="${w}">${urut[w] === "jarak" ? "Terdekat dulu · ketuk untuk urutan biasa" : "Urutkan terdekat"}</button></div>`;

function renderDash() {
  const rows = inPeriod(D),
    cnt = (s) => rows.filter((r) => r.status === s).length;
  $("stats").innerHTML =
    `<div class="stat go" data-go="riwayat"><span class="muted">Total klien</span><b>${rows.length}</b></div>` +
    STATUS.map(
      (s) =>
        `<div class="stat go" data-go="riwayat" data-st="${s}" style="--c:${COL[s]}"><span class="muted">${s}</span><b>${cnt(s)}</b></div>`,
    ).join("");
  const mx = Math.max(1, ...STATUS.map(cnt));
  $("barStatus").innerHTML = STATUS.map(
    (s) =>
      `<div class="bar go" data-go="riwayat" data-st="${s}" style="--c:${COL[s]}"><span>${s}</span><div><div style="width:${(cnt(s) / mx) * 100}%"></div></div><b>${cnt(s)}</b></div>`,
  ).join("");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const wk = [];
  for (let i = 7; i >= 0; i--) {
    const s = new Date(mon);
    s.setDate(mon.getDate() - i * 7);
    const e = new Date(s);
    e.setDate(s.getDate() + 7);
    wk.push({
      l: s.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
      n: D.filter((r) => {
        const t = new Date(r.waktu);
        return t >= s && t < e;
      }).length,
    });
  }
  const wm = Math.max(1, ...wk.map((w) => w.n));
  $("wk").innerHTML = wk
    .map(
      (w) =>
        `<div><span>${w.n}</span><div style="height:${(w.n / wm) * 80}%"></div><span>${w.l}</span></div>`,
    )
    .join("");

  const today = todayStr();
  const fuToday = D.filter(r => r.fu && !r.fuDone && r.fu <= today && FU_ST.includes(r.status));
  const kToday = jk0.map(x => x.r);
  const ruteHariIni = [...fuToday, ...kToday.filter(kr => !fuToday.some(fr => fr.id === kr.id))];
  const ruteWithCoords = ruteHariIni.filter(r => r.lat != null && r.lng != null);

  const routeBar = $("routeBar");
  if(routeBar){
    if(ruteHariIni.length > 0){
      routeBar.classList.remove("hidden");
      $("routeText").textContent = `${ruteHariIni.length} titik (${fuToday.length} follow-up, ${kToday.length} kroscek) · ${ruteWithCoords.length} lokasi berkoordinat`;
      $("openRouteBtn").onclick = () => {
        if(!ruteWithCoords.length) return toast("Belum ada lokasi kunjungan hari ini yang memiliki koordinat.");
        const urut = myPos ? ruteWithCoords.slice().sort((a,b) => (jarakKm(a)||999) - (jarakKm(b)||999)) : ruteWithCoords;
        const pts = urut.map(r => `${r.lat},${r.lng}`);
        let url = "";
        if(pts.length === 1){
          url = `https://www.google.com/maps/dir/?api=1&destination=${pts[0]}`;
        }else{
          const dest = pts[pts.length - 1];
          const waypoints = pts.slice(0, pts.length - 1).join("|");
          url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${waypoints}`;
        }
        window.open(url, "_blank");
      };
    }else{
      routeBar.classList.add("hidden");
    }
  }

  const fu = urutDekat(
    D.filter((r) => r.fu && !r.fuDone && FU_ST.includes(r.status)).sort(
      (a, b) => a.fu.localeCompare(b.fu),
    ),
    "fu",
  ).slice(0, 6);
  $("fuList").innerHTML = fu.length
    ? urutBtn("fu") +
      fu
        .map(
          (r) =>
            `<div class="li go" data-go="riwayat" data-q="${esc(r.nama)}"><span><b>${esc(r.nama)}</b><br><span class="muted">${fmtDay(r.fu)}${r.fu < today ? " · terlambat" : ""}${jarakInfo(r)}</span></span><span>${badge(r.status)} ${mapMini(r)} <button class="sm" data-act="fudone" data-id="${esc(r.id)}">Sudah</button></span></div>`,
        )
        .join("")
    : `<p class="muted">Tidak ada follow-up yang menunggu. Isi tanggal follow-up di form klien.</p>`;

  const jk0 = D.filter((r) => r.status === "SPK")
    .map((r) => ({ r, j: jadwalK(r) }))
    .filter((x) => x.j && (!x.j.hari.length || (x.j.hariIni && !x.j.sudah)))
    .sort((a, b) => a.j.hari.length - b.j.hari.length);
  const jk = urutDekat(jk0, "k", (x) => x.r);
  $("kJadwal").innerHTML = jk.length
    ? urutBtn("k") +
      jk
        .map(
          (x) =>
            `<div class="li go" data-go="detail" data-id="${esc(x.r.id)}"><span><b>${esc(x.r.nama)}</b><br><span class="muted">${jadwalTxt(x.j)}${x.j.hari.length ? ` · minggu ini ${x.j.minggu} dari ${x.j.hari.length}` : ""}${jarakInfo(x.r)}</span></span><span>${x.j.hari.length ? `<span class="badge" style="--c:#c98400">Hari ini</span>` : `<span class="badge" style="--c:#5d6f75">Atur hari</span>`} ${mapMini(x.r)}</span></div>`,
        )
        .join("")
    : `<p class="muted">Tidak ada kroscek yang harus dilakukan hari ini.</p>`;

  const sv = D.filter((r) => r.status === "SPK")
    .map((r) => ({
      r,
      n: sOf(r.id).reduce((a, s) => a + hitung(s).service, 0),
      t: umurService(r.id),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (a.t || "").localeCompare(b.t || ""))
    .slice(0, 6);
  $("svcList").innerHTML = sv.length
    ? sv
        .map(
          (x) =>
            `<div class="li go" data-go="detail" data-id="${esc(x.r.id)}"><span><b>${esc(x.r.nama)}</b><br><span class="muted">${x.n} pcs · ${x.t ? Math.max(0, dayDiff(x.t, today)) : 0} hari menunggu cek ulang</span></span></div>`,
        )
        .join("")
    : `<p class="muted">Tidak ada barang yang menunggu cek ulang.</p>`;

  const due = D.filter((r) => r.status === "SPK")
    .map((r) => ({ r, i: spkInfo(r.id) }))
    .filter((x) => x.i && !x.i.done && x.i.d <= 14)
    .sort((a, b) => a.i.d - b.i.d)
    .slice(0, 6);
  $("spkDue").innerHTML = due.length
    ? due
        .map(
          (x) =>
            `<div class="li go" data-go="detail" data-id="${esc(x.r.id)}"><span><b>${esc(x.r.nama)}</b><br><span class="muted">${x.i.txt}</span></span><button class="sm" data-act="spknew" data-id="${esc(x.r.id)}">SPK baru</button></div>`,
        )
        .join("")
    : `<p class="muted">Tidak ada SPK yang jatuh tempo dalam 14 hari.</p>`;
  $("recent").innerHTML =
    D.slice(0, 6)
      .map(
        (r) =>
          `<div class="li go" data-go="riwayat" data-q="${esc(r.nama)}"><span><b>${esc(r.nama)}</b><br><span class="muted">${fmtTime(r.waktu)}</span></span>${badge(r.status)}</div>`,
      )
      .join("") || `<p class="muted">Belum ada data.</p>`;
}

function filtered() {
  const q = $("q").value.toLowerCase().trim(),
    st = $("stF").value,
    tm = $("tglMulai") ? $("tglMulai").value : "",
    ts = $("tglSelesai") ? $("tglSelesai").value : "";
  return D.filter(
    (r) =>
      (!st || r.status === st) &&
      (!tm || String(r.waktu).slice(0, 10) >= tm) &&
      (!ts || String(r.waktu).slice(0, 10) <= ts) &&
      (!q ||
        [r.nama, r.alamat, r.hp, r.status, r.catatan]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
}
function renderRiwayat() {
  const rows = filtered(),
    pp = +$("pp").value,
    pages = Math.max(1, Math.ceil(rows.length / pp));
  if (page > pages) page = pages;
  const s = (page - 1) * pp,
    slice = rows.slice(s, s + pp);
  $("list").innerHTML =
    (loaded ? "" : statusBox()) ||
    slice.map(card).join("") ||
    `<div class="card muted" style="text-align:center">${D.length ? "Tidak ada data yang cocok dengan filter." : "Belum ada data. Mulai dari menu Input."}</div>`;
  $("count").textContent = rows.length
    ? `Menampilkan ${s + 1}-${s + slice.length} dari ${rows.length} data`
    : "";
  $("pager").innerHTML =
    pages > 1
      ? `<button class="btn-s sm" data-act="pg" data-p="${page - 1}" ${page === 1 ? "disabled" : ""}>‹ Sebelumnya</button><span class="muted">Hal ${page} / ${pages}</span><button class="btn-s sm" data-act="pg" data-p="${page + 1}" ${page === pages ? "disabled" : ""}>Berikutnya ›</button>`
      : "";
}
function spkInfo(id) {
  const L = sOf(id);
  if (!L.length) return null;
  const s = L.reduce((a, b) => (b.selesai > a.selesai ? b : a)),
    n = L.indexOf(s) + 1,
    d = dayDiff(todayStr(), s.selesai),
    h = hitung(s);
  const base =
    `SPK ke-${n} · ${fmtDay(s.mulai)} - ${fmtDay(s.selesai)}` +
    (h.target ? ` · ${h.terangkut}/${h.target} pcs` : "");
  return {
    s,
    n,
    d,
    h,
    done: h.selesai,
    txt: h.selesai
      ? base + " · selesai"
      : base +
        " · " +
        (d > 0
          ? `sisa ${d} hari`
          : d === 0
            ? "berakhir hari ini"
            : `terlambat ${-d} hari`),
  };
}
function kualitasSupplier(sid) {
  const spks = sOf(sid);
  if (!spks.length) return null;
  let totalLolos = 0, totalSvc = 0, totalRej = 0;
  spks.forEach(sp => {
    const h = hitung(sp);
    totalLolos += h.terangkut;
    totalSvc += h.service;
    totalRej += h.ditolak;
  });
  const total = totalLolos + totalSvc + totalRej;
  if (total === 0) return null;
  const pLolos = Math.round((totalLolos / total) * 100);
  const pSvc = Math.round((totalSvc / total) * 100);
  const pRej = Math.max(0, 100 - pLolos - pSvc);
  return { total, totalLolos, totalSvc, totalRej, pLolos, pSvc, pRej };
}

function spkFiltered() {
  const q = ($("spkQ") ? $("spkQ").value : "").toLowerCase().trim();
  const sort = $("spkSort") ? $("spkSort").value : "due";
  let rows = D.filter(r => r.status === "SPK");
  if (q) rows = rows.filter(r => [r.nama, r.alamat, r.hp].join(" ").toLowerCase().includes(q));
  if (sort === "due") {
    rows = rows.sort((a, b) => {
      const f = x => { const i = spkInfo(x.id); return i ? (i.done ? 1e8 : i.d) : 1e9; };
      return f(a) - f(b);
    });
  } else if (sort === "nama") {
    rows = rows.sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id"));
  } else if (sort === "quality") {
    rows = rows.sort((a, b) => {
      const qa = kualitasSupplier(a.id), qb = kualitasSupplier(b.id);
      return (qb ? qb.pLolos : 0) - (qa ? qa.pLolos : 0);
    });
  }
  return rows;
}

function renderSpk() {
  const rows = spkFiltered();
  $("spkList").innerHTML =
    (loaded ? "" : statusBox()) ||
    rows
      .map((r) => {
        const i = spkInfo(r.id),
          c = i
            ? i.done
              ? "#1b7a4b"
              : i.d < 0
                ? "#b3372f"
                : i.d <= 7
                  ? "#c98400"
                  : "#1b7a4b"
            : "";
        const q = kualitasSupplier(r.id);
        const qHtml = q ? `<div class="quality-box">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">
      <span><b>Kualitas Pengambilan:</b> ${q.pLolos}% Lolos (${q.totalLolos}/${q.total} pcs)</span>
      <span class="muted">${q.pSvc}% Service · ${q.pRej}% Retur</span>
    </div>
    <div class="quality-bar">
      <div class="q-lolos" style="width:${q.pLolos}%" title="${q.totalLolos} pcs lolos (${q.pLolos}%)"></div>
      <div class="q-svc" style="width:${q.pSvc}%" title="${q.totalSvc} pcs service (${q.pSvc}%)"></div>
      <div class="q-rej" style="width:${q.pRej}%" title="${q.totalRej} pcs retur (${q.pRej}%)"></div>
    </div>
  </div>` : "";
        return `<div class="rec" style="--c:${COL.SPK}">
    <div class="rh"><b>${esc(r.nama)}</b>${i ? `<span class="badge" style="--c:${c}">${i.txt}</span>` : `<span class="muted">Data SPK belum diisi</span>`}</div>
    <div class="rl">${hpCell(r.hp)}${mapBtns(r)}</div>
    ${r.alamat ? `<div class="muted">${esc(r.alamat)}</div>` : ""}
    <div class="muted">${sOf(r.id).length} SPK · ${K.filter((k) => k.sid === r.id).length} laporan kroscek</div>
    ${qHtml}
    <div class="acts">${!i || i.done ? `<button class="sm" data-act="spknew" data-id="${esc(r.id)}">${i ? "SPK baru" : "Isi data SPK"}</button>` : ""}<button class="sm" data-act="detail" data-id="${esc(r.id)}">Buka halaman supplier</button></div></div>`;
      })
      .join("") ||
    `<div class="card muted" style="text-align:center">Belum ada supplier SPK. Naikkan klien berstatus Siap Ambil lewat tombol "Jadikan SPK".</div>`;
}

// ---------- Detail supplier, SPK, pengambilan, kroscek ----------
const kOf = (id) => K.filter((k) => k.sid === id);
const kOfSpk = (id) => K.filter((k) => k.spk === id);
const kLepas = (sid) =>
  K.filter(
    (k) => k.sid === sid && !S.some((s) => s.id === k.spk && s.sid === sid),
  ); // laporan lama tanpa SPK
const spkNo = (r, s) => sOf(r.id).findIndex((x) => x.id === s.id) + 1;
const evTxt = (a) =>
  a.jenis === "Cek awal"
    ? `siap ${a.siap}, diambil ${a.diambil}`
    : `diambil ${a.diambil}, ditolak ${a.ditolak}`;

const kroscekItem = (
  k,
) => `<div class="rec" style="--c:${COL.SPK}"> <div class="rh" style="flex-wrap:wrap"><b>${fmtTime(k.waktu)}</b><span class="acts" style="margin:0"><button class="btn-s sm" data-act="sharek" data-id="${esc(k.id)}">Bagikan ke WA</button>${k.foto.length ? `<button class="btn-s sm" data-act="kfoto" data-id="${esc(k.id)}">Unduh semua foto (${k.foto.length})</button>` : ""}<button class="btn-d sm" data-act="delk" data-id="${esc(k.id)}">Hapus</button></span></div>
  ${k.catatan ? `<div class="note">${esc(k.catatan)}</div>` : ""}${thumbs(k.foto, true)}</div>`;

const evHtml = (s) =>
  ambilOf(s.id)
    .slice()
    .sort((a, b) => b.tgl.localeCompare(a.tgl))
    .map(
      (a) =>
        `<div class="ev"><span>${fmtDay(a.tgl)} · <b>${a.jenis}</b> · ${evTxt(a)}${a.catatan ? `<br><span class="muted">${esc(a.catatan)}</span>` : ""}</span><button class="btn-d sm" data-act="ambildel" data-id="${esc(a.id)}">Hapus</button></div>`,
    )
    .join("");

const sgHtml = (h) =>
  h.target
    ? `<div class="sg"><div>Target<b>${h.target}</b></div><div>Terangkut<b>${h.terangkut}</b></div><div>Di service<b>${h.service}</b></div><div>Ditolak<b>${h.ditolak}</b></div><div>Sisa target<b>${h.sisa}</b></div></div>`
    : `<p class="muted">Target belum diisi. Tekan Edit untuk mengisi target.</p>`;

const spkBd = (s, h) => {
  const last = spkInfo(s.sid)?.s;
  if (h.selesai || (s !== last && !h.target))
    return `<span class="badge" style="--c:#1b7a4b">Selesai</span>`;
  const d = dayDiff(todayStr(), s.selesai);
  return d < 0
    ? `<span class="badge" style="--c:#b3372f">Terlambat ${-d} hari</span>`
    : `<span class="badge" style="--c:#c98400">${d === 0 ? "Berakhir hari ini" : "Sisa " + d + " hari"}</span>`;
};

function spkSection(r) {
  const L = sOf(r.id);
  return (
    `<div class="card"><div class="rh"><h2 style="margin:0">Riwayat SPK (${L.length})</h2><button class="sm" data-act="spknew" data-id="${esc(r.id)}">+ SPK baru</button></div>` +
    (L.map((s, i) => {
      const h = hitung(s),
        nk = kOfSpk(s.id).length;
      return `<div class="spkb">
      <div class="rh"><b>SPK ke-${i + 1}</b>${spkBd(s, h)}</div>
      <div class="muted">${fmtDay(s.mulai)} - ${fmtDay(s.selesai)}${s.jumlah ? " · " + esc(s.jumlah) : ""}${s.catatan ? " · " + esc(s.catatan) : ""}</div>
      ${sgHtml(h)}
      <div class="acts"><button class="sm" data-act="spkopen" data-id="${esc(s.id)}">Buka kroscek (${nk})</button>
        <button class="sm" data-act="ambilnew" data-id="${esc(s.id)}">+ Pengambilan</button>
        ${h.selesai ? `<button class="sm" data-act="spknew" data-id="${esc(r.id)}">SPK baru</button>` : ""}
        <button class="btn-s sm" data-act="spkedit" data-id="${esc(s.id)}">Edit</button>
        ${h.n || nk ? `<span class="muted">Sudah ada pengambilan/kroscek, tidak bisa dihapus</span>` : `<button class="btn-d sm" data-act="spkdel" data-id="${esc(s.id)}">Hapus</button>`}</div></div>`;
    }).join("") || `<p class="muted">Belum ada data SPK.</p>`) +
    `</div>`
  );
}
function jadwalSection(r) {
  const j = jadwalK(r);
  if (!j)
    return `<div class="card"><h2>Jadwal kroscek</h2><p class="muted">Tidak ada SPK yang sedang berjalan.</p></div>`;
  const info = `<p class="muted">${jadwalTxt(j)}${j.hari.length ? ` · minggu ini ${j.minggu} dari ${j.hari.length}` : ""}</p>`;
  if (!(kjEdit && kjEdit.id === r.id))
    return `<div class="card"><h2>Jadwal kroscek</h2>${info}
    ${j.hari.length ? `<div class="chips">${j.hari.map((i) => `<span class="chip on ro">${HARI[i]}</span>`).join("")}</div>` : ""}
    <div class="btn-row"><button class="btn-s" data-act="kjedit" data-id="${esc(r.id)}">${j.hari.length ? "Edit jadwal" : "Atur hari kroscek"}</button>${j.hari.length ? `<button class="btn-d" data-act="kjdel" data-id="${esc(r.id)}">Hapus jadwal</button>` : ""}</div></div>`;
  return `<div class="card"><h2>Jadwal kroscek</h2>${info}
    <label>Pilih hari kroscek (boleh lebih dari satu)</label>
    <div class="chips" id="kjDays">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<button type="button" class="chip${kjEdit.hari.includes(i) ? " on" : ""}" data-d="${i}">${HARI[i]}</button>`).join("")}</div>
    <div class="btn-row"><button class="btn-s" data-act="kjcancel">Batal</button><button id="kj_save">Simpan jadwal</button></div></div>`;
}
let FK = null,
  kjEdit = null;
function renderDetail() {
  const r = D.find((x) => x.id === detailId);
  if (!r) {
    if (!loaded) {
      $("v-detail").innerHTML = statusBox();
      return;
    }
    showView("spk");
    return;
  }
  const lepas = kLepas(r.id);
  $("v-detail").innerHTML =
    `<button class="btn-s sm" data-act="back">‹ Kembali</button>
  <div class="card" style="margin-top:10px"><div class="rh"><h2 style="margin:0">${esc(r.nama)}</h2>${badge(r.status)}</div>
    <p>${hpCell(r.hp)}<br>${esc(r.alamat) || "<span class='muted'>Alamat belum diisi</span>"}</p>
    <div class="rl">${mapBtns(r)}</div>
    <div class="btn-row"><button class="btn-s" data-act="xls" data-id="${esc(r.id)}">Unduh Excel</button><button class="btn-s" data-act="pdf" data-id="${esc(r.id)}">Unduh PDF</button></div></div>
  ${jadwalSection(r)}
  ${spkSection(r)}
  ${lepas.length ? `<h2>Kroscek tanpa SPK (${lepas.length})</h2><p class="muted">Laporan lama yang dibuat sebelum kroscek dikaitkan ke SPK.</p>${lepas.map(kroscekItem).join("")}` : ""}`;
  if ($("kjDays"))
    $("kjDays").onclick = (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      const d = +c.dataset.d,
        i = kjEdit.hari.indexOf(d);
      if (i >= 0) kjEdit.hari.splice(i, 1);
      else kjEdit.hari.push(d);
      c.classList.toggle("on", i < 0);
    };
  if ($("kj_save"))
    $("kj_save").onclick = () =>
      busy($("kj_save"), async () => {
        const hari = kjEdit.hari.slice().sort().join(",");
        try {
          const res = await api({ action: "kSet", id: r.id, hari });
          r.kHari = res.kHari;
          r.kNext = "";
          kjEdit = null;
          renderAll();
          toast(res.kHari ? "Jadwal tersimpan" : "Jadwal dihapus");
        } catch (e) {
          toast("Gagal: " + e.message);
        }
      });
}

// ---------- Halaman satu SPK: kroscek, pengambilan, unduhan ----------
let spkdId = null;
function renderSpkDetail() {
  const sp = S.find((x) => x.id === spkdId),
    r = sp && D.find((x) => x.id === sp.sid);
  if (!sp || !r) {
    if (!loaded) {
      $("v-spkd").innerHTML = statusBox();
      return;
    }
    showView(D.some((x) => x.id === detailId) ? "detail" : "spk");
    return;
  }
  detailId = r.id;
  const h = hitung(sp),
    no = spkNo(r, sp),
    ks = kOfSpk(sp.id)
      .slice()
      .sort((a, b) => b.waktu.localeCompare(a.waktu));
  const keep =
    FK && FK.spk === sp.id && $("k_cat")
      ? { cat: $("k_cat").value, ph: FK.items() }
      : null;
  $("v-spkd").innerHTML =
    `<button class="btn-s sm" data-act="spkback">‹ Kembali ke supplier</button>
  <div class="card" style="margin-top:10px"><div class="rh"><h2 style="margin:0">SPK ke-${no} · ${esc(r.nama)}</h2>${spkBd(sp, h)}</div>
    <div class="muted">${fmtDay(sp.mulai)} - ${fmtDay(sp.selesai)}${sp.jumlah ? " · " + esc(sp.jumlah) : ""}${sp.catatan ? " · " + esc(sp.catatan) : ""}</div>
    ${sgHtml(h)}
    <div class="btn-row"><button class="btn-s" data-act="spkedit" data-id="${esc(sp.id)}">Edit SPK</button><button class="btn-s" data-act="sxls" data-id="${esc(sp.id)}">Unduh Excel</button><button class="btn-s" data-act="spdf" data-id="${esc(sp.id)}">Unduh PDF</button></div></div>
  <div class="card"><h2>Laporan kroscek baru</h2>${photoHtml("k_")}<label>Catatan</label><textarea id="k_cat" rows="3" maxlength="1500"></textarea>
    <p class="err" id="k_err"></p><button id="k_save" style="width:100%">Simpan laporan</button></div>
  <h2>Riwayat kroscek (${ks.length})</h2>
  ${ks.map(kroscekItem).join("") || `<p class="muted">Belum ada laporan kroscek untuk SPK ini.</p>`}
  <div class="card" style="margin-top:14px"><div class="rh"><h2 style="margin:0">Riwayat pengambilan</h2><button class="sm" data-act="ambilnew" data-id="${esc(sp.id)}">+ Pengambilan</button></div>
    ${evHtml(sp) || `<p class="muted">Belum ada catatan pengambilan.</p>`}</div>`;
  FK = initPhotos("k_", keep ? keep.ph : [], () => ({
    nama: r.nama,
    lat: r.lat,
    lng: r.lng,
  }));
  FK.sid = r.id;
  FK.spk = sp.id;
  if (keep) $("k_cat").value = keep.cat;
  $("k_save").onclick = () =>
    busy($("k_save"), async () => {
      $("k_err").textContent = "";
      try {
        const cat = $("k_cat").value.trim();
        if (!FK.count() && !cat)
          throw new Error("Isi catatan atau tambahkan foto.");
        const foto = await FK.upload();
        const res = await api({
          action: "kroscekSave",
          sid: r.id,
          spk: sp.id,
          catatan: cat,
          foto,
        });
        FK = null;
        K.unshift(res.rec);
        renderAll();
        toast("Laporan tersimpan");
      } catch (e) {
        $("k_err").textContent = e.message;
      }
    });
}

// ---------- Peta ----------
let map, layer, tileNormalLayer, tileSatelitLayer, mapMode = "normal";

const TILES = {
  normal: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satelit: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 19,
    maxNativeZoom: 18
  }
};

function switchMapTile(mode) {
  if (!map) return;
  mapMode = mode;
  if (tileNormalLayer) map.removeLayer(tileNormalLayer);
  if (tileSatelitLayer) map.removeLayer(tileSatelitLayer);
  const t = TILES[mode];
  const newTile = L.tileLayer(t.url, { maxZoom: t.maxZoom, maxNativeZoom: t.maxNativeZoom || t.maxZoom, attribution: t.attr });
  newTile.addTo(map);
  if (mode === "normal") tileNormalLayer = newTile;
  else tileSatelitLayer = newTile;
  document.querySelectorAll(".tile-btn").forEach(b => b.classList.remove("on"));
  const btn = mode === "normal" ? $("tileNormal") : $("tileSatelit");
  if (btn) btn.classList.add("on");
}

function renderMap() {
  if (cur !== "peta") return;
  if (!map) {
    map = L.map("map").setView([-6.6, 110.7], 8);
    tileNormalLayer = L.tileLayer(TILES.normal.url, { maxZoom: 19, maxNativeZoom: 19, attribution: TILES.normal.attr }).addTo(map);
    layer = L.layerGroup().addTo(map);
    // Wire tile toggle buttons
    const tn = $("tileNormal"), ts = $("tileSatelit");
    if (tn) tn.onclick = () => switchMapTile("normal");
    if (ts) ts.onclick = () => switchMapTile("satelit");
  }
  setTimeout(() => map.invalidateSize(), 60);
  layer.clearLayers();
  const f = $("mapSt").value,
    all = D.filter((r) => !f || r.status === f),
    pts = all.filter((r) => r.lat != null && r.lng != null);
  pts.forEach((r) => {
    const fotoId = r.foto && r.foto.length ? r.foto[0] : null;
    const thumbUrl = fotoId ? thumb(fotoId, 400) : "";
    const popupHtml = `
      <div class="map-card-thumb">
        ${fotoId ? `<img src="${thumbUrl}" alt="Foto ${esc(r.nama)}" onerror="this.onerror=null;this.src='${PIXEL}';this.parentElement.style.display='none';">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:0.8rem">📷 Belum ada foto rumah</div>`}
        <span class="badge map-card-badge" style="--c:${COL[r.status] || '#0d9488'}">${esc(r.status)}</span>
      </div>
      <div class="map-card-body">
        <b>${esc(r.nama)}</b>
        <div class="map-card-meta">
          ${r.alamat ? `<div>📍 ${esc(r.alamat)}</div>` : ""}
          ${r.hp ? `<div>📞 <a href="tel:${esc(r.hp)}" class="lnk">${esc(r.hp)}</a></div>` : ""}
          ${r.estimasi && r.estimasi !== "-" ? `<div>📦 Est: ${esc(r.estimasi)}</div>` : ""}
        </div>
        <div class="map-card-acts">
          <a href="${esc(mapUrl(r))}" target="_blank" rel="noopener" class="btn-s">🧭 Rute Maps</a>
          ${r.status === "SPK" ? `<button class="sm" data-act="detail" data-id="${esc(r.id)}">Detail</button>` : ""}
        </div>
      </div>
    `;

    L.circleMarker([r.lat, r.lng], {
      radius: 9,
      color: "#ffffff",
      weight: 2.5,
      fillColor: COL[r.status] || "#0d9488",
      fillOpacity: 0.95,
    })
      .bindPopup(popupHtml, { maxWidth: 280, minWidth: 240 })
      .addTo(layer);
  });
  if (pts.length)
    map.fitBounds(
      pts.map((r) => [r.lat, r.lng]),
      { padding: [40, 40], maxZoom: 16 },
    );
  $("mapInfo").textContent =
    `${pts.length} lokasi tampil.` +
    (all.length > pts.length
      ? ` ${all.length - pts.length} data belum punya koordinat (isi lewat tombol "Ambil lokasi saya" atau link Maps).`
      : "");
}

// ---------- Navigasi ----------
function showView(v) {
  cur = v;
  try {
    sessionStorage.setItem("view", v);
    if (v === "detail" || v === "spkd")
      sessionStorage.setItem("did", detailId || "");
    if (v === "spkd") sessionStorage.setItem("sdid", spkdId || "");
  } catch (e) {}
  document
    .querySelectorAll(".view")
    .forEach((s) => s.classList.toggle("hidden", s.id !== "v-" + v));
  document
    .querySelectorAll(".nav[data-v]")
    .forEach((b) =>
      b.classList.toggle(
        "on",
        b.dataset.v === (v === "detail" || v === "spkd" ? "spk" : v),
      ),
    );
  scrollTo(0, 0);
  if (v === "dash") aman(renderDash);
  if (v === "riwayat") aman(renderRiwayat);
  if (v === "spk") aman(renderSpk);
  if (v === "detail") aman(renderDetail);
  if (v === "spkd") aman(renderSpkDetail);
  if (v === "peta") renderMap();
}
document.querySelectorAll(".nav[data-v]").forEach(
  (b) =>
    (b.onclick = () => {
      if (b.dataset.v === "riwayat" && cur !== "riwayat") {
        $("stF").value = "";
        $("q").value = "";
        page = 1;
        renderRiwayat();
      }
      showView(b.dataset.v);
    }),
);

// Satu bagian error tidak boleh mematikan bagian lain
const aman = (fn) => {
  try {
    fn();
  } catch (e) {
    console.error(fn.name + ":", e);
  }
};
function renderAll() {
  if (!loaded && loading) {
    $("stats").innerHTML = skeletonStats();
    $("list").innerHTML = skeletonCards(4);
    $("spkList").innerHTML = skeletonCards(3);
    document
      .querySelectorAll("#v-dash .dash-grid")
      .forEach((x) => x.classList.add("hidden"));
    return;
  }
  aman(renderDash);
  aman(renderRiwayat);
  aman(renderSpk);
  if (!loaded) $("stats").innerHTML = statusBox();
  document
    .querySelectorAll("#v-dash .dash-grid")
    .forEach((x) => x.classList.toggle("hidden", !loaded));
  if (cur === "detail" && !document.querySelector("dialog[open]"))
    aman(renderDetail);
  if (cur === "spkd" && !document.querySelector("dialog[open]"))
    aman(renderSpkDetail);
  aman(renderMap);
}
$("stF").innerHTML =
  `<option value="">Semua</option>` +
  STATUS.map((s) => `<option>${s}</option>`).join("");
$("mapSt").innerHTML =
  `<option value="">Semua status</option>` +
  STATUS.map((s) => `<option>${s}</option>`).join("");
$("legend").innerHTML = STATUS.map(
  (s) => `<span style="--c:${COL[s]}"><i></i>${s}</span>`,
).join("");
$("mapSt").onchange = renderMap;
$("period").onchange = renderDash;
$("q").oninput = () => { page = 1; renderRiwayat(); };
$("stF").onchange = () => { page = 1; renderRiwayat(); };
$("pp").onchange = () => { page = 1; renderRiwayat(); };
if ($("tglMulai")) $("tglMulai").onchange = () => { page = 1; renderRiwayat(); };
if ($("tglSelesai")) $("tglSelesai").onchange = () => { page = 1; renderRiwayat(); };
if ($("resetFilterBtn")) $("resetFilterBtn").onclick = () => {
  $("q").value = "";
  $("stF").value = "";
  if ($("tglMulai")) $("tglMulai").value = "";
  if ($("tglSelesai")) $("tglSelesai").value = "";
  page = 1;
  renderRiwayat();
};

// SPK Search & Sort
if ($("spkQ")) $("spkQ").oninput = renderSpk;
if ($("spkSort")) $("spkSort").onchange = renderSpk;

// ===== DARK MODE TOGGLE =====
(function initDarkMode() {
  const DARK_KEY = "keliling_dark_mode";
  const root = document.documentElement;
  let isDark = localStorage.getItem(DARK_KEY);
  if (isDark === null) isDark = window.matchMedia("(prefers-color-scheme: dark)").matches ? "1" : "0";
  function applyDark(val) {
    if (val === "1") {
      root.setAttribute("data-theme", "dark");
      const icon = $("darkIcon");
      if (icon) icon.innerHTML = "<circle cx='12' cy='12' r='5'/><path d='M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'/>";
      const lbl = $("darkLabel"); if (lbl) lbl.textContent = "Light";
    } else {
      root.removeAttribute("data-theme");
      const icon = $("darkIcon");
      if (icon) icon.innerHTML = "<path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/>";
      const lbl = $("darkLabel"); if (lbl) lbl.textContent = "Dark";
    }
  }
  applyDark(isDark);
  const btn = $("darkBtn");
  if (btn) btn.onclick = () => {
    isDark = isDark === "1" ? "0" : "1";
    localStorage.setItem(DARK_KEY, isDark);
    applyDark(isDark);
  };
})();

// ===== SYNC TIMESTAMP =====
let lastSyncTime = null;
function updateSyncTimestamp() {
  lastSyncTime = Date.now();
  updateSyncBadgeTime();
}
function updateSyncBadgeTime() {
  const badge = $("syncBadge");
  if (!badge || !lastSyncTime) return;
  const mins = Math.floor((Date.now() - lastSyncTime) / 60000);
  if (badge.classList.contains("syncing") || badge.classList.contains("pending")) return;
  if (mins < 1) badge.textContent = "Tersinkron barusan";
  else if (mins < 60) badge.textContent = "Sinkron " + mins + " mnt lalu";
  else badge.textContent = "Sinkron " + Math.floor(mins / 60) + " jam lalu";
}
setInterval(updateSyncBadgeTime, 60000);

// ===== PULL TO REFRESH =====
(function initPullToRefresh() {
  let startY = 0, pulling = false, indicator = null;
  function createIndicator() {
    if (indicator) return;
    indicator = document.createElement("div");
    indicator.id = "pullIndicator";
    indicator.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--brand);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>Tarik untuk segarkan</span>';
    indicator.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-70px);transition:transform 0.2s;z-index:999;background:var(--surface);border:1px solid var(--border);border-radius:0 0 20px 20px;padding:12px 22px;display:flex;align-items:center;gap:10px;font-size:0.85rem;font-weight:600;color:var(--muted);box-shadow:var(--shadow-lg);";
    document.body.appendChild(indicator);
  }
  document.addEventListener("touchstart", e => {
    if (window.scrollY > 10) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 20) {
      createIndicator();
      const pct = Math.min(dy / 80, 1);
      indicator.style.transform = "translateX(-50%) translateY(" + ((pct - 1) * 70 + 70) + "px)";
      indicator.querySelector("span").textContent = dy > 70 ? "Lepaskan untuk segarkan" : "Tarik untuk segarkan";
      indicator.querySelector("svg").style.transform = "rotate(" + (pct * 180) + "deg)";
    }
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (!pulling || !indicator) { pulling = false; return; }
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 70) {
      indicator.querySelector("span").textContent = "Menyegarkan...";
      muat(false);
    }
    indicator.style.transform = "translateX(-50%) translateY(-70px)";
    setTimeout(() => { if (indicator) { indicator.remove(); indicator = null; } }, 350);
    pulling = false;
  });
})();
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act,
    id = b.dataset.id,
    r = D.find((x) => x.id === id);
  if (a === "pg") {
    page = +b.dataset.p;
    renderRiwayat();
    scrollTo(0, 0);
  } else if (a === "reload") muat();
  else if (a === "urut")
    busy(b, async () => {
      const w = b.dataset.w;
      if (urut[w] === "jarak") {
        urut[w] = "tgl";
        renderDash();
        return;
      }
      try {
        await posisiSaya();
        urut[w] = "jarak";
        renderDash();
      } catch (err) {
        toast(err.message);
      }
    });
  else if (a === "edit" && r) openEdit(r);
  else if (a === "promote" && r) promote(r);
  else if (a === "fudone" && r) setFuDone(r, true);
  else if (a === "fuundo" && r) setFuDone(r, false);
  else if (a === "detail" && r) {
    detailId = id;
    showView("detail");
  } else if (a === "back") {
    kjEdit = null;
    showView("spk");
  } else if (a === "kjedit" && r) {
    kjEdit = { id, hari: (jadwalK(r) || { hari: [] }).hari.slice() };
    renderDetail();
  } else if (a === "kjcancel") {
    kjEdit = null;
    renderDetail();
  } else if (a === "kjdel" && r)
    busy(b, async () => {
      if (
        !confirm(
          "Hapus jadwal kroscek " +
            r.nama +
            "?\n\nLaporan kroscek yang sudah ada tidak ikut terhapus.",
        )
      )
        return;
      try {
        const res = await api({ action: "kSet", id, hari: "" });
        r.kHari = res.kHari;
        r.kNext = "";
        kjEdit = null;
        renderAll();
        toast("Jadwal dihapus");
      } catch (err) {
        toast("Gagal: " + err.message);
      }
    });
  else if (a === "spknew") openSpk(id, null, false);
  else if (a === "spkedit") {
    const s = S.find((x) => x.id === id);
    if (s) openSpk(s.sid, s, false);
  } else if (a === "spkdel") {
    if (ambilOf(id).length)
      return toast(
        "SPK ini sudah punya catatan pengambilan, tidak bisa dihapus. Silakan edit saja.",
      );
    if (!confirm("Hapus SPK ini? (Hanya untuk SPK kosong yang salah input.)"))
      return;
    const i = S.findIndex((x) => x.id === id),
      s = S[i];
    S.splice(i, 1);
    renderAll();
    try {
      await api({ action: "spkDelete", id });
      toast("SPK dihapus");
    } catch (err) {
      S.splice(i, 0, s);
      renderAll();
      toast("Gagal menghapus: " + err.message);
    }
  } else if (a === "ambilnew") openAmbil(id);
  else if (a === "ambildel") {
    const x = A.find((z) => z.id === id),
      sp = x && S.find((s) => s.id === x.spk);
    if (!x || !sp) return;
    const A0 = A;
    A = A.filter((z) => z.id !== id);
    const ok = hitung(sp).service >= 0;
    A = A0;
    if (!ok)
      return toast(
        "Tidak bisa dihapus: barang di service jadi minus. Hapus cek ulang terkait dulu.",
      );
    if (!confirm("Hapus catatan pengambilan ini?")) return;
    const i = A.indexOf(x);
    A.splice(i, 1);
    renderAll();
    try {
      await api({ action: "ambilDelete", id });
      toast("Catatan dihapus");
    } catch (err) {
      A.splice(i, 0, x);
      renderAll();
      toast("Gagal menghapus: " + err.message);
    }
  } else if (a === "del" && r) {
    const ns = sOf(id).length,
      na = A.filter((z) => z.sid === id).length,
      nk = K.filter((k) => k.sid === id).length;
    if (
      !confirm(
        `Hapus "${r.nama}"?\n\nYang ikut hilang permanen:\n- ${ns} SPK\n- ${na} catatan pengambilan\n- ${nk} laporan kroscek`,
      )
    )
      return;
    const i = D.indexOf(r),
      ks = K.filter((k) => k.sid === id),
      ss = S.filter((s) => s.sid === id),
      as = A.filter((z) => z.sid === id);
    D.splice(i, 1);
    K = K.filter((k) => k.sid !== id);
    S = S.filter((s) => s.sid !== id);
    A = A.filter((z) => z.sid !== id);
    renderAll();
    try {
      await api({ action: "delete", id });
      toast("Data dihapus");
    } catch (err) {
      D.splice(i, 0, r);
      K.push(...ks);
      S.push(...ss);
      A.push(...as);
      renderAll();
      toast("Gagal menghapus: " + err.message);
    }
  } else if (a === "delk") {
    if (!confirm("Hapus laporan kroscek ini?")) return;
    const k = K.find((x) => x.id === id),
      i = K.indexOf(k);
    K.splice(i, 1);
    renderAll();
    try {
      await api({ action: "kroscekDelete", id });
      toast("Laporan dihapus");
    } catch (err) {
      K.splice(i, 0, k);
      renderAll();
      toast("Gagal menghapus: " + err.message);
    }
  } else if (a === "shareloc" && r)
    busy(b, () =>
      bagikan(
        `${r.nama}${r.alamat ? "\n" + r.alamat : ""}\n${mapUrl(r)}`,
        r.foto,
      ),
    );
  else if (a === "sharek") {
    const k = K.find((x) => x.id === id),
      s = k && D.find((x) => x.id === k.sid);
    if (!k || !s) return;
    busy(b, () =>
      bagikan(
        `Laporan kroscek ${s.nama}\n${new Date(k.waktu).toLocaleString("id-ID")}${k.catatan ? "\n" + k.catatan : ""}${mapUrl(s) ? "\n" + mapUrl(s) : ""}`,
        k.foto,
      ),
    );
  } else if (a === "dlfoto")
    busy(b, () =>
      downloadFoto(id).catch((err) => toast("Gagal: " + err.message)),
    );
  else if (a === "kfoto")
    busy(b, async () => {
      const k = K.find((x) => x.id === id),
        all = k ? k.foto : [];
      if (!all.length) return toast("Belum ada foto.");
      try {
        for (const f of all) {
          await downloadFoto(f);
          await new Promise((ok) => setTimeout(ok, 350));
        }
      } catch (err) {
        toast("Gagal: " + err.message);
      }
    });
  else if (a === "xls" && r) exportSupplierXls(r);
  else if (a === "spkopen") {
    const s = S.find((x) => x.id === id);
    if (s) {
      detailId = s.sid;
      spkdId = id;
      showView("spkd");
    }
  } else if (a === "spkback") {
    showView("detail");
  } else if (a === "sxls") {
    const s = S.find((x) => x.id === id),
      rr = s && D.find((x) => x.id === s.sid);
    if (rr) exportSupplierXls(rr, s);
  } else if (a === "spdf")
    busy(b, () => {
      const s = S.find((x) => x.id === id),
        rr = s && D.find((x) => x.id === s.sid);
      return rr
        ? exportSupplierPdf(rr, s).catch((err) =>
            toast("Gagal membuat PDF: " + err.message),
          )
        : null;
    });
  else if (a === "pdf" && r)
    busy(b, () =>
      exportSupplierPdf(r).catch((err) =>
        toast("Gagal membuat PDF: " + err.message),
      ),
    );
});

// ---------- Ekspor ----------
const cl = v => String(v ?? "").replace(/[^\u0000-\u00FF]/g,"");
const lt = iso => new Date(iso).toLocaleString("id-ID");
function exportRows(){ return filtered().map(r => ({Waktu:lt(r.waktu),Nama:r.nama,Alamat:r.alamat,"No HP":r.hp,Status:r.status,"Est. Barang/Mgg":r.estimasi,"Follow-up":r.fu,"Sudah dikunjungi":r.fuDone||"",Lokasi:mapUrl(r),Catatan:r.catatan})); }
$("xlsBtn").onclick = () => {
  const rows = exportRows();
  if(!rows.length) return toast("Tidak ada data untuk diunduh");
  const tm = $("tglMulai") ? $("tglMulai").value : "";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Rekap");
  XLSX.writeFile(wb, `Rekap_Keliling${tm ? "_"+tm : ""}.xlsx`);
};
$("pdfBtn").onclick = () => {
  const rows = exportRows();
  if(!rows.length) return toast("Tidak ada data untuk diunduh");
  const tm = $("tglMulai") ? $("tglMulai").value : "", ts = $("tglSelesai") ? $("tglSelesai").value : "";
  const periStr = (tm || ts) ? ` · Periode: ${tm ? fmtDay(tm) : "Awal"} s/d ${ts ? fmtDay(ts) : "Sekarang"}` : "";
  const doc = new window.jspdf.jsPDF({orientation:"landscape",format:"a4"}), keys = Object.keys(rows[0]).filter(k => k!=="Lokasi");
  doc.setFontSize(13); doc.text("Rekap Keliling Lapangan",14,14);
  doc.setFontSize(9); doc.text(`Dicetak ${new Date().toLocaleString("id-ID")}${periStr} · ${rows.length} data`,14,19);
  doc.autoTable({startY:23,margin:{left:14,right:14},head:[keys],body:rows.map(r => keys.map(k => cl(r[k]))),styles:{fontSize:8,cellPadding:2,textColor:0},headStyles:{fillColor:[15,92,102],textColor:255}});
  doc.save(`Rekap_Keliling${tm ? "_"+tm : ""}.pdf`);
};

// only = satu SPK saja (unduhan per SPK); kosong = semua SPK supplier
const spkList = (r, only) => only ? [only] : sOf(r.id);
const fnSuffix = (r, only) => only ? "_SPK" + spkNo(r, only) : "";
const spkRowsOut = (r, list) => list.map(s => { const h = hitung(s);
  return {"SPK ke":spkNo(r,s), Mulai:s.mulai, Selesai:s.selesai, Target:h.target||"", Terangkut:h.terangkut, "Di service":h.service, Ditolak:h.ditolak, "Sisa target":h.target ? h.sisa : "", Status:statusSpk(h)}; });
// Kroscek dikelompokkan per SPK; laporan lama masuk "Tanpa SPK"
function kGroups(r, only){
  const g = [], byTime = (a,b) => a.waktu.localeCompare(b.waktu);
  spkList(r, only).forEach(s => { const items = kOfSpk(s.id).slice().sort(byTime), n = spkNo(r,s);
    if(items.length || only) g.push({no:n, label:`SPK ke-${n} (${fmtDay(s.mulai)} - ${fmtDay(s.selesai)})`, items}); });
  if(!only){ const l = kLepas(r.id).slice().sort(byTime); if(l.length) g.push({no:"Tanpa SPK", label:"Tanpa SPK", items:l}); }
  return g;
}
function exportSupplierXls(r, only){
  const wb = XLSX.utils.book_new(), sp = spkList(r, only);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Nama",r.nama],["No HP",r.hp],["Alamat",r.alamat],["Lokasi",mapUrl(r)],["Supplier sejak",sOf(r.id)[0]?sOf(r.id)[0].mulai:""],["Estimasi/minggu",r.estimasi],["Catatan awal",r.catatan]]), "Supplier");
  if(sp.length){
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spkRowsOut(r, sp)), "SPK");
    const peng = []; sp.forEach(s => ambilOf(s.id).slice().sort((a,b) => a.tgl.localeCompare(b.tgl)).forEach(a =>
      peng.push({"SPK ke":spkNo(r,s), Tanggal:a.tgl, Jenis:a.jenis, Siap:a.jenis==="Cek awal"?a.siap:"", Diambil:a.diambil, Ditolak:a.ditolak, Catatan:a.catatan})));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peng.length ? peng : [{"SPK ke":"","Tanggal":"Belum ada pengambilan"}]), "Pengambilan");
  }
  const kr = []; kGroups(r, only).forEach(g => g.items.forEach(k =>
    kr.push({"SPK ke":g.no, Waktu:lt(k.waktu), Catatan:k.catatan, "Jumlah Foto":k.foto.length, "Link Foto":k.foto.map(f => `https://drive.google.com/file/d/${f}/view`).join("\n")})));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kr.length ? kr : [{"SPK ke":"","Waktu":"Belum ada laporan kroscek"}]), "Kroscek");
  XLSX.writeFile(wb, `Kroscek_${cl(r.nama).replace(/\W+/g,"_")}${fnSuffix(r, only)}.xlsx`);
}
async function exportSupplierPdf(r, only){
  const doc = new window.jspdf.jsPDF(), W = 210, M = 14; let y = 16;
  const tbl = (head, body) => { doc.autoTable({startY:y,margin:{left:M,right:M},head:[head],body,styles:{fontSize:8,cellPadding:2,textColor:0},headStyles:{fillColor:[15,92,102],textColor:255}}); y = doc.lastAutoTable.finalY + 6; };
  const judul = t => { if(y>255){ doc.addPage(); y = 16; } doc.setFontSize(10); doc.setFont(undefined,"bold"); doc.text(cl(t),M,y); doc.setFont(undefined,"normal"); y += 3; };
  doc.setFontSize(14); doc.text(only ? `Laporan Kroscek SPK ke-${spkNo(r,only)}` : "Laporan Kroscek Supplier",M,y); y += 8; doc.setFontSize(10);
  [["Nama",r.nama],["No HP",r.hp],["Alamat",r.alamat],["Supplier sejak",sOf(r.id)[0]?fmtDay(sOf(r.id)[0].mulai):"-"]].forEach(([k,v]) => {
    const t = doc.splitTextToSize(`${k}: ${cl(v)}`, W-2*M); doc.text(t,M,y); y += t.length*5; });
  if(mapUrl(r)){
    doc.text("Lokasi: ",M,y);
    const lx = M + doc.getTextWidth("Lokasi: ");
    doc.setTextColor(10,100,200);
    doc.textWithLink("Buka di Google Maps", lx, y, {url: mapUrl(r)});
    doc.setTextColor(0,0,0); y += 5;
  }
  const sp = spkList(r, only);
  if(sp.length){
    y += 4; judul(only ? "Ringkasan SPK" : "Ringkasan SPK");
    tbl(["SPK","Periode","Target","Terangkut","Service","Ditolak","Sisa","Status"], sp.map(s => { const h = hitung(s);
      return [`ke-${spkNo(r,s)}`, cl(`${fmtDay(s.mulai)} - ${fmtDay(s.selesai)}`), h.target||"-", h.terangkut, h.service, h.ditolak, h.target ? h.sisa : "-", statusSpk(h)]; }));
    const rows = []; sp.forEach(s => ambilOf(s.id).slice().sort((a,b) => a.tgl.localeCompare(b.tgl)).forEach(a =>
      rows.push([`ke-${spkNo(r,s)}`, cl(fmtDay(a.tgl)), a.jenis, a.jenis==="Cek awal"?a.siap:"-", a.diambil, a.jenis==="Cek ulang"?a.ditolak:"-", cl(a.catatan)])));
    if(rows.length){ judul("Pengambilan barang"); tbl(["SPK","Tanggal","Jenis","Siap","Diambil","Ditolak","Catatan"], rows); }
  }
  for(const g of kGroups(r, only)){
    y += 2; judul(g.no==="Tanpa SPK" ? "Kroscek tanpa SPK" : "Kroscek " + g.label);
    if(!g.items.length){ y += 4; doc.text("Belum ada laporan kroscek.",M,y); y += 6; }
    for(const k of g.items){
      y += 2; if(y>265){ doc.addPage(); y = 16; }
      doc.setFont(undefined,"bold"); doc.text(lt(k.waktu),M,y); doc.setFont(undefined,"normal"); y += 5;
      const t = doc.splitTextToSize(cl(k.catatan)||"-", W-2*M); doc.text(t,M,y); y += t.length*5+2;
      let col = 0, rh = 0;
      for(const id of k.foto){
        const {data} = await api({action:"foto",id}), p = doc.getImageProperties(data), s = Math.min(85/p.width, 85/p.height), w = p.width*s, h = p.height*s;
        if(col===0 && y+85>285){ doc.addPage(); y = 16; }
        doc.addImage(data,"JPEG",M+col*92,y,w,h); rh = Math.max(rh,h);
        if(col===1){ y += rh+4; rh = 0; col = 0; } else col = 1;
      }
      if(col===1) y += rh+4;
    }
  }
  doc.save(`Kroscek_${cl(r.nama).replace(/\W+/g,"_")}${fnSuffix(r, only)}.pdf`);
}

// ---------- Modal SPK ----------
let spkCtx = null;
function openSpk(sid, rec, promote){
  spkCtx = {sid, id: rec?.id, promote};
  $("spkTitle").textContent = rec ? "Edit SPK" : "SPK baru";
  $("sp_m").value = rec?.mulai || todayStr(); $("sp_s").value = rec?.selesai || "";
  $("sp_t").value = rec?.target || ""; $("sp_j").value = rec?.jumlah || ""; $("sp_c").value = rec?.catatan || "";
  $("sp_err").textContent = ""; $("spkModal").showModal();
}
$("spCancel").onclick = () => $("spkModal").close();
$("spSave").onclick = () => busy($("spSave"), async () => {
  const m = $("sp_m").value, s = $("sp_s").value, t = $("sp_t").value.trim();
  if(!m || !s) return $("sp_err").textContent = "Tanggal mulai dan selesai wajib diisi.";
  if(s < m) return $("sp_err").textContent = "Tanggal selesai tidak boleh sebelum mulai.";
  if(!spkCtx.id && !t) return $("sp_err").textContent = "Target jumlah wajib diisi.";
  if(t && !(Number.isInteger(Number(t)) && Number(t) > 0)) return $("sp_err").textContent = "Target harus angka bulat lebih dari 0.";
  try{
    const c = spkCtx, r = D.find(x => x.id===c.sid);
    if(c.promote){ const old = {...r}; r.status = "SPK";
      try{ await api({action:"update",...payload(r)}); }catch(e){ Object.assign(r, old); throw e; } }
    const res = await api({action:"spkSave",id:c.id,sid:c.sid,mulai:m,selesai:s,target:t,jumlah:$("sp_j").value,catatan:$("sp_c").value});
    const i = S.findIndex(x => x.id===res.rec.id); if(i>=0) S[i] = res.rec; else S.push(res.rec);
    $("spkModal").close(); renderAll(); toast("SPK tersimpan");
  }catch(e){ $("sp_err").textContent = e.message; }
});

// ---------- Modal pengambilan ----------
let ambCtx = null;
function abSync(){
  const u = $("ab_j").value==="Cek ulang", h = hitung(ambCtx.sp);
  $("ab_wS").classList.toggle("hidden", u); $("ab_wX").classList.toggle("hidden", !u);
  $("ab_info").textContent = u ? `Sisa di service: ${h.service} pcs` : (h.target ? `Sisa target: ${h.sisa} pcs` : "");
}
function openAmbil(spId){
  const sp = S.find(x => x.id===spId); if(!sp) return;
  ambCtx = {sp}; $("ab_t").value = todayStr(); $("ab_j").value = "Cek awal";
  ["ab_s","ab_d","ab_x","ab_c"].forEach(i => $(i).value = ""); $("ab_err").textContent = ""; abSync(); $("ambilModal").showModal();
}
$("ab_j").onchange = abSync;
$("abCancel").onclick = () => $("ambilModal").close();
$("abSave").onclick = () => busy($("abSave"), async () => {
  const sp = ambCtx.sp, u = $("ab_j").value==="Cek ulang", tgl = $("ab_t").value, err = m => $("ab_err").textContent = m;
  const n = v => { const x = Number(v||0); return Number.isInteger(x) && x>=0 ? x : NaN; };
  const siap = u ? 0 : n($("ab_s").value), diambil = n($("ab_d").value), ditolak = u ? n($("ab_x").value) : 0;
  if(!tgl) return err("Tanggal wajib diisi.");
  if([siap,diambil,ditolak].some(isNaN)) return err("Jumlah harus angka bulat 0 atau lebih.");
  const h0 = hitung(sp);
  if(u){
    if(diambil+ditolak===0) return err("Isi jumlah diambil atau ditolak.");
    if(diambil+ditolak > h0.service) return err(`Cek ulang melebihi sisa service (${h0.service} pcs).`);
  } else {
    if(siap===0) return err("Jumlah siap harus lebih dari 0.");
    if(diambil > siap) return err("Diambil tidak boleh melebihi Siap.");
  }
  try{
    const res = await api({action:"ambilSave", sid:sp.sid, spk:sp.id, tgl, jenis:$("ab_j").value, siap, diambil, ditolak, catatan:$("ab_c").value});
    A.push(res.rec); $("ambilModal").close(); renderAll();
    toast(!h0.selesai && hitung(sp).selesai ? "SPK selesai! Tombol SPK baru sudah muncul." : "Pengambilan tersimpan");
  }catch(e){ err(e.message); }
});

document.addEventListener("click", e => {
  if(e.target.closest("[data-act]")) return;
  const g = e.target.closest("[data-go]"); if(!g) return;
  const d = g.dataset;
  if(d.go==="detail"){ detailId = d.id; showView("detail"); return; }
  if(d.st==="SPK"){ showView("spk"); return; }
  $("stF").value = d.st || ""; $("q").value = d.q || ""; page = 1;
  renderRiwayat(); showView("riwayat");
});

resetInput();
if(password){
  const v = sessionStorage.getItem("view");
  showApp();
  if(v && document.getElementById("v-"+v)){
    if(v==="detail"||v==="spkd") detailId = sessionStorage.getItem("did") || null;
    if(v==="spkd") spkdId = sessionStorage.getItem("sdid") || null;
    showView(v);
  }
}