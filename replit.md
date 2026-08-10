# Whisper STT Server

REST API Speech-to-Text berbasis Whisper untuk Wemos D1 Mini dan client IoT lain.

## Run & Operate

- `python artifacts/api-server/main.py` — run the FastAPI Whisper server locally
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `API_KEY` — key yang dikirim melalui header `X-API-Key`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Python 3.11 + FastAPI + Uvicorn
- Speech-to-text: OpenAI Whisper (`tiny` secara default)
- Audio preprocessing: FFmpeg
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/main.py` — aplikasi FastAPI dan endpoint STT
- `artifacts/api-server/requirements.txt` — dependency Python
- `artifacts/api-server/.env.example` — contoh konfigurasi
- `artifacts/api-server/README.md` — panduan penggunaan API
- `artifacts/api-server/test_api.py` — smoke test endpoint

## Architecture decisions

- Model Whisper diload sekali saat startup agar request berikutnya tidak membayar biaya load model.
- Audio selalu dinormalisasi FFmpeg menjadi WAV PCM mono 16 kHz 16-bit sebelum transkripsi.
- Upload hanya disimpan di direktori temporary dan dihapus otomatis setelah request selesai.

## Product

Server menerima WAV, MP3, M4A, OGG, dan WebM melalui `POST /transcribe`, lalu mengembalikan teks hasil transkripsi dalam JSON.

## User preferences

Tidak ada preferensi tambahan.

## Gotchas

- `API_KEY` wajib tersedia sebelum server startup.
- FFmpeg harus tersedia agar format audio dapat dinormalisasi.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
