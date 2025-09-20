import json
import streamlit as st
from prompt_utils import get_default_instructions
from st_utils import get_logger
from dotenv import load_dotenv
import os

load_dotenv()


st.set_page_config(page_title="OpenAI Realtime Voice Chat", page_icon="🎤", layout="wide")

# Configure logger
logger = get_logger(__name__)


def set_page_style():
    """Set up the page layout with custom styles"""
    st.markdown(
        """
        <style>
            .chat-container {
                margin: 20px 0;
                padding: 20px;
                border-radius: 10px;
                background-color: #f8f9fa;
            }
            .webrtc-container {
                margin: 20px 0;
                text-align: center;
            }
            footer {
                visibility: hidden;
            }
        </style>
    """,
        unsafe_allow_html=True,
    )


def get_js_code():
    """Return the JavaScript code for WebRTC implementation"""
    return """
        document.addEventListener('DOMContentLoaded', function() {
            console.log("Script loaded");

            // Add debug logging for audio context
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => console.log("Microphone permission granted"))
                .catch(err => console.error("Microphone error:", err));

            const startButton = document.getElementById('startButton');
            const stopButton = document.getElementById('stopButton');
            const statusDiv = document.getElementById('status');
            const errorDiv = document.getElementById('error');

            let peerConnection = null;
            let audioStream = null;
            let dataChannel = null;

            const INITIAL_INSTRUCTIONS = INSTRUCTIONS_PLACEHOLDER;
            const API_KEY = API_KEY_PLACEHOLDER;
            
            // Azure OpenAI Realtime API configuration
            const SESSIONS_URL = SESSIONS_URL_PLACEHOLDER;
            const WEBRTC_URL = WEBRTC_URL_PLACEHOLDER;
            const DEPLOYMENT = DEPLOYMENT_PLACEHOLDER;
            const VOICE = VOICE_PLACEHOLDER;

            // Add event listeners
            startButton.addEventListener('click', init);
            stopButton.addEventListener('click', stopRecording);

            async function init() {
                startButton.disabled = true;
                try {
                    updateStatus('Getting ephemeral key...');

                    // Step 1: Get ephemeral key from Azure OpenAI
                    const sessionResponse = await fetch(SESSIONS_URL, {
                        method: "POST",
                        headers: {
                            "api-key": API_KEY,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: DEPLOYMENT,
                            voice: VOICE
                        })
                    });

                    if (!sessionResponse.ok) {
                        const errorText = await sessionResponse.text();
                        throw new Error(`Session API error: ${sessionResponse.status} - ${errorText}`);
                    }

                    const sessionData = await sessionResponse.json();
                    const sessionId = sessionData.id;
                    const ephemeralKey = sessionData.client_secret?.value;

                    if (!ephemeralKey) {
                        throw new Error('Failed to get ephemeral key from session');
                    }

                    console.log('Session ID:', sessionId);
                    console.log('Ephemeral key received');
                    updateStatus('Connecting to WebRTC...');

                    // Step 2: Set up WebRTC connection using ephemeral key
                    peerConnection = new RTCPeerConnection();
                    await setupAudio();
                    setupDataChannel();

                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);

                    const sdpResponse = await fetch(`${WEBRTC_URL}?model=${DEPLOYMENT}`, {
                        method: "POST",
                        body: offer.sdp,
                        headers: {
                            Authorization: `Bearer ${ephemeralKey}`,
                            "Content-Type": "application/sdp"
                        },
                    });

                    if (!sdpResponse.ok) {
                        const errorText = await sdpResponse.text();
                        throw new Error(`WebRTC API error: ${sdpResponse.status} - ${errorText}`);
                    }

                    const answer = {
                        type: "answer",
                        sdp: await sdpResponse.text(),
                    };
                    await peerConnection.setRemoteDescription(answer);

                    updateStatus('Connected');
                    stopButton.disabled = false;
                    hideError();

                } catch (error) {
                    startButton.disabled = false;
                    stopButton.disabled = true;
                    showError('Error: ' + error.message);
                    console.error('Initialization error:', error);
                    updateStatus('Failed to connect');
                }
            }

            async function setupAudio() {
                try {
                    const audioEl = document.createElement("audio");
                    audioEl.autoplay = true;
                    document.body.appendChild(audioEl);

                    audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 48000,
                            channelCount: 1
                        }
                    });

                    peerConnection.ontrack = (event) => {
                        console.log("Received audio track");
                        audioEl.srcObject = event.streams[0];
                    };

                    audioStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, audioStream);
                    });

                    console.log("Audio setup completed");
                } catch (error) {
                    console.error("Error setting up audio:", error);
                    throw error;
                }
            }

            function setupDataChannel() {
                dataChannel = peerConnection.createDataChannel("realtime-channel");
                dataChannel.onopen = onDataChannelOpen;
                dataChannel.onmessage = handleMessage;
                dataChannel.onerror = (error) => {
                    console.error("DataChannel error:", error);
                    showError("DataChannel error: " + error.message);
                };
                console.log("DataChannel setup completed");
            }

            function handleMessage(event) {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Received message:', message);

                    switch (message.type) {
                        case "response.done":
                            handleTranscript(message);
                            break;
                        case "response.audio.delta":
                            handleAudioDelta(message);
                            break;
                        case "input_audio_buffer.speech_started":
                            console.log("Speech started");
                            createUserMessageContainer();
                            break;
                        case "input_audio_buffer.speech_ended":
                            console.log("Speech ended");
                            break;
                        case "conversation.item.input_audio_transcription.completed":
                            handleUserTranscript(message);
                            break;
                        case "error":
                            console.error("Error from API:", message.error);
                            showError(message.error.message);
                            break;
                        default:
                            console.log('Message type:', message.type);
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                    showError('Error processing message: ' + error.message);
                }
            }

            let currentUserMessage = null;

            function createUserMessageContainer() {
                const chatContainer = document.getElementById('chat-container');
                currentUserMessage = document.createElement('div');
                currentUserMessage.className = 'message user-message';

                const label = document.createElement('div');
                label.className = 'message-label';
                label.textContent = 'You';

                const content = document.createElement('div');
                content.className = 'message-content';

                currentUserMessage.appendChild(label);
                currentUserMessage.appendChild(content);
                chatContainer.appendChild(currentUserMessage);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            function handleUserTranscript(message) {
                if (currentUserMessage && message.transcript) {
                    const content = currentUserMessage.querySelector('.message-content');
                    if (content.textContent) {
                        content.textContent = content.textContent + " " + message.transcript;
                    } else {
                        content.textContent = message.transcript;
                    }
                    const chatContainer = document.getElementById('chat-container');
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }

            function handleAudioDelta(message) {
                if (message.delta) {
                    console.log("Received audio data");
                }
            }

            function handleTranscript(message) {
                const chatContainer = document.getElementById('chat-container');

                if (message.response?.output?.[0]?.content?.[0]?.transcript) {
                    const transcript = message.response.output[0].content[0].transcript;

                    const botMessage = document.createElement('div');
                    botMessage.className = 'message bot-message';

                    const label = document.createElement('div');
                    label.className = 'message-label';
                    label.textContent = 'Assistant';

                    const content = document.createElement('div');
                    content.className = 'message-content';
                    content.textContent = transcript;

                    botMessage.appendChild(label);
                    botMessage.appendChild(content);
                    chatContainer.appendChild(botMessage);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }

            function sendSessionUpdate() {
                const sessionUpdateEvent = {
                    "type": "session.update",
                    "session": {
                        "instructions": INITIAL_INSTRUCTIONS,
                        "modalities": ["text", "audio"],
                        "voice": VOICE,
                        "input_audio_format": "pcm16",
                        "output_audio_format": "pcm16",
                        "input_audio_transcription": {
                            "model": "whisper-1",
                        },
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 200,
                        }
                    }
                };
                sendMessage(sessionUpdateEvent);
            }

            function sendMessage(message) {
                if (dataChannel?.readyState === "open") {
                    dataChannel.send(JSON.stringify(message));
                    console.log('Sent message:', message);
                }
            }

            function onDataChannelOpen() {
                sendSessionUpdate();
                sendResponseCreate();
            }

            function sendResponseCreate() {
                sendMessage({ "type": "response.create" });
            }

            function stopRecording() {
                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    audioStream = null;
                }
                if (dataChannel) {
                    dataChannel.close();
                    dataChannel = null;
                }
                startButton.disabled = false;
                stopButton.disabled = true;
                updateStatus('Ready to start');
            }

            function updateStatus(message) {
                statusDiv.textContent = message;
            }

            function showError(message) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = message;
            }

            function hideError() {
                errorDiv.style.display = 'none';
            }
        });
    """


def get_webrtc_html():
    """Generate the HTML for WebRTC interface"""
    instructions = get_default_instructions()

    # Get Azure OpenAI configuration from environment variables
    api_key = os.getenv("AZURE_OPENAI_API_KEY", os.getenv("OPENAI_API_KEY", None))
    sessions_url = os.getenv(
        "SESSIONS_URL",
        "https://new-voice-assist.openai.azure.com/openai/realtimeapi/sessions?api-version=2025-04-01-preview",
    )
    webrtc_url = os.getenv(
        "WEBRTC_URL", "https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc"
    )
    deployment = os.getenv("DEPLOYMENT", "gpt-realtime")
    voice = os.getenv("VOICE", "alloy")

    js_code = get_js_code()
    js_code = js_code.replace("INSTRUCTIONS_PLACEHOLDER", json.dumps(instructions))
    js_code = js_code.replace("API_KEY_PLACEHOLDER", f'"{api_key}"')
    js_code = js_code.replace("SESSIONS_URL_PLACEHOLDER", f'"{sessions_url}"')
    js_code = js_code.replace("WEBRTC_URL_PLACEHOLDER", f'"{webrtc_url}"')
    js_code = js_code.replace("DEPLOYMENT_PLACEHOLDER", f'"{deployment}"')
    js_code = js_code.replace("VOICE_PLACEHOLDER", f'"{voice}"')

    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Voice Chat</title>
        <style>
            .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .controls {
                text-align: center;
                margin: 20px 0;
            }
            .chat-container {
                margin: 20px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                min-height: 300px;
                max-height: 500px;
                overflow-y: auto;
            }
            .message {
                margin: 10px 0;
                padding: 10px;
                border-radius: 8px;
                max-width: 80%;
            }
            .user-message {
                background-color: #e3f2fd;
                margin-left: auto;
                margin-right: 20px;
            }
            .bot-message {
                background-color: #f5f5f5;
                margin-left: 20px;
                margin-right: auto;
            }
            .message-label {
                font-size: 0.8em;
                color: #666;
                margin-bottom: 4px;
            }
            .status {
                text-align: center;
                margin: 10px 0;
                font-style: italic;
            }
            .error {
                color: red;
                display: none;
                margin: 10px 0;
            }
            button {
                padding: 10px 20px;
                margin: 0 10px;
                border-radius: 5px;
                border: none;
                background-color: #0066cc;
                color: white;
                cursor: pointer;
            }
            button:disabled {
                background-color: #cccccc;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="controls">
                <button id="startButton">Start Conversation</button>
                <button id="stopButton" disabled>End Conversation</button>
            </div>
            <div id="chat-container" class="chat-container"></div>
            <div id="status" class="status">Ready to start</div>
            <div id="error" class="error"></div>
        </div>
        <script>
            JAVASCRIPT_CODE_PLACEHOLDER
        </script>
    </body>
    </html>
    """.replace("JAVASCRIPT_CODE_PLACEHOLDER", js_code)


def main():
    set_page_style()

    st.title("🎤 Azure OpenAI Realtime Voice Chat")
    st.markdown("""
    This is a demonstration of Azure OpenAI's Realtime API integration with Streamlit.
    Click the 'Start Conversation' button and start speaking with the AI assistant.
    """)

    # Display configuration status
    api_key = os.getenv("AZURE_OPENAI_API_KEY", os.getenv("OPENAI_API_KEY", None))
    if not api_key:
        st.error(
            "⚠️ Azure OpenAI API key not found. Please set AZURE_OPENAI_API_KEY in your .env file."
        )
        return

    # Create WebRTC container
    with st.container():
        st.components.v1.html(get_webrtc_html(), height=600)

    st.markdown("""
    ### How it works
    1. Click 'Start Conversation' to initialize the voice chat
    2. Allow microphone access when prompted
    3. Start speaking - the assistant will respond in real-time
    4. Click 'End Conversation' to stop the session
    
    ### Configuration
    - **Sessions URL**: Uses Azure OpenAI endpoint for ephemeral key generation
    - **WebRTC URL**: Connects to Azure's East US 2 region for real-time communication
    - **Model**: gpt-realtime
    - **Voice**: Alloy
    """)


if __name__ == "__main__":
    main()
