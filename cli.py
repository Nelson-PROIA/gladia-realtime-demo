#!/usr/bin/env python3
"""Minimal CLI for Gladia Real-Time Transcription"""

import json
import os
import shutil
import signal
import struct
import sys
import termios
import time
from threading import Thread
import pyaudio
import requests
import websocket
from dotenv import load_dotenv

load_dotenv()

# Configuration
GLADIA_API_KEY = os.getenv('GLADIA_API_KEY')
GLADIA_API_URL = "https://api.gladia.io/v2/live"
SAMPLE_RATE = 16000
CHUNK_SIZE = 2048

SHOW_PARTIAL_RESULTS = True
LANGUAGES = ["fr"]
CODE_SWITCHING = False
CUSTOM_VOCABULARY = ["Gladia", "API", "transcription", "diarization"]

CLEAR_PARTIAL_LINE = True
ENABLE_VAD = False
VAD_THRESHOLD = 100
DEBUG_MESSAGES = False


def create_session():
    payload = {
        "encoding": "wav/pcm",
        "sample_rate": SAMPLE_RATE,
        "messages_config": {
            "receive_partial_transcripts": SHOW_PARTIAL_RESULTS,
            "receive_final_transcripts": True
        }
    }
    
    if LANGUAGES:
        payload['language_config'] = {'languages': LANGUAGES}
        if CODE_SWITCHING:
            payload['language_config']['code_switching'] = True
    
    if CUSTOM_VOCABULARY:
        payload.setdefault('realtime_processing', {})['custom_vocabulary'] = True
        payload['realtime_processing']['custom_vocabulary_config'] = {'vocabulary': CUSTOM_VOCABULARY}
    
    print("Creating session with payload:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    
    response = requests.post(GLADIA_API_URL, headers={'x-gladia-key': GLADIA_API_KEY, 'Content-Type': 'application/json'}, json=payload)
    response.raise_for_status()
    
    data = response.json()
    print(f"\nSession created: {data['id']}")
    return data['url']


TERMINAL_WIDTH = shutil.get_terminal_size().columns
last_partial_lines = 0

def on_message(ws, message):
    global last_partial_lines
    data = json.loads(message)
    
    if DEBUG_MESSAGES:
        print(f"\n{'-'*60}\n{json.dumps(data, indent=2, ensure_ascii=False)}\n{'-'*60}")
    
    if data.get('type') == 'transcript':
        utterance = data.get('data', {}).get('utterance', {})
        text = utterance.get('text', '').strip()
        if not text:
            return
        
        speaker = utterance.get('speaker', 0)
        is_final = data.get('data', {}).get('is_final', False)
        start = utterance.get('start', 0)
        end = utterance.get('end', 0)
        
        timestamp = f"[{start:.2f}s - {end:.2f}s]"
        status = "Final" if is_final else "Partial"
        formatted = f"{timestamp} [Speaker {speaker}] [{status}] - {text}"
        
        if is_final:
            if DEBUG_MESSAGES:
                sys.stdout.write('\n')
            elif CLEAR_PARTIAL_LINE:
                for _ in range(last_partial_lines):
                    sys.stdout.write('\033[A\033[K')
                sys.stdout.write('\r\033[K')
                last_partial_lines = 0
            sys.stdout.write(f"{formatted}\n")
            sys.stdout.flush()
        elif SHOW_PARTIAL_RESULTS:
            if DEBUG_MESSAGES:
                print()
                print(formatted)
            elif CLEAR_PARTIAL_LINE:
                for _ in range(last_partial_lines):
                    sys.stdout.write('\033[A\033[K')
                sys.stdout.write('\r\033[K')
                sys.stdout.write(formatted)
                last_partial_lines = len(formatted) // TERMINAL_WIDTH
            else:
                print(formatted)
            sys.stdout.flush()


def should_send_audio(audio_data):
    if not ENABLE_VAD:
        return True

    samples = struct.unpack(f'{len(audio_data)//2}h', audio_data)
    rms = sum(abs(s) for s in samples) / len(samples)
    
    return rms > VAD_THRESHOLD


def run():
    if not GLADIA_API_KEY:
        print("ERROR: GLADIA_API_KEY not found")
        return
    
    # Disable Ctrl+C echo
    try:
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        new_settings = old_settings[:]
        new_settings[3] &= ~termios.ECHOCTL
        termios.tcsetattr(fd, termios.TCSADRAIN, new_settings)
    except:
        old_settings = None
    
    signal.signal(signal.SIGINT, lambda s, f: (print("\nStopping..."), sys.exit(0)))
    
    print("\n" + "=" * 60)
    print("Gladia Real-Time Transcription")
    print("=" * 60 + "\n")
    
    ws_url = create_session()
    
    audio = pyaudio.PyAudio()
    stream = audio.open(format=pyaudio.paInt16, channels=1, rate=SAMPLE_RATE, input=True, frames_per_buffer=CHUNK_SIZE)
    
    print("\nMicrophone ready")
    
    ws = websocket.WebSocketApp(ws_url, on_open=lambda ws: print("Connected. Start speaking!\n" + "=" * 60 + "\n"), on_message=on_message, on_error=lambda ws, e: None, on_close=lambda ws, c, m: None)
    
    Thread(target=ws.run_forever, daemon=True).start()
    time.sleep(1)
    
    if ENABLE_VAD:
        print(f"VAD enabled (threshold: {VAD_THRESHOLD})")
        if not DEBUG_MESSAGES:
            print()
    
    try:
        while True:
            data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            if ws.sock and ws.sock.connected and should_send_audio(data):
                ws.send(data, opcode=websocket.ABNF.OPCODE_BINARY)
    except KeyboardInterrupt:
        pass
    finally:
        if ws.sock and ws.sock.connected:
            try:
                ws.send(json.dumps({"type": "stop_recording"}))
                time.sleep(0.2)
            except:
                pass
        
        stream.stop_stream()
        stream.close()
        audio.terminate()
        ws.close()
        
        if old_settings:
            try:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
            except:
                pass
        
        print("\n" + "=" * 60)
        print("Session terminated")
        print("=" * 60)


if __name__ == '__main__':
    try:
        run()
    except Exception as e:
        print(f"Error: {e}")
