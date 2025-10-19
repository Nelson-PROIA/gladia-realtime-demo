/**
 * Gladia Real-Time Transcription Demo - Frontend Client
 * 
 * This client-side application captures microphone audio, processes it for Gladia's API,
 * and displays real-time transcription results with speaker diarization.
 * 
 * Architecture:
 *   Browser Audio Capture → Audio Processing → Socket.IO → Flask → Gladia API
 *   
 * Audio Processing Pipeline:
 *   1. MediaDevices API: Request microphone access
 *   2. AudioContext: Create audio processing context at 16kHz
 *   3. ScriptProcessor: Process audio in 4096-sample chunks
 *   4. Float32 → Int16: Convert audio format
 *   5. WAV Encoding: Add WAV headers to PCM data
 *   6. Base64 Encoding: Convert binary to string for Socket.IO
 *   7. Socket.IO: Send to Flask backend
 * 
 * Communication Flow:
 *   - Socket.IO connects to Flask backend
 *   - Emits 'start_stream' with Gladia configuration
 *   - Continuously emits 'audio_data' chunks
 *   - Receives 'transcript' events with results
 *   - Displays partial and final transcripts in real-time
 * 
 * @requires socket.io-client - For WebSocket communication with Flask
 */

// ============================================================================
// Global State
// ============================================================================

/** @type {SocketIOClient.Socket|null} Socket.IO connection to Flask backend */
let socket = null

/** @type {Object|null} Media recorder object containing processor, source, and stream */
let mediaRecorder = null

/** @type {AudioContext|null} Web Audio API context for audio processing */
let audioContext = null

/** @type {boolean} Current recording state */
let isRecording = false

/** @type {boolean} Whether audio sending is paused (e.g., during stop confirmation) */
let isPaused = false

/** @type {string} User's custom speaker name for Speaker 0 */
let speakerName = ''

/** @type {boolean} Whether to display partial transcripts */
let showPartialResults = true

/** @type {Array<Object>} Array of finalized transcripts for export */
let transcriptData = []

/** @type {Array<string>} Array of selected language codes (ISO 639-1) */
let selectedLanguages = []

// ============================================================================
// DOM Element References
// ============================================================================

const container = document.querySelector('.container')
const startBtn = document.getElementById('start-btn')
const controlBtn = document.getElementById('control-btn')
const exportBtn = document.getElementById('export-btn')
const transcriptPanel = document.getElementById('transcript-panel')
const transcriptContent = document.getElementById('transcript')
const recordingIndicator = document.getElementById('recording-indicator')
const speakerNameInput = document.getElementById('speaker-name')
const partialResultsCheckbox = document.getElementById('partial-results')
const toggleAdvancedBtn = document.getElementById('toggle-advanced')
const advancedSettings = document.getElementById('advanced-settings')
const languageSelect = document.getElementById('language-select')
const languageSearch = document.getElementById('language-search')
const codeSwitchingCheckbox = document.getElementById('code-switching')
const customVocabularyTextarea = document.getElementById('custom-vocabulary')
const langCount = document.getElementById('lang-count')
const clearLanguagesBtn = document.getElementById('clear-languages')
const stopModal = document.getElementById('stop-modal')
const cancelStopBtn = document.getElementById('cancel-stop')
const confirmStopBtn = document.getElementById('confirm-stop')
const restartModal = document.getElementById('restart-modal')
const cancelRestartBtn = document.getElementById('cancel-restart')
const confirmRestartBtn = document.getElementById('confirm-restart')

// ============================================================================
// Event Listeners
// ============================================================================

startBtn.addEventListener('click', startStreaming)
controlBtn.addEventListener('click', handleControlClick)
exportBtn.addEventListener('click', exportTranscript)
toggleAdvancedBtn.addEventListener('click', toggleAdvanced)
languageSelect.addEventListener('change', updateLanguageCount)
languageSelect.addEventListener('click', handleLanguageClick)
languageSearch.addEventListener('input', filterLanguages)
clearLanguagesBtn.addEventListener('click', clearLanguages)
customVocabularyTextarea.addEventListener('blur', validateCustomVocabulary)
cancelStopBtn.addEventListener('click', closeModal)
confirmStopBtn.addEventListener('click', confirmStop)
cancelRestartBtn.addEventListener('click', closeModal)
confirmRestartBtn.addEventListener('click', confirmRestart)

// ============================================================================
// Language Selection Functions
// ============================================================================

/**
 * Update the language count display based on selected languages.
 * Shows "(auto-detect)" when no languages selected, or count of selected languages.
 * 
 * @returns {void}
 */
function updateLanguageCount() {
    const count = selectedLanguages.length
    if (count === 0) {
        langCount.textContent = '(auto-detect)'
        clearLanguagesBtn.disabled = true
    } else if (count === 1) {
        langCount.textContent = '(1 selected)'
        clearLanguagesBtn.disabled = false
    } else {
        langCount.textContent = `(${count} selected)`
        clearLanguagesBtn.disabled = false
    }
}

/**
 * Update the visual selection state of language options to match selectedLanguages array.
 * 
 * @returns {void}
 */
function updateLanguageDisplay() {
    Array.from(languageSelect.options).forEach(option => {
        if (selectedLanguages.includes(option.value)) {
            option.selected = true
            option.setAttribute('selected', 'selected')
        } else {
            option.selected = false
            option.removeAttribute('selected')
        }
    })
    updateLanguageCount()
}

/**
 * Clear all language selections (enables auto-detect mode).
 * 
 * @returns {void}
 */
function clearLanguages() {
    selectedLanguages = []
    updateLanguageDisplay()
}

/**
 * Handle language option clicks with custom multi-select behavior.
 * Single click selects only that language, Ctrl/Cmd+click toggles selection.
 * 
 * @param {MouseEvent} event - Click event on language select element
 * @returns {void}
 */
function handleLanguageClick(event) {
    event.preventDefault()
    
    const clickedOption = event.target
    if (clickedOption.tagName !== 'OPTION') return
    
    const value = clickedOption.value
    
    if (event.ctrlKey || event.metaKey) {
        // Multi-select mode: toggle the option
        if (selectedLanguages.includes(value)) {
            selectedLanguages = selectedLanguages.filter(lang => lang !== value)
        } else {
            selectedLanguages.push(value)
        }
    } else {
        // Single-select mode: clear all and select only this one
        selectedLanguages = [value]
    }
    
    // Immediately update the visual state
    Array.from(languageSelect.options).forEach(option => {
        if (selectedLanguages.includes(option.value)) {
            option.selected = true
            option.setAttribute('selected', 'selected')
        } else {
            option.selected = false
            option.removeAttribute('selected')
        }
    })
    
    updateLanguageCount()
}

/**
 * Filter language options based on search input.
 * 
 * @returns {void}
 */
function filterLanguages() {
    const searchTerm = languageSearch.value.toLowerCase()
    const options = Array.from(languageSelect.options)
    
    options.forEach(option => {
        const languageName = option.textContent.toLowerCase()
        if (languageName.includes(searchTerm)) {
            option.style.display = 'block'
        } else {
            option.style.display = 'none'
        }
    })
}

/**
 * Validate and clean custom vocabulary input.
 * Removes invalid characters and formats as comma-separated list.
 * 
 * @returns {void}
 */
function validateCustomVocabulary() {
    const value = customVocabularyTextarea.value
    if (!value.trim()) return
    
    const words = value
        .split(',')
        .map(word => word.trim())
        .filter(word => word.length > 0)
        .filter(word => /^[\w\s'-]+$/.test(word))
    
    customVocabularyTextarea.value = words.join(', ')
}

// Initialize selectedLanguages from HTML on page load
selectedLanguages = Array.from(languageSelect.options)
    .filter(option => option.selected || option.hasAttribute('selected'))
    .map(option => option.value)

updateLanguageDisplay()

// ============================================================================
// UI Control Functions
// ============================================================================

/**
 * Toggle advanced settings panel visibility.
 * 
 * @returns {void}
 */
function toggleAdvanced() {
    advancedSettings.classList.toggle('active')
    toggleAdvancedBtn.classList.toggle('active')
}

/**
 * Handle control button click (Stop or Restart).
 * 
 * @returns {void}
 */
function handleControlClick() {
    if (isRecording) {
        showStopModal()
    } else {
        showRestartModal()
    }
}

/**
 * Show confirmation modal for stop action.
 * Pauses audio sending while modal is open.
 * 
 * @returns {void}
 */
function showStopModal() {
    isPaused = true
    stopModal.classList.add('active')
}

/**
 * Show confirmation modal for restart action.
 * 
 * @returns {void}
 */
function showRestartModal() {
    restartModal.classList.add('active')
}

/**
 * Close any active modal.
 * Resumes audio sending if stop modal was canceled.
 * 
 * @returns {void}
 */
function closeModal() {
    const wasStopModalOpen = stopModal.classList.contains('active')
    stopModal.classList.remove('active')
    restartModal.classList.remove('active')
    
    // Resume audio if stop was canceled
    if (wasStopModalOpen && isRecording) {
        isPaused = false
    }
}

/**
 * Confirm stop action and end recording session.
 * 
 * @returns {void}
 */
function confirmStop() {
    closeModal()
    stopStreaming()
}

/**
 * Confirm restart action and begin new session.
 * 
 * @returns {void}
 */
function confirmRestart() {
    closeModal()
    restartStreaming()
}

// ============================================================================
// Core Streaming Functions
// ============================================================================

/**
 * Initialize and start the audio streaming session.
 * 
 * This function orchestrates the complete setup for real-time transcription:
 * 1. Request microphone access with specific audio constraints
 * 2. Establish Socket.IO connection to Flask backend
 * 3. Configure Gladia session parameters
 * 4. Set up event handlers for transcripts and errors
 * 5. Begin audio capture and processing
 * 
 * Gladia Configuration Sent:
 * - speaker_name: Custom name for Speaker 0 identification
 * - partial_results: Enable real-time partial transcripts
 * - languages: Array of ISO 639-1 codes (empty = auto-detect)
 * - code_switching: Per-utterance language detection
 * - custom_vocabulary: Words to boost in recognition
 * 
 * @async
 * @returns {Promise<void>}
 */
async function startStreaming() {
    if (isRecording) return
    
    speakerName = speakerNameInput.value.trim()
    showPartialResults = partialResultsCheckbox.checked
    
    const codeSwitching = codeSwitchingCheckbox.checked
    const customVocabulary = customVocabularyTextarea.value
        .split(',')
        .map(word => word.trim())
        .filter(word => word.length > 0)
    
    try {
        // Request microphone access with Gladia's required audio format
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000  // Gladia requires 16kHz
            } 
        })
        
        // Establish Socket.IO connection
        socket = io()
        
        socket.on('connect', () => {
            console.log('Connected to server')
            // Send Gladia configuration to backend
            socket.emit('start_stream', {
                speaker_name: speakerName,
                partial_results: showPartialResults,
                languages: selectedLanguages,
                code_switching: codeSwitching,
                custom_vocabulary: customVocabulary
            })
            console.log('Emitted start_stream event with config')
        })
        
        socket.on('stream_started', (data) => {
            console.log('Stream started:', data)
            startRecording(stream)
        })
        
        socket.on('transcript', (data) => {
            console.log('Transcript received:', data)
            displayTranscript(data)
        })
        
        socket.on('error', (data) => {
            console.error('Error:', data)
            alert('Error: ' + data.message)
        })
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server')
        })
        
        container.classList.add('recording')
        startBtn.classList.add('hidden')
        isRecording = true
        
    } catch (err) {
        console.error('Error accessing microphone:', err)
        alert('Could not access microphone. Please grant permission and try again.')
    }
}

/**
 * Start audio capture and processing pipeline.
 * 
 * Audio Processing Details:
 * 1. Creates AudioContext at 16kHz (Gladia's required sample rate)
 * 2. Creates MediaStreamSource from microphone
 * 3. Creates ScriptProcessor for real-time audio processing
 * 4. Processes audio in 4096-sample chunks (~256ms at 16kHz)
 * 5. Converts Float32 PCM to Int16 PCM
 * 6. Adds WAV headers to create valid audio format
 * 7. Encodes as base64 for Socket.IO transmission
 * 8. Emits to backend which forwards to Gladia
 * 
 * @param {MediaStream} stream - Microphone audio stream
 * @returns {void}
 */
function startRecording(stream) {
    audioContext = new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    source.connect(processor)
    processor.connect(audioContext.destination)
    
    processor.onaudioprocess = (e) => {
        if (!isRecording || isPaused) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        const pcmData = convertFloat32ToInt16(inputData)
        const wavData = createWavBuffer(pcmData, 16000)
        const base64Audio = arrayBufferToBase64(wavData)
        
        if (socket && socket.connected) {
            socket.emit('audio_data', { audio: base64Audio })
        }
    }
    
    mediaRecorder = { processor, source, stream }
}

/**
 * Convert Float32 audio samples to Int16 PCM format.
 * Required for WAV file format and Gladia API compatibility.
 * 
 * @param {Float32Array} float32Array - Audio samples in range [-1.0, 1.0]
 * @returns {Int16Array} Audio samples in range [-32768, 32767]
 */
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]))
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return int16Array
}

/**
 * Create WAV file buffer from PCM audio samples.
 * Adds proper WAV headers to raw PCM data for audio format compliance.
 * 
 * WAV Format:
 * - RIFF header (12 bytes)
 * - fmt chunk (24 bytes): format specifications
 * - data chunk (8 bytes + audio data)
 * 
 * @param {Int16Array} samples - PCM audio samples
 * @param {number} sampleRate - Sample rate in Hz (16000 for Gladia)
 * @returns {ArrayBuffer} Complete WAV file buffer
 */
function createWavBuffer(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i))
        }
    }
    
    // RIFF header
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(8, 'WAVE')
    
    // fmt chunk
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)          // Chunk size
    view.setUint16(20, 1, true)           // Audio format (PCM)
    view.setUint16(22, 1, true)           // Number of channels (mono)
    view.setUint32(24, sampleRate, true)  // Sample rate
    view.setUint32(28, sampleRate * 2, true)  // Byte rate
    view.setUint16(32, 2, true)           // Block align
    view.setUint16(34, 16, true)          // Bits per sample
    
    // data chunk
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    
    // Write PCM samples
    const offset = 44
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(offset + i * 2, samples[i], true)
    }
    
    return buffer
}

/**
 * Convert ArrayBuffer to base64 string for Socket.IO transmission.
 * 
 * @param {ArrayBuffer} buffer - Binary audio data
 * @returns {string} Base64 encoded string
 */
function arrayBufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

// ============================================================================
// Transcript Display Functions
// ============================================================================

/**
 * Display transcript results in the UI.
 * 
 * Handles both partial and final transcripts:
 * - Partial: Updates existing partial element or creates new one
 * - Final: Converts partial to final or creates new element
 * - Final transcripts are stored in transcriptData for export
 * 
 * Transcript Data Structure:
 * {
 *   speaker: int,           // Speaker ID from diarization
 *   text: string,          // Transcribed text
 *   is_final: boolean,     // Partial or final transcript
 *   speaker_name: string,  // Custom name or "Speaker N"
 *   timestamp: float,      // Start time in seconds
 *   end_time: float        // End time in seconds
 * }
 * 
 * @param {Object} data - Transcript data from Gladia via backend
 * @param {number} data.speaker - Speaker identifier (0, 1, 2, ...)
 * @param {string} data.text - Transcribed text
 * @param {boolean} data.is_final - Whether this is the final version
 * @param {string} [data.speaker_name] - Custom speaker name
 * @param {number} [data.timestamp] - Start time in seconds
 * @param {number} [data.end_time] - End time in seconds
 * @returns {void}
 */
function displayTranscript(data) {
    const { speaker, text, is_final, speaker_name, timestamp, end_time } = data
    
    if (!text || text.trim() === '') return
    
    if (!showPartialResults && !is_final) return
    
    // Store final transcripts for export
    if (is_final) {
        transcriptData.push({
            speaker: speaker,
            speaker_name: speaker_name || `Speaker ${speaker}`,
            text: text,
            timestamp: timestamp,
            end_time: end_time
        })
    }
    
    const existingPartial = transcriptContent.querySelector('.partial')
    
    const displayName = speaker_name || `Speaker ${speaker}`
    const formattedTime = formatTimestamp(timestamp, end_time)
    
    if (is_final) {
        if (existingPartial) {
            // Convert partial to final without re-animating
            existingPartial.classList.remove('partial')
            existingPartial.querySelector('.transcript-text').textContent = text
            existingPartial.querySelector('.speaker-label').textContent = displayName
            if (formattedTime && existingPartial.querySelector('.timestamp')) {
                existingPartial.querySelector('.timestamp').textContent = formattedTime
            }
        } else {
            // Create new final message at top
            const line = document.createElement('div')
            line.className = `transcript-line speaker-${speaker}`
            line.innerHTML = `
                <div class="transcript-header">
                    <span class="speaker-label">${escapeHtml(displayName)}</span>
                    ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
                </div>
                <span class="transcript-text">${escapeHtml(text)}</span>
            `
            transcriptContent.insertBefore(line, transcriptContent.firstChild)
        }
    }
    
    if (!is_final && showPartialResults) {
        if (existingPartial) {
            existingPartial.querySelector('.transcript-text').textContent = text
            existingPartial.querySelector('.speaker-label').textContent = displayName
            if (formattedTime && existingPartial.querySelector('.timestamp')) {
                existingPartial.querySelector('.timestamp').textContent = formattedTime
            }
        } else {
            const line = document.createElement('div')
            line.className = `transcript-line partial speaker-${speaker}`
            line.innerHTML = `
                <div class="transcript-header">
                    <span class="speaker-label">${escapeHtml(displayName)}</span>
                    ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
                </div>
                <span class="transcript-text">${escapeHtml(text)}</span>
            `
            transcriptContent.insertBefore(line, transcriptContent.firstChild)
        }
    }
}

/**
 * Format timestamp range in seconds to [start - end] display format.
 * 
 * @param {number|null|undefined} start - Start time in seconds
 * @param {number|null|undefined} end - End time in seconds
 * @returns {string|null} Formatted time range string or null if invalid
 */
function formatTimestamp(start, end) {
    if (start === null || start === undefined) return null
    if (end === null || end === undefined) return null
    
    return `${start.toFixed(2)}s - ${end.toFixed(2)}s`
}

/**
 * Escape HTML special characters to prevent XSS attacks.
 * 
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// ============================================================================
// Session Control Functions
// ============================================================================

/**
 * Stop the current streaming session.
 * Cleans up audio resources, closes connections, and updates UI.
 * Converts any remaining partial transcript to final.
 * 
 * @returns {void}
 */
function stopStreaming() {
    isRecording = false
    
    // Convert any remaining partial transcript to final
    const existingPartial = transcriptContent.querySelector('.partial')
    if (existingPartial) {
        existingPartial.classList.remove('partial')
        
        // Extract data and add to transcriptData
        const speakerLabel = existingPartial.querySelector('.speaker-label').textContent
        const transcriptText = existingPartial.querySelector('.transcript-text').textContent
        const timestampEl = existingPartial.querySelector('.timestamp')
        const timestamp = timestampEl ? timestampEl.textContent : null
        
        // Find speaker number from class
        const speakerClass = Array.from(existingPartial.classList).find(cls => cls.startsWith('speaker-'))
        const speakerNum = speakerClass ? parseInt(speakerClass.split('-')[1]) : 0
        
        transcriptData.push({
            speaker: speakerNum,
            speaker_name: speakerLabel,
            text: transcriptText,
            timestamp: timestamp,
            end_time: null
        })
    }
    
    // Clean up audio resources
    if (mediaRecorder) {
        if (mediaRecorder.processor) {
            mediaRecorder.processor.disconnect()
        }
        if (mediaRecorder.source) {
            mediaRecorder.source.disconnect()
        }
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop())
        }
        mediaRecorder = null
    }
    
    if (audioContext) {
        audioContext.close()
        audioContext = null
    }
    
    // Close Socket.IO connection
    if (socket) {
        socket.emit('stop_stream')
        socket.disconnect()
        socket = null
    }
    
    // Update UI
    container.classList.add('stopped')
    recordingIndicator.classList.add('stopped')
    recordingIndicator.querySelector('span:last-child').textContent = 'Stopped'
    
    controlBtn.classList.add('restart')
    controlBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
            <circle cx="8" cy="8" r="2" fill="currentColor"/>
        </svg>
        <span>Restart</span>
    `
    
    exportBtn.style.display = 'flex'
}

/**
 * Restart streaming with a new session.
 * Clears previous transcript data and UI, then starts fresh.
 * 
 * @returns {void}
 */
function restartStreaming() {
    transcriptContent.innerHTML = ''
    transcriptData = []
    
    controlBtn.classList.remove('restart')
    controlBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/>
        </svg>
        <span>Stop</span>
    `
    container.classList.remove('stopped')
    recordingIndicator.classList.remove('stopped')
    recordingIndicator.querySelector('span:last-child').textContent = 'Recording'
    
    exportBtn.style.display = 'none'
    
    startStreaming()
}

// ============================================================================
// Export Function
// ============================================================================

/**
 * Export transcript data as JSON file.
 * 
 * Includes:
 * - Session configuration (speaker name, languages, settings)
 * - All final transcripts with timestamps
 * - Export metadata (timestamp, total count)
 * 
 * @returns {void}
 */
function exportTranscript() {
    if (transcriptData.length === 0) {
        alert('No transcript data to export')
        return
    }
    
    const codeSwitching = codeSwitchingCheckbox.checked
    const customVocabulary = customVocabularyTextarea.value
        .split(',')
        .map(word => word.trim())
        .filter(word => word.length > 0)
    
    const exportData = {
        exported_at: new Date().toISOString(),
        session_config: {
            speaker_name: speakerName || null,
            languages: selectedLanguages.length > 0 ? selectedLanguages : null,
            code_switching: codeSwitching,
            custom_vocabulary: customVocabulary.length > 0 ? customVocabulary : null,
            partial_results_enabled: showPartialResults
        },
        total_transcripts: transcriptData.length,
        transcripts: transcriptData
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
