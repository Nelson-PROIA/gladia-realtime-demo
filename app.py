"""
Gladia Real-Time Transcription Demo - Flask Backend

This application demonstrates real-time speech transcription using Gladia's Real-Time API V2.
It provides a WebSocket-based architecture that bridges browser audio capture with Gladia's
transcription service, enabling live speech-to-text with speaker diarization.

Architecture:
    Browser (MediaRecorder) → Socket.IO → Flask Server → Gladia WebSocket API → Browser (UI)
    
    1. Browser captures microphone audio via Web Audio API
    2. Audio is resampled to 16kHz PCM and sent via Socket.IO as base64
    3. Flask server forwards binary audio to Gladia's WebSocket
    4. Gladia returns transcript messages with speaker diarization
    5. Flask forwards transcripts back to browser for display

Key Components:
    - Flask: HTTP server and static file serving
    - Flask-SocketIO: Bidirectional WebSocket communication with browser
    - websocket-client: Connection to Gladia's Real-Time API V2
    - Threading: Async handling of WebSocket connections per client

Gladia API Integration:
    - Session Initialization: POST to /v2/live endpoint
    - Audio Streaming: Binary WebSocket frames (WAV/PCM, 16kHz)
    - Real-time Results: Partial and final transcripts with timestamps
    - Speaker Diarization: Automatic speaker identification
"""

from typing import Dict, Any, Optional, List
from flask import Flask, send_from_directory, request, Response, session, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv
import os
import json
from threading import Thread
import base64
import requests
import websocket

load_dotenv()

# Flask application setup
app = Flask(__name__, static_folder='static', template_folder='static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'secret_key')
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour session
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Gladia API configuration
GLADIA_API_KEY: Optional[str] = os.getenv('GLADIA_API_KEY')
GLADIA_API_URL: str = "https://api.gladia.io/v2/live"

# Access control configuration
ACCESS_KEY: Optional[str] = os.getenv('ACCESS_KEY')

# Store active WebSocket connections and session data per client
active_sessions: Dict[str, Dict[str, Any]] = {}


@app.route('/')
def index() -> Response:
    """
    Serve the access control page or main application.
    
    If ACCESS_KEY is configured, users must authenticate first.
    Otherwise, serve the main application directly.
    
    Returns:
        Response: Login page or main application HTML
    """
    if not ACCESS_KEY:
        return send_from_directory('static', 'index.html')
    
    if session.get('authenticated'):
        return send_from_directory('static', 'index.html')
    
    return send_from_directory('static', 'login.html')


@app.route('/verify-access', methods=['POST'])
def verify_access() -> Response:
    """
    Verify the provided access key.
    
    Returns:
        Response: JSON with success status
    """
    data = request.get_json()
    provided_key = data.get('key', '')
    
    if ACCESS_KEY and provided_key == ACCESS_KEY:
        session.permanent = True
        session['authenticated'] = True
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Invalid access key'}), 401


@app.route('/favicon.ico')
def favicon() -> Response:
    """
    Serve the favicon.
    
    Returns:
        Response: The Gladia logo as favicon
    """
    return send_from_directory('assets', 'gladia-logo.ico')


@app.route('/logo.png')
def logo() -> Response:
    """
    Serve the Gladia logo image.
    
    Returns:
        Response: The Gladia logo PNG file
    """
    return send_from_directory('assets', 'gladia-logo.png')


@socketio.on('connect')
def handle_connect(auth: Optional[Dict[str, Any]] = None) -> None:
    """
    Handle client WebSocket connection.
    
    Called when a browser client establishes a Socket.IO connection.
    Each client gets a unique session ID (request.sid) used to manage
    their individual Gladia WebSocket connection.
    
    Args:
        auth: Optional authentication data (not used in this demo)
    """
    print('='*50)
    print(f'CLIENT CONNECTED: {request.sid}')
    print('='*50)


@socketio.on('disconnect')
def handle_disconnect() -> None:
    """
    Handle client WebSocket disconnection.
    
    Cleans up the client's Gladia WebSocket connection and removes
    session data when the browser disconnects. This prevents resource
    leaks and ensures proper cleanup.
    """
    try:
        print(f'Client disconnected: {request.sid}')
        
        if request.sid in active_sessions:
            session_data = active_sessions[request.sid]
            ws = session_data.get('ws')
            if ws:
                ws.close()
            del active_sessions[request.sid]
    except Exception as e:
        print(f'Error during disconnect cleanup: {e}')


@socketio.on('start_stream')
def handle_start_stream(config: Optional[Dict[str, Any]] = None) -> None:
    """
    Initialize a new Gladia Real-Time transcription session.
    
    This is the entry point for starting a transcription session. It receives
    configuration from the browser, stores it for the session, and initiates
    the Gladia API connection in a background thread.
    
    Args:
        config: Configuration dictionary containing:
            - speaker_name (str): Optional custom name for Speaker 0
            - partial_results (bool): Enable/disable partial transcripts
            - languages (List[str]): Language codes (empty = auto-detect)
            - code_switching (bool): Enable per-utterance language detection
            - custom_vocabulary (List[str]): Words to boost recognition
    
    Emits:
        stream_started: Signal to browser that initialization has begun
    """
    client_sid: str = request.sid
    print('='*50)
    print(f'START STREAM CALLED FOR: {client_sid}')
    print('='*50)
    
    if config is None:
        config = {}
    
    speaker_name: str = config.get('speaker_name', '')
    partial_results: bool = config.get('partial_results', True)
    languages: List[str] = config.get('languages', [])
    code_switching: bool = config.get('code_switching', False)
    custom_vocabulary: List[str] = config.get('custom_vocabulary', [])
    
    print(f'Config: speaker_name={speaker_name}, partial_results={partial_results}, '
          f'languages={languages}, code_switching={code_switching}')
    
    # Store config in session for later use (e.g., speaker name display)
    if client_sid not in active_sessions:
        active_sessions[client_sid] = {}
    active_sessions[client_sid]['config'] = {
        'speaker_name': speaker_name,
        'partial_results': partial_results,
        'languages': languages,
        'code_switching': code_switching,
        'custom_vocabulary': custom_vocabulary
    }
    
    # Start Gladia session in a separate thread to avoid blocking
    thread = Thread(
        target=start_gladia_session,
        args=(client_sid, partial_results, languages, code_switching, custom_vocabulary)
    )
    thread.daemon = True
    thread.start()
    
    emit('stream_started', {'status': 'ready'})


def start_gladia_session(
    client_sid: str,
    partial_results: bool = True,
    languages: Optional[List[str]] = None,
    code_switching: bool = False,
    custom_vocabulary: Optional[List[str]] = None
) -> None:
    """
    Initialize a Gladia Real-Time API session via HTTP POST.
    
    This function implements the Gladia Real-Time API V2 session initialization flow:
    1. Construct the configuration payload
    2. POST to /v2/live endpoint to create a session
    3. Extract the WebSocket URL from the response
    4. Connect to the WebSocket for audio streaming
    
    Gladia API Flow:
        POST /v2/live → {id, url, created_at}
        Connect to WebSocket URL → Start streaming binary audio
        Receive transcript messages → Forward to browser
    
    Args:
        client_sid: Unique client session identifier
        partial_results: If True, receive partial transcripts as user speaks
        languages: List of ISO 639-1 language codes (e.g., ['en', 'fr']).
                  Empty list enables automatic language detection.
        code_switching: If True, detect language per utterance (requires multiple languages)
        custom_vocabulary: List of words/phrases to boost recognition accuracy
    
    Gladia API Payload Structure:
        {
            "encoding": "wav/pcm",           # Audio format
            "sample_rate": 16000,            # Required sample rate
            "language_config": {             # Optional
                "languages": ["en", "fr"],   # Empty = auto-detect
                "code_switching": true       # Per-utterance detection
            },
            "messages_config": {
                "receive_partial_transcripts": true,
                "receive_final_transcripts": true
            },
            "realtime_processing": {         # Optional
                "custom_vocabulary": true,
                "custom_vocabulary_config": {
                    "vocabulary": ["Gladia", "API", ...]
                }
            }
        }
    
    Raises:
        requests.exceptions.HTTPError: If Gladia API returns an error
        Exception: For other connection or processing errors
    """
    if languages is None:
        languages = []
    if custom_vocabulary is None:
        custom_vocabulary = []
    
    # Prepare API request headers
    headers = {
        'x-gladia-key': GLADIA_API_KEY,
        'Content-Type': 'application/json'
    }
    
    # Build language configuration
    language_config: Dict[str, Any] = {}
    if languages and len(languages) > 0:
        language_config['languages'] = languages
    if code_switching:
        language_config['code_switching'] = True
    
    # Build base payload with required audio format and message config
    payload: Dict[str, Any] = {
        "encoding": "wav/pcm",
        "sample_rate": 16000,
        "messages_config": {
            "receive_partial_transcripts": partial_results,
            "receive_final_transcripts": True
        }
    }
    
    # Add optional language configuration
    if language_config:
        payload['language_config'] = language_config
    
    # Add optional custom vocabulary for improved recognition
    if custom_vocabulary and len(custom_vocabulary) > 0:
        payload['realtime_processing'] = {
            "custom_vocabulary": True,
            "custom_vocabulary_config": {
                "vocabulary": custom_vocabulary
            }
        }
    
    try:
        print(f'Creating Gladia session...')
        
        # POST to Gladia API to create session
        response = requests.post(GLADIA_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        # Extract WebSocket URL and session ID from response
        session_data: Dict[str, Any] = response.json()
        ws_url: str = session_data.get('url')
        session_id: str = session_data.get('id')
        
        print(f'Session created: {session_id}')
        
        # Connect to the WebSocket for audio streaming
        connect_to_gladia_websocket(client_sid, ws_url)
        
    except requests.exceptions.HTTPError as e:
        print(f'HTTP Error creating Gladia session: {e}')
        print(f'Response: {e.response.text}')
        socketio.emit(
            'error',
            {'message': f'Failed to create session: {e.response.status_code} - {e.response.text}'},
            room=client_sid
        )
    except Exception as e:
        print(f'Error creating Gladia session: {e}')
        socketio.emit(
            'error',
            {'message': f'Failed to create session: {str(e)}'},
            room=client_sid
        )


def connect_to_gladia_websocket(client_sid: str, ws_url: str) -> None:
    """
    Establish WebSocket connection to Gladia Real-Time API.
    
    This function creates a persistent WebSocket connection to Gladia's API
    for bidirectional audio streaming and transcript reception. The connection
    remains open for the duration of the transcription session.
    
    Audio Streaming:
        - Browser sends base64 encoded audio chunks via Socket.IO
        - Flask decodes and forwards as binary WebSocket frames to Gladia
        - Format: WAV/PCM, 16kHz, 16-bit, mono
        - Frame type: Binary (opcode 0x2)
    
    Transcript Reception:
        Gladia sends JSON messages with structure:
        {
            "type": "transcript",
            "data": {
                "is_final": bool,
                "utterance": {
                    "text": str,
                    "speaker": int,
                    "start": float,  # Seconds from session start
                    "end": float,
                    "confidence": float,
                    "words": [...]
                }
            }
        }
    
    Message Types:
        - transcript: Partial or final transcription results
        - speech_start/speech_end: Voice activity detection events
        - error: API errors or warnings
    
    Args:
        client_sid: Unique client session identifier for routing messages
        ws_url: Dynamic WebSocket URL obtained from session initialization
    
    WebSocket Lifecycle:
        on_open → Ready to receive audio
        on_message → Process transcript results
        on_error → Handle connection errors
        on_close → Clean up session
    """
    
    def on_message(ws: websocket.WebSocketApp, message: str) -> None:
        """
        Handle incoming messages from Gladia WebSocket.
        
        Processes transcript messages and forwards them to the browser client.
        Extracts speaker information, text, timing, and applies custom speaker
        names if configured.
        
        Args:
            ws: WebSocket application instance
            message: JSON string containing transcript or event data
        """
        try:
            data: Dict[str, Any] = json.loads(message)
            
            # Handle transcript messages (partial or final)
            if data.get('type') == 'transcript':
                utterance: Dict[str, Any] = data.get('data', {}).get('utterance', {})
                speaker: int = utterance.get('speaker', 0)
                text: str = utterance.get('text', '')
                is_final: bool = data.get('data', {}).get('is_final', False)
                start_time: Optional[float] = utterance.get('start', None)
                end_time: Optional[float] = utterance.get('end', None)
                
                if text:
                    print(f'Transcript [{speaker}]: {text} (final={is_final})')
                    
                    # Retrieve custom speaker name from session config
                    display_name: Optional[str] = None
                    if client_sid in active_sessions:
                        config: Dict[str, Any] = active_sessions[client_sid].get('config', {})
                        stored_name: str = config.get('speaker_name', '')
                        if speaker == 0 and stored_name:
                            display_name = stored_name
                    
                    # Forward transcript to browser via Socket.IO
                    socketio.emit('transcript', {
                        'speaker': speaker,
                        'text': text,
                        'is_final': is_final,
                        'speaker_name': display_name,
                        'timestamp': start_time,
                        'end_time': end_time
                    }, room=client_sid)
                    
        except json.JSONDecodeError as e:
            print(f'Error parsing message: {e}')
        except Exception as e:
            print(f'Error in on_message: {e}')
    
    def on_error(ws: websocket.WebSocketApp, error: Exception) -> None:
        """Handle WebSocket errors."""
        print(f'WebSocket error: {error}')
        socketio.emit('error', {'message': str(error)}, room=client_sid)
    
    def on_close(
        ws: websocket.WebSocketApp,
        close_status_code: Optional[int],
        close_msg: Optional[str]
    ) -> None:
        """Clean up session on WebSocket closure."""
        print(f'WebSocket closed: {close_status_code} - {close_msg}')
        if client_sid in active_sessions:
            del active_sessions[client_sid]
    
    def on_open(ws: websocket.WebSocketApp) -> None:
        """Confirm WebSocket connection established."""
        print('Connected to Gladia WebSocket')
    
    # Create WebSocket connection with event handlers
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    
    # Store WebSocket in session (preserve existing config)
    if client_sid in active_sessions:
        active_sessions[client_sid]['ws'] = ws
    else:
        active_sessions[client_sid] = {'ws': ws}
    
    # Run WebSocket (blocking call - runs in background thread)
    ws.run_forever()


@socketio.on('audio_data')
def handle_audio_data(data: Dict[str, str]) -> None:
    """
    Receive audio chunks from browser and forward to Gladia.
    
    This function is called repeatedly as the browser captures audio.
    It converts base64 encoded audio to binary and sends it to Gladia's
    WebSocket as binary frames.
    
    Audio Processing Flow:
        1. Browser: MediaRecorder captures audio → resamples to 16kHz
        2. Browser: Converts to base64 string
        3. Browser: Sends via Socket.IO emit('audio_data', {audio: base64_string})
        4. Flask: Decodes base64 → binary bytes
        5. Flask: Forwards to Gladia WebSocket as binary frame (opcode 0x2)
        6. Gladia: Processes audio and returns transcripts
    
    Args:
        data: Dictionary containing 'audio' key with base64 encoded audio data
    
    Audio Format Expected:
        - Encoding: WAV/PCM
        - Sample Rate: 16kHz
        - Bit Depth: 16-bit
        - Channels: Mono (1)
        - Encoding: Base64 string in data['audio']
    """
    client_sid: str = request.sid
    
    if client_sid in active_sessions:
        ws = active_sessions[client_sid].get('ws')
        if ws and ws.sock and ws.sock.connected:
            try:
                # Decode base64 audio to binary bytes
                audio_bytes: bytes = base64.b64decode(data['audio'])
                
                # Send binary audio data to Gladia WebSocket
                # opcode 0x2 specifies binary frame (vs text frame 0x1)
                ws.send(audio_bytes, opcode=0x2)
            except Exception as e:
                print(f'Error sending audio: {e}')
                emit('error', {'message': f'Error sending audio: {str(e)}'})
    else:
        print(f'No active session for {client_sid}')


@socketio.on('stop_stream')
def handle_stop_stream() -> None:
    """
    Stop the transcription session and clean up resources.
    
    Closes the Gladia WebSocket connection and removes session data.
    This is called when the user clicks the stop button in the UI.
    
    Emits:
        stream_stopped: Signal to browser that session has ended
    """
    client_sid: str = request.sid
    
    if client_sid in active_sessions:
        ws = active_sessions[client_sid].get('ws')
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        try:
            del active_sessions[client_sid]
        except KeyError:
            pass
    
    emit('stream_stopped', {'status': 'stopped'})


if __name__ == '__main__':
    # Validate API key before starting server
    if not GLADIA_API_KEY:
        print('ERROR: GLADIA_API_KEY not found in environment variables')
        print('Please create a .env file with your API key')
        print('Get your API key from: https://app.gladia.io/')
        exit(1)
    
    # Get port from environment (Render sets PORT) or default to 8000 for local dev
    port = int(os.getenv('PORT', 8000))
    debug = os.getenv('FLASK_ENV') != 'production'
    
    print('Starting Gladia Real-Time Transcription Demo...')
    print(f'Server will run on port {port}')
    
    if debug:
        print('Running in DEBUG mode')
        print(f'Open http://localhost:{port} in your browser')
        socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)
    else:
        print('Running in PRODUCTION mode')
        socketio.run(app, host='0.0.0.0', port=port, debug=False)
