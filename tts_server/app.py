"""
Opero TTS Server - Text-to-Speech using pyttsx3
Free, offline TTS for voice feedback
"""

import asyncio
import base64
import io
import os
import tempfile
from contextlib import asynccontextmanager
from threading import Lock
from typing import Optional

import pyttsx3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ============ TTS Engine ============

# Thread-safe TTS engine wrapper
class TTSEngine:
    def __init__(self):
        self._engine: Optional[pyttsx3.Engine] = None
        self._lock = Lock()
        self._initialized = False
        
    def initialize(self):
        """Initialize the TTS engine (must be called from main thread)"""
        if not self._initialized:
            self._engine = pyttsx3.init()
            # Configure voice properties
            self._engine.setProperty('rate', 175)  # Words per minute
            self._engine.setProperty('volume', 0.9)
            
            # Try to set a natural-sounding voice
            voices = self._engine.getProperty('voices')
            for voice in voices:
                # Prefer female voice for natural sound
                if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                    self._engine.setProperty('voice', voice.id)
                    break
            
            self._initialized = True
            print(f"[TTS] Engine initialized with {len(voices)} available voices")
    
    def speak_to_file(self, text: str) -> str:
        """
        Speak text and save to temporary file
        Returns the file path
        """
        with self._lock:
            if not self._engine:
                self.initialize()
            
            # Create temp file
            fd, filepath = tempfile.mkstemp(suffix='.wav')
            os.close(fd)
            
            # Save speech to file
            self._engine.save_to_file(text, filepath)
            self._engine.runAndWait()
            
            return filepath
    
    def get_voices(self) -> list:
        """Get available voices"""
        with self._lock:
            if not self._engine:
                self.initialize()
            
            voices = self._engine.getProperty('voices')
            return [
                {
                    'id': v.id,
                    'name': v.name,
                    'languages': v.languages,
                    'gender': 'female' if 'female' in v.name.lower() else 'male'
                }
                for v in voices
            ]
    
    def set_voice(self, voice_id: str):
        """Set the voice by ID"""
        with self._lock:
            if self._engine:
                self._engine.setProperty('voice', voice_id)
    
    def set_rate(self, rate: int):
        """Set speech rate (words per minute)"""
        with self._lock:
            if self._engine:
                self._engine.setProperty('rate', rate)

# Global TTS engine
tts_engine = TTSEngine()

# ============ API Models ============

class SpeakRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    rate: Optional[int] = None

class VoiceConfig(BaseModel):
    voice_id: Optional[str] = None
    rate: Optional[int] = None

# ============ FastAPI App ============

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize TTS on startup
    tts_engine.initialize()
    print("[TTS] Server ready")
    yield
    # Cleanup on shutdown
    print("[TTS] Server shutting down")

app = FastAPI(
    title="Opero TTS Server",
    description="Text-to-Speech service using pyttsx3",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ API Endpoints ============

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "Opero TTS Server"}

@app.get("/status")
async def status():
    """Get server status and available voices"""
    voices = tts_engine.get_voices()
    return {
        "status": "ok",
        "engine": "pyttsx3",
        "voices_available": len(voices),
        "voices": voices[:5]  # Return first 5 voices
    }

@app.post("/speak")
async def speak(request: SpeakRequest):
    """
    Convert text to speech and return audio file
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if len(request.text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long (max 5000 chars)")
    
    try:
        # Apply optional settings
        if request.voice_id:
            tts_engine.set_voice(request.voice_id)
        if request.rate:
            tts_engine.set_rate(request.rate)
        
        # Generate speech
        filepath = tts_engine.speak_to_file(request.text)
        
        # Return audio file
        return FileResponse(
            filepath,
            media_type="audio/wav",
            filename="speech.wav",
            background=None  # Don't delete file immediately
        )
        
    except Exception as e:
        print(f"[TTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/speak/base64")
async def speak_base64(request: SpeakRequest):
    """
    Convert text to speech and return base64-encoded audio
    Useful for web extension that can't easily handle binary responses
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if len(request.text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long (max 5000 chars)")
    
    try:
        # Apply optional settings
        if request.voice_id:
            tts_engine.set_voice(request.voice_id)
        if request.rate:
            tts_engine.set_rate(request.rate)
        
        # Generate speech
        filepath = tts_engine.speak_to_file(request.text)
        
        # Read file and encode as base64
        with open(filepath, 'rb') as f:
            audio_data = f.read()
        
        # Clean up temp file
        os.remove(filepath)
        
        # Return base64-encoded audio
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        return {
            "success": True,
            "audio": f"data:audio/wav;base64,{audio_base64}",
            "text_length": len(request.text)
        }
        
    except Exception as e:
        print(f"[TTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/voices")
async def get_voices():
    """Get all available voices"""
    voices = tts_engine.get_voices()
    return {
        "success": True,
        "count": len(voices),
        "voices": voices
    }

@app.post("/configure")
async def configure(config: VoiceConfig):
    """Configure TTS settings"""
    if config.voice_id:
        tts_engine.set_voice(config.voice_id)
    if config.rate:
        tts_engine.set_rate(config.rate)
    
    return {"success": True, "message": "Configuration updated"}

# ============ Main ============

if __name__ == "__main__":
    import uvicorn
    
    # Default port 8765 (avoid conflicts with common ports)
    port = int(os.environ.get("TTS_PORT", 8765))
    
    print(f"[TTS] Starting server on http://localhost:{port}")
    print("[TTS] Endpoints:")
    print("  GET  /          - Health check")
    print("  GET  /status    - Server status")
    print("  POST /speak     - Text to speech (returns WAV file)")
    print("  POST /speak/base64 - Text to speech (returns base64)")
    print("  GET  /voices    - List available voices")
    print("  POST /configure - Configure voice settings")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
