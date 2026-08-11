"""Lightweight Whisper Speech-to-Text API for Wemos D1 Mini clients."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import imageio_ffmpeg
from faster_whisper import WhisperModel
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

load_dotenv()

MAX_FILE_SIZE = 10 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm"}
SUPPORTED_CONTENT_TYPES = {
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "audio/webm",
    "video/webm",
    "application/ogg",
}

logger = logging.getLogger("whisper-stt")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="[%(levelname)s] %(message)s",
)

try:
    FFMPEG_EXECUTABLE = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_directory = str(Path(FFMPEG_EXECUTABLE).parent)
    os.environ["PATH"] = os.pathsep.join(
        [ffmpeg_directory, os.environ.get("PATH", "")]
    )
except Exception:
    FFMPEG_EXECUTABLE = "ffmpeg"


def _settings() -> dict[str, str | None]:
    return {
        "api_key": os.getenv("API_KEY"),
        "model_name": os.getenv("WHISPER_MODEL", "tiny"),
        "language": os.getenv("WHISPER_LANGUAGE", "id"),
    }


def _error(message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": message},
    )


def _service_status() -> dict[str, str]:
    return {"status": "online", "service": "Whisper STT Server"}


def _health_status() -> dict[str, str]:
    return {"status": "healthy"}


async def _write_upload(upload: UploadFile, destination: Path) -> int:
    total_size = 0
    with destination.open("wb") as output:
        while chunk := await upload.read(CHUNK_SIZE):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                raise ValueError("Ukuran file melebihi batas maksimal 10 MB.")
            output.write(chunk)
    return total_size


def _normalize_audio(source: Path, destination: Path) -> None:
    command = [
        FFMPEG_EXECUTABLE,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        str(destination),
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg tidak tersedia di server.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Preprocessing audio melebihi batas waktu.") from exc

    if completed.returncode != 0:
        details = completed.stderr.strip()
        raise ValueError(
            f"Format audio tidak valid atau FFmpeg gagal{': ' + details if details else '.'}"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = _settings()
    if not settings["api_key"]:
        raise RuntimeError("API_KEY wajib diatur sebelum server dijalankan.")

    logger.info("Server started")
    logger.info("Loading Whisper model: %s", settings["model_name"])
    try:
        model = WhisperModel(
            str(settings["model_name"]),
            device="cpu",
            compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            cpu_threads=int(os.getenv("WHISPER_CPU_THREADS", "2")),
            num_workers=1,
        )
    except Exception:
        logger.exception("Whisper model failed to load")
        raise

    app.state.whisper_model = model
    app.state.transcription_lock = asyncio.Lock()
    app.state.language = settings["language"]
    logger.info("Whisper model loaded")
    yield


app = FastAPI(
    title="Whisper STT Server",
    description="Speech-to-text REST API for Wemos D1 Mini and other IoT clients.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    missing_file = any(
        error.get("loc", [])[-1:] == ["file"] for error in exc.errors()
    )
    message = "File audio wajib dikirim pada field 'file'." if missing_file else "Request tidak valid."
    return _error(message, 400)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request tidak dapat diproses."
    return _error(detail, exc.status_code)


@app.get("/")
@app.get("/api")
async def root() -> dict[str, str]:
    return _service_status()


@app.get("/health")
@app.get("/api/health")
@app.get("/healthz")
@app.get("/api/healthz")
async def health() -> dict[str, str]:
    return _health_status()


@app.post("/transcribe")
@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile | None = File(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> JSONResponse:
    expected_api_key = _settings()["api_key"]
    if not expected_api_key or not x_api_key or not secrets.compare_digest(
        x_api_key, expected_api_key
    ):
        return _error("API key tidak valid.", 401)

    if file is None or not file.filename:
        return _error("File audio wajib dikirim pada field 'file'.", 400)

    suffix = Path(file.filename).suffix.lower()
    content_type = (file.content_type or "").lower()
    if suffix not in SUPPORTED_EXTENSIONS and content_type not in SUPPORTED_CONTENT_TYPES:
        return _error(
            "Format audio tidak didukung. Gunakan WAV, MP3, M4A, OGG, atau WebM.",
            415,
        )

    logger.info("Audio received: %s", suffix or content_type or "unknown")
    try:
        with tempfile.TemporaryDirectory(prefix="whisper-stt-") as temp_dir:
            temp_path = Path(temp_dir) / f"input{suffix or '.audio'}"
            normalized_path = Path(temp_dir) / "normalized.wav"
            await _write_upload(file, temp_path)
            await asyncio.to_thread(_normalize_audio, temp_path, normalized_path)

            logger.info("Transcribing...")
            async with app.state.transcription_lock:
                segments, _info = await asyncio.to_thread(
                    app.state.whisper_model.transcribe,
                    str(normalized_path),
                    language=app.state.language,
                    task="transcribe",
                    beam_size=1,
                    vad_filter=True,
                )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            logger.info("Transcription completed")
            return JSONResponse(content={"success": True, "text": text})
    except ValueError as exc:
        return _error(str(exc), 400)
    except RuntimeError as exc:
        logger.warning("Audio processing failed: %s", exc)
        return _error(str(exc), 422)
    except Exception:
        logger.exception("Unexpected transcription error")
        return _error("Server gagal memproses audio.", 500)
    finally:
        await file.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )