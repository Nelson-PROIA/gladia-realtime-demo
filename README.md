# Gladia Realtime Demo

Live speech-to-text demo using Gladia's Realtime API V2 with speaker diarization.

**🌐 Live Demo:** [https://gladia-realtime-demo.onrender.com/](https://gladia-realtime-demo.onrender.com/)  
*Note: Access key required - contact the owner for access*

## Quick Start

1. **Get API key:** [app.gladia.io](https://app.gladia.io/)
2. **Clone & setup:**
```bash
git clone https://github.com/Nelson-PROIA/gladia-realtime-demo
cd gladia-realtime-demo
pip install -r requirements.txt
```
3. **Configure:**
```bash
cp .env.example .env
# Edit .env with your settings:
# GLADIA_API_KEY=your_gladia_api_key
# SECRET_KEY=your_flask_secret_key
# ACCESS_KEY=your_demo_access_key (optional - for public deployment security)
```
4. **Run:**
```bash
python app.py
# Open http://localhost:8000
```

## Code Structure

```
├── app.py                    # Flask web app (WebSocket + Gladia API)
├── cli.py                    # Minimal CLI demo (~200 lines)
├── static/
│   ├── index.html           # Main UI
│   ├── login.html           # Access control page
│   ├── app.js               # Frontend (audio capture + Socket.IO)
│   ├── style.css            # Main styling
│   └── login.css            # Login page styling
├── assets/
│   ├── gladia-logo.png      # Logo image
│   └── gladia-logo.ico      # Favicon
├── requirements.txt          # Web app dependencies
├── requirements-cli.txt      # CLI dependencies (includes PyAudio)
├── .env.example             # Environment variables template
└── README.md                # This file
```

## How It Works

1. **Browser** captures microphone → Web Audio API (16kHz)
2. **Frontend** converts audio → WAV → base64 → Socket.IO
3. **Flask** receives audio → forwards to Gladia WebSocket
4. **Gladia** transcribes → returns JSON → displayed in UI

## CLI Demo

Quick test without web interface:

```bash
pip install -r requirements-cli.txt  # Adds PyAudio
python cli.py
```

## Configuration

**Web App:** Use the UI settings panel
- Languages: Auto-detect or select specific languages
- Code switching: Only available in auto-detect mode
- Custom vocabulary: Boost recognition for specific terms

**CLI:** Edit `create_session()` in `cli.py`:
```python
payload = {
    "language_config": {
        "languages": [],  # Auto-detect
        "code_switching": False
    },
    "realtime_processing": {
        "custom_vocabulary": True,
        "custom_vocabulary_config": {
            "vocabulary": ["Gladia", "API"]
        }
    }
}
```

## Deployment

**Render (recommended):**
1. Push to GitHub
2. Connect repo to Render
3. Set environment variables: `GLADIA_API_KEY`
4. Deploy

## API Reference

- **Gladia Docs:** [docs.gladia.io](https://docs.gladia.io/)
- **Endpoint:** `POST https://api.gladia.io/v2/live`
- **Audio format:** WAV/PCM, 16kHz, mono
- **Languages:** Multiple languages supported (auto-detect or specific)

## Troubleshooting

- **No audio:** Check microphone permissions
- **No transcription:** Verify `GLADIA_API_KEY` in `.env`
- **Poor quality:** Add custom vocabulary, reduce noise
- **CLI issues:** Install PyAudio system dependencies

---

**Built by:** Nelson PROIA 
**Powered by:** [Gladia](https://gladia.io/)