# Opero TTS Server

Offline text-to-speech server using pyttsx3.

## Setup

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running

```bash
# Start the server
python app.py

# Or with custom port
TTS_PORT=9000 python app.py
```

Server runs on `http://localhost:8765` by default.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/status` | GET | Server status + available voices |
| `/speak` | POST | Convert text to WAV file |
| `/speak/base64` | POST | Convert text to base64 audio |
| `/voices` | GET | List all available voices |
| `/configure` | POST | Configure voice/rate settings |

## Example Usage

```bash
# Simple speech
curl -X POST http://localhost:8765/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, I am Opero!"}' \
  --output speech.wav

# Get base64 audio (for web extension)
curl -X POST http://localhost:8765/speak/base64 \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, I am Opero!", "rate": 150}'
```

## Voice Configuration

```bash
# List available voices
curl http://localhost:8765/voices

# Set voice and speech rate
curl -X POST http://localhost:8765/configure \
  -H "Content-Type: application/json" \
  -d '{"voice_id": "HKEY_LOCAL_MACHINE\\SOFTWARE\\...", "rate": 175}'
```
