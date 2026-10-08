# 💰 Personal Finance Tracker — Solo Project Plan

> **Tujuan:** Aplikasi keuangan pribadi yang cepat selesai, nyaman dipakai sendiri, dan mudah dirawat oleh satu developer.
> **Scope awal:** penggunaan lokal, satu pemilik, pencatatan manual, Bahasa Indonesia, mata uang IDR.
> **Status:** dokumen rencana; task belum berarti sudah diimplementasikan atau diuji.

**Prinsip utama: buat yang berguna dulu, bukan versi mini aplikasi enterprise.**
Kerangka Phase 0–7 tetap dipakai, tetapi tidak semua fase wajib dikerjakan.

## 🧭 Cara Menggunakan Dokumen Ini

1. Ikuti jalur MVP lokal: **0 → 1 → keputusan mode di 2.1 → 3 → 4 → 7.1–7.2**.
2. Tambahkan budget di Phase 5 hanya bila memang akan dipakai.
3. Kerjakan autentikasi di 2.2 **sebelum** membuka akses melalui internet, LAN, atau tunnel.
4. Tunda Phase 6, deployment, dan CI sampai versi lokal berguna.
5. Kerjakan satu task, gunakan skill yang relevan, uji hasilnya, lalu tandai selesai.

**Daftar isi:**
- [Visi & Scope Produk](#scope-produk)
- [Tech Stack](#tech-stack)
- [Panduan Skill untuk Agent](#skill-agent)
- [Struktur Project](#struktur-project)
- [Aturan Domain & API](#aturan-domain)
- [Roadmap & Phase Plan](#roadmap)
- [Summary Timeline](#timeline)
- [Testing Strategy](#testing)
- [Definition of Done](#definition-of-done)
- [Key Decisions & Rationale](#key-decisions)
- [Skills Developer](#skill-developer)
- [Risiko & Pengembangan Lanjutan](#risiko)

---

<a id="scope-produk"></a>

## 🎯 Visi & Scope Produk

### Wajib untuk MVP Lokal
- Tambah, edit, dan hapus pemasukan/pengeluaran.
- Kategori sederhana dengan beberapa kategori bawaan.
- Daftar transaksi dengan filter bulan, kategori, dan tipe.
- Ringkasan pemasukan, pengeluaran, arus kas bersih, dan breakdown kategori.
- Export CSV, penyimpanan permanen, dan backup yang bisa dipulihkan.
- Form jelas, nominal akurat, serta tampilan desktop/mobile yang nyaman.

Alur utama: **buka aplikasi → catat transaksi → cek ringkasan → export/backup bila perlu**.
Tidak ada kewajiban register akun untuk penggunaan lokal pribadi.

### Opsional Setelah MVP Berguna
- Budget bulanan, dark mode, pencarian tambahan, dan trend chart.
- Login satu pemilik bila aplikasi diakses dari luar komputer sendiri.
- Insight rule-based, eksperimen forecasting, deployment, dan CI sederhana.

### Tidak Dikerjakan Sekarang
Multi-user, register publik, role/permission, sinkronisasi bank, multi-wallet, transfer, multi-currency,
OCR, email/push notification, LLM chat, Redis, job queue, microservices, dan pipeline MLOps.
Tidak perlu staging terpisah, branch `develop`, dokumen compliance, atau target SLA.

### Batas Penggunaan Lokal
Mode lokal tanpa login **hanya** untuk komputer pribadi tepercaya: frontend dan backend bind ke
`127.0.0.1`, tanpa port forwarding, public tunnel, atau akses LAN. Ini bukan mode aman untuk server publik.
Komputer bersama membutuhkan proteksi tambahan atau login; file database juga harus dilindungi oleh akses OS.

### Status Repository & Pilihan Backend
FastAPI dipilih sebagai backend untuk rencana ini. Scaffolding backend lokal mengikuti pilihan tersebut;
frontend dan ML tetap ditambahkan hanya saat task terkait dikerjakan. Sebelum mengganti atau menghapus file
implementasi yang sudah ada, periksa isinya dan jangan menimpa pekerjaan pengguna.

---

<a id="tech-stack"></a>

## 🏗️ Tech Stack

### Backend — FastAPI

| Komponen | Pilihan awal | Alasan |
|---|---|---|
| Framework | FastAPI | API sederhana dan OpenAPI bawaan |
| ORM & validasi | SQLModel + Pydantic | Model bertipe; schema request/response terpisah |
| Database | **SQLite** | Satu file, tidak perlu server database atau Docker |
| DB access | Session synchronous per request | Cukup untuk satu pengguna; async DB belum diperlukan |
| Migration | Alembic | Perubahan schema tidak mengorbankan data yang sudah dicatat |
| Config | pydantic-settings + `.env` | Konfigurasi lokal yang jelas |
| Auth | Tidak ada pada mode lokal; session login pada mode remote | Hindari JWT/refresh-token flow yang belum dibutuhkan |

PostgreSQL baru dipilih jika deployment tidak mendukung SQLite persisten, butuh akses concurrent lebih besar,
atau memang ingin belajar PostgreSQL. Jika dipilih, jalankan integration test pada PostgreSQL juga.

### Frontend — React + TypeScript

| Komponen | Pilihan awal | Batas pemakaian |
|---|---|---|
| Framework | React + Vite + TypeScript | Versi stabil yang kompatibel |
| Styling | Tailwind CSS v4 | Semantic tokens ringan; konfigurasi CSS-first |
| Components | shadcn/ui | Ambil komponen yang dibutuhkan saja |
| API state | TanStack Query + Fetch | Tidak perlu Redux atau Axios tanpa kebutuhan khusus |
| Forms | React Hook Form + Zod | Validasi input dan error field |
| Routing | React Router | Route config sederhana untuk dashboard/transaksi/budget |
| Chart | Recharts | Satu chart sederhana dulu, bukan semua jenis visualisasi |
| Table | HTML table biasa | TanStack Table/virtualization hanya bila kebutuhan bertambah |

### ML/AI — Ditunda
Mulai dari insight rule-based, tanpa dependency ML. pandas, scikit-learn, Prophet, dan Jupyter
baru ditambahkan saat benar-benar mengerjakan Phase 6. Jangan menginstalnya untuk MVP pencatatan.

### Tools & DevOps

| Wajib awal | Opsional nanti |
|---|---|
| Git, environment Python, satu sumber dependency Python, npm lockfile | Docker/Compose, PostgreSQL |
| pytest + httpx, Ruff, ESLint, TypeScript check, frontend build | Vitest/RTL tambahan, Playwright, mypy, coverage report |
| Backup file database yang benar, instruksi menjalankan app | GitHub Actions, hosting, error tracking |

Gunakan runtime yang masih didukung, misalnya Python 3.12+ dan Node LTS kompatibel dengan Vite.
Pilih satu cara mengelola dependency Python; jangan memelihara requirements dan pyproject yang saling berbeda.
Semua struktur dan command di dokumen ini adalah target, bukan quick start yang sudah tersedia.

---

<a id="skill-agent"></a>

## 🧠 Panduan Skill untuk Agent

Skill agent adalah instruksi kerja, bukan nama teknologi. Context7 adalah tool dokumentasi, bukan skill.
**Cukup satu skill utama per task**, ditambah skill verifikasi/pengujian bila relevan.
Skill tidak boleh mengubah personal project ini menjadi proyek enterprise.

### Skill yang Tersedia pada Environment Saat Ini

| Skill ID | Kapan dipakai |
|---|---|
| `design-taste-frontend` | Menentukan arah visual dan layout awal sekali, bukan redesign setiap fase |
| `impeccable` | Forms, responsive, loading/empty/error states, dan pemeriksaan accessibility |
| `graphify` | Memahami hubungan kode jika graph repository tersedia |
| `find-skills` | Mencari alternatif ketika skill spesialis belum tersedia |

Gunakan gaya dashboard tenang, label jelas, angka mudah dibaca, dan dekorasi seperlunya.
Tidak perlu branding kit, image generation, animasi kompleks, atau deck desain untuk MVP.

### Skill Tambahan — Belum Terpasang

| Skill ID | Sumber | Prioritas |
|---|---|---|
| `fastapi-templates` | [wshobson/agents](https://skills.sh/wshobson/agents/fastapi-templates) | Backend jika FastAPI dipilih; gunakan pola minimal/sync yang cocok |
| `python-testing-patterns` | [wshobson/agents](https://skills.sh/wshobson/agents/python-testing-patterns) | Tes model, CRUD, agregasi, dan backup |
| `verification-before-completion` | [obra/superpowers](https://skills.sh/obra/superpowers/verification-before-completion) | Memastikan klaim selesai didukung hasil tes nyata |
| `auth-implementation-patterns` | [wshobson/agents](https://skills.sh/wshobson/agents/auth-implementation-patterns) | Hanya saat mode remote dikerjakan |
| `ml-pipeline-workflow` | [wshobson/agents](https://skills.sh/wshobson/agents/ml-pipeline-workflow) | Referensi evaluasi eksperimen, bukan kewajiban membangun MLOps |
| `github-actions-templates` | [wshobson/agents](https://skills.sh/wshobson/agents/github-actions-templates) | Hanya jika CI dibutuhkan |

Sumber tersebut sudah diperiksa pada penyusunan sebelumnya, tetapi tetap review isi sebelum instalasi.
Audit direktori `auth-implementation-patterns` pernah menampilkan **Socket: Warn**; periksa warning terbaru.
Tidak perlu memasang semuanya. Instalasi skill memerlukan persetujuan pengguna.

Contoh instalasi satu skill backend, **bukan command yang sudah dijalankan**:
```powershell
npx skills add https://github.com/wshobson/agents --skill fastapi-templates
```

Jika skill pada task belum tersedia, nyatakan fallback: dokumentasi resmi + checklist task + tes.
Gunakan `find-skills` hanya bila perlu alternatif; jangan menghentikan pekerjaan sekadar karena paket skill belum dipasang.
Jika backend akhirnya Django, pilih skill yang sesuai melalui `find-skills`; jangan memakai template FastAPI.

### Protokol Ringkas Setiap Task
1. Baca instruksi workspace, file terkait, scope, dan acceptance criteria.
2. Bila `graphify-out/graph.json` tersedia, mulai dari `graphify query "<pertanyaan task>"`; tidak perlu membuat graph baru untuk README ini.
3. Muat skill relevan atau sebutkan fallback. `verification-before-completion` dipakai pada semua task bila tersedia.
4. Periksa dokumentasi library sesuai versi melalui Context7 atau sumber resmi; jangan kirim data keuangan/secret ke tool eksternal.
5. Implementasikan perubahan kecil, tambah tes untuk risiko nyata, lalu jalankan pemeriksaan yang relevan.
6. Setelah perubahan kode, jalankan `graphify update .` sesuai instruksi workspace atau laporkan blocker; edit README saja tidak memerlukan update AST.
7. Laporkan file berubah, hasil verifikasi, dan next task. Jangan klaim skill dimuat atau tes lulus bila belum dilakukan.

### Template Instruksi Agent
```text
Kerjakan task <ID> dari README.md untuk personal project solo, mode lokal secara default.
Muat skill utama task atau nyatakan fallback, lalu gunakan dokumentasi sesuai versi.
Pilih solusi paling sederhana yang aman; jangan tambah layanan, abstraksi, atau fitur opsional.
Pastikan nominal akurat, data tersimpan, dan state UI jelas.
Uji happy path serta edge case relevan; laporkan hasil nyata dan batas verifikasi.
Jangan membuka akses jaringan atau mengubah dependency tanpa persetujuan.
```

---

<a id="struktur-project"></a>

## 📁 Struktur Project

Struktur target dibuat bertahap; tidak perlu membuat folder/file kosong untuk fitur yang ditunda.

```text
finance-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py                  # Engine, session, SQLite FK configuration
│   │   ├── models.py              # Category, Transaction; Budget saat diperlukan
│   │   ├── schemas.py             # Create/update/read schemas
│   │   ├── api/
│   │   │   ├── transactions.py
│   │   │   ├── categories.py
│   │   │   └── analytics.py
│   │   └── services/
│   │       ├── analytics.py
│   │       └── export.py
│   ├── alembic/
│   ├── scripts/
│   │   ├── seed.py                # Kategori awal; transaksi dummy hanya database demo
│   │   └── backup.py
│   ├── tests/
│   ├── data/                      # Database lokal; tidak masuk Git
│   ├── pyproject.toml            # Bila dipilih; jangan duplikasi sumber dependency
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                   # Fetch client dan typed API functions
│   │   ├── components/            # Form, table, summary, shared UI
│   │   ├── pages/                 # Dashboard, Transactions; Budget opsional
│   │   ├── lib/                   # Amount/date parsing dan formatters
│   │   ├── styles/globals.css
│   │   └── App.tsx
│   ├── tests/                     # Tambahkan sesuai kebutuhan
│   ├── package.json
│   └── package-lock.json
├── .gitignore
└── README.md
```

Tidak perlu generic CRUD base, repository pattern, service untuk setiap operasi, generated API types,
atau banyak dokumen ADR/runbook pada awal proyek. Tambahkan layer/file saat benar-benar mengurangi duplikasi.
Auth, budget, `ml/`, Docker, dan `.github/workflows/` ditambahkan ketika task opsionalnya dikerjakan.

---

<a id="aturan-domain"></a>

## 📐 Aturan Domain & API

### Yang Tetap Wajib Walaupun Project Kecil
- **Uang:** MVP hanya rupiah utuh. Simpan `amount_rupiah` sebagai integer di DB dan hitung total dengan integer Python.
  API memakai string digit, misalnya `"150000"`; terima 1–9.999.999.999.999 rupiah per transaksi/budget.
  Tolak nol, negatif, pecahan, dan overflow; SQLite CHECK juga memastikan tipe tersimpan integer, bukan REAL.
  Jangan menyimpan/menghitung total keuangan menggunakan float.
- **Trade-off:** rupiah utuh lebih sederhana dan presisi untuk SQLite. Jika nanti perlu pecahan/multi-currency,
  rancang ulang currency/scale dan migration secara eksplisit, bukan sekadar mengganti label tampilan.
- **Tanggal:** transaksi memakai tanggal lokal `YYYY-MM-DD`; timestamps disimpan UTC dan dinormalisasi konsisten oleh aplikasi.
  Zona waktu awal `Asia/Jakarta`, locale `id-ID`, filter tanggal inklusif.
- **Kategori:** tipe kategori harus cocok dengan transaksi; kategori yang dipakai transaksi/budget tidak boleh dihapus.
- **Arus kas:** pemasukan dikurangi pengeluaran periode bukan saldo rekening bank; label UI harus sesuai.
- **Budget opsional:** kategori expense saja, nominal positif, unik per kategori/bulan/tahun.
  Normal <80%, warning 80–<100%, over budget ≥100%.
- **Data:** FK SQLite aktif pada setiap koneksi; commit/rollback benar, update tidak mengubah field yang tidak dikirim.
- **Privasi:** database, backup, `.env`, CSV pribadi, dan notebook berisi data nyata tidak masuk Git atau log.

### Kontrak API Minimal
- Prefix `/api/v1`; request/response model eksplisit dan OpenAPI bawaan cukup sebagai dokumentasi awal.
- `POST` create → 201, `GET`/`PATCH` → 200, `DELETE` → 204 tanpa body.
- Error 404 untuk ID tidak ada, 409 untuk konflik, 422 untuk input invalid; gunakan error framework yang konsisten.
  Format custom error/request ID dan generator tipe belum wajib.
- Pagination sederhana: `page`, `page_size` (maksimal 100), response `items`, `total`, `page`, `page_size`.
- Sorting memakai allowlist dan tie-breaker ID; perubahan filter kembali ke page pertama.
- Mutasi transaksi memperbarui list, summary, dan budget jika aktif melalui query invalidation/refetch.
- Export mengikuti filter, quote CSV dengan benar, dan netralkan formula injection pada field teks.
- Di mode remote, semua resource dan export dilindungi session pemilik; mode single-owner tidak menyediakan register publik.

### UI Minimum yang Nyaman
Label form dan focus jelas; nominal mudah dipindai; ada loading, empty, error/retry, dan submitting states.
Konfirmasi sebelum delete, hindari double submit, dan jangan tampilkan gagal fetch seolah totalnya nol.
Warna chart/alert disertai label teks; breakdown kategori bisa berupa list, tidak harus donut chart.

---

<a id="roadmap"></a>

## 🗺️ Roadmap & Phase Plan

**Wajib:** fondasi, CRUD, ringkasan, polish minimum, dan backup.
**Opsional:** auth remote, budget, ML, hosting, dan CI.
Checklist pengujian adalah expected result, bukan hasil yang sudah lulus.

### PHASE 0 — Project Setup & Foundation
**Prioritas:** wajib · **Estimasi:** 4–6 jam fokus.

#### Objectives
Backend/frontend bisa dijalankan lokal dengan setup yang mudah diulang.

#### Tasks
**[x] 0.1 — Setup Environment & Konfirmasi Scaffold**
- **Skill agent:** `verification-before-completion`; `fastapi-templates` bila tersedia, atau dokumentasi FastAPI resmi.
- FastAPI telah dipilih untuk backend MVP ini. Pastikan dependency aktif tidak lagi mencampur Django/DRF.
- Siapkan runtime, environment Python, satu sumber dependency, dan lockfile frontend.
- Jangan mengganti dependency atau scaffold di atas file yang sudah ada tanpa persetujuan.

**[ ] 0.2 — Backend Lokal**
- **Skill agent:** `fastapi-templates` setelah FastAPI dikonfirmasi.
- Buat API, settings, SQLite session synchronous per request, dan health endpoint.
- Gunakan endpoint `def` untuk operasi DB synchronous, bukan blocking DB di event loop `async def`.
- Default bind `127.0.0.1`; allowlist Host dan Origin lokal, cek Origin pada request mutasi dari browser.
  CORS saja tidak cukup melindungi API localhost dari situs berbahaya; tolak origin/host tak dikenal dan input content-type tak sesuai.
- Simpan DB pada path yang jelas, bukan direktori sementara; mode tanpa auth tidak boleh digunakan lewat LAN/tunnel.
- Scaffold sekarang menyediakan health endpoint dan konfigurasi dasar; perlindungan Origin untuk endpoint mutasi
  harus ditambahkan sebelum endpoint penulisan dibuat.

Setelah `requirements.txt` dan `.env.example` tersedia, command lokal dari folder `backend/`:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m app
```
Untuk tes, buka terminal kedua di `backend/` dan jalankan `python -m pytest`.
Jangan commit `.env`; bila `.venv` sudah ada, gunakan tanpa membuatnya ulang.

**[ ] 0.3 — Frontend & Layout Ringan**
- **Skill agent:** `design-taste-frontend`; `impeccable` untuk states dan interaksi.
- Setup React/TypeScript, Tailwind, komponen seperlunya, QueryClient, dan route dashboard/transaksi.
- Pilih satu gaya visual dan beberapa semantic tokens; tidak perlu dokumen desain terpisah.
- Buat scripts lint, type-check, build; jangan menaruh secret pada `VITE_*`.

**[ ] 0.4 — Git & Instruksi Menjalankan App**
- **Skill agent:** `verification-before-completion`.
- Gunakan `main` dan commit kecil; branch fitur/PR opsional, tidak perlu branch `develop`.
- Gitignore database/backup/CSV pribadi, `.env`, environment, dan dependencies.
- Catat command aktual setelah diuji. Remote repository/push hanya bila diinginkan pengguna.

#### Testing Phase 0
- [ ] Backend health dan frontend lokal berjalan; alamat bind tidak mengekspos ke jaringan.
- [ ] Request mutasi dengan origin asing dan Host tak dikenal ditolak.
- [ ] Frontend type-check/build lulus; data/secret lokal tidak masuk Git.

**Exit gate:** app shell dan backend hidup tanpa layanan tambahan yang tidak diperlukan.

### PHASE 1 — Database Design & Models
**Prioritas:** wajib · **Estimasi:** 3–5 jam fokus.

#### Database Schema Minimal
```text
categories
  id, name, normalized_name, type (income/expense), created_at, updated_at
  unique: (type, normalized_name)

transactions
  id, category_id (FK), amount_rupiah (INTEGER > 0), type, description,
  date, notes (nullable), created_at, updated_at
  index: date; category_id bila query membutuhkan

budgets [hanya jika Phase 5 dikerjakan]
  id, category_id (FK), amount_rupiah (INTEGER > 0), month, year,
  created_at, updated_at
  unique: (category_id, month, year)
```

Tidak perlu tabel user/refresh token untuk MVP lokal single-owner. Data model ini bukan multi-user;
jika scope berubah, tambahkan ownership dan migration sebelum membuka akses pengguna lain.

#### Tasks
**[ ] 1.1 — Model & Validasi**
- **Skill agent:** `fastapi-templates`; `python-testing-patterns` untuk invariant data.
- Pisahkan schema create/update/read, batasi panjang input, dan validasi integer rupiah/tanggal/tipe kategori.
- Aktifkan FK SQLite pada setiap koneksi; CHECK amount positif dan larangan delete kategori yang direferensikan.

**[ ] 1.2 — Migration & Kategori Awal**
- **Skill agent:** `python-testing-patterns`.
- Siapkan migration awal dan seed kategori idempotent, misalnya Gaji, Makanan, Transport, Hiburan.
- Transaksi dummy hanya untuk DB demo/test, bukan otomatis masuk DB keuangan pribadi.
- Backup sebelum migration pada DB berisi data; jangan menghapus DB untuk menyelesaikan perubahan schema.

#### Testing Phase 1
- [ ] Migration DB kosong lulus; seed dua kali tidak menggandakan kategori.
- [ ] Amount invalid, FK invalid, dan kategori duplikat ditolak.
- [ ] Restart backend tidak menghapus transaksi; DB test terpisah dari DB pribadi.

**Exit gate:** model minimal persisten dan invariant uang/relasi terlindungi.

### PHASE 2 — Authentication System
**Prioritas:** keputusan mode wajib; implementasi auth hanya untuk remote.
**Estimasi:** keputusan lokal 0,5–1 jam; auth remote tambahan 6–10 jam.

#### Objectives
Tidak membangun sistem akun yang belum dibutuhkan, tetapi tidak mengekspos data pribadi tanpa proteksi.

#### Tasks
**[ ] 2.1 — Tetapkan Mode Akses**
- **Skill agent:** `verification-before-completion`.
- Untuk MVP, catat keputusan local-only; tidak ada register/login/profile/role.
- Uji bind loopback dan Host/Origin allowlist; login wajib sebelum penggunaan LAN, tunnel, atau internet.
- Pilihan ini mengasumsikan komputer pribadi tepercaya, bukan perlindungan terhadap malware/pengguna OS lain.

**[ ] 2.2 — Login Pemilik [Opsional, Wajib Sebelum Remote]**
- **Skill agent:** `auth-implementation-patterns`; `impeccable` untuk halaman login.
- Satu pemilik dibuat melalui konfigurasi/command lokal, tanpa endpoint register publik.
- Pilih session server-side sederhana: token opaque acak di cookie, session tervalidasi/expired/revoked di server.
  Simpan hash token di DB, bukan token plaintext. Gunakan implementasi/dependency teruji; jangan mengarang protokol auth sendiri.
- Hash password dengan Argon2; cookie HttpOnly, Secure untuk HTTPS, SameSite sesuai topology.
- Login/logout, rate limit, CSRF/Origin protection, dan guard seluruh endpoint data termasuk export.
- Prefer frontend/API same-origin; tidak perlu access JWT, refresh rotation, OAuth, atau password reset pada scope ini.

#### Testing Phase 2
- [ ] Lokal: akses jaringan luar tidak dibuka dan Origin/Host yang tidak diizinkan ditolak.
- [ ] Jika remote: tanpa session tidak bisa membaca/mengubah/export data; credential salah ditolak.
- [ ] Jika remote: login, reload, logout, expiry, dan CSRF rejection bekerja; secret tidak muncul di storage/log frontend.

**Exit gate:** mode akses jelas; auth remote boleh dilewati hanya pada local-only yang benar-benar dibatasi.

### PHASE 3 — Core CRUD — Transactions & Categories
**Prioritas:** wajib · **Estimasi:** 10–16 jam fokus.

#### API Endpoints
```text
GET/POST           /api/v1/transactions
GET/PATCH/DELETE   /api/v1/transactions/{id}
GET                /api/v1/transactions/export/csv
GET/POST           /api/v1/categories
PATCH/DELETE       /api/v1/categories/{id}
```
Filter awal: start_date/end_date, category_id, type, page/page_size.
Search dan variasi sorting lanjutan boleh ditunda. Daftarkan route export statis sebelum route `/{id}`.

#### Tasks
**[ ] 3.1 — Backend CRUD**
- **Skill agent:** `fastapi-templates`; `python-testing-patterns` untuk API/data.
- CRUD transaksi/kategori, pagination, validasi kategori sesuai tipe, serta PATCH absent vs explicit null.
- Gunakan query/model langsung dan helper kecil; tidak perlu generic repository/CRUD base.
- Amount API string digit dikonversi ke integer dengan validasi; total dihitung server.

**[ ] 3.2 — Halaman Transaksi**
- **Skill agent:** `impeccable`.
- Form tanggal/tipe/kategori/amount/description; table sederhana dan filter bulan/kategori/tipe.
- Validasi input lokal, inline errors, submitting state, konfirmasi delete, dan loading/empty/retry.
- Input nominal tetap string sampai server memvalidasi; refetch list/summary setelah mutasi.

**[ ] 3.3 — Export CSV**
- **Skill agent:** `python-testing-patterns`; `impeccable` untuk aksi export.
- Export filter aktif, kolom tanggal/tipe/kategori/nominal/deskripsi, UTF-8, dan escaping newline/comma.
- Netralisasi spreadsheet formula injection pada teks; CSV adalah export, bukan pengganti backup DB.

#### Testing Phase 3
- [ ] Tambah/edit/delete bekerja; input kosong, nol, negatif, pecahan, dan overflow ditolak.
- [ ] Filter tanggal/kategori/tipe tepat; kategori yang digunakan tidak bisa dihapus.
- [ ] Tambah 3 transaksi, hapus 1 → tersisa 2 setelah reload/restart.
- [ ] Export sesuai filter dan aman untuk teks formula/newline/comma.

**Exit gate:** aplikasi sudah bisa dipakai mencatat keuangan harian secara lokal.

### PHASE 4 — Dashboard & Visualisasi
**Prioritas:** wajib untuk summary; chart tambahan boleh ditunda · **Estimasi:** 6–10 jam fokus.

#### API Endpoints & Layout
```text
GET /api/v1/analytics/summary       → income, expense, net_cash_flow untuk bulan terpilih
GET /api/v1/analytics/by-category   → breakdown expense per kategori

[Pemasukan] [Pengeluaran] [Arus kas bersih]
[Breakdown kategori: list atau satu chart]
[Transaksi terbaru untuk bulan terpilih]
```
Monthly trend 12 bulan, heatmap, dan daily-spending endpoint bukan syarat MVP.

#### Tasks
**[ ] 4.1 — Aggregate & Periode**
- **Skill agent:** `python-testing-patterns`; `fastapi-templates` untuk endpoint.
- Hitung summary/breakdown dari DB dengan integer; filter bulan/tahun konsisten untuk semua widget.
- Bulan kosong menghasilkan total nol; kegagalan API tetap error, bukan angka nol.
- Jika menampilkan perubahan persen, baseline nol menghasilkan "Belum ada pembanding", bukan infinity.

**[ ] 4.2 — Dashboard Ringan**
- **Skill agent:** `design-taste-frontend` mengikuti arah awal; `impeccable` untuk keterbacaan/states.
- Tiga metric, period selector, breakdown kategori, dan recent transactions.
- Gunakan format IDR, label arus kas yang benar, warna konsisten, serta alternatif teks untuk chart.
- Ganti periode/mutasi transaksi memperbarui semua widget; jangan mengubah desain keseluruhan lagi.

#### Testing Phase 4
- [ ] Total cocok dengan fixture manual, termasuk income-only/expense-only dan bulan kosong.
- [ ] Pergantian bulan/tahun dan perubahan transaksi memperbarui semua angka yang terkait.
- [ ] Dashboard terbaca di mobile/desktop; error fetch tidak disamarkan sebagai kosong.

**Exit gate:** pengguna bisa memahami pengeluaran bulan ini tanpa harus membaca seluruh table.

### PHASE 5 — Budget Management
**Prioritas:** opsional · **Estimasi:** tambahan 4–8 jam fokus.

#### Tasks
**[ ] 5.1 — Budget Bulanan**
- **Skill agent:** `fastapi-templates`; `python-testing-patterns` untuk kalkulasi/constraint.
- Tambahkan model budget dan migration hanya saat fase ini dimulai.
- CRUD `/api/v1/budgets` dan status `/api/v1/budgets/status`; kategori expense saja, unique kategori/bulan/tahun.
- Return budget, spent, remaining, percentage, dan status; tanpa yearly/carry-over/scheduler.

**[ ] 5.2 — Progress & Alert In-App**
- **Skill agent:** `impeccable`.
- Form budget dan progress per kategori; warning 80%, over budget 100%.
- Bar maksimal 100%, label tetap menampilkan aktual, misalnya 125%; alert cukup di halaman aplikasi.
- Edit/hapus/pindah tanggal transaksi memperbarui budget periode terkait.

#### Testing Phase 5
- [ ] Duplikat ditolak; actual spending sesuai transaksi pada periode yang benar.
- [ ] Batas 80%/100% dan spending >100% tampil benar; remaining boleh negatif.

**Exit gate:** budget membantu penggunaan pribadi; boleh dilewati tanpa menghalangi MVP pencatatan.

### PHASE 6 — ML & AI Insights
**Prioritas:** ditunda, bukan syarat selesai · **Estimasi:** ditentukan setelah scope eksperimen dipilih.

#### Tasks
**[ ] 6.1 — Insight Rule-Based [Opsional]**
- **Skill agent:** `python-testing-patterns`; `impeccable` untuk penyajian.
- Mulai dari insight sederhana: kategori terbesar atau perubahan dari periode pembanding yang valid.
- Tidak perlu model, worker, LLM, artifact store, atau endpoint ML terpisah untuk statistik dasar.

**[ ] 6.2 — Eksperimen Forecasting [Nanti]**
- **Skill agent:** `ml-pipeline-workflow` hanya bagian data/evaluasi yang relevan.
- Moving average dulu jika ada minimal 3 bulan penuh yang representatif; tampilkan insufficient_data jika belum cukup.
- Gunakan temporal backtest, bandingkan baseline, dan jangan mengklaim interval/akurasi tanpa evaluasi.
- Prophet/IsolationForest dan notebook hanya jika memang menjadi tujuan belajar; tidak perlu pipeline production.
- Jangan load pickle/joblib dari sumber tidak terpercaya atau commit notebook berisi data pribadi.

#### Testing Phase 6
- [ ] Insight dapat ditelusuri ke perhitungan/periode; data tidak cukup tidak menghasilkan prediksi palsu.
- [ ] Jika forecast dibuat: split temporal tanpa leakage dan hasil dibandingkan baseline.

**Exit gate:** eksperimen tidak mengganggu pencatatan; fase ini boleh tetap tidak dikerjakan.

### PHASE 7 — Polish, Backup & Deployment Opsional
**Prioritas:** polish/backup wajib; hosting/CI opsional · **Estimasi lokal:** 4–6 jam fokus.

#### Tasks
**[ ] 7.1 — Polish Minimum**
- **Skill agent:** `impeccable`.
- Review forms, keyboard/focus, empty/error states, kontras, mobile, dan nominal besar.
- Perbaiki bug yang menghambat penggunaan; dark mode, animasi, dan Lighthouse score khusus tidak wajib.
- Pastikan lint, TypeScript check, frontend build, dan tes core lulus.

**[ ] 7.2 — Backup & Restore Sederhana**
- **Skill agent:** `python-testing-patterns`; `verification-before-completion`.
- Sediakan satu cara backup DB: SQLite backup API atau copy setelah app/koneksi dihentikan dengan benar.
  Jangan copy file DB live sembarang, terutama ketika WAL aktif.
- Backup sebelum migration dan secara rutin sesuai frekuensi pemakaian; simpan salinan di lokasi privat terpisah.
- Uji restore ke DB sementara, cek jumlah transaksi dan summary; tulis instruksi singkat di README.
- Tidak perlu scheduler, RPO/RTO formal, monitoring stack, atau incident runbook terpisah.

**[ ] 7.3 — Hosting Pribadi [Opsional]**
- **Skill agent:** `find-skills` untuk provider terpilih; `auth-implementation-patterns` untuk review proteksi.
- Kerjakan 2.2 dahulu; gunakan HTTPS, same-origin bila memungkinkan, proteksi secret dan DB.
- Pilih satu deployment sederhana. SQLite harus pada persistent disk dan satu instance; filesystem ephemeral tidak boleh menyimpan data utama.
- Gunakan PostgreSQL jika penyimpanan SQLite tidak cocok, lalu tes migration/agregasi pada DB tersebut.
- Jangan memakai Vite dev server sebagai server internet; pilih build frontend production.
- Verifikasi harga/kuota dan backup; deployment berbayar/publik memerlukan persetujuan.

**[ ] 7.4 — CI Ringan [Opsional]**
- **Skill agent:** `github-actions-templates`.
- Satu workflow lint, type-check, test, dan build pada push/PR sudah cukup.
- Tidak perlu automatic deploy, release approval matrix, staging, atau image scanning pipeline jika belum ada deployment/container.
- Jangan mengekspos secret pada workflow atau PR yang tidak dipercaya.

#### Testing Phase 7
- [ ] Core flow tetap bekerja setelah restart; lint/type-check/build dan tes core lulus.
- [ ] Restore backup ke DB terpisah menghasilkan data dan total yang sama.
- [ ] Jika remote: HTTPS/auth/CSRF/logout berfungsi dan storage tetap persisten setelah restart/redeploy.

**Exit gate:** MVP lokal nyaman dipakai dan datanya bisa dipulihkan; hosting/CI bukan blocker.

---

<a id="timeline"></a>

## 📊 Summary Timeline

Estimasi untuk satu developer yang cukup familiar dengan stack; jam fokus, bukan janji tanggal selesai.

| Fase | Jam fokus | Wajib untuk MVP lokal? |
|---|---|---|
| 0 — Setup | 4–6 | Ya |
| 1 — Database | 3–5 | Ya |
| 2.1 — Keputusan mode lokal | 0,5–1 | Ya |
| 3 — CRUD & CSV | 10–16 | Ya |
| 4 — Summary & dashboard ringan | 6–10 | Ya |
| 7.1–7.2 — Polish & backup | 4–6 | Ya |
| **MVP lokal** | **Sekitar 28–44** | **Stop point utama** |
| 5 — Budget | +4–8 | Tidak |
| 2.2 — Auth remote | +6–10 | Hanya jika remote |
| 6 / 7.3 / 7.4 | Estimasi setelah dipilih | Tidak |

Tambahkan buffer 20–30% untuk belajar/debugging: sekitar **34–58 jam** untuk MVP lokal.
Dengan 2 jam per hari, 5 hari per minggu, kira-kira **3–6 minggu**; lebih lama bila baru mempelajari stack.
Jika waktu habis, prioritaskan CRUD, summary teks, export, dan backup; tunda chart dekoratif dan semua fitur opsional.

**Stop rule:** setelah pencatatan, ringkasan, export, dan restore bekerja, proyek boleh dinyatakan selesai untuk kebutuhan awal.
Tidak perlu menyelesaikan seluruh Phase 0–7 hanya karena ada di roadmap.

---

<a id="testing"></a>

## 🧪 Testing Strategy Summary

| Area | Pemeriksaan awal |
|---|---|
| Data & API | pytest + httpx; SQLite test DB terpisah |
| Nominal | Integer/string parsing, batas nominal, dan total tanpa float |
| CRUD & kategori | Create/update/delete, invalid input, FK, kategori yang digunakan |
| Analytics | Fixture total manual, periode, bulan kosong, refetch setelah mutasi |
| UI | Manual core flow, validasi, loading/error/empty, keyboard, mobile |
| Backup | Restore terisolasi dan perbandingan data/summary |
| Remote, jika aktif | Login/logout/expiry, CSRF, semua data/export memerlukan session |

Tidak ada kewajiban coverage 80%, load test 50 clients, tes semua komponen, atau lima suite E2E.
Automasi logic uang/CRUD/summary lebih bernilai daripada mengejar angka coverage.
Vitest untuk parser/formatter atau Playwright untuk satu core flow boleh ditambahkan bila membantu.

### Tiga Alur Manual Wajib
1. Tambah pemasukan dan dua pengeluaran → cek list dan ringkasan bulan.
2. Edit/hapus/pindah tanggal transaksi → filter, summary, dan budget jika aktif ikut berubah.
3. Export → restart app → backup dan restore ke DB sementara → data/angka tetap benar.

### Command Target Setelah Setup Tersedia
Contoh berikut harus disesuaikan dengan tooling yang dipilih dan baru dicatat sebagai lulus setelah dijalankan.

Backend, dari `backend/` dan environment Python yang sudah disiapkan:
```powershell
python -m pytest
python -m ruff check .
```

Frontend, dari `frontend/`, setelah scripts dibuat:
```powershell
npm ci
npm run lint
npm run type-check
npm run build
```

Command test/backup tidak boleh mengarah ke DB keuangan pribadi untuk cleanup atau restore.
Skill pengujian: `python-testing-patterns`; skill verifikasi: `verification-before-completion`;
skill pemeriksaan UI: `impeccable`, masing-masing memakai fallback eksplisit jika belum tersedia.

---

<a id="definition-of-done"></a>

## ✅ Definition of Done

Checklist pendek untuk task yang sedang dikerjakan:
- [ ] Fitur sesuai scope task; tidak ada layanan atau fitur opsional yang ikut ditambahkan.
- [ ] Data tersimpan benar, nominal akurat, validasi dan error relevan bekerja.
- [ ] UI state dan tampilan yang disentuh sudah diperiksa.
- [ ] Tes/pemeriksaan relevan benar-benar dijalankan; batas verifikasi dilaporkan.
- [ ] Skill yang digunakan/fallback dan instruksi penting diperbarui seperlunya.
- [ ] Tidak ada secret/data pribadi yang ikut commit, dan perubahan pengguna tidak ditimpa.

Jika implementasi belum bisa diuji, statusnya **implemented, unverified**, bukan selesai.
Untuk selesai MVP: core flows, restart persistence, export, serta restore backup lulus.
Login/security remote hanya menjadi gate tambahan bila akses remote dipilih.

---

<a id="key-decisions"></a>

## 🔑 Key Decisions & Rationale

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Scope | Solo, satu pemilik, local-first | Cepat berguna dan biaya maintenance rendah |
| Backend | FastAPI sebagai acuan; konfirmasi dependency Django | Tidak migrasi stack tanpa manfaat nyata |
| Database | SQLite awal | Tidak memerlukan service/container tambahan |
| Nominal | Integer rupiah di DB, digit string di API | Presisi sederhana; pecahan/multi-currency di luar scope |
| DB access | Synchronous session per request | Beban single-user tidak memerlukan async DB |
| Auth | Local-only tanpa login; session owner sebelum remote | Sederhana tanpa membuka data pribadi ke jaringan |
| Arsitektur | File kecil, helper seperlunya | Hindari abstraksi sebelum ada duplikasi |
| Testing | Risiko inti, tanpa quota coverage | Uang/data benar lebih penting daripada checklist enterprise |
| Backup | Manual/command sederhana, restore diuji | Proteksi data tetap wajib walau proyek kecil |
| ML/DevOps | Ditunda hingga ada kebutuhan | Bukan syarat selesai personal project |

Keputusan cukup dicatat singkat di README; ADR terpisah baru diperlukan jika alasan/desain mulai sulit diikuti.

### Referensi Teknis
- [FastAPI — SQL databases](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [SQLModel — Session dependency](https://sqlmodel.tiangolo.com/tutorial/fastapi/session-with-dependency/)
- [Tailwind — Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Direktori skill agent](https://skills.sh/)

Verifikasi versi sebelum implementasi. Contoh skill async/production bukan kewajiban mengikuti seluruh stack template.

---

<a id="skill-developer"></a>

## 🧠 Skills yang Dibutuhkan Developer

Ini kompetensi manusia, berbeda dari registry skill agent; pelajari just-in-time.

| Area | Pelajari sekarang | Tunda sampai dibutuhkan |
|---|---|---|
| Python/backend | Environment, routing, validation, SQLModel/SQL, migration, pytest | Async DB, worker, caching |
| Frontend | TypeScript dasar, React, forms, Fetch/Query, CSS, format IDR | Table framework, virtualization, motion kompleks |
| Domain | Integer money, date/period, relasi kategori, backup/restore | Multi-currency, ledger wallet/transfer |
| Tools | Git/commit, terminal, lint, build, `.env` | Docker, CI/CD, cloud services |
| Security | Privasi file, local bind, Host/Origin checks, input validation | Session/CSRF/HTTPS sebelum remote; OAuth/MFA belum perlu |
| Data/ML | Aggregate dan perbandingan sederhana | pandas, temporal backtest, forecasting, anomaly detection |

Urutan belajar: **React/TypeScript dasar → API & SQL → CRUD → summary → backup**.
Auth remote, budget, dan ML mengikuti kebutuhan, bukan prasyarat memulai.

---

<a id="risiko"></a>

## ⚠️ Risiko & Pengembangan Lanjutan

| Risiko yang relevan sekarang | Mitigasi |
|---|---|
| Scope membesar sampai proyek tidak selesai | Ikuti stop rule, jangan otomatis mengerjakan task opsional |
| Salah memilih/migrasi backend | Konfirmasi FastAPI vs Django sebelum scaffolding |
| Nominal atau periode salah | Integer rupiah, validasi, fixture total/tanggal |
| SQLite reset/backup tidak konsisten | Path permanen, migration, backup API/stop-before-copy, restore teruji |
| Mode tanpa login terbuka ke jaringan | Loopback saja, Host/Origin allowlist, auth sebelum LAN/tunnel/internet |
| File pribadi masuk Git/log/tool eksternal | Gitignore, review commit, data sintetis untuk tes |
| Hosting filesystem ephemeral | Persistent storage satu instance atau PostgreSQL |
| Terlalu banyak skill/abstraksi | Satu skill utama per task, fallback transparan, pola minimal |

### Backlog — Hanya Jika Masih Ingin Melanjutkan
1. Budget dan dark mode jika membantu kebiasaan penggunaan.
2. CSV import dengan preview/deduplication jika input manual merepotkan.
3. Hosting dengan owner login jika butuh akses dari perangkat lain.
4. Insight/forecasting jika histori cukup atau menjadi tujuan belajar.
5. Multi-user, wallet, dan integrasi bank hanya setelah scope berubah secara eksplisit.

**Ukuran keberhasilan:** aplikasi benar-benar dipakai sendiri, angka dapat dipercaya, data bisa dipulihkan,
dan perubahan kecil tidak memerlukan maintenance besar. Proyek tidak harus berubah menjadi produk publik.
