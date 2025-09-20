// Chat Page JavaScript with WebRTC and Animation Management
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.IO
    const socket = io();
    
    // DOM Elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const chatMessages = document.getElementById('chatMessages');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const errorContainer = document.getElementById('errorContainer');
    const errorText = document.getElementById('errorText');
    const audioPlayer = document.getElementById('audioPlayer');
    const statusLabel = document.querySelector('.status-label');

    // WebRTC Variables
    let peerConnection = null;
    let audioStream = null;
    let dataChannel = null;
    let config = null;
    let currentUserMessage = null;
    let isConnected = false;

    // Animation States
    const AnimationStates = {
        IDLE: 'idle',
        USER_SPEAKING: 'user-speaking',
        AI_SPEAKING: 'ai-speaking',
        PROCESSING: 'processing'
    };

    // Initialize
    init();

    async function init() {
        // Fetch configuration
        try {
            const response = await fetch('/api/config');
            config = await response.json();
            
            if (!config.api_key) {
                showError('API key not configured. Please check your environment variables.');
                startBtn.disabled = true;
            }
        } catch (error) {
            console.error('Failed to fetch configuration:', error);
            showError('Failed to load configuration');
            startBtn.disabled = true;
        }

        // Set up event listeners
        startBtn.addEventListener('click', startConversation);
        stopBtn.addEventListener('click', stopConversation);
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Animation Management
    function setAnimationState(state) {
        const animations = document.querySelectorAll('.animation-state');
        animations.forEach(anim => anim.classList.remove('active'));
        
        const targetAnimation = document.querySelector(`.animation-state.${state}`);
        if (targetAnimation) {
            targetAnimation.classList.add('active');
        }

        // Update status label
        switch(state) {
            case AnimationStates.IDLE:
                statusLabel.textContent = 'Ready';
                break;
            case AnimationStates.USER_SPEAKING:
                statusLabel.textContent = 'Listening...';
                break;
            case AnimationStates.AI_SPEAKING:
                statusLabel.textContent = 'Speaking...';
                break;
            case AnimationStates.PROCESSING:
                statusLabel.textContent = 'Processing...';
                break;
        }

        // Send state change via Socket.IO for logging
        socket.emit('state_change', { state });
    }

    // Start Conversation
    async function startConversation() {
        startBtn.disabled = true;
        setAnimationState(AnimationStates.PROCESSING);
        updateConnectionStatus('Connecting...');

        try {
            // Step 1: Get ephemeral key from Azure OpenAI
            const sessionResponse = await fetch(config.sessions_url, {
                method: "POST",
                headers: {
                    "api-key": config.api_key,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: config.deployment,
                    voice: config.voice
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

            console.log('Session established:', sessionId);

            // Step 2: Set up WebRTC connection
            peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            // Set up audio
            await setupAudio();
            
            // Set up data channel
            setupDataChannel();

            // Create offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            // Send offer to Azure
            const sdpResponse = await fetch(`${config.webrtc_url}?model=${config.deployment}`, {
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

            // Update UI
            stopBtn.disabled = false;
            isConnected = true;
            updateConnectionStatus('Connected');
            setAnimationState(AnimationStates.IDLE);
            hideError();

            // Add system message
            addMessage('system', 'Connected! You can start speaking now.');

        } catch (error) {
            console.error('Connection error:', error);
            showError(error.message);
            startBtn.disabled = false;
            stopBtn.disabled = true;
            updateConnectionStatus('Disconnected');
            setAnimationState(AnimationStates.IDLE);
        }
    }

    // Set up Audio
    async function setupAudio() {
        try {
            // Request microphone access
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000,
                    channelCount: 1
                }
            });

            // Handle incoming audio
            peerConnection.ontrack = (event) => {
                console.log("Received audio track");
                audioPlayer.srcObject = event.streams[0];
            };

            // Add local audio track
            audioStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, audioStream);
            });

            console.log("Audio setup completed");
        } catch (error) {
            console.error("Error setting up audio:", error);
            throw new Error('Failed to access microphone. Please check your permissions.');
        }
    }

    // Set up Data Channel
    function setupDataChannel() {
        dataChannel = peerConnection.createDataChannel("realtime-channel");
        
        dataChannel.onopen = () => {
            console.log('Data channel opened');
            sendSessionUpdate();
            sendResponseCreate();
        };

        dataChannel.onmessage = handleDataChannelMessage;
        
        dataChannel.onerror = (error) => {
            console.error("DataChannel error:", error);
            showError("Connection error: " + error.message);
        };
    }

    // Handle Data Channel Messages
    function handleDataChannelMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message.type);

            switch (message.type) {
                case "response.done":
                    handleResponseDone(message);
                    break;
                case "response.audio.delta":
                    // Audio is being received
                    setAnimationState(AnimationStates.AI_SPEAKING);
                    break;
                case "input_audio_buffer.speech_started":
                    console.log("User started speaking");
                    setAnimationState(AnimationStates.USER_SPEAKING);
                    createUserMessageContainer();
                    break;
                case "input_audio_buffer.speech_ended":
                    console.log("User stopped speaking");
                    setAnimationState(AnimationStates.PROCESSING);
                    break;
                case "conversation.item.input_audio_transcription.completed":
                    handleUserTranscript(message);
                    break;
                case "error":
                    console.error("Error from API:", message.error);
                    showError(message.error.message);
                    setAnimationState(AnimationStates.IDLE);
                    break;
                default:
                    console.log('Unhandled message type:', message.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }

    // Create user message container
    function createUserMessageContainer() {
        currentUserMessage = document.createElement('div');
        currentUserMessage.className = 'message user-message';

        const label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = 'You';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = '...';

        currentUserMessage.appendChild(label);
        currentUserMessage.appendChild(content);
        chatMessages.appendChild(currentUserMessage);
        scrollToBottom();
    }

    // Handle user transcript
    function handleUserTranscript(message) {
        if (currentUserMessage && message.transcript) {
            const content = currentUserMessage.querySelector('.message-content');
            if (content.textContent === '...') {
                content.textContent = message.transcript;
            } else {
                content.textContent = content.textContent + " " + message.transcript;
            }
            scrollToBottom();

            // Log conversation
            socket.emit('conversation_update', {
                role: 'User',
                message: message.transcript,
                state: 'user-speaking'
            });
        }
    }

    // Handle response done
    function handleResponseDone(message) {
        if (message.response?.output?.[0]?.content?.[0]?.transcript) {
            const transcript = message.response.output[0].content[0].transcript;
            
            addMessage('assistant', transcript);
            
            // Log conversation
            socket.emit('conversation_update', {
                role: 'Assistant',
                message: transcript,
                state: 'ai-speaking'
            });
        }
        
        // Return to idle state
        setTimeout(() => {
            setAnimationState(AnimationStates.IDLE);
        }, 500);
    }

    // Add message to chat
    function addMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type === 'assistant' ? 'bot' : type}-message`;

        if (type !== 'system') {
            const label = document.createElement('div');
            label.className = 'message-label';
            label.textContent = type === 'assistant' ? 'Assistant' : 'System';
            messageDiv.appendChild(label);
        }

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        messageDiv.appendChild(content);

        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    // Send session update
    function sendSessionUpdate() {
        const sessionUpdateEvent = {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": "gpt-realtime",
                "instructions": "You are a helpful AI assistant. Be conversational, friendly, and concise in your responses.",
                "modalities": ["text", "audio"],
                "audio": {
                    "input": {
                    "format": {
                        'type': "audio/pcm",
                        "rate": 24000,
                    },
                    "turn_detection": {
                        "type": "semantic_vad"
                    }
                    },
                    "output": {
                    "format": {
                        "type": "audio/pcm",
                    },
                    voice: config.voice,
                    }
                }
                // "voice": config.voice,
                // "input_audio_format": "pcm16",
                // "output_audio_format": "pcm16",
                // "turn_detection": {
                //     "type": "server_vad",}
            }
        };
        sendMessage(sessionUpdateEvent);
    }

    // Send response create
    function sendResponseCreate() {
        sendMessage({ "type": "response.create" });
    }

    // Send message through data channel
    function sendMessage(message) {
        if (dataChannel?.readyState === "open") {
            dataChannel.send(JSON.stringify(message));
            console.log('Sent message:', message.type);
        }
    }

    // Stop conversation
    function stopConversation() {
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
        
        startBtn.disabled = false;
        stopBtn.disabled = true;
        isConnected = false;
        updateConnectionStatus('Disconnected');
        setAnimationState(AnimationStates.IDLE);
        
        addMessage('system', 'Conversation ended.');
    }

    // Handle logout
    async function handleLogout() {
        if (isConnected) {
            stopConversation();
        }

        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            if (data.success) {
                window.location.href = data.redirect || '/register';
            }
        } catch (error) {
            console.error('Logout error:', error);
            showError('Failed to logout. Please try again.');
        }
    }

    // Update connection status
    function updateConnectionStatus(status) {
        statusText.textContent = status;
        if (status === 'Connected') {
            statusDot.classList.add('connected');
        } else {
            statusDot.classList.remove('connected');
        }
    }

    // Show error
    function showError(message) {
        errorText.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            hideError();
        }, 5000);
    }

    // Hide error
    function hideError() {
        errorContainer.style.display = 'none';
    }

    // Scroll to bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Socket.IO event handlers
    socket.on('connected', (data) => {
        console.log('Connected to server:', data.status);
    });

    socket.on('animation_state', (data) => {
        // Animation state can be controlled from server if needed
        console.log('Animation state update:', data.state);
    });
});
