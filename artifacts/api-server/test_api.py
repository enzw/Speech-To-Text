"""Small smoke test for the running Whisper STT API.

Usage:
    API_KEY=your-secret-key python test_api.py
    API_BASE_URL=https://your-replit-url/api API_KEY=... python test_api.py
"""

from __future__ import annotations

import io
import os
import struct
import urllib.error
import urllib.request
import wave


BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.getenv("API_KEY", "")


def request_json(url: str, **kwargs: object) -> str:
    request = urllib.request.Request(url, **kwargs)
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            body = response.read().decode("utf-8")
            print(f"{response.status} {url}: {body}")
            return body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        print(f"{exc.code} {url}: {body}")
        raise


def make_silence_wav() -> bytes:
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes(struct.pack("<h", 0) * 16000)
    return audio.getvalue()


def main() -> None:
    request_json(f"{BASE_URL}/")
    request_json(f"{BASE_URL}/health")

    boundary = "----WhisperSttSmokeTest"
    audio = make_silence_wav()
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="silence.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()

    request_json(
        f"{BASE_URL}/transcribe",
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "X-API-Key": API_KEY,
        },
    )


if __name__ == "__main__":
    main()