// ====== PENGATURAN ======
const PASSWORD = PropertiesService.getScriptProperties().getProperty("PASSWORD");
const SHEET_NAME = "Data";
const KROSCEK_SHEET = "Kroscek";
const FOLDER_NAME = "Foto Keliling";   // Folder Drive dibuat otomatis
const STATUS = ["Menolak", "Ragu-ragu", "Tertarik", "Siap Ambil", "SPK"];
const HEADERS = ["ID", "Waktu", "Nama", "Alamat", "No HP", "Status", "Estimasi", "Catatan",
                 "LinkMaps", "Lat", "Lng", "Foto", "TglSPK", "FollowUp",
                 "FuSelesai", "KroscekHari", "KroscekNext"];
const K_HEADERS = ["ID", "IDSupplier", "Waktu", "Catatan", "Foto", "IDSPK"];
const FOTO_PUBLIK = true;   // false = file foto baru tidak dibuka lewat link publik
const SPK_SHEET = "SPK";
const S_HEADERS = ["ID", "IDSupplier", "Mulai", "Selesai", "Jumlah", "Catatan", "Target"];
const PENG_SHEET = "Pengambilan";
const P_HEADERS = ["ID", "IDSupplier", "IDSPK", "Tanggal", "Jenis", "Siap", "Diambil", "Ditolak", "Catatan"];
const TEXT_COLS_DATA = [1, 5, 12, 14, 15, 16, 17];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function getSheet(name, headers, textCols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const cur = sh.getLastRow() ? sh.getRange(1, 1, 1, headers.length).getValues()[0].join("|") : "";
  if (cur !== headers.join("|")) {          // sheet baru atau perlu kolom tambahan (data lama tetap aman)
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    textCols.forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat("@"));
  }
  return sh;
}
const dataSheet = () => getSheet(SHEET_NAME, HEADERS, TEXT_COLS_DATA);
const kSheet = () => getSheet(KROSCEK_SHEET, K_HEADERS, [1, 2, 5, 6]);
const sSheet = () => getSheet(SPK_SHEET, S_HEADERS, [1, 2, 3, 4]);
const pSheet = () => getSheet(PENG_SHEET, P_HEADERS, [1, 2, 3, 4]);
const dstr = v => v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(v || "");

function spkRows(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, S_HEADERS.length).getValues().map(r =>
    ({ id: String(r[0]), sid: String(r[1]), mulai: dstr(r[2]), selesai: dstr(r[3]), jumlah: String(r[4] || ""),
       catatan: String(r[5] || ""), target: Number(r[6]) || 0 }));
}
function ambilRows(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, P_HEADERS.length).getValues().map(r =>
    ({ id: String(r[0]), sid: String(r[1]), spk: String(r[2]), tgl: dstr(r[3]), jenis: String(r[4]),
       siap: Number(r[5]) || 0, diambil: Number(r[6]) || 0, ditolak: Number(r[7]) || 0, catatan: String(r[8] || "") }));
}
// Di service = (Siap - Diambil) semua Cek awal - (Diambil + Ditolak) semua Cek ulang
const serviceOf = (rows, spk) => rows.filter(a => a.spk === spk)
  .reduce((n, a) => n + (a.jenis === "Cek awal" ? a.siap - a.diambil : -(a.diambil + a.ditolak)), 0);

// Teks yang diawali = + - @ tidak boleh jadi rumus
function clean(v, max) {
  const s = String(v == null ? "" : v).trim().slice(0, max || 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
const iso = v => v instanceof Date ? v.toISOString() : String(v || "");
const normStatus = s => {
  s = String(s || "");
  return s.indexOf("Tertarik") === 0 ? "Tertarik" : s.indexOf("Ragu") === 0 ? "Ragu-ragu"
       : s.indexOf("Menolak") === 0 ? "Menolak" : (STATUS.indexOf(s) >= 0 ? s : "Tertarik");
};
const ids = v => String(v || "").split(",").filter(Boolean);

function toRec(r) {
  return {
    id: String(r[0]), waktu: iso(r[1]), nama: r[2], alamat: r[3], hp: String(r[4]).replace(/^'/, ""),
    status: normStatus(r[5]), estimasi: r[6], catatan: r[7], maps: r[8],
    lat: r[9] === "" ? null : Number(r[9]), lng: r[10] === "" ? null : Number(r[10]),
    foto: ids(r[11]), tglSpk: iso(r[12]),
    fu: dstr(r[13]), fuDone: dstr(r[14]), kHari: String(r[15] || ""), kNext: dstr(r[16])
  };
}

// ====== LINK MAPS -> KOORDINAT ======
function parseCoords(s) {
  try { s = decodeURIComponent(s); } catch (e) {}
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
            s.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}
function resolveCoords(link) {
  let url = String(link || "");
  for (let i = 0; i < 6; i++) {
    const c = parseCoords(url);
    if (c) return c;
    if (!/^https?:\/\//.test(url)) return null;
    const r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    const h = r.getHeaders(), loc = h["Location"] || h["location"];
    if (!loc) return parseCoords(r.getContentText().slice(0, 200000));
    url = loc;
  }
  return null;
}

// old = baris lama (saat update) supaya FuSelesai, KroscekHari, KroscekNext tidak hilang
function buildRow(d, id, waktu, oldSpk, old) {
  const status = normStatus(d.status);
  const mapsRaw = String(d.maps || "").trim();
  let maps = /^https?:\/\//i.test(mapsRaw) ? clean(mapsRaw, 500) : "";
  let lat = d.lat === null || d.lat === "" || d.lat === undefined ? "" : Number(d.lat);
  let lng = d.lng === null || d.lng === "" || d.lng === undefined ? "" : Number(d.lng);
  if (maps && (lat === "" || lng === "")) {
    try { const c = resolveCoords(maps); if (c) { lat = c.lat; lng = c.lng; } } catch (e) {}
  }
  if (!maps && lat !== "" && lng !== "") {
    maps = "https://www.google.com/maps?q=" + lat + "," + lng;
  }
  const fu = clean(d.fu, 10);
  const fuDone = old && dstr(old[13]) === fu ? dstr(old[14]) : "";   // ganti tanggal follow-up = belum dikunjungi lagi
  return [id, waktu, clean(d.nama, 100), clean(d.alamat, 200), clean(d.hp, 20).replace(/^'/, ""), status,
          clean(d.estimasi, 60) || "-", clean(d.catatan, 800), maps, lat, lng,
          (d.foto || []).filter(x => /^[\w-]+$/.test(x)).join(","),
          status === "SPK" ? (oldSpk || new Date()) : "", fu,
          fuDone, old ? String(old[15] || "") : "", old ? dstr(old[16]) : ""];
}

// Foto dibuang ke Sampah Drive (masih bisa dipulihkan 30 hari)
function trashFotos(csv) {
  ids(csv).forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
}

function folder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

// Tulis satu baris; kolom teks dipaksa berformat Teks dulu supaya 0 di depan No HP tidak hilang
function writeRow(sh, r, row) {
  TEXT_COLS_DATA.forEach(c => sh.getRange(r, c).setNumberFormat("@"));
  sh.getRange(r, 1, 1, row.length).setValues([row]);
}
function setText(sh, r, c, v) { const cell = sh.getRange(r, c); cell.setNumberFormat("@"); cell.setValue(v); }

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const cache = CacheService.getScriptCache();
    if (Number(cache.get("gagal") || 0) >= 10)
      return out({ status: "error", message: "Terlalu banyak percobaan. Coba lagi 15 menit." });
    if (d.password !== PASSWORD) {
      cache.put("gagal", String(Number(cache.get("gagal") || 0) + 1), 900);
      return out({ status: "error", message: "Password salah!" });
    }
    if (d.action === "login") return out({ status: "success" });

    // Aksi yang tidak menyentuh Sheet
    if (d.action === "upload") {
      const bytes = Utilities.base64Decode(String(d.data).split(",")[1]);
      const f = folder().createFile(Utilities.newBlob(bytes, "image/jpeg", "foto_" + Date.now() + ".jpg"));
      if (FOTO_PUBLIK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out({ status: "success", id: f.getId() });
    }
    if (d.action === "foto") {
      if (!/^[\w-]+$/.test(d.id)) return out({ status: "error", message: "ID foto tidak valid." });
      const b = DriveApp.getFileById(d.id).getBlob();
      return out({ status: "success", data: "data:" + b.getContentType() + ";base64," + Utilities.base64Encode(b.getBytes()) });
    }

    // Koordinat -> alamat lengkap (tidak menyentuh Sheet)
    if (d.action === "geo") {
      const lat = Number(d.lat), lng = Number(d.lng);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return out({ status: "error", message: "Koordinat tidak valid." });
      const res = Maps.newGeocoder().setLanguage("id").reverseGeocode(lat, lng);
      const alamat = res && res.results && res.results.length ? String(res.results[0].formatted_address || "") : "";
      return out({ status: "success", alamat: alamat });
    }

    // Ambil data (Read-only, tidak perlu LockService agar instan & tidak timeout)
    if (d.action === "list") {
      const sh = dataSheet(), ks = kSheet(), ss2 = sSheet(), ps = pSheet();
      const last = sh.getLastRow();
      const rows = last > 1 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
      const kl = ks.getLastRow();
      const krows = kl > 1 ? ks.getRange(2, 1, kl - 1, K_HEADERS.length).getValues() : [];
      return out({
        status: "success",
        data: rows.map(toRec).reverse(),
        spk: spkRows(ss2),
        ambil: ambilRows(ps),
        kroscek: krows.map(r => ({ id: String(r[0]), sid: String(r[1]), waktu: iso(r[2]), catatan: r[3], foto: ids(r[4]), spk: String(r[5] || "") })).reverse()
      });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = dataSheet(), ks = kSheet(), ss2 = sSheet(), ps = pSheet();
      const last = sh.getLastRow();
      const findRow = (sheet, id) => {
        const n = sheet.getLastRow(); if (n < 2) return -1;
        const col = sheet.getRange(2, 1, n - 1, 1).getValues();
        for (let i = 0; i < col.length; i++) if (String(col[i][0]) === String(id)) return i + 2;
        return -1;
      };

      if (d.action === "save") {
        if (!clean(d.nama)) return out({ status: "error", message: "Nama wajib diisi." });
        const row = buildRow(d, Utilities.getUuid().slice(0, 8), new Date(), null, null);
        writeRow(sh, last + 1, row);
        return out({ status: "success", rec: toRec(row) });
      }

      if (d.action === "update") {
        if (!clean(d.nama)) return out({ status: "error", message: "Nama wajib diisi." });
        const r = findRow(sh, d.id);
        if (r < 0) return out({ status: "error", message: "Data tidak ditemukan." });
        const old = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
        const row = buildRow(d, old[0], old[1], old[12] || null, old);
        writeRow(sh, r, row);
        ids(old[11]).filter(x => ids(row[11]).indexOf(x) < 0).forEach(x => trashFotos(x));
        return out({ status: "success", rec: toRec(row) });
      }

      // Tandai klien "Sudah dikunjungi" (done=true) atau batalkan (done=false)
      if (d.action === "fuDone") {
        const r = findRow(sh, d.id);
        if (r < 0) return out({ status: "error", message: "Data tidak ditemukan." });
        const v = d.done ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
        setText(sh, r, 15, v);
        return out({ status: "success", fuDone: v });
      }

      // Jadwal kroscek: hari tetap mingguan, bebas pilih berapa hari, contoh "1,6"
      if (d.action === "kSet") {
        const r = findRow(sh, d.id);
        if (r < 0) return out({ status: "error", message: "Supplier tidak ditemukan." });
        const a = String(d.hari || "").split(",").map(x => x.trim()).filter(Boolean);
        if (a.some(x => !/^[0-6]$/.test(x)) || new Set(a).size !== a.length)
          return out({ status: "error", message: "Hari kroscek tidak valid." });
        const hari = a.sort().join(",");
        setText(sh, r, 16, hari); setText(sh, r, 17, "");
        return out({ status: "success", kHari: hari });
      }

      if (d.action === "delete") {
        const r = findRow(sh, d.id);
        if (r < 0) return out({ status: "error", message: "Data sudah tidak ada." });
        const fotos = [String(sh.getRange(r, 12).getValue())];
        sh.deleteRow(r);
        const hapusBySid = (sheet, fotoCol) => { for (let n = sheet.getLastRow(); n >= 2; n--) {
          if (String(sheet.getRange(n, 2).getValue()) === String(d.id)) {
            if (fotoCol) fotos.push(String(sheet.getRange(n, fotoCol).getValue()));
            sheet.deleteRow(n); } } };
        hapusBySid(ps); hapusBySid(ss2); hapusBySid(ks, 5);
        fotos.forEach(trashFotos);
        return out({ status: "success" });
      }

      if (d.action === "kroscekSave") {
        if (findRow(sh, d.sid) < 0) return out({ status: "error", message: "Supplier tidak ditemukan." });
        const spkId = String(d.spk || "");
        if (spkId) {
          const rs = findRow(ss2, spkId);
          if (rs < 0 || String(ss2.getRange(rs, 2).getValue()) !== String(d.sid)) return out({ status: "error", message: "SPK tidak valid." });
        }
        const row = [Utilities.getUuid().slice(0, 8), String(d.sid), new Date(), clean(d.catatan, 1500),
                     (d.foto || []).filter(x => /^[\w-]+$/.test(x)).join(","), spkId];
        ks.appendRow(row);
        return out({ status: "success", rec: { id: row[0], sid: row[1], waktu: iso(row[2]), catatan: row[3], foto: ids(row[4]), spk: spkId } });
      }

      if (d.action === "kroscekDelete") {
        const r = findRow(ks, d.id);
        if (r < 0) return out({ status: "error", message: "Laporan sudah tidak ada." });
        const f = String(ks.getRange(r, 5).getValue());
        ks.deleteRow(r);
        trashFotos(f);
        return out({ status: "success" });
      }

      if (d.action === "spkSave") {
        if (findRow(sh, d.sid) < 0) return out({ status: "error", message: "Supplier tidak ditemukan." });
        const mulai = clean(d.mulai, 10), selesai = clean(d.selesai, 10);
        if (!DATE_RE.test(mulai) || !DATE_RE.test(selesai)) return out({ status: "error", message: "Tanggal tidak valid." });
        if (selesai < mulai) return out({ status: "error", message: "Tanggal selesai sebelum tanggal mulai." });
        const tg = clean(d.target, 10), r = d.id ? findRow(ss2, d.id) : -1;
        if (tg === "" && r < 0) return out({ status: "error", message: "Target SPK wajib diisi." });
        if (tg !== "" && !(Number.isInteger(Number(tg)) && Number(tg) > 0)) return out({ status: "error", message: "Target harus angka bulat lebih dari 0." });
        const row = [r > 0 ? String(d.id) : Utilities.getUuid().slice(0, 8), String(d.sid), mulai, selesai,
                     clean(d.jumlah, 40), clean(d.catatan, 300), tg === "" ? "" : Number(tg)];
        if (r > 0) ss2.getRange(r, 1, 1, S_HEADERS.length).setValues([row]); else ss2.appendRow(row);
        return out({ status: "success", rec: { id: row[0], sid: row[1], mulai: mulai, selesai: selesai, jumlah: row[4], catatan: row[5], target: Number(row[6]) || 0 } });
      }

      if (d.action === "spkDelete") {
        const r = findRow(ss2, d.id);
        if (r < 0) return out({ status: "error", message: "SPK sudah tidak ada." });
        if (ambilRows(ps).some(a => a.spk === String(d.id)))
          return out({ status: "error", message: "SPK ini sudah punya catatan pengambilan, tidak bisa dihapus. Silakan edit saja." });
        const kn = ks.getLastRow();
        if (kn > 1 && ks.getRange(2, 6, kn - 1, 1).getValues().some(x => String(x[0]) === String(d.id)))
          return out({ status: "error", message: "SPK ini sudah punya laporan kroscek, tidak bisa dihapus. Silakan edit saja." });
        ss2.deleteRow(r);
        return out({ status: "success" });
      }

      // Satu baris per kejadian pengambilan
      if (d.action === "ambilSave") {
        const rs = findRow(ss2, d.spk);
        if (rs < 0) return out({ status: "error", message: "SPK tidak ditemukan." });
        if (String(ss2.getRange(rs, 2).getValue()) !== String(d.sid)) return out({ status: "error", message: "SPK bukan milik supplier ini." });
        const tgl = clean(d.tgl, 10), jenis = String(d.jenis);
        if (!DATE_RE.test(tgl)) return out({ status: "error", message: "Tanggal tidak valid." });
        if (jenis !== "Cek awal" && jenis !== "Cek ulang") return out({ status: "error", message: "Jenis tidak valid." });
        const num = v => { const x = Number(v || 0); return Number.isInteger(x) && x >= 0 ? x : -1; };
        let siap = num(d.siap), diambil = num(d.diambil), ditolak = num(d.ditolak);
        if (siap < 0 || diambil < 0 || ditolak < 0) return out({ status: "error", message: "Jumlah harus angka bulat 0 atau lebih." });
        if (jenis === "Cek awal") {
          ditolak = 0;
          if (siap === 0) return out({ status: "error", message: "Jumlah siap harus lebih dari 0." });
          if (diambil > siap) return out({ status: "error", message: "Diambil tidak boleh melebihi Siap." });
        } else {
          siap = 0;
          if (diambil + ditolak === 0) return out({ status: "error", message: "Isi jumlah diambil atau ditolak." });
          const sisa = serviceOf(ambilRows(ps), String(d.spk));
          if (diambil + ditolak > sisa) return out({ status: "error", message: "Cek ulang melebihi sisa service (" + sisa + " pcs)." });
        }
        const row = [Utilities.getUuid().slice(0, 8), String(d.sid), String(d.spk), tgl, jenis,
                     jenis === "Cek awal" ? siap : "", diambil, ditolak, clean(d.catatan, 300)];
        ps.appendRow(row);
        return out({ status: "success", rec: { id: row[0], sid: row[1], spk: row[2], tgl: tgl, jenis: jenis,
                     siap: siap, diambil: diambil, ditolak: ditolak, catatan: row[8] } });
      }

      if (d.action === "ambilDelete") {
        const r = findRow(ps, d.id);
        if (r < 0) return out({ status: "error", message: "Catatan sudah tidak ada." });
        const rows = ambilRows(ps), target = rows.find(a => a.id === String(d.id));
        if (serviceOf(rows.filter(a => a.id !== target.id), target.spk) < 0)
          return out({ status: "error", message: "Tidak bisa dihapus: barang di service jadi minus. Hapus cek ulang terkait dulu." });
        ps.deleteRow(r);
        return out({ status: "success" });
      }

      return out({ status: "error", message: "Aksi tidak dikenal." });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ status: "error", message: err.toString() });
  }
}

function doGet() { return out({ status: "ok", message: "API aktif." }); }

// Jalankan fungsi ini sekali dari editor untuk memunculkan izin Drive & koneksi luar
function authorize() { folder(); UrlFetchApp.fetch("https://www.google.com"); Maps.newGeocoder().reverseGeocode(-6.5, 110.7); }