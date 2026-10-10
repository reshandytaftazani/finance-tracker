# Personal Finance Tracker

Sebuah aplikasi pencatatan keuangan pribadi untuk satu pemilik, dirancang untuk penggunaan lokal pada satu komputer pribadi. Antarmuka menggunakan Bahasa Indonesia dan mata uang Rupiah (IDR).

Roadmap dan catatan task tersimpan di `PLANNING.local.md` pada salinan lokal dan sengaja tidak disertakan di repository.

---

## Status Proyek

Proyek sedang membangun fondasi MVP:
- **Backend:** FastAPI, database SQLite dengan foreign key aktif, synchronous session per request, proteksi host dan origin pada request mutasi, health endpoint, dan pengujian otomatis via pytest.
- **Frontend:** React, TypeScript, dan Vite dengan type-checking, linter, serta konfigurasi build produksi.
- **Model & validasi:** model Owner/Category/Transaction dengan constraint ownership, nominal rupiah integer, normalisasi nama, timestamp UTC, dan schema create/update/read. API nominal menggunakan string digit; client tidak dapat mengirim `owner_id` atau `normalized_name`.
- **Mode akses & autentikasi:** mode akses ditetapkan eksplisit sebagai single-owner local-only untuk MVP tanpa endpoint register/login/profile publik. Server menyelesaikan kepemilikan data secara internal via bootstrap ID `1` (`app.dependencies.get_current_owner_id`), menolak input/override ownership dari client, dan menolak akses non-local tanpa autentikasi.
- **Migration & seed:** migration Alembic awal dan bootstrap owner/kategori tersedia melalui command eksplisit. Tidak ada transaksi demo.
- **API CRUD:** transaksi/kategori dengan filter, pagination, PATCH parsial, dan isolasi owner. Kategori yang terpakai tidak dapat dihapus atau diubah tipenya.
- **Halaman transaksi & export CSV:** tambah/edit/hapus melalui API, filter bulan/kategori/tipe, pagination, validasi inline, konfirmasi hapus, loading/error/retry, serta export CSV aman. Nominal dikirim sebagai string digit; perubahan memperbarui list dan menginvalidasi cache analytics. ID melebihi `Number.MAX_SAFE_INTEGER` ditolak di browser (termasuk pembacaan) untuk mencegah mutasi ke ID yang dibulatkan; dukungan penuh ID 64-bit belum tersedia di UI.
- **Dashboard keuangan:** metrik total pemasukan, total pengeluaran, dan arus kas bersih (net cash flow), pemilih periode bulan, distribusi alokasi pengeluaran per kategori, serta daftar transaksi terbaru yang terhubung langsung ke API analytics dan transaksi.
- **Belum tersedia:** fitur budget management (Phase 5). Startup tidak menjalankan migration atau seed otomatis. Progress task hanya ada pada catatan lokal yang tidak di-commit.

---

## Tech Stack

| Komponen | Pilihan | Keterangan |
|---|---|---|
| Framework Backend | FastAPI + Uvicorn | REST API dengan dokumentasi OpenAPI otomatis |
| ORM & Validasi | SQLModel + Pydantic | Pemodelan data bertipe, validasi skema, nilai moneter berbasis integer rupiah |
| Basis Data | SQLite | Penyimpanan lokal pada satu file di `backend/data/finance.db` |
| Framework Frontend | React + Vite + TypeScript | Antarmuka pengguna berbasis SPA |
| Styling | Tailwind CSS v4 + shadcn/ui | Desain antarmuka fungsional dan minimalis |
| Pengelolaan State API | TanStack Query | Caching data server dan invalidasi mutasi |
| Kode Kualitas & Pengujian | pytest, Ruff, Oxlint, TypeScript | Pengujian logika dan verifikasi tipe statis |

---

## Panduan Menjalankan Aplikasi

Prasyarat lingkungan: Python 3.12+ dan Node.js 24 LTS beserta npm. Perintah berikut menggunakan PowerShell.

### 1. Menjalankan Backend

Dari direktori root proyek:

```powershell
cd backend

# Aktifkan virtual environment
.\.venv\Scripts\Activate.ps1

# Pasang dependensi jika belum terpasang
python -m pip install -r requirements.txt

# Salin konfigurasi environment default jika belum ada
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# Buat/update schema, lalu bootstrap owner lokal dan kategori awal
python -m scripts.migrate
python -m scripts.seed

# Jalankan server API
python -m app
```

- Endpoint Health: <http://127.0.0.1:8000/health>
- Dokumentasi API (Swagger UI): <http://127.0.0.1:8000/docs>
- File basis data: `backend/data/finance.db`

#### API pencatatan lokal

Setelah migration dan bootstrap, gunakan Swagger UI atau client JSON lokal:

| Method | Path | Fungsi |
|---|---|---|
| GET / POST | `/api/v1/transactions` | Daftar / tambah transaksi |
| GET / PATCH / DELETE | `/api/v1/transactions/{id}` | Baca / edit / hapus transaksi |
| GET / POST | `/api/v1/categories` | Daftar / tambah kategori |
| PATCH / DELETE | `/api/v1/categories/{id}` | Edit / hapus kategori |

Daftar mengembalikan `items`, `total` (jumlah baris, bukan nominal), `page`, dan `page_size`.
Default `page=1`, `page_size=20`; ukuran halaman 1–100, nomor halaman 1–2147483647.
Transaksi menerima filter `start_date`/`end_date` inklusif (`YYYY-MM-DD`), `category_id`, dan
`type=income|expense`, berurutan tanggal terbaru lalu ID terbesar. Kategori menerima filter
`type`, berurutan nama normalisasi lalu ID. Filter kategori tidak ada/milik owner lain → 404.

Contoh body POST transaksi:
```json
{
  "category_id": 2,
  "type": "expense",
  "amount_rupiah": "150000",
  "date": "2026-10-09",
  "description": "Belanja makanan",
  "notes": null
}
```
Pilih ID kategori expense dari GET kategori; contoh ID `2` mengikuti bootstrap awal.
Nominal request/response selalu string digit; database memakai integer rupiah.
PATCH hanya mengubah field yang dikirim; `notes: null` menghapus catatan, null pada field wajib
ditolak. PATCH `{}` tidak mengubah timestamp. Server menentukan owner; `owner_id` dan
`normalized_name` tidak boleh dikirim. POST → 201, GET/PATCH → 200, DELETE → 204 tanpa body;
ID tidak ada/milik owner lain → 404, konflik nama/relasi → 409, input atau tipe kategori tidak
cocok → 422. Endpoint export CSV belum tersedia (task 3.3).

#### Migration dan bootstrap lokal

Jalankan command dari `backend/`, dengan `.venv` aktif dan **backend dihentikan**.
URL database mengikuti `APP_DATABASE_URL` / `.env`, sama dengan aplikasi. Untuk menguji pada salinan,
ubah `APP_DATABASE_URL` di terminal tersebut ke path SQLite salinan, bukan DB pribadi.

- `python -m scripts.migrate` menerapkan revision Alembic terbaru (`0002_budgets`). Bila ada upgrade tertunda
  dan database berisi data, command membuat snapshot melalui SQLite backup API di `backend/backups/`,
  lalu memeriksa integritasnya. Backup gagal → migration dibatalkan. File lama tidak ditimpa.
- `python -m scripts.seed` membuat owner lokal ID `1` beserta Gaji, Makanan, Transport, dan Hiburan
  dalam satu transaksi. Hanya untuk `APP_ENV=local`; owner yang sudah ada tidak diubah atau di-seed ulang,
  termasuk bila semua kategorinya sudah dihapus. Tidak ada transaksi dummy.
- `python -m alembic current` menampilkan revision; `python -m alembic check` memeriksa perbedaan model/schema.
  History migration terpisah dari model aplikasi; `create_all()` hanya dipakai fixture tes.

SQLite FK tetap aktif; migration DDL dan pencatatan revision memakai transaksi eksplisit agar kegagalan
tidak menyisakan schema setengah jadi. Schema kategori/transaksi lama yang belum tercatat di Alembic
ditolak tanpa diganti: periksa salinan dan buat migration backfill sesuai schema lama.
Jangan menghapus database atau menjalankan `alembic stamp` untuk melewati pemeriksaan ini.

Jika migration gagal, jangan menghapus data: hentikan app, simpan DB yang gagal, dan verifikasi backup
pada path terpisah sebelum pemulihan. Jangan menimpa DB aktif atau mengabaikan file WAL/SHM.
Downgrade migration awal menolak database yang berisi owner/kategori/transaksi; gunakan backup terverifikasi.
Backup ini khusus pengamanan migration, bukan pengganti prosedur backup rutin task 7.2; simpan salinan privat
di lokasi terpisah juga. Migration PostgreSQL hanya diuji sebagai DDL offline, bukan pada server PostgreSQL.

### Budget Bulanan (API)

Task 5.1 menambahkan backend budget; form/progress UI tetap task 5.2. Hentikan backend,
jalankan `python -m scripts.migrate`, lalu mulai ulang backend. Migration hanya menambah
tabel budget; transaksi/kategori lama tidak diubah. DB pribadi tidak di-migrate otomatis.
Downgrade revision budget ditolak bila tabel budget berisi data.

```text
GET/POST         /api/v1/budgets
GET/PATCH/DELETE /api/v1/budgets/{id}
GET              /api/v1/budgets/status?month=10&year=2026
```

POST menerima `{"category_id":1,"amount_rupiah":"100","month":10,"year":2026}`.
Kategori wajib expense milik owner server; nominal string digit positif sampai
`9999999999999`, month 1–12 dan year 1–9999 (integer JSON). Budget unik per
owner/kategori/bulan/tahun. `owner_id` dan `category_type` bukan input publik.
PATCH mengubah field yang dikirim saja; `{}` tidak mengubah timestamp, explicit null
ditolak. Status HTTP mengikuti CRUD transaksi (201/200/204, 404/409/422).

GET list memakai pagination `page`/`page_size` (maksimal 100), filter opsional
`month`, `year`, `category_id`; urut tahun/bulan/ID descending. Status mewajibkan
month/year dan mengembalikan semua budget periode itu, urut ID ascending:

```json
{"month":10,"year":2026,"items":[{"id":1,"category_id":1,"category_name":"Makanan","budget":"100","spent":"125","remaining":"-25","percentage":"125.00","status":"over_budget"}]}
```

Nominal/totals adalah string exact; remaining boleh negatif. Percentage adalah string
desimal dua digit, dibulatkan half-up tanpa float dan tidak dibatasi 100%. Status
ditentukan dari integer exact: normal <80%, warning 80–<100%, over_budget ≥100%.
Pembulatan dapat menampilkan `80.00` untuk nilai sedikit di bawah 80%; gunakan
field `status`, jangan menebak status dari persentase tampilan. Spending hanya expense
owner/kategori pada bulan terpilih dan mencerminkan edit/hapus/pindah transaksi pada
request berikutnya. Bulan tanpa budget menghasilkan `items: []`; kegagalan DB tetap error,
bukan nol. Tidak ada yearly budget, carry-over, scheduler, atau alert di luar aplikasi.

### 2. Menjalankan Frontend

Buka sesi terminal baru dari direktori root proyek:

```powershell
cd frontend

# Pasang dependensi jika belum terpasang
npm install

# Jalankan development server
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Akses antarmuka melalui peramban web di <http://127.0.0.1:5173>. Halaman Dashboard dan Transaksi terhubung ke API. Frontend dan API harus memakai hostname yang sama
(default `127.0.0.1`) agar request mutasi tidak ditolak proteksi cross-site. Jika memakai `localhost`,
atur `VITE_API_BASE_URL=http://localhost:8000` sebelum menjalankan frontend dan buka melalui `localhost`.

### Export CSV

Pada halaman Transaksi, pilih bulan, tipe, dan kategori lalu klik **Export CSV**.
Download memuat **semua hasil filter**, bukan hanya halaman tabel yang sedang dibuka.
Jika filter diganti saat export berjalan, file tetap memakai filter saat tombol diklik.
Filter valid tanpa transaksi menghasilkan file dengan header saja. Kegagalan export
menampilkan pesan dan tombol coba lagi; browser menentukan lokasi penyimpanan file.

Endpoint `GET /api/v1/transactions/export/csv` memakai `start_date`/`end_date` inklusif,
`category_id`, dan `type`, dengan pembatasan owner yang sama seperti daftar transaksi.
Kolomnya `tanggal`, `tipe` (`income`/`expense`), `kategori`, `nominal_rupiah`, `deskripsi`.
Nominal berupa digit rupiah utuh tanpa pemisah ribuan; CSV memakai UTF-8 dengan BOM,
delimiter koma, dan quoting untuk koma, kutip, serta baris baru. Bila spreadsheet
tidak mendeteksi delimiter, pilih **UTF-8** dan **koma** pada dialog import.

Teks yang berpotensi dibaca sebagai formula diberi awalan apostrof (`'`) pada export,
tanpa mengubah data tersimpan. Beberapa pembaca CSV menampilkan apostrof tersebut.
Jangan menghapus proteksi ini atau mengubah sel menjadi formula; import kolom teks
sebagai **teks**, terutama ketika mengedit atau menyimpan ulang di spreadsheet.
Proteksi saat export bukan jaminan setelah file diubah oleh aplikasi lain.
Export dibuat dalam memori untuk penggunaan lokal; dataset sangat besar belum menjadi
target. **CSV bukan backup database:** tidak memuat ID, owner, notes, atau timestamps,
dan tidak disediakan jalur restore/import CSV. Simpan export pribadi di lokasi privat.

---

## Ringkasan Bulanan (API)

Tersedia dua endpoint analytics yang dikonsumsi langsung oleh Dashboard:

```text
GET /api/v1/analytics/summary?month=10&year=2026
GET /api/v1/analytics/by-category?month=10&year=2026
```

Keduanya mewajibkan `month` (1–12) dan `year` (1–9999), memakai tanggal kalender
transaksi dari awal sampai akhir bulan, serta owner yang ditentukan server.
Periode hilang/tidak valid menghasilkan 422. Pilih bulan/tahun yang sama untuk
semua widget; daftar transaksi terbaru dapat memakai filter `start_date`/`end_date`
bulan yang sama pada endpoint transaksi yang sudah tersedia.

Contoh response summary:

```json
{"month":10,"year":2026,"income":"1000","expense":"700","net_cash_flow":"300"}
```

`net_cash_flow` adalah pemasukan dikurangi pengeluaran, **bukan saldo rekening**,
dan dapat negatif. Breakdown hanya memuat kategori expense dengan transaksi
pada periode tersebut, diurutkan total terbesar lalu ID kategori:

```json
{"month":10,"year":2026,"items":[{"category_id":3,"category_name":"Transport","expense":"400"},{"category_id":1,"category_name":"Makanan","expense":"300"}]}
```

Nominal response selalu **string rupiah utuh**, termasuk nol; total tidak dibatasi
maksimum nominal per transaksi. Penjumlahan memakai integer Python, bukan float
atau SQLite `SUM`, agar tetap exact saat total melebihi integer 64-bit. Client
jangan mengonversi total menjadi JavaScript `Number` tanpa pemeriksaan presisi.
Untuk MVP, setiap request membaca baris sesuai owner/periode (tanpa cache);
dataset besar memerlukan evaluasi performa sebelum mengganti strategi agregasi.

Bulan kosong menghasilkan ketiga total `"0"` dan breakdown `items: []`.
Kegagalan database/API tetap error, **bukan** total nol. Mutasi transaksi dan rename
kategori langsung tercermin pada request berikutnya. Tidak ada perbandingan persen
atau tren pada endpoint ini; jangan menampilkan nol baseline sebagai infinity.

---

## Pengujian dan Verifikasi

### Backend

Dari direktori `backend/` dengan virtual environment aktif:

```powershell
python -m pytest
python -m ruff check .
```

### Frontend

Dari direktori `frontend/`:

```powershell
npm test
npm run lint
npm run type-check
npm run build
```

`npm test` memakai test runner bawaan Node.js 24 (tanpa dependency tambahan) untuk validasi tanggal/nominal,
payload API, pagination kategori, error HTTP, CSV/filter export, dan invalidasi cache transaksi/analytics. Query dashboard
pada Phase 4 harus memakai prefix `['analytics']` agar ikut diperbarui setelah mutasi.

Tes browser opsional memakai Chrome/Chromium yang sudah terpasang, backend environment yang sama,
dan SQLite sementara hasil migration/seed, **bukan database pribadi**:

```powershell
# Dari frontend/. Tidak perlu menjalankan server app secara manual.
$env:BACKEND_PYTHON = (Resolve-Path ..\backend\.venv\Scripts\python.exe).Path
npm run test:browser
```

Jika Chrome tidak ada di lokasi default, set `CHROME_PATH` ke executable Chrome/Chromium.
`BACKEND_PYTHON` juga dapat menunjuk environment backend di lokasi lain (misalnya worktree).
Runner menyalakan server loopback test (default API `18032`, frontend `15132`), lalu menghentikannya.
Port dapat diubah melalui `TEST_API_PORT`/`TEST_UI_PORT`; pastikan port tersebut kosong.
Artifact/screenshot dan DB fixture tersimpan di direktori temporary baru yang dilaporkan runner;
set `TEST_ARTIFACTS_DIR` untuk memilih direktori induknya. Jangan commit artifact/database tersebut.
Flow yang diuji: tambah 3/hapus 1, edit, filter/pagination, reload, download CSV nyata sesuai
filter/lintas halaman, error/retry, double-submit/double-export,
serta viewport desktop/mobile. Screenshot emulasi bukan pengujian perangkat fisik atau screen reader.

---

## Struktur Direktori

```text
finance-tracker/
├── backend/
│   ├── app/
│   │   ├── api/             # Router dan controller endpoint
│   │   ├── config.py        # Konfigurasi aplikasi dan allowlist
│   │   ├── db.py            # Konfigurasi engine SQLite dan session per request
│   │   ├── main.py          # Inisialisasi aplikasi FastAPI dan middleware
│   │   ├── models.py        # Model dan constraint domain
│   │   ├── schemas.py       # Schema API create/update/read
│   │   ├── services/        # Agregasi exact bulanan dan proteksi teks CSV
│   │   ├── validation.py    # Validasi nominal, tanggal, dan teks
│   │   ├── dependencies.py  # Resolusi kepemilikan data server-side
│   │   └── security.py      # Proteksi Host dan Origin
│   ├── alembic/             # Environment dan revision migration
│   ├── alembic.ini          # Konfigurasi Alembic
│   ├── scripts/             # Migration, backup pra-upgrade, dan bootstrap
│   ├── tests/               # Tes model, migration, API fondasi, dan keamanan
│   ├── data/                # Database lokal (di-ignore Git)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/                 # Komponen dan logika antarmuka pengguna
│   ├── public/              # Aset statis
│   ├── package.json
│   └── package-lock.json
├── .gitignore
└── README.md                # Dokumentasi utama proyek
```

`PLANNING.local.md` adalah file opsional di working copy lokal dan tidak termasuk struktur repository.

---

## Keamanan dan Privasi

- Mode tanpa autentikasi hanya untuk komputer pribadi tepercaya dan bind loopback. Jangan membuka akses melalui LAN, tunnel, port forwarding, atau internet.
- `APP_HOST` menerima IP loopback saja (`127.0.0.1`, alamat `127.x.x.x`, atau `::1`); hostname seperti `localhost` tidak diterima sebagai alamat bind.
- Trusted Host dan proteksi Origin/content-type untuk request mutasi bukan pengganti login. Autentikasi wajib ditambahkan sebelum memilih akses remote.
- Database, `.env`, backup, dan CSV pribadi tidak boleh di-commit. Backup migration di `backend/backups/` bukan pengganti backup rutin yang disimpan pada lokasi privat terpisah.
