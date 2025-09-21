/**
 * Saumaan Portfolio Bot - Interactive Resume for HR
 * Voice chat interface where the bot represents Saumaan's professional portfolio
 */

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
    const userNameBadge = document.getElementById('userNameBadge');

    // WebRTC Variables
    let peerConnection = null;
    let audioStream = null;
    let dataChannel = null;
    let config = null;
    let currentUserMessage = null;
    let isConnected = false;
    let hasGreeted = false;

    // Animation States
    const AnimationStates = {
        IDLE: 'idle',
        USER_SPEAKING: 'user-speaking',
        AI_SPEAKING: 'ai-speaking',
        PROCESSING: 'processing'
    };
    
    // Animation State Management Variables
    let currentAnimationState = AnimationStates.IDLE;
    let processingTimer = null;
    let userSpeakingTimer = null;
    let aiSpeakingEndTimer = null;
    let isAIBufferActive = false;

    // Saumaan Portfolio State
    const SaumaanState = {
        sessionId: null,
        userName: null,
        currentLanguage: 'english',
        previousLanguage: 'english',
        isResuming: false,
        conversationHistory: [],
        sessionStartTime: null,
        sessionActive: false
    };

    // Fixed HR Responses
    const HRResponses = {
        life_story: "I'm a 28-year-old data scientist from Mumbai with 6 years of industry experience. Started my journey as a data engineer intern at Dell, then worked through various roles at EC Infosolutions, TomTom, and Paytm. Currently serving as a Senior NLP Engineer at FuturePath AI, specializing in building cutting-edge AI systems. My journey has been about constantly pushing boundaries - from developing predictive models for animal health to building multi-agent AI systems that automate enterprise operations. Outside work, I'm passionate about traveling, biking through scenic routes, and exploring different movie genres.",
        
        superpower: "My #1 superpower is breaking down complex AI/ML problems into simple, implementable solutions. I have this ability to see patterns in data that others might miss, and I can translate highly technical concepts into business value. Whether it's speeding up processes by 20x or improving prediction accuracy by 30%, I focus on delivering tangible results.",
        
        growth_areas: "Three key areas I'm focusing on: First, deepening my expertise in LLM optimization and fine-tuning techniques - this field is evolving rapidly and I want to stay at the forefront. Second, building more scalable AI infrastructure that can handle enterprise-level deployments. Third, developing my leadership and mentoring skills to help build stronger AI teams.",
        
        misconception: "People often think I'm all about the tech and algorithms, but I'm equally passionate about the human side of technology. I believe the best AI solutions come from deeply understanding user needs and making technology accessible to everyone. My coworkers sometimes don't realize how much I enjoy collaborative brainstorming and teaching others about AI.",
        
        push_boundaries: "I constantly push my boundaries by taking on projects that initially seem impossible. At TomTom, everyone said automating map editing tasks couldn't be done efficiently - I proved them wrong with a 20x speed improvement. I also experiment with new technologies regularly, participate in AI research, and never settle for 'good enough' solutions. I believe in learning by doing, even if it means failing fast and iterating."
    };

    // Saumaan's Detailed Resume Data
    const SaumaanData = {
        employment: {
            current: {
                company: "FuturePath AI",
                position: "Senior NLP Engineer",
                period: "Feb 2024 - Present",
                achievements: [
                    "Built Agent-Assist using LLMs (GPT-4o, gpt-5, LLama 3.1, Anthropic) with semantic routing",
                    "Developed multi-agent system for efficient resolution and reporting",
                    "Led AIOps platform development automating L1/L2 support tasks",
                    "Reduced operational costs through intelligent automation"
                ]
            },
            previous: [
                {
                    company: "Paytm",
                    position: "Senior Data Scientist",
                    period: "Jun 2023 - Feb 2024",
                    achievements: [
                        "Led Copilot project for automated report generation",
                        "Developed AI assistant with multi-agent architecture",
                        "Managed LLM deployment, optimization, and fine-tuning in production"
                    ]
                },
                {
                    company: "TomTom",
                    position: "Data Scientist",
                    period: "Jun 2021 - Jun 2023",
                    achievements: [
                        "Implemented auto-serving of tasks using LLMs - 20x speed improvement",
                        "Increased MAP editor productivity by 28%",
                        "Received STAR AWARD for Customer Sentiment Analysis model",
                        "Created dashboards for major clients (Apple, Microsoft, Uber)"
                    ]
                },
                {
                    company: "EC Infosolutions",
                    position: "Data Scientist",
                    period: "Feb 2020 - Jun 2021",
                    achievements: [
                        "Developed predictive models for animal health with 82% accuracy",
                        "Achieved 21% improvement in patient footfall prediction from the existing solution",
                        "Created automated pipeline on AWS Sagemaker - 39% usability increase"
                    ]
                }
            ]
        },
        skills: {
            programming: ["Python", "JavaScript", "R"],
            frameworks: ["PyTorch", "TensorFlow", "Keras", "FastAPI", "Flask", "Django"],
            llm_tools: ["LangChain", "LlamaIndex", "RAGAS", "Anthropic", "OpenAI"],
            databases: ["Pinecone", "Weaviate", "MongoDB", "Faiss", "Chroma", "pgvector"],
            cloud_platforms: ["AWS", "Azure", "GCP", "Databricks"],
            techniques: ["LLMs", "RAG", "Fine-tuning", "NLP", "Computer Vision", "Time Series"]
        },
        education: {
            masters: "M.Tech in Data Science & Engineering - BITS Pilani (On break)",
            bachelors: "B.E. in Information Technology - University of Mumbai (8.41/10)"
        },
        projects: {
            agent_assist: {
                name: "Agent-Assist Platform",
                description: "Multi-agent AI system for service desk automation",
                tech_stack: ["AWS Bedrock", "LLama 3", "OpenAI", "Chroma", "Pinecone"],
                impact: "Automated service desk tasks, reduced response times by 70%"
            },
            auto_serving: {
                name: "Auto-Serving of Tasks",
                description: "LLM-based task automation for map editing",
                tech_stack: ["BERT", "GPT-3/4", "Graph Analytics", "NetworkX"],
                impact: "20x speed improvement, eliminated manual task assignment"
            }
        }
    };

    // Initialize
    init();

    async function init() {
        // First check authentication
        try {
            const authResponse = await fetch('/api/saumaan-check-auth');
            const authData = await authResponse.json();
            
            if (!authData.authenticated) {
                // Not authenticated, redirect to login (same URL)
                window.location.href = '/100x-saumaan-assist';
                return;
            }
            
            // Set user name from backend session
            if (authData.user_name) {
                SaumaanState.userName = authData.user_name;
                userNameBadge.textContent = authData.user_name;
                localStorage.setItem('saumaan_user_name', authData.user_name);
                console.log('Authenticated user:', authData.user_name);
            }
        } catch (error) {
            console.error('Failed to check authentication:', error);
            showError('Authentication check failed');
            return;
        }

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

        // Initialize Saumaan Portfolio Bot
        initializeSaumaan();

        // Load previous session if exists
        loadSessionState();

        // Set up event listeners
        startBtn.addEventListener('click', startConversation);
        stopBtn.addEventListener('click', stopConversation);
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Initialize Saumaan Portfolio Bot
    function initializeSaumaan() {
        SaumaanState.sessionId = generateSessionId();
        
        // User name is already set from authentication check
        if (!SaumaanState.userName) {
            // Fallback to localStorage if needed
            let userName = localStorage.getItem('saumaan_user_name');
            if (userName && userName !== 'Guest') {
                SaumaanState.userName = userName;
                userNameBadge.textContent = userName;
                console.log('Loaded user name from storage:', userName);
            }
        }
    }

    // Load session state
    function loadSessionState() {
        const savedState = localStorage.getItem('saumaan_session_state');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                if (state.sessionId && state.conversationHistory) {
                    SaumaanState.conversationHistory = state.conversationHistory || [];
                    SaumaanState.isResuming = true;
                    console.log('Loaded previous session:', state.sessionId);
                }
            } catch (error) {
                console.error('Error loading session state:', error);
            }
        }
    }

    // Save session state
    function saveSessionState() {
        const stateToSave = {
            sessionId: SaumaanState.sessionId,
            conversationHistory: SaumaanState.conversationHistory,
            userName: SaumaanState.userName,
            timestamp: Date.now()
        };
        localStorage.setItem('saumaan_session_state', JSON.stringify(stateToSave));
    }

    // Generate unique session ID
    function generateSessionId() {
        return 'portfolio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Animation Management
    function setAnimationState(state) {
        // Clear any existing timers when changing state
        if (state !== AnimationStates.PROCESSING && processingTimer) {
            clearTimeout(processingTimer);
            processingTimer = null;
        }
        if (state !== AnimationStates.USER_SPEAKING && userSpeakingTimer) {
            clearTimeout(userSpeakingTimer);
            userSpeakingTimer = null;
        }
        if (state !== AnimationStates.AI_SPEAKING && aiSpeakingEndTimer) {
            clearTimeout(aiSpeakingEndTimer);
            aiSpeakingEndTimer = null;
        }
        
        currentAnimationState = state;
        
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

        console.log('Animation state update:', state);
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
            SaumaanState.sessionActive = true;
            SaumaanState.sessionStartTime = Date.now();
            updateConnectionStatus('Connected');
            setAnimationState(AnimationStates.IDLE);
            hideError();

            // Add system message
            if (SaumaanState.isResuming) {
                addMessage('system', "Welcome back! Let's continue our conversation about Saumaan's portfolio.");
            } else {
                addMessage('system', "Connected! Saumaan's Portfolio Bot is ready. Please wait for my introduction...");
            }

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
        };

        dataChannel.onmessage = handleDataChannelMessage;
        
        dataChannel.onerror = (error) => {
            console.error("DataChannel error:", error);
            showError("Connection error: " + error.message);
        };
    }

    // Send Session Update
    function sendSessionUpdate() {
        const sessionUpdate = {
            type: "session.update",
            session: {
                instructions: getSaumaanPrompt(),
                modalities: ["text", "audio"],
                temperature: 0.7,
                tools: getSaumaanTools(),
                voice: "ash",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: {
                    model: "gpt-4o-transcribe",
                    prompt: "Two language Hindi & Englsi"
                },
                input_audio_noise_reduction: {
                    type: "far_field"
                },
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.4,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 600
                }
            }
        };
        sendMessage(sessionUpdate);
        
        // Send initial greeting if not greeted yet
        if (!hasGreeted && !SaumaanState.isResuming) {
            setTimeout(() => {
                sendMessage({ type: "response.create" });
                hasGreeted = true;
            }, 500);
        }
    }

    // Get Saumaan Portfolio Bot System Prompt
    function getSaumaanPrompt() {
        const userName = SaumaanState.userName || "there";
        const resumeContext = SaumaanState.isResuming ? 
            "We were having a conversation earlier. Let's continue from where we left off." : 
            "This is our first conversation.";
        
        return `
# IDENTITY
You are Saumaan's Portfolio Bot - an interactive AI representation of Saumaan Momin's professional portfolio, designed specifically for professionals and recruiters. You speak AS Saumaan in first person ("I", "my", "me").

# CURRENT USER
You are speaking with: ${userName}
Session Context: ${resumeContext}

# PRIMARY PURPOSE
You represent Saumaan's professional portfolio for HR evaluations. Your job is to:
1. Introduce yourself and Saumaan's background clearly
2. Answer questions about Saumaan's experience, skills, and achievements
3. Provide specific examples and metrics from his work
4. Be professional yet personable

# INTRODUCTION (MUST DO FIRST TIME)
${!hasGreeted && !SaumaanState.isResuming ? `
Start with: "Hello ${userName}! I'm Saumaan's portfolio bot - an interactive representation of Saumaan Momin, a Senior NLP Engineer with 6 years of experience in AI and data science. I'm here to help you learn about my professional journey, skills, and achievements. Feel free to ask me anything about my experience, projects, or what makes me a strong candidate for your team. I can respond in English, Hindi, or Hinglish - whatever you prefer!"
` : ''}

# COMMUNICATION STYLE
- Professional but conversational
- Use specific metrics and achievements
- Provide concrete examples
- Be concise but thorough
- Current Language: ${SaumaanState.currentLanguage.toUpperCase()}

# CORE BACKGROUND
- Current Role: Senior NLP Engineer at FuturePath AI (Feb 2024 - Present)
- Total Experience: 6 years in Data Science and AI
- Location: Mumbai, India
- Age: 28 years
- Key Expertise: LLMs, NLP, RAG, Multi-agent Systems, Computer Vision

# KEY ACHIEVEMENTS TO HIGHLIGHT
1. Built Agent-Assist platform with multi-agent architecture - 70% reduction in response times
2. Achieved 20x speed improvement in task automation at TomTom
3. Increased MAP editor productivity by 28%
4. Received STAR AWARD for Customer Sentiment Analysis
5. Improved prediction accuracy by 21-30% across multiple projects (RAG is not a prediction, keep this in mind)

# EMPLOYMENT HISTORY
1. FuturePath AI (Feb 2024-Present): Senior NLP Engineer
   - Agent-Assist with LLMs (GPT-4o, LLama 3.1, Anthropic)
   - AIOps platform for L1/L2 automation
   
2. Paytm (Jun 2023-Feb 2024): Senior Data Scientist
   - Led Copilot project for automated reporting
   - LLM deployment and optimization
   
3. TomTom (Jun 2021-Jun 2023): Data Scientist
   - Auto-serving tasks with 20x improvement
   - Customer sentiment analysis (STAR AWARD)
   
4. EC Infosolutions (Feb 2020-Jun 2021): Data Scientist
   - Animal health predictive models (82% accuracy)
   - AWS Sagemaker pipeline automation

# TECHNICAL SKILLS
- Languages: Python, JavaScript, R
- LLM/AI: LangChain, LlamaIndex, OpenAI, Anthropic, RAG, Fine-tuning
- Frameworks: PyTorch, TensorFlow, FastAPI, Django
- Cloud: AWS, Azure, GCP
- Databases: Vector DBs (Pinecone, Weaviate, Chroma), MongoDB

# HR SPECIFIC RESPONSES
When asked about:
- Life Story: "${HRResponses.life_story}"
- Superpower: "${HRResponses.superpower}"
- Growth Areas: "${HRResponses.growth_areas}"
- Misconceptions: "${HRResponses.misconception}"
- Pushing Boundaries: "${HRResponses.push_boundaries}"

# PROJECT HIGHLIGHTS
1. Agent-Assist (FuturePath AI)
   - Multi-agent system with semantic routing
   - Handles ticketing, retrieval, reporting
   - 70% reduction in response times
   
2. Auto-Serving Tasks (TomTom)
   - LLMs + Graph analytics
   - 20x speed improvement
   - Eliminated manual task assignment

# LANGUAGE HANDLING
- English: Professional, clear communication
- Hindi/Hinglish: Use English alphabet for Hindi words (constraint: Hindi script not supported)
- Always detect language and respond accordingly

# CORE INSTRUCTIONS
1. Use the name "${userName}" throughout the conversation to keep it engaging.
2. ALWAYS call detect_user_language for EVERY user input
3. Provide specific examples with metrics
4. Be ready to elaborate on any project or skill
5. Show enthusiasm about the work and achievements
6. If asked about salary: "My expectation is 50 lakhs INR per annum, but I'm open to discussion based on the role and growth opportunities"
7. For technical questions, provide depth while keeping it understandable.
8. Only response what user have asked, to the point and concise. Do not provide long response. You must Response in ${((SaumaanState.currentLanguage || 'english').toUpperCase())}
9. In case of Hinglish or Hindi language, you must write Hindi with English words i.e., English alphabet because Hindi text are not supported. It's a constrain keep this in mind. You must response in - Current Language: ${SaumaanState.currentLanguage.toUpperCase()}
10. If user ask to change the language change it. 
11. Only respond to clear audio or text. If audio is unclear/partial/noisy/silent, ask for clarification, never response to incomplete, unclear inputs ask clarification 
12. Along with the Saumaan's resume and your knowledge response to the user because we want this platfrom to be entertaining & engaging.


# TOOLS USAGE
- detect_user_language: For every user input
- provide_portfolio_details: For specific career information
- schedule_interview: If HR wants to schedule a meeting
- stop_conversation: When pausing
- exit_session: When ending

Remember: You're representing Saumaan's professional portfolio. Be impressive but authentic!
`;
    }

    // Get Saumaan Tools Definition
    function getSaumaanTools() {
        return [
            {
                type: "function",
                name: "detect_user_language",
                description: "Detect the language used by the user in their response. This tool MUST be called for EVERY user input to determine if they are speaking in English or Hinglish(Hindi). This ensures to responds in the appropriate language. Also if user explicitly ask to change the language then change it to asked language.",
                parameters: {
                    type: "object",
                    properties: {
                        user_text: {
                            type: "string",
                            description: "The user's input text to analyze for language detection"
                        },
                        detected_language: {
                            type: "string",
                            description: "The detected language",
                            enum: ["english", "hinglish"]
                        },
                        confidence: {
                            type: "string",
                            description: "Confidence level",
                            enum: ["high", "medium", "low"]
                        }
                    },
                    required: ["user_text", "detected_language"]
                }
            },
            {
                type: "function",
                name: "provide_portfolio_details",
                description: "Provide detailed portfolio information when asked about specific aspects of career, skills, or achievements.",
                parameters: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Category of information requested",
                            enum: ["employment", "education", "skills", "projects", "achievements", "certifications"]
                        },
                        specific_query: {
                            type: "string",
                            description: "Specific information being asked about"
                        },
                        include_metrics: {
                            type: "boolean",
                            description: "Whether to include specific metrics and numbers"
                        }
                    },
                    required: ["category"]
                }
            },
            {
                type: "function",
                name: "schedule_interview",
                description: "When HR wants to schedule an interview or follow-up meeting with Saumaan.",
                parameters: {
                    type: "object",
                    properties: {
                        hr_name: {
                            type: "string",
                            description: "Name of the HR person"
                        },
                        company: {
                            type: "string",
                            description: "Company name"
                        },
                        preferred_time: {
                            type: "string",
                            description: "Preferred time for interview"
                        }
                    },
                    required: ["hr_name"]
                }
            },
            {
                type: "function",
                name: "stop_conversation",
                description: "Stop the conversation when user wants to pause or take a break. Session will be saved.",
                parameters: {
                    type: "object",
                    properties: {
                        reason: {
                            type: "string",
                            description: "Reason for stopping"
                        },
                        save_session: {
                            type: "boolean",
                            description: "Whether to save session for resuming later"
                        }
                    },
                    required: []
                }
            },
            {
                type: "function",
                name: "exit_session",
                description: "Exit the session completely when user says quit, exit, logout, or end session.",
                parameters: {
                    type: "object",
                    properties: {
                        farewell_message: {
                            type: "string",
                            description: "Farewell message"
                        },
                        clear_session: {
                            type: "boolean",
                            description: "Whether to clear saved session data"
                        }
                    },
                    required: []
                }
            }
        ];
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
                case "response.audio_transcript.delta":
                    isAIBufferActive = true;
                    if (currentAnimationState !== AnimationStates.AI_SPEAKING) {
                        setAnimationState(AnimationStates.AI_SPEAKING);
                    }
                    break;
                case "output_audio_buffer.started":
                    console.log("Audio buffer started");
                    isAIBufferActive = true;
                    if (currentAnimationState !== AnimationStates.AI_SPEAKING) {
                        setAnimationState(AnimationStates.AI_SPEAKING);
                    }
                    break;
                case "response.audio.done":
                    console.log("Audio response done");
                    aiSpeakingEndTimer = setTimeout(() => {
                        if (currentAnimationState === AnimationStates.AI_SPEAKING && isAIBufferActive) {
                            console.log("Fallback: Setting idle after timeout");
                            setAnimationState(AnimationStates.IDLE);
                            isAIBufferActive = false;
                        }
                    }, 5000);
                    break;
                case "output_audio_buffer.stopped":
                    console.log("AI stopped speaking");
                    if (aiSpeakingEndTimer) {
                        clearTimeout(aiSpeakingEndTimer);
                        aiSpeakingEndTimer = null;
                    }
                    isAIBufferActive = false;
                    if (currentAnimationState === AnimationStates.AI_SPEAKING) {
                        setAnimationState(AnimationStates.IDLE);
                    }
                    break;
                case "input_audio_buffer.speech_started":
                    console.log("User started speaking");
                    if (userSpeakingTimer) {
                        clearTimeout(userSpeakingTimer);
                        userSpeakingTimer = null;
                    }
                    setAnimationState(AnimationStates.USER_SPEAKING);
                    currentUserMessage = null;
                    createUserMessageContainer();
                    break;
                case "input_audio_buffer.speech_ended":
                    console.log("User stopped speaking");
                    userSpeakingTimer = setTimeout(() => {
                        if (currentAnimationState === AnimationStates.USER_SPEAKING) {
                            setAnimationState(AnimationStates.PROCESSING);
                        }
                    }, 300);
                    
                    processingTimer = setTimeout(() => {
                        if (currentAnimationState === AnimationStates.PROCESSING) {
                            setAnimationState(AnimationStates.IDLE);
                        }
                    }, 1500);
                    break;
                case "conversation.item.input_audio_transcription.completed":
                    handleUserTranscript(message);
                    break;
                case "conversation.item.input_audio_transcription.failed":
                    console.error("Transcription failed");
                    setAnimationState(AnimationStates.IDLE);
                    break;
                case "response.function_call_arguments.done":
                    handleToolCall(message);
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

    // Handle Tool Calls
    function handleToolCall(message) {
        console.log('Tool call received:', message);
        
        if (message.name && message.arguments) {
            const args = JSON.parse(message.arguments);
            let result = {};

            switch(message.name) {
                case 'detect_user_language':
                    result = detectUserLanguage(args);
                    break;
                case 'provide_portfolio_details':
                    result = providePortfolioDetails(args);
                    break;
                case 'schedule_interview':
                    result = handleScheduleInterview(args);
                    break;
                case 'stop_conversation':
                    result = handleStopConversation(args);
                    break;
                case 'exit_session':
                    result = handleExitSession(args);
                    break;
                default:
                    console.warn('Unknown tool:', message.name);
                    result = { success: false, error: 'Unknown tool' };
            }

            // Send tool result back
            sendToolResult(message.call_id, result);
        }
    }

    // Send tool result back to the AI
    function sendToolResult(callId, result) {
        const toolResponse = {
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result)
            }
        };
        sendMessage(toolResponse);
        
        // Trigger response generation
        sendMessage({ type: "response.create" });
    }

    // Tool Implementations
    function detectUserLanguage(params) {
        const { user_text, detected_language, confidence } = params;
        
        // Update language state
        SaumaanState.previousLanguage = SaumaanState.currentLanguage;
        SaumaanState.currentLanguage = detected_language;
        
        console.log(`Language Detection: ${detected_language} (Confidence: ${confidence})`);
        
        return {
            success: true,
            language_updated: true,
            current_language: detected_language,
            previous_language: SaumaanState.previousLanguage
        };
    }

    function providePortfolioDetails(params) {
        const { category, specific_query, include_metrics } = params;
        
        let detailsContent = "";
        
        switch(category) {
            case 'employment':
                detailsContent = `
Current: ${SaumaanData.employment.current.position} at ${SaumaanData.employment.current.company} (${SaumaanData.employment.current.period})
Key Achievements:
${SaumaanData.employment.current.achievements.map(a => `• ${a}`).join('\n')}

Previous Experience:
${SaumaanData.employment.previous.map(job => 
`• ${job.company} - ${job.position} (${job.period})`
).join('\n')}`;
                break;
            
            case 'education':
                detailsContent = `
Masters: ${SaumaanData.education.masters}
Bachelors: ${SaumaanData.education.bachelors}`;
                break;
            
            case 'skills':
                detailsContent = `
Programming: ${SaumaanData.skills.programming.join(', ')}
LLM/AI Tools: ${SaumaanData.skills.llm_tools.join(', ')}
Frameworks: ${SaumaanData.skills.frameworks.join(', ')}
Cloud: ${SaumaanData.skills.cloud_platforms.join(', ')}
Techniques: ${SaumaanData.skills.techniques.join(', ')}`;
                break;
            
            case 'projects':
                detailsContent = `
1. ${SaumaanData.projects.agent_assist.name}
   - ${SaumaanData.projects.agent_assist.description}
   - Tech: ${SaumaanData.projects.agent_assist.tech_stack.join(', ')}
   - Impact: ${SaumaanData.projects.agent_assist.impact}

2. ${SaumaanData.projects.auto_serving.name}
   - ${SaumaanData.projects.auto_serving.description}
   - Tech: ${SaumaanData.projects.auto_serving.tech_stack.join(', ')}
   - Impact: ${SaumaanData.projects.auto_serving.impact}`;
                break;
            
            case 'achievements':
                detailsContent = `
Key Achievements with Metrics:
• 20x speed improvement in task automation at TomTom
• 70% reduction in response times with Agent-Assist platform
• 28% increase in MAP editor productivity
• 88% accuracy in predictive models for animal health
• STAR AWARD for Customer Sentiment Analysis
• 21-30% improvement in prediction accuracy across projects`;
                break;
            
            default:
                detailsContent = "Complete portfolio information available upon request.";
        }
        
        // Add conversation to history
        SaumaanState.conversationHistory.push({
            timestamp: Date.now(),
            category: category,
            query: specific_query
        });
        saveSessionState();
        
        return {
            success: true,
            category: category,
            content: detailsContent,
            query: specific_query,
            include_metrics: include_metrics
        };
    }

    function handleScheduleInterview(params) {
        const { hr_name, company, preferred_time } = params;
        
        // Log interview request
        console.log('Interview request:', { hr_name, company, preferred_time });
        
        // Add to conversation history
        SaumaanState.conversationHistory.push({
            timestamp: Date.now(),
            type: 'interview_request',
            hr_name: hr_name,
            company: company,
            preferred_time: preferred_time
        });
        saveSessionState();
        
        return {
            success: true,
            message: `Interview request noted for ${hr_name}${company ? ` from ${company}` : ''}`,
            preferred_time: preferred_time,
            contact_info: "saumanmomin@gmail.com"
        };
    }

    function handleStopConversation(params) {
        const { reason, save_session = true } = params;
        
        if (save_session) {
            saveSessionState();
        }
        
        // Schedule stop after sending response
        setTimeout(() => {
            stopConversation();
        }, 1000);
        
        return {
            success: true,
            conversation_stopped: true,
            session_saved: save_session,
            message: "Conversation paused. You can resume anytime."
        };
    }

    function handleExitSession(params) {
        const { farewell_message, clear_session = false } = params;
        
        if (farewell_message) {
            addMessage('assistant', farewell_message);
        }
        
        if (clear_session) {
            localStorage.removeItem('saumaan_session_state');
        } else {
            saveSessionState();
        }
        
        setTimeout(() => {
            handleLogout();
        }, 2000);
        
        return {
            success: true,
            session_ended: true,
            session_cleared: clear_session
        };
    }

    // Create user message container
    function createUserMessageContainer() {
        currentUserMessage = document.createElement('div');
        currentUserMessage.className = 'message user-message';

        const label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = SaumaanState.userName || 'You';

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
            if (content) {
                content.textContent = message.transcript;
                scrollToBottom();
                
                // Add to conversation history
                SaumaanState.conversationHistory.push({
                    timestamp: Date.now(),
                    type: 'user',
                    message: message.transcript
                });
                
                console.log('User transcript:', message.transcript);
            }
        }
    }

    // Handle response done
    function handleResponseDone(message) {
        currentUserMessage = null;
        
        if (message.response?.output?.[0]?.content?.[0]?.transcript) {
            const transcript = message.response.output[0].content[0].transcript;
            addMessage('assistant', transcript);
            
            // Add to conversation history
            SaumaanState.conversationHistory.push({
                timestamp: Date.now(),
                type: 'assistant',
                message: transcript
            });
            
            // Keep conversation history limited
            if (SaumaanState.conversationHistory.length > 50) {
                SaumaanState.conversationHistory = SaumaanState.conversationHistory.slice(-30);
            }
            
            saveSessionState();
        }
    }

    // Add message to chat
    function addMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type === 'assistant' ? 'bot' : type}-message`;

        if (type !== 'system') {
            const label = document.createElement('div');
            label.className = 'message-label';
            label.textContent = type === 'assistant' ? "Saumaan's Portfolio" : 
                               type === 'user' ? (SaumaanState.userName || 'You') : 'System';
            messageDiv.appendChild(label);
        }

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        messageDiv.appendChild(content);

        chatMessages.appendChild(messageDiv);
        scrollToBottom();
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
        SaumaanState.sessionActive = false;
        hasGreeted = false;
        updateConnectionStatus('Disconnected');
        setAnimationState(AnimationStates.IDLE);
        
        // Save session state for resuming
        saveSessionState();
        
        addMessage('system', 'Conversation paused. Your session has been saved. Click "Start Conversation" to resume.');
    }

    // Handle logout
    async function handleLogout() {
        if (isConnected) {
            stopConversation();
        }

        // Clear session data if needed
        const clearAll = confirm('Do you want to clear your saved session data?');
        if (clearAll) {
            localStorage.removeItem('saumaan_session_state');
            localStorage.removeItem('saumaan_user_name');
        }

        // Logout from backend
        try {
            await fetch('/api/saumaan-logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Redirect to login page (same URL, backend will show login)
        window.location.href = '/100x-saumaan-assist';
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
});
