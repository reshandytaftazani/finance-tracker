# Personal Finance Tracker

Aplikasi pencatatan keuangan pribadi untuk satu pemilik dengan Bahasa Indonesia dan mata uang Rupiah (IDR). Dirancang untuk penggunaan lokal di komputer pribadi.

Dokumen perencanaan dan pelacakan implementasi tersimpan di [PLANNING.local.md](PLANNING.local.md).

---

## Status Proyek

Proyek saat ini berada pada tahap fondasi MVP:
- **Backend:** FastAPI, database SQLite dengan foreign key aktif, synchronous session per request, proteksi host dan origin pada request mutasi, health endpoint, dan pengujian otomatis via pytest.
- **Frontend:** React, TypeScript, dan Vite dengan type-checking, linter, serta konfigurasi build produksi.
- **Pelacakan Task:** Seluruh task Phase 0 (Task 0.1 s.d. 0.4) telah selesai. Rincian tahapan lanjutan tercatat di [PLANNING.local.md](PLANNING.local.md).

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

# Jalankan server API
python -m app
```

- Endpoint Health: <http://127.0.0.1:8000/health>
- Dokumentasi API (Swagger UI): <http://127.0.0.1:8000/docs>
- File basis data: `backend/data/finance.db`

### 2. Menjalankan Frontend

Buka sesi terminal baru dari direktori root proyek:

```powershell
cd frontend

# Pasang dependensi jika belum terpasang
npm install

# Jalankan development server
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Akses antarmuka melalui peramban web di <http://localhost:5173>.

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
│   │   └── security.py      # Middleware validasi origin dan header mutasi
│   ├── tests/               # Pengujian fungsional dan keamanan
│   ├── data/                # Lokasi file database SQLite (diabaikan oleh git)
│   ├── requirements.txt     # Daftar dependensi Python
│   └── .env.example
├── frontend/
│   ├── src/                 # Komponen dan logika antarmuka pengguna
│   ├── public/              # Aset statis
│   ├── package.json
│   └── package-lock.json
├── PLANNING.local.md        # Rencana arsitektur, fase, dan daftar tugas
├── .gitignore
└── README.md                # Dokumentasi utama proyek
```

---

## Keamanan dan Privasi

- Penggunaan tanpa autentikasi hanya ditujukan untuk lingkungan lokal pribadi tepercaya (`127.0.0.1`).
- `APP_HOST` hanya menerima alamat IP loopback (`127.0.0.1`, alamat `127.x.x.x`, atau `::1`). Aplikasi menolak startup jika dikonfigurasi untuk bind ke jaringan; hostname seperti `localhost` juga ditolak agar alamat bind tidak bergantung pada resolusi DNS.
- Endpoint API diproteksi dengan `TrustedHostMiddleware` dan `MutationProtectionMiddleware` untuk menolak request mutasi data (`POST`, `PUT`, `PATCH`, `DELETE`) yang berasal dari origin asing atau jenis konten yang tidak sesuai.
- File basis data lokal, file konfigurasi `.env`, cadangan data (backup), serta file ekspor CSV dikecualikan dari repositori melalui konfigurasi `.gitignore`.
