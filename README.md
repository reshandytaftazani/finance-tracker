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
- **Belum tersedia:** halaman transaksi terhubung API, dashboard data nyata, dan export CSV. Startup tidak menjalankan migration atau seed otomatis. Progress task hanya ada pada catatan lokal yang tidak di-commit.

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

Prasyarat lingkungan: Python 3.12+ dan Node.js LTS beserta npm. Perintah berikut menggunakan PowerShell.

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

- `python -m scripts.migrate` menerapkan revision Alembic `0001_initial`/head. Bila ada upgrade tertunda
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

### 2. Menjalankan Frontend

Buka sesi terminal baru dari direktori root proyek:

```powershell
cd frontend

# Pasang dependensi jika belum terpasang
npm install

# Jalankan development server
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Akses antarmuka melalui peramban web di <http://localhost:5173>. Frontend masih berupa shell UI; integrasi form dan daftar transaksi dengan API dikerjakan pada task 3.2.

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
npm run lint
npm run type-check
npm run build
```

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
