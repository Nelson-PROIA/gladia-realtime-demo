# Gladia Real-Time Transcription Demo

A production-ready demonstration of **Gladia's Real-Time API V2** for live speech transcription with speaker diarization. This project showcases best practices for integrating real-time speech-to-text capabilities into web applications using WebSocket-based communication.

> **Built for:** Case study demonstration of Gladia Real-Time API V2 integration  
> **Live Demo:** [Deploy to Render](https://render.com) - Instructions below  
> **Platform:** Deployed on Render with full WebSocket support

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Gladia API Integration](#-gladia-api-integration)
- [Quick Start](#-quick-start)
- [CLI Demo](#-cli-demo)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## ✨ Features

### Core Functionality
- **Real-Time Transcription**: Live speech-to-text with < 500ms latency
- **Speaker Diarization**: Automatic speaker identification and labeling
- **Partial Results**: See transcription as you speak (optional)
- **Custom Speaker Names**: Replace "Speaker 0" with user-provided names

### Advanced Gladia Features
- **Multi-Language Support**: 87+ languages with auto-detection
- **Code Switching**: Per-utterance language detection for multilingual conversations
- **Custom Vocabulary**: Boost recognition accuracy for specific terms
- **Timestamp Precision**: Accurate timing for each utterance

### User Experience
- **Modern UI**: Shadcn-inspired dark theme with smooth CSS animations
- **Language Search**: Filter through 87 languages instantly
- **Export Functionality**: Download transcripts as JSON with session metadata
- **Responsive Design**: Works on desktop and mobile browsers
- **Confirmation Modals**: Prevent accidental data loss on stop/restart
- **Precise Timestamps**: Each transcript shows start-end time range

---

## 🛠 Tech Stack

### Backend
- **Python 3.x**: Core backend language
- **Flask**: Lightweight web framework for HTTP/WebSocket server
- **Flask-SocketIO**: Bidirectional WebSocket communication with browser
- **websocket-client**: Connection to Gladia's Real-Time WebSocket API
- **python-dotenv**: Environment variable management

### Frontend
- **Vanilla JavaScript**: No framework dependencies for maximum compatibility
- **Socket.IO Client**: Real-time communication with Flask backend
- **Web Audio API**: Microphone capture and audio processing
- **CSS3**: Modern styling with animations (no preprocessor)

### Infrastructure
- **Render**: Cloud platform with native WebSocket support
- **Gladia Real-Time API V2**: Speech-to-text engine

### Why This Stack?
- **Simplicity**: Minimal dependencies for easy understanding and maintenance
- **Performance**: Direct WebSocket connections minimize latency
- **Real-Time Support**: Render's native WebSocket support for live transcription
- **Security**: API keys stored as environment variables, not in code
- **Free Tier**: Complete demo deployable on Render's free plan

---

## 🏗 Architecture

### System Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Browser   │◄────►│ Flask Server │◄────►│  Gladia API V2  │
│             │      │              │      │   (WebSocket)   │
│ - Audio Cap │      │ - Socket.IO  │      │ - Transcription │
│ - UI/UX     │      │ - Routing    │      │ - Diarization   │
│ - Display   │      │ - Auth       │      │ - Timestamps    │
└─────────────┘      └──────────────┘      └─────────────────┘
     ▲ ▼                   ▲ ▼                      ▲ ▼
  Socket.IO            WebSocket                 Binary
   (JSON)              (Binary)                   Audio
```

### Data Flow

#### 1. Session Initialization
```
Browser → Flask → Gladia API
        POST /v2/live
        {
          "encoding": "wav/pcm",
          "sample_rate": 16000,
          "language_config": {...},
          "messages_config": {...}
        }
        ←──────────────
        {
          "id": "session-uuid",
          "url": "wss://api.gladia.io/...",
          "created_at": "2025-10-17T..."
        }
```

#### 2. Audio Streaming Pipeline
```
Microphone (Browser)
    ↓
AudioContext (16kHz resampling)
    ↓
ScriptProcessor (4096 samples)
    ↓
Float32 → Int16 conversion
    ↓
WAV header addition
    ↓
Base64 encoding
    ↓
Socket.IO emit('audio_data')
    ↓
Flask Backend (base64 decode)
    ↓
Gladia WebSocket (binary frame)
    ↓
Transcription Processing
    ↓
Transcript JSON ← Socket.IO emit('transcript')
    ↓
Browser UI Display
```

#### 3. Transcript Reception
```
Gladia WebSocket → Flask → Browser
{
  "type": "transcript",
  "data": {
    "is_final": true/false,
    "utterance": {
      "text": "Hello world",
      "speaker": 0,
      "start": 1.23,
      "end": 2.45,
      "confidence": 0.98
    }
  }
}
```

### Communication Patterns

**Browser ↔ Flask (Socket.IO)**
- `connect`: Establish WebSocket connection
- `start_stream`: Initialize Gladia session with config
- `audio_data`: Stream audio chunks (continuous)
- `transcript`: Receive transcription results
- `stop_stream`: End session
- `error`: Handle errors

**Flask ↔ Gladia (WebSocket)**
- HTTP POST: Create session, get WebSocket URL
- Binary frames: Stream audio data
- JSON messages: Receive transcripts, events, errors

---

## 🔌 Gladia API Integration

### Overview

This project demonstrates complete integration with Gladia's Real-Time API V2, including session management, audio streaming, and result processing.

### Session Initialization

**Endpoint:** `POST https://api.gladia.io/v2/live`

**Headers:**
```json
{
  "x-gladia-key": "YOUR_API_KEY",
  "Content-Type": "application/json"
}
```

**Payload Structure:**
```json
{
  "encoding": "wav/pcm",
  "sample_rate": 16000,
  "language_config": {
    "languages": ["en", "fr"],
    "code_switching": true
  },
  "messages_config": {
    "receive_partial_transcripts": true,
    "receive_final_transcripts": true
  },
  "realtime_processing": {
    "custom_vocabulary": true,
    "custom_vocabulary_config": {
      "vocabulary": ["Gladia", "API", "WebSocket"]
    }
  }
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "wss://api.gladia.io/v2/live?token=temp_auth_token",
  "created_at": "2025-10-17T14:30:00.000Z"
}
```

### Configuration Options

#### Language Configuration

**Auto-Detection (No languages specified):**
```python
# Omit language_config or set languages to empty list
payload = {
    "encoding": "wav/pcm",
    "sample_rate": 16000
}
```

**Single Language:**
```python
"language_config": {
    "languages": ["en"]
}
```

**Multi-Language with Code Switching:**
```python
"language_config": {
    "languages": ["en", "fr", "es"],
    "code_switching": True  # Detect language per utterance
}
```

Supported languages: 87 total including English, Spanish, French, German, Chinese, Japanese, Arabic, and more. See [Language Select UI] for full list.

#### Message Configuration

```python
"messages_config": {
    "receive_partial_transcripts": True,   # Live updates as user speaks
    "receive_final_transcripts": True,     # Final corrected transcripts
    "receive_speech_events": True,         # Speech start/end detection
    "receive_errors": True                 # Error notifications
}
```

#### Custom Vocabulary

Boost recognition accuracy for specific words or phrases:

```python
"realtime_processing": {
    "custom_vocabulary": True,
    "custom_vocabulary_config": {
        "vocabulary": [
            "Gladia",                    # Simple word
            "API",                       # Acronym
            "Real-Time WebSocket",       # Phrase
            "transcription"              # Technical term
        ]
    }
}
```

### WebSocket Connection

After session creation, connect to the returned WebSocket URL:

```python
import websocket

ws = websocket.WebSocketApp(
    ws_url,  # From session creation response
    on_open=on_open,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close
)

ws.run_forever()
```

### Audio Format Requirements

**Critical Specifications:**
- **Encoding**: WAV/PCM (uncompressed)
- **Sample Rate**: 16,000 Hz (16 kHz)
- **Bit Depth**: 16-bit
- **Channels**: Mono (1 channel)
- **Frame Type**: Binary WebSocket frames (opcode 0x2)

**Browser Audio Processing:**
```javascript
// 1. Create AudioContext at 16kHz
const audioContext = new AudioContext({ sampleRate: 16000 })

// 2. Process in chunks
const processor = audioContext.createScriptProcessor(4096, 1, 1)

// 3. Convert Float32 to Int16
const int16Array = new Int16Array(float32Array.length)
for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
}

// 4. Add WAV headers (44 bytes)
const wavBuffer = createWavBuffer(int16Array, 16000)

// 5. Encode as base64 for Socket.IO
const base64Audio = arrayBufferToBase64(wavBuffer)

// 6. Send to Flask backend
socket.emit('audio_data', { audio: base64Audio })
```

**Backend Audio Forwarding:**
```python
# Receive from browser
@socketio.on('audio_data')
def handle_audio_data(data):
    # Decode base64 to binary
    audio_bytes = base64.b64decode(data['audio'])
    
    # Forward to Gladia as binary frame
    ws.send(audio_bytes, opcode=0x2)  # opcode 0x2 = binary
```

### Transcript Message Structure

**Partial Transcript:**
```json
{
  "type": "transcript",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-10-17T14:30:01.234Z",
  "data": {
    "is_final": false,
    "utterance": {
      "text": "Hello wor",
      "speaker": 0,
      "start": 0.0,
      "end": null,
      "confidence": null
    }
  }
}
```

**Final Transcript:**
```json
{
  "type": "transcript",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-10-17T14:30:02.456Z",
  "data": {
    "is_final": true,
    "utterance": {
      "text": "Hello world, how are you?",
      "speaker": 0,
      "start": 0.0,
      "end": 2.4,
      "confidence": 0.987,
      "words": [
        {"text": "Hello", "start": 0.0, "end": 0.4, "confidence": 0.99},
        {"text": "world", "start": 0.5, "end": 0.9, "confidence": 0.98}
      ]
    }
  }
}
```

### Speaker Diarization

Gladia automatically identifies and labels speakers:

```json
{
  "speaker": 0,  // First speaker
  "text": "Hello, how are you?"
}

{
  "speaker": 1,  // Second speaker detected
  "text": "I'm fine, thank you!"
}
```

**Custom Speaker Names:**
The demo allows mapping Speaker 0 to a custom name:
```javascript
// Frontend sends
socket.emit('start_stream', {
    speaker_name: "John Doe"
})

// Backend maps in transcript
if speaker == 0 and stored_name:
    display_name = stored_name  // "John Doe"
else:
    display_name = f"Speaker {speaker}"  // "Speaker 1", "Speaker 2"
```

### Timestamp Handling

Gladia provides precise timing for each utterance:

```python
start_time = utterance.get('start')  # Seconds from session start
end_time = utterance.get('end')      # Seconds from session start

# Example: start=1.23, end=3.45 means utterance spans 2.22 seconds
# Display: "0:01" (MM:SS format)
```

### Error Handling

**HTTP Errors (Session Creation):**
```python
try:
    response = requests.post(GLADIA_API_URL, headers=headers, json=payload)
    response.raise_for_status()
except requests.exceptions.HTTPError as e:
    # Handle 400 Bad Request, 401 Unauthorized, 429 Rate Limit, etc.
    print(f'Gladia API Error: {e.response.status_code}')
    print(f'Response: {e.response.text}')
```

**WebSocket Errors:**
```python
def on_error(ws, error):
    print(f'WebSocket error: {error}')
    # Notify frontend
    socketio.emit('error', {'message': str(error)}, room=client_sid)
```

---

## 🚀 Quick Start

### Web Application

**Prerequisites:**
- Python 3.8 or higher
- Modern web browser (Chrome 80+, Firefox 75+, Safari 14+, Edge 80+)
- Gladia API key ([Get one free](https://app.gladia.io/))

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/gladia-realtime-demo.git
cd gladia-realtime-demo
```

2. **Create virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
GLADIA_API_KEY=your_actual_api_key_from_gladia_dashboard
SECRET_KEY=your_random_flask_secret_key
```

Generate a secure SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

5. **Run the application:**
```bash
python app.py
```

6. **Open your browser:**
```
http://localhost:8000
```

### First Use

1. Click "Start recording" button
2. Grant microphone permissions when prompted
3. Start speaking
4. Watch real-time transcription appear
5. Configure advanced settings (languages, custom vocabulary)
6. Click "Stop" when finished
7. Export transcript as JSON (optional)

---

## 🖥️ CLI Demo

A minimal command-line tool to quickly test Gladia's API. Perfect for testing, debugging, or understanding the basics.

### Quick Start

**1. Install dependencies:**
```bash
# Web app dependencies
pip install -r requirements.txt

# CLI dependencies (includes PyAudio for microphone access)
pip install -r requirements-cli.txt
```

**Note:** PyAudio requires system dependencies. On macOS:
```bash
brew install portaudio
pip install pyaudio
```

On Linux:
```bash
sudo apt-get install portaudio19-dev python3-pyaudio
pip install pyaudio
```

**Important:** The web app does NOT need PyAudio (only the CLI demo). If deploying to Render, use only `requirements.txt`.

**2. Run the CLI:**
```bash
python cli.py
```

**3. Start speaking!** You'll see:
```
Connected to Gladia. Start speaking!

[Speaker 0] Hello this is...        # ← Partial (updates as you speak)
[Speaker 0] Hello this is a test    # ← Final (when you pause)
```

**4. Stop:** Press `CTRL+C`

### Configuration

Edit parameters at the top of `cli.py`:

```python
# Transcription settings (same defaults as web demo)
SHOW_PARTIAL_RESULTS = True      # Show transcription as you speak
LANGUAGES = []                    # Empty = auto-detect, or ['en'], ['en', 'fr']
CODE_SWITCHING = False            # Detect language per utterance
CUSTOM_VOCABULARY = []            # Add custom words: ['Gladia', 'API']

# Display settings
CLEAR_PARTIAL_LINE = True         # Clear partial when final arrives
ENABLE_VAD = False                # Voice Activity Detection - only send when speaking
VAD_THRESHOLD = 100               # Volume threshold (increase if too sensitive)
DEBUG_MESSAGES = False            # Show all Gladia messages (for debugging)
```

### Features

- ✅ Real-time microphone capture
- ✅ Live partial transcripts (see words as you speak)
- ✅ Speaker diarization
- ✅ Voice Activity Detection (only sends audio when speaking)
- ✅ All Gladia API options configurable
- ✅ Clean output (no spam from audio acknowledgments)
- ✅ ~200 lines of simple Python code
- ✅ Same defaults as web demo

### Example Output

```
============================================================
Gladia Real-Time Transcription
============================================================

Creating session with payload:
{
  "encoding": "wav/pcm",
  "sample_rate": 16000,
  "messages_config": {
    "receive_partial_transcripts": true,
    "receive_final_transcripts": true
  }
}

Session created: abc123...

Microphone ready
Connected. Start speaking!
============================================================

[0.00s - 1.23s] [Speaker 0] [Partial] - This is a test
[0.00s - 2.45s] [Speaker 0] [Final] - This is a test of the Gladia API
[2.50s - 4.10s] [Speaker 0] [Partial] - It works great
[2.50s - 5.67s] [Speaker 0] [Final] - It works great with real-time transcription

============================================================
Session terminated
============================================================
```

### Use Cases

- 🧪 Quick API testing
- 🔍 Debugging audio issues
- 📚 Learning how Gladia API works
- ⚡ Rapid prototyping
- 🎓 Educational examples

### CLI vs Web App

| Feature | CLI Demo | Web App |
|---------|----------|---------|
| **Setup Time** | 30 seconds | 2 minutes |
| **Lines of Code** | ~200 | ~2000 |
| **Dependencies** | Same + PyAudio | 25 packages |
| **Interface** | Terminal | Browser UI |
| **VAD** | Yes (configurable) | No |
| **Use Case** | Testing/Learning | Production/Demo |

---

## 📁 Project Structure

```
gladia-realtime-demo/
├── app.py                    # Flask web application (full-featured)
│   ├── WebSocket routing (Socket.IO)
│   ├── Session initialization (POST /v2/live)
│   ├── Audio streaming (binary frames)
│   └── Transcript forwarding
│
├── cli.py                    # Minimal CLI demo (~200 lines)
│   ├── Direct microphone capture (PyAudio)
│   ├── Voice Activity Detection (VAD)
│   ├── Real-time transcription display
│   └── Easy parameter configuration
│
├── static/                   # Frontend assets (web app)
│   ├── index.html           # Main application UI
│   ├── login.html           # Access control page (if ACCESS_KEY set)
│   ├── style.css            # Main styles (shadcn-inspired dark theme)
│   ├── login.css            # Login page specific styles
│   └── app.js               # Frontend logic & audio processing
│       ├── Microphone capture (Web Audio API)
│       ├── Audio resampling (16kHz)
│       ├── WAV encoding
│       ├── Socket.IO client
│       └── UI state management
│
├── assets/                   # Static assets
│   ├── gladia-logo.png      # Logo image (visible in pages)
│   └── gladia-logo.ico      # Favicon (browser tab icon)
│
├── requirements.txt         # Web app dependencies (Render uses this)
├── requirements-cli.txt     # CLI dependencies (PyAudio - optional)
├── .env.example            # Environment variable template
├── .gitignore              # Git ignore rules
└── README.md               # This file (comprehensive documentation)
```

### Key Functions

**Backend (`app.py`):**
- `handle_start_stream()`: Initialize Gladia session
- `start_gladia_session()`: POST to /v2/live, configure options
- `connect_to_gladia_websocket()`: Establish WebSocket connection
- `handle_audio_data()`: Forward audio to Gladia
- `handle_stop_stream()`: Clean up resources

**Frontend (`static/app.js`):**
- `startStreaming()`: Setup microphone and Socket.IO
- `startRecording()`: AudioContext and audio processing
- `convertFloat32ToInt16()`: Audio format conversion
- `createWavBuffer()`: Add WAV headers
- `displayTranscript()`: Render results in UI
- `exportTranscript()`: Download JSON file

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GLADIA_API_KEY` | Yes | Your Gladia API key | `gladia_abc123...` |
| `SECRET_KEY` | Yes (if using ACCESS_KEY) | Flask session secret | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ACCESS_KEY` | No | Access control key for demo protection | `my_secret_key_123` |

**Note on ACCESS_KEY:**
- If set, users must enter this key before accessing the demo
- If not set or empty, the demo is publicly accessible
- Useful for controlling access to your Render deployment

### Gladia Settings (UI)

**Basic:**
- **Your Name**: Custom identifier for Speaker 0
- **Show Partial Results**: Enable/disable live updates

**Advanced:**
- **Languages**: 87 language options, multi-select with search
- **Detect Language Per Utterance**: Code switching for multilingual conversations
- **Custom Vocabulary**: Comma-separated words/phrases to boost

### Audio Settings

Configured automatically for optimal Gladia compatibility:
- Sample Rate: 16,000 Hz
- Echo Cancellation: Enabled
- Noise Suppression: Enabled
- Auto Gain Control: Enabled

---

## 🚢 Deployment

### Render

This project is deployed on Render with full WebSocket support for real-time transcription.

#### Why Render?
- ✅ Native WebSocket support (critical for real-time transcription)
- ✅ Free tier with persistent connections
- ✅ Automatic HTTPS (required for microphone access)
- ✅ Simple deployment from GitHub
- ✅ Auto-deploy on push

#### Deploy to Render

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/gladia-realtime-demo.git
git push -u origin main
```

2. **Create Web Service:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   
3. **Configure Service:**
   - **Name:** gladia-realtime-demo
   - **Environment:** Python 3
   - **Region:** Oregon (or closest to you)
   - **Branch:** main
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python app.py`
   - **Plan:** Free

4. **Environment Variables:**
   - Add `GLADIA_API_KEY` = your_api_key_from_gladia_dashboard
   - Add `SECRET_KEY` = generate with `python -c "import secrets; print(secrets.token_hex(32))"`
   - Add `ACCESS_KEY` (optional) = your_custom_access_key_for_demo_protection

5. **Deploy:**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - Your app will be live at: `https://your-service-name.onrender.com`

#### Post-Deployment

- Visit your Render URL
- Grant microphone permissions
- Start recording and verify transcription works
- Monitor usage in Render Dashboard (logs, metrics)
- Monitor API usage in [Gladia Dashboard](https://app.gladia.io/usage)

### Security

**Environment Variables:**
- Never commit `.env` file to Git
- Use Render's environment variables for all secrets
- Rotate API keys regularly

**HTTPS:**
- Render provides automatic HTTPS
- Required for microphone access in browsers

**API Key Safety:**
- Use dedicated API key for this demo
- Monitor usage to prevent abuse
- Set up rate limiting if needed

---

## 📚 API Reference

### Gladia Real-Time API V2

**Official Documentation:** [https://docs.gladia.io/](https://docs.gladia.io/)

**Endpoint:**
```
POST https://api.gladia.io/v2/live
```

**WebSocket:**
```
wss://api.gladia.io/v2/live?token={session_token}
```

**Features Used in This Demo:**
- ✅ Real-time transcription
- ✅ Speaker diarization
- ✅ Partial transcripts
- ✅ Multi-language support
- ✅ Code switching
- ✅ Custom vocabulary
- ✅ Timestamp precision
- ✅ WAV/PCM audio format

**Not Implemented (Available in API):**
- ⚠️ Translation
- ⚠️ Named entity recognition
- ⚠️ Sentiment analysis
- ⚠️ Summarization
- ⚠️ Audio enhancement

### Rate Limits

**Free Tier:**
- 10 hours/month transcription
- Concurrent sessions: 1
- Max audio duration: 60 minutes per session

**Paid Tiers:** Contact Gladia for enterprise pricing

---

## 🛠 Development

### Local Development

```bash
# Activate virtual environment
source venv/bin/activate

# Run with auto-reload
python app.py

# Server runs at http://localhost:8000
# Debug mode enabled (logs all events)
```

### Code Style

**Backend (Python):**
- Type hints on all functions
- Google-style docstrings
- PEP 8 formatting

**Frontend (JavaScript):**
- JSDoc comments on all functions
- Clear variable names
- Modular organization

### Best Practices Implemented

1. **Separation of Concerns**: Backend handles API, frontend handles UI
2. **Error Handling**: Try-catch blocks, user-friendly error messages
3. **Resource Cleanup**: Proper WebSocket and audio stream disposal
4. **Security**: Environment variables, input validation, HTML escaping
5. **Performance**: Efficient audio processing, minimal DOM manipulation
6. **Accessibility**: Semantic HTML, keyboard navigation
7. **Documentation**: Comprehensive inline and API documentation

### Testing Locally

**Microphone Test:**
1. Open browser DevTools (F12)
2. Grant microphone permission
3. Check console for "Connected to server"
4. Speak clearly, watch console logs
5. Verify transcripts appear in UI

**Network Debug:**
```javascript
// In browser console
socket.on('transcript', console.log)  // Log all transcripts
socket.on('error', console.error)     // Log all errors
```

---

## 🐛 Troubleshooting

### Common Issues

**Microphone Not Working:**
- ✅ Browser requires HTTPS or localhost
- ✅ Check browser permissions (lock icon in address bar)
- ✅ Verify microphone is not in use by another application
- ✅ Try different browser (Chrome recommended)

**No Transcription Appearing:**
- ✅ Verify `GLADIA_API_KEY` in `.env` file
- ✅ Check Gladia API status: https://status.gladia.io/
- ✅ Open browser console, look for error messages
- ✅ Ensure stable internet connection
- ✅ Check Gladia account has available quota

**WebSocket Connection Fails:**
- ✅ Check firewall settings
- ✅ Verify Gladia API endpoint is accessible
- ✅ Review server logs: `python app.py`
- ✅ Ensure Flask-SocketIO is installed correctly

**Poor Transcription Quality:**
- ✅ Speak clearly into microphone
- ✅ Reduce background noise
- ✅ Add relevant terms to Custom Vocabulary
- ✅ Select correct language (or use auto-detect)
- ✅ Check microphone quality/positioning

**"Invalid API Key" Error:**
- ✅ Copy key exactly from Gladia dashboard
- ✅ No extra spaces or quotes in `.env` file
- ✅ Restart Flask server after changing `.env`
- ✅ Verify key hasn't expired

### Debug Mode

**Enable Verbose Logging:**

Backend:
```python
# Already enabled in app.py
socketio.run(app, debug=True)
```

Frontend:
```javascript
// In browser console
localStorage.debug = '*'  // Log all Socket.IO events
```

### Browser Compatibility

**Tested Browsers:**
- ✅ Chrome/Edge 80+ (recommended)
- ✅ Firefox 75+
- ✅ Safari 14+
- ✅ Brave 1.20+

**Required Features:**
- WebSocket support
- Web Audio API
- MediaDevices API
- ES6+ JavaScript

### Getting Help

1. Check [Gladia Documentation](https://docs.gladia.io/)
2. Review [Gladia Status Page](https://status.gladia.io/)
3. Open GitHub issue with:
   - Browser and OS version
   - Console error messages
   - Steps to reproduce
4. Contact Gladia support: support@gladia.io

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🙏 Credits

**Built by:** Nelson PROIA 
**Purpose:** Case study demonstration for Gladia Real-Time API V2  
**Powered by:** [Gladia](https://gladia.io/) - Speech-to-Text API

### Acknowledgments

- Gladia team for excellent API documentation
- Shadcn for UI design inspiration
- Flask-SocketIO community for WebSocket support

---

## 🔗 Links

- **Gladia Website:** https://gladia.io/
- **Gladia Dashboard:** https://app.gladia.io/
- **API Documentation:** https://docs.gladia.io/
- **Get API Key:** https://app.gladia.io/
- **Status Page:** https://status.gladia.io/

---

**Last Updated:** October 2025  
**Demo Version:** 1.0.0  
**Gladia API:** V2
