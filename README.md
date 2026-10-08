# Personal Finance Tracker

Aplikasi pencatatan keuangan pribadi untuk satu pemilik, dengan Bahasa Indonesia
dan mata uang rupiah (IDR). Dikembangkan untuk penggunaan lokal di komputer pribadi.

## Status

Project masih pada tahap scaffold, belum siap untuk mencatat keuangan nyata.

- Backend: FastAPI, konfigurasi lokal, engine SQLite dengan foreign key aktif,
  endpoint health, dan tes dasar.
- Frontend: starter React + TypeScript + Vite, belum terhubung ke backend.
- CRUD transaksi, kategori, dashboard, export, serta backup/restore belum tersedia.

## Teknologi Saat Ini

| Bagian | Teknologi |
|---|---|
| Backend | FastAPI, SQLModel, pydantic-settings, SQLite |
| Frontend | React, TypeScript, Vite |
| Pemeriksaan | pytest, Ruff, Oxlint, TypeScript |

## Menjalankan Secara Lokal

Prasyarat: Python 3.12+ dan Node.js LTS yang kompatibel dengan Vite
(misalnya Node.js 24 LTS), beserta npm. Command berikut menggunakan PowerShell.

### Backend

Dari folder utama project:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -m app
```

Jika `.venv` sudah ada, lewati langkah pembuatannya. Pertahankan
`APP_HOST=127.0.0.1` dan jalankan backend dari folder `backend/` agar path
database dan `.env` konsisten. Lokasi database default: `backend/data/finance.db`.
Engine sudah dikonfigurasi, tetapi schema dan migration belum tersedia.

- Health: <http://127.0.0.1:8000/health>
- Dokumentasi API: <http://127.0.0.1:8000/docs>

Endpoint health mengembalikan `{"status":"ok"}`; ini bukan pemeriksaan kesiapan database.

### Frontend

Buka terminal kedua dari folder utama project:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Buka <http://localhost:5173>. Frontend saat ini masih menampilkan halaman starter Vite.

## Pemeriksaan

Backend, dari `backend/` dengan environment Python aktif:

```powershell
python -m pytest
python -m ruff check .
```

Frontend, dari `frontend/`:

```powershell
npm run lint
npm run type-check
npm run build
```

Command di atas adalah cara menjalankan pemeriksaan, bukan klaim semua pemeriksaan sudah lulus.

## Struktur Utama

```text
backend/
  app/             # API, settings, dan engine database
  tests/           # Tes backend
  requirements.txt
  .env.example
frontend/
  src/             # Kode React dan styles
  public/          # Asset statis
  package.json
  package-lock.json
```

## Keamanan & Privasi

- Mode tanpa login hanya untuk komputer pribadi tepercaya; backend dan frontend
  harus bind ke `127.0.0.1`.
- Jangan membuka akses LAN, internet, port forwarding, atau tunnel. Autentikasi
  dan perlindungan request mutasi belum tersedia.
- Jangan commit `.env`, database, backup, atau CSV berisi data pribadi.
- Jangan gunakan scaffold ini sebagai server publik atau penyimpanan data keuangan utama.
