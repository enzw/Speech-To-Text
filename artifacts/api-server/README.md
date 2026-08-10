# Whisper STT Server

REST API Speech-to-Text ringan untuk Wemos D1 Mini (ESP8266) dan perangkat IoT
lain. Whisper dijalankan di server, bukan di mikrokontroler.

## Fitur

- `POST /transcribe` menerima audio `multipart/form-data`
- Format: WAV, MP3, M4A, OGG, dan WebM
- Audio diproses menjadi mono, 16 kHz, 16-bit PCM WAV dengan FFmpeg
- Whisper diload sekali saat startup
- API key melalui header `X-API-Key`
- Batas upload maksimal 10 MB
- File audio tidak disimpan permanen
- CORS aktif untuk client lintas origin
- Health check di `/` dan `/health`

## Menjalankan secara lokal

Pastikan Python 3.11 atau lebih baru dan FFmpeg tersedia.

```bash
uv sync
cp .env.example .env
# isi API_KEY di .env
python main.py
```

Server berjalan di `http://localhost:8000` secara default. Port dapat diubah
dengan environment variable `PORT`.

Jika dependency dipasang menggunakan pip:

```bash
pip install -r requirements.txt
```

## Environment variables

| Variable | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `API_KEY` | Ya | — | Nilai rahasia untuk header `X-API-Key` |
| `WHISPER_MODEL` | Tidak | `tiny` | Model Whisper, misalnya `tiny` atau `base` |
| `WHISPER_LANGUAGE` | Tidak | auto-detect | Gunakan `id` untuk Bahasa Indonesia |
| `PORT` | Tidak | `8000` | Port server; Replit mengisinya otomatis |
| `LOG_LEVEL` | Tidak | `INFO` | Level logging |

Jangan commit file `.env`.

## Endpoint

### `GET /`

```json
{
  "status": "online",
  "service": "Whisper STT Server"
}
```

### `GET /health`

```json
{
  "status": "healthy"
}
```

### `POST /transcribe`

Header dan body:

```http
X-API-Key: your-secret-key
Content-Type: multipart/form-data
file: audio.wav
```

Response sukses:

```json
{
  "success": true,
  "text": "halo bagaimana kabarmu"
}
```

Response error:

```json
{
  "success": false,
  "error": "deskripsi error"
}
```

Artifact API Replit juga menerima prefix `/api`, jadi URL yang dipublikasikan
umumnya berbentuk `https://URL-ANDA/api/transcribe`.

## cURL

```bash
curl -X POST "http://localhost:8000/transcribe" \
  -H "X-API-Key: your-secret-key" \
  -F "file=@audio.wav"
```

## Wemos D1 Mini / ESP8266

Gunakan library `ESP8266HTTPClient` dan `WiFiClient`. Audio WAV PCM mono 16-bit
16.000 Hz adalah format yang direkomendasikan.

```cpp
HTTPClient http;
WiFiClient client;
http.begin(client, "https://URL-ANDA/api/transcribe");
http.addHeader("X-API-Key", "your-secret-key");
http.addHeader("Content-Type", "multipart/form-data; boundary=----WemosAudio");

String head = "------WemosAudio\r\n"
              "Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n"
              "Content-Type: audio/wav\r\n\r\n";
String tail = "\r\n------WemosAudio--\r\n";

http.sendRequest("POST", head + audioBytes + tail);
String response = http.getString();
http.end();
```

Untuk audio berukuran besar, kirim buffer secara streaming menggunakan
`WiFiClient` agar RAM ESP8266 tidak habis. Pastikan boundary pada header,
pembuka, dan penutup multipart sama persis.

## Smoke test

Dengan server sudah berjalan:

```bash
API_KEY=your-secret-key python test_api.py
```

Untuk URL Replit:

```bash
API_BASE_URL=https://URL-ANDA/api API_KEY=your-secret-key python test_api.py
```

Script ini menguji `/`, `/health`, dan `/transcribe` menggunakan WAV silence
sebagai audio uji.