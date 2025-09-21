/**
 * Career Counseling Chat Integration
 * Combines WebRTC voice chat with career counseling functionality
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

    // Career Counselor State
    const CareerState = {
        sessionId: null,
        studentName: null,
        completedQuestions: [],
        currentQuestion: null,
        responses: {},
        isPaused: false,
        isResuming: false,  // Flag to indicate if we're resuming a session
        questionQueue: [],
        requiredQuestions: [
            'intro', 'academic_status', 'career_confusion', 'interests',
            'skills', 'ai_fears', 'industry_preference', 'work_values',
            'learning_style', 'obstacles', 'timeline', 'immediate_need'
        ],
        optionalQuestions: ['role_models', 'experience', 'support'],
        currentLanguage: 'english',  // Track current language: 'english' or 'hinglish'
        previousLanguage: 'english'   // Track previous turn language
    };

    // Initialize
    init();

    async function init() {
        // Clear any old session on page load (fresh login)
        clearOldSessionOnLogin();
        
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

        // Initialize Career Counselor
        initializeCareerCounselor();

        // Set up event listeners
        startBtn.addEventListener('click', handleStartSession);
        stopBtn.addEventListener('click', stopConversation);
        logoutBtn.addEventListener('click', handleLogout);
        
        // Listen for page unload to save state
        window.addEventListener('beforeunload', () => {
            if (isConnected) {
                saveSessionToStorage();
            }
        });
    }

    // Initialize Career Counselor
    function initializeCareerCounselor() {
        CareerState.sessionId = generateSessionId();
        CareerState.questionQueue = [...CareerState.requiredQuestions];
        
        // Load user name from localStorage (set during registration)
        const storedName = localStorage.getItem('user_name');
        if (storedName) {
            CareerState.studentName = storedName;
            console.log('Loaded user name from storage:', storedName);
        }
        
        console.log('Career Counselor initialized with session:', CareerState.sessionId);
    }

    // Clear old sessions on fresh login
    function clearOldSessionOnLogin() {
        // Check if user session is active (set during registration)
        const userSessionActive = localStorage.getItem('user_session_active');
        
        // If no active session marker, this is a fresh login
        if (!userSessionActive) {
            // Clear all career session data from localStorage
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('career_session_') || 
                    key.startsWith('career_summary_') || 
                    key.startsWith('career_paused_')) {
                    localStorage.removeItem(key);
                }
            });
            
            console.log('Cleared old sessions for fresh login');
        }
    }

    // Handle Start Session button click
    async function handleStartSession() {
        // Check for existing session in localStorage
        const savedSession = loadSessionFromStorage();
        
        if (savedSession && savedSession.completedQuestions.length > 0) {
            // Session found - ask user if they want to resume
            const shouldResume = confirm(
                `Found a previous session with ${savedSession.completedQuestions.length} completed questions.\n\n` +
                `Would you like to resume from where you left off?\n\n` +
                `Click OK to resume, Cancel to start fresh.`
            );
            
            if (shouldResume) {
                // Resume existing session
                resumeExistingSession(savedSession);
            } else {
                // User chose to start fresh - clear everything and reset state
                clearSessionFromStorage();
                resetCareerState();
                clearChatHistory();
                await startConversation();
            }
        } else {
            // No existing session - start fresh
            await startConversation();
        }
    }

    // Resume existing session
    function resumeExistingSession(savedSession) {
        // Restore the saved state
        Object.assign(CareerState, savedSession);
        
        // Mark that we're resuming a session
        CareerState.isResuming = true;
        
        // Show resume message
        addMessage('system', `Welcome back! Resuming your previous session.`);
        addMessage('system', `Previously completed ${savedSession.completedQuestions.length} questions.`);
        
        // Display previous responses in chat
        if (savedSession.chatHistory && savedSession.chatHistory.length > 0) {
            savedSession.chatHistory.forEach(msg => {
                addMessage(msg.type, msg.text);
            });
        }
        
        // Now start the conversation with the restored state
        startConversation();
    }

    // Save session to localStorage
    function saveSessionToStorage() {
        const sessionData = {
            ...CareerState,
            timestamp: new Date().toISOString(),
            chatHistory: getChatHistory()
        };
        
        localStorage.setItem('career_session_active', JSON.stringify(sessionData));
        console.log('Session saved to storage');
    }

    // Load session from localStorage
    function loadSessionFromStorage() {
        const savedData = localStorage.getItem('career_session_active');
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (error) {
                console.error('Error loading saved session:', error);
                return null;
            }
        }
        return null;
    }

    // Clear session from localStorage
    function clearSessionFromStorage() {
        localStorage.removeItem('career_session_active');
        console.log('Session cleared from storage');
    }
    
    // Reset Career State to initial values
    function resetCareerState() {
        CareerState.sessionId = generateSessionId();
        CareerState.studentName = null;
        CareerState.completedQuestions = [];
        CareerState.currentQuestion = null;
        CareerState.responses = {};
        CareerState.isPaused = false;
        CareerState.isResuming = false;
        CareerState.questionQueue = [...CareerState.requiredQuestions];
        console.log('Career state reset to initial values');
    }
    
    // Clear chat history from UI
    function clearChatHistory() {
        chatMessages.innerHTML = '';
        console.log('Chat history cleared');
    }

    // Get chat history for saving
    function getChatHistory() {
        const messages = chatMessages.querySelectorAll('.message');
        const history = [];
        
        messages.forEach(msg => {
            if (!msg.classList.contains('system-message')) {
                const content = msg.querySelector('.message-content');
                if (content) {
                    let type = 'user';
                    if (msg.classList.contains('bot-message')) {
                        type = 'assistant';
                    }
                    history.push({
                        type: type,
                        text: content.textContent
                    });
                }
            }
        });
        
        return history;
    }

    // Generate unique session ID
    function generateSessionId() {
        return 'career_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
            addMessage('system', 'Connected! The career counselor will start the conversation now.');

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

    // Set up Data Channel with Career Counselor Integration
    function setupDataChannel() {
        dataChannel = peerConnection.createDataChannel("realtime-channel");
        
        dataChannel.onopen = () => {
            console.log('Data channel opened');
            // Send career counselor session update
            sendCareerSessionUpdate();
        };

        dataChannel.onmessage = handleDataChannelMessage;
        
        dataChannel.onerror = (error) => {
            console.error("DataChannel error:", error);
            showError("Connection error: " + error.message);
        };
    }

    // Send Career Counselor Session Update
    function sendCareerSessionUpdate() {
        const sessionUpdate = {
            type: "session.update",
            session: {
                instructions: getCareerCounselorPrompt(),
                modalities: ["text", "audio"],
                tools: getCareerTools(),
                voice: "ash",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 350,
                }
            }
        };
        sendMessage(sessionUpdate);
        
        // If resuming, send context about the session
        if (CareerState.isResuming) {
            // Create a context message to inform the AI about the resumed state
            const resumeContext = {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "system",
                    content: [{
                        type: "input_text",
                        text: `IMPORTANT: This is a RESUMED session. The student has already answered ${CareerState.completedQuestions.length} questions. ` +
                              `Questions already answered: ${CareerState.completedQuestions.join(', ')}. ` +
                              `The next question to ask should be from the remaining unanswered questions. ` +
                              `Do not restart from the introduction. Continue naturally from where the conversation left off.`
                    }]
                }
            };
            sendMessage(resumeContext);
            
            // Reset the resuming flag
            CareerState.isResuming = false;
        }
        
        // Start the conversation
        sendMessage({ type: "response.create" });
    }

    // Get Career Counselor System Prompt (from realtime_prompts.py)
    function getCareerCounselorPrompt() {
        // Get the stored user name from localStorage or CareerState
        const userName = CareerState.studentName || localStorage.getItem('user_name') || null;
        const userFirstName = userName ? userName.split(" ")[0] : "there";
        
        // Language-specific examples based on current language state
        const langExamples = CareerState.currentLanguage === 'hinglish' ? {
            responses: [
                "Achha, that's interesting! Aap currently kya padh rahe hain?",
                "Main samjh sakti hun, bahut students ko yeh confusion hota hai",
                "Thik hai, let me note that down. Ab bataiye ki...",
                "Bilkul sahi! Aapke skills kaafi achhe lag rahe hain"
            ],
            instructions: "YOU MUST RESPOND IN HINGLISH - casual mix of English and Hindi. Use words like: bhi, kya, kaise, achha, thik hai, matlab, samjh. Never write output Hindi that is  Devanagari or Nastaliq, only in Hinglish(Romanized Hindi as given) as student does not know how to read hindi written in Devanagari or Nastaliq."
        } : {
            responses: [
                "That's really insightful! What subjects interest you the most?",
                "I understand completely, many students face this confusion",
                "Great, let me capture that. Now, could you tell me about...",
                "Excellent! Your skills seem quite promising"
            ],
            instructions: "YOU MUST RESPOND IN ENGLISH - clear, simple English appropriate for university students"
        };

        // Common acknowledgments and transitions
        const conversationHelpers = {
            acknowledgments: ["That's really insightful.", "I appreciate you sharing that.", "That makes complete sense.", "Many students feel the same way.", "That's a great point."],
            transitions: ["Let's explore another aspect...", "Building on that...", "Now I'd like to understand...", "Moving forward..."],
            empathy: ["That must be challenging.", "It's understandable to feel that way.", "You're not alone in this."],
            emotional: {
                fear: "That's a very valid concern that many students share",
                confusion: "It's completely normal to feel uncertain at this stage",
                frustration: "I understand this can feel overwhelming"
            }
        };

        return `
# Role & Objective
You are a warm, empathetic career counselor helping university students who feel lost about their career path. Conduct a structured 8-15 question interview to understand their academic situation, career confusion, skills, AI fears, industry preferences, and learning style.

# Personality & Communication
- Warm, supportive, never judgmental | Encouraging but realistic | Professional yet approachable mentor
- 2-3 sentences per response | Acknowledge briefly before next question
- Moderate, calming pace | Vary acknowledgments and transitions
- Semi-formal tone preferred by Indian students

# CRITICAL LANGUAGE INSTRUCTIONS
Current Language: ${CareerState.currentLanguage.toUpperCase()} | Previous: ${CareerState.previousLanguage.toUpperCase()}
${langExamples.instructions}
Examples: ${langExamples.responses.map(r => `"${r}"`).join(', ')}

Rules:
- Start first conversation in English
- If no language detected, use previous turn's language
- ${CareerState.currentLanguage === 'hinglish' ? 'When mentioning language support, say "English and Hinglish"' : ''}

# Reference Pronunciations
AI="A-I", UI/UX="U-I U-X", DevOps="dev-ops", SQL="sequel", API="A-P-I"

# Tools
## CRITICAL: Language Detection Requirement
ALWAYS call detect_user_language FIRST for EVERY user input - mandatory for correct language response

## detect_user_language(user_text, detected_language, confidence, Hinglish_words_found)
Use: ALWAYS FIRST for EVERY user input | Purpose: Language detection and state update

## track_survey_response(question_id, response)
Use: When student provides substantive answer | Preamble: "Let me capture that..."

## determine_next_question(completed_questions, student_profile)  
Use: After recording response | Call immediately after track_survey_response

## check_completion_status()
Use: To verify if enough information gathered

## end_session_summary()
Use: When all questions answered OR student requests to end

## stop_conversation()
Use: User wants to pause/stop/take break or similar

## trigger_logout()
Use: User says quit/exit/logout/end session or similar

# Core Instructions
- Must introduce yourself and explain purpose at start, and mention which languages you support (Hello ${userFirstName}!, I'm your career counseling assistant, and I'm here to help you navigate your career path. We'll go through some questions to understand your interests and concerns better...language...)
- Ask ONE question at a time | Track questions to avoid repetition
- Be PROACTIVE with tool calls | Acknowledge emotions appropriately
- If unclear audio after 2 attempts, offer to move to next question
- Be as Human as possible, Not too much formal not too casual. Do not talk to much with extras as student do not like this.
- Wait for students to response after each question and keep the session engaging and entertaining
- Use the student's name "${userFirstName}" throughout the conversation to keep it engaging.

# Question Flow (15 Questions)
1. **Introduction**: Welcome, explain 10-15 questions process
2. **Academic_Status**: Year and major/field of study
3. **Career_Confusion**: Specific career planning challenges
4. **Current_Interests**: Academic and personal interests (2-3)
5. **Skills_Assessment**: Technical and soft skills strengths
6. **AI_Fears**: Concerns about automation and job replacement
7. **Industry_Preferences**: Sectors and work environment preferences
8. **Work_Values**: Career priorities (salary, balance, impact)
9. **Learning_Style**: Preferred learning methods
10. **Role_Models**: Professional inspirations
11. **Obstacles**: Internal and external barriers
12. **Timeline_Pressure**: Decision urgency and family/peer pressure
13. **Previous_Experience**: Work/internship/project experiences
14. **Support_System**: Available career guidance resources
15. **Next_Steps**: Immediate guidance needs

## Summary
Thank student, summarize key points, explain next steps

# Conversation Helpers
Acknowledgments: ${conversationHelpers.acknowledgments.join(' | ')}
Transitions: ${conversationHelpers.transitions.join(' | ')}
Empathy: ${conversationHelpers.empathy.join(' | ')}

# Safety Escalation
Suggest human support for: severe anxiety/depression, self-harm mentions, specific job placement, legal/financial advice, academic emergencies
Response: "I'd recommend connecting with your university's career services for hands-on assistance."

# Session State
ID: ${CareerState.sessionId} | Completed: ${CareerState.completedQuestions.length} questions
Current: ${CareerState.currentQuestion || 'intro'} | Resuming: ${CareerState.isResuming}

${CareerState.isResuming && CareerState.completedQuestions.length > 0 ? `
# RESUMED SESSION - DO NOT RESTART
Completed: ${CareerState.completedQuestions.join(', ')}
Student Name: ${CareerState.studentName}
Continue from next unanswered question.
Previous responses: ${Object.entries(CareerState.responses).map(([q,r]) => `${q}: ${r.response}`).join(' | ')}
` : ''}
`;
    }

    // Get Career Tools Definition (from realtime_tools.py)
    function getCareerTools() {
        return [
            {
                type: "function",
                name: "detect_user_language",
                description: "Detect the language used by the user in their response. This tool MUST be called for EVERY user input to determine if they are speaking in English or Hinglish. This ensures the counselor responds in the appropriate language.",
                parameters: {
                    type: "object",
                    properties: {
                        user_text: {
                            type: "string",
                            description: "The user's input text to analyze for language detection"
                        },
                        detected_language: {
                            type: "string",
                            description: "The detected language of the user's input",
                            enum: ["english", "Hinglish"]
                        },
                        confidence: {
                            type: "string",
                            description: "Confidence level of the language detection",
                            enum: ["high", "medium", "low"]
                        },
                        Hinglish_words_found: {
                            type: "array",
                            items: { type: "string" },
                            description: "List of Hinglish words or patterns detected in the input"
                        }
                    },
                    required: ["user_text", "detected_language"]
                }
            },
            {
                type: "function",
                name: "track_survey_response",
                description: "Record a student's response to a survey question. Use this whenever a student provides a substantive answer to one of your questions.\n\nPreamble sample phrases:\n- \"Let me capture that...\"\n- \"I'm noting that down...\"\n- \"Let me record your response...\"\n- \"Got it, let me save that...\"",
                parameters: {
                    type: "object",
                    properties: {
                        question_id: {
                            type: "string",
                            description: "The ID of the question being answered (e.g., 'intro', 'academic_status', 'career_confusion')",
                            enum: [
                                "intro", "academic_status", "career_confusion", "interests",
                                "skills", "ai_fears", "industry_preference", "work_values",
                                "learning_style", "role_models", "obstacles", "timeline",
                                "experience", "support", "immediate_need"
                            ]
                        },
                        response: {
                            type: "string",
                            description: "The student's complete response to the question"
                        },
                        emotion_detected: {
                            type: "string",
                            description: "Any notable emotion detected in the response",
                            enum: ["neutral", "anxious", "confused", "frustrated", "hopeful", "excited", "overwhelmed"]
                        }
                    },
                    required: ["question_id", "response"]
                }
            },
            {
                type: "function",
                name: "determine_next_question",
                description: "Determine which question to ask next based on what has been covered and the student's profile. Call this immediately after tracking a response.",
                parameters: {
                    type: "object",
                    properties: {
                        completed_questions: {
                            type: "array",
                            items: { type: "string" },
                            description: "List of question IDs that have already been asked"
                        },
                        student_profile: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "Student's first name"
                                },
                                year: {
                                    type: "string",
                                    description: "Academic year (e.g., 'freshman', 'sophomore', 'junior', 'senior')"
                                },
                                major: {
                                    type: "string",
                                    description: "Current major or 'undecided'"
                                },
                                primary_concern: {
                                    type: "string",
                                    description: "Main career-related concern identified"
                                }
                            }
                        },
                        skip_optional: {
                            type: "boolean",
                            description: "Whether to skip optional questions to keep survey shorter",
                            default: false
                        }
                    },
                    required: ["completed_questions", "student_profile"]
                }
            },
            {
                type: "function",
                name: "check_completion_status",
                description: "Check if enough information has been gathered to complete the survey. Returns whether minimum required questions have been answered.",
                parameters: {
                    type: "object",
                    properties: {
                        responses_count: {
                            type: "integer",
                            description: "Number of substantive responses collected"
                        },
                        required_questions_answered: {
                            type: "array",
                            items: { type: "string" },
                            description: "List of required question IDs that have been answered"
                        },
                        conversation_duration: {
                            type: "integer",
                            description: "Duration of conversation in minutes"
                        }
                    },
                    required: ["responses_count", "required_questions_answered"]
                }
            },
            {
                type: "function",
                name: "end_session_summary",
                description: "Generate and save a comprehensive summary of the career counseling session. Use when all necessary questions are answered or student requests to end.\n\nPreamble sample phrases:\n- \"Let me summarize what we've discussed...\"\n- \"I'm preparing your session summary...\"\n- \"Let me compile everything we've covered...\"",
                parameters: {
                    type: "object",
                    properties: {
                        student_name: {
                            type: "string",
                            description: "Student's name"
                        },
                        session_data: {
                            type: "object",
                            properties: {
                                academic_info: {
                                    type: "object",
                                    properties: {
                                        year: { type: "string" },
                                        major: { type: "string" }
                                    }
                                },
                                career_concerns: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "List of career-related concerns"
                                },
                                interests: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Identified interests and passions"
                                },
                                skills: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Self-identified skills"
                                },
                                ai_automation_fears: {
                                    type: "string",
                                    description: "Concerns about AI and job automation"
                                },
                                preferred_industries: {
                                    type: "array",
                                    items: { type: "string" }
                                },
                                work_values: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Prioritized career values"
                                },
                                obstacles: {
                                    type: "array",
                                    items: { type: "string" }
                                },
                                immediate_needs: {
                                    type: "string",
                                    description: "Most pressing need for career guidance"
                                }
                            }
                        },
                        recommendations: {
                            type: "array",
                            items: { type: "string" },
                            description: "Initial recommendations based on the conversation"
                        }
                    },
                    required: ["student_name", "session_data"]
                }
            },
            {
                type: "function",
                name: "provide_clarification",
                description: "Provide clarification or examples when a student doesn't understand a question or needs more context.",
                parameters: {
                    type: "object",
                    properties: {
                        question_id: {
                            type: "string",
                            description: "The question that needs clarification"
                        },
                        clarification_type: {
                            type: "string",
                            description: "Type of clarification needed",
                            enum: ["definition", "example", "rephrase", "context"]
                        }
                    },
                    required: ["question_id", "clarification_type"]
                }
            },
            {
                type: "function",
                name: "detect_emotional_state",
                description: "Detect and respond to student's emotional state, especially if they seem overwhelmed, anxious, or need support.",
                parameters: {
                    type: "object",
                    properties: {
                        detected_emotion: {
                            type: "string",
                            description: "Primary emotion detected",
                            enum: ["anxiety", "overwhelm", "frustration", "confusion", "hopelessness", "neutral", "positive"]
                        },
                        intensity: {
                            type: "string",
                            description: "Intensity of the emotion",
                            enum: ["mild", "moderate", "severe"]
                        },
                        trigger: {
                            type: "string",
                            description: "What triggered this emotional response"
                        },
                        support_needed: {
                            type: "boolean",
                            description: "Whether professional support should be suggested"
                        }
                    },
                    required: ["detected_emotion", "intensity"]
                }
            },
            {
                type: "function",
                name: "adjust_conversation_depth",
                description: "Adjust the depth and pace of questioning based on student engagement and responses.",
                parameters: {
                    type: "object",
                    properties: {
                        current_engagement: {
                            type: "string",
                            description: "Student's current engagement level",
                            enum: ["highly_engaged", "moderately_engaged", "low_engagement", "disengaged"]
                        },
                        adjustment_action: {
                            type: "string",
                            description: "How to adjust the conversation",
                            enum: ["go_deeper", "maintain_pace", "speed_up", "wrap_up_soon"]
                        },
                        reason: {
                            type: "string",
                            description: "Reason for the adjustment"
                        }
                    },
                    required: ["current_engagement", "adjustment_action"]
                }
            },
            {
                type: "function",
                name: "stop_conversation",
                description: "Stop the conversation when user wants to pause, stop, or take a break. This ends the current session but preserves data.",
                parameters: {
                    type: "object",
                    properties: {
                        save_progress: {
                            type: "boolean",
                            description: "Whether to save the conversation progress",
                            default: true
                        }
                    },
                    required: []
                }
            },
            {
                type: "function",
                name: "trigger_logout",
                description: "Trigger logout when user says quit, exit, logout, or similar commands. This will end the session and log the user out.",
                parameters: {
                    type: "object",
                    properties: {
                        confirm_logout: {
                            type: "boolean",
                            description: "Confirmation to proceed with logout",
                            default: true
                        }
                    },
                    required: []
                }
            }
        ];
    }

    // Handle Data Channel Messages with Career Tool Support
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

    // Handle Tool Calls from the AI
    function handleToolCall(message) {
        console.log('Tool call received:', message);
        
        if (message.name && message.arguments) {
            const args = JSON.parse(message.arguments);
            let result = {};

            switch(message.name) {
                case 'detect_user_language':
                    result = detectUserLanguage(args);
                    break;
                case 'track_survey_response':
                    result = trackResponse(args);
                    break;
                case 'determine_next_question':
                    result = getNextQuestion(args);
                    break;
                case 'check_completion_status':
                    result = checkCompletion(args);
                    break;
                case 'end_session_summary':
                    result = generateSummary(args);
                    break;
                case 'provide_clarification':
                    result = provideClarification(args);
                    break;
                case 'detect_emotional_state':
                    result = detectEmotionalState(args);
                    break;
                case 'adjust_conversation_depth':
                    result = adjustConversationDepth(args);
                    break;
                case 'stop_conversation':
                    result = handleStopConversation(args);
                    break;
                case 'trigger_logout':
                    result = handleTriggerLogout(args);
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

    // Career Counselor Tool Implementations
    function trackResponse(params) {
        const { question_id, response, emotion_detected } = params;
        
        // Store the response
        CareerState.responses[question_id] = {
            response: response,
            emotion: emotion_detected || 'neutral',
            timestamp: new Date().toISOString()
        };
        
        // Mark question as completed
        if (!CareerState.completedQuestions.includes(question_id)) {
            CareerState.completedQuestions.push(question_id);
        }
        
        // Update student name if this was the intro question
        if (question_id === 'intro' && response) {
            CareerState.studentName = response.trim();
        }
        
        // Save to localStorage for persistence at every turn
        saveSessionToStorage();
        
        // Update progress display
        updateProgressDisplay();
        
        return {
            success: true,
            message: `Response recorded for ${question_id}`,
            completedCount: CareerState.completedQuestions.length
        };
    }

    function getNextQuestion(params) {
        const { completed_questions, skip_optional } = params;
        
        // Use the saved completed questions if resuming, otherwise use the passed parameter
        const actualCompletedQuestions = CareerState.completedQuestions.length > 0 ? 
            CareerState.completedQuestions : completed_questions;
        
        // Update completed questions
        CareerState.completedQuestions = actualCompletedQuestions;
        
        // Find next unanswered required question
        const unansweredRequired = CareerState.requiredQuestions.filter(
            q => !actualCompletedQuestions.includes(q)
        );
        
        if (unansweredRequired.length > 0) {
            CareerState.currentQuestion = unansweredRequired[0];
            
            // Save the updated state
            saveSessionToStorage();
            
            return {
                success: true,
                next_question: unansweredRequired[0],
                questions_remaining: unansweredRequired.length,
                already_completed: actualCompletedQuestions,
                student_name: CareerState.studentName || null
            };
        }
        
        // If all required done, check optional questions
        if (!skip_optional) {
            const unansweredOptional = CareerState.optionalQuestions.filter(
                q => !actualCompletedQuestions.includes(q)
            );
            
            if (unansweredOptional.length > 0) {
                CareerState.currentQuestion = unansweredOptional[0];
                
                // Save the updated state
                saveSessionToStorage();
                
                return {
                    success: true,
                    next_question: unansweredOptional[0],
                    questions_remaining: unansweredOptional.length,
                    is_optional: true,
                    already_completed: actualCompletedQuestions,
                    student_name: CareerState.studentName || null
                };
            }
        }
        
        // All questions completed
        return {
            success: true,
            complete: true,
            message: "All questions completed",
            total_answered: actualCompletedQuestions.length
        };
    }

    function checkCompletion(params) {
        const { responses_count, required_questions_answered } = params;
        
        const minRequired = 8; // Minimum number of questions
        const allRequiredCore = ['intro', 'academic_status', 'career_confusion', 'ai_fears', 'immediate_need'];
        
        const hasMinimum = responses_count >= minRequired;
        const hasCoreQuestions = allRequiredCore.every(q => required_questions_answered.includes(q));
        
        return {
            success: true,
            is_complete: hasMinimum && hasCoreQuestions,
            responses_count: responses_count,
            percentage: Math.round((required_questions_answered.length / CareerState.requiredQuestions.length) * 100)
        };
    }

    function generateSummary(params) {
        const summary = {
            session_id: CareerState.sessionId,
            timestamp: new Date().toISOString(),
            student_name: params.student_name,
            total_questions_answered: CareerState.completedQuestions.length,
            session_data: params.session_data,
            recommendations: params.recommendations || [],
            raw_responses: CareerState.responses
        };
        
        // Save summary to localStorage for persistence
        localStorage.setItem(`career_summary_${CareerState.sessionId}`, JSON.stringify(summary));
        
        // Clear active session after completion
        clearSessionFromStorage();
        
        // Send summary to server via WebSocket
        socket.emit('career_summary', summary);
        
        // Display summary in chat
        addMessage('system', 'Session summary has been generated and saved.');
        
        return {
            success: true,
            summary_saved: true,
            session_id: CareerState.sessionId
        };
    }

    function resumeSession(params) {
        const { student_identifier } = params;
        
        // Try to load from localStorage
        const keys = Object.keys(localStorage).filter(k => k.startsWith('career_paused_'));
        
        for (let key of keys) {
            const pausedData = JSON.parse(localStorage.getItem(key));
            if (pausedData.state.studentName === student_identifier || 
                pausedData.session_id === student_identifier) {
                
                // Restore state
                Object.assign(CareerState, pausedData.state);
                CareerState.isPaused = false;
                
                // Remove pause data
                localStorage.removeItem(key);
                
                addMessage('system', 'Previous conversation resumed.');
                
                return {
                    success: true,
                    resumed: true,
                    current_question: CareerState.currentQuestion,
                    completed_count: CareerState.completedQuestions.length
                };
            }
        }
        
        return {
            success: false,
            error: "No paused session found for this student"
        };
    }

    // Handler for detect_user_language tool (LLM-based detection)
    function detectUserLanguage(params) {
        const { user_text, detected_language, confidence, Hinglish_words_found } = params;
        
        // Update language state based on LLM's detection
        CareerState.previousLanguage = CareerState.currentLanguage;
        CareerState.currentLanguage = detected_language;
        
        // Log the LLM-based detection
        console.log(`LLM Language Detection: ${detected_language} (Confidence: ${confidence})`);
        if (Hinglish_words_found && Hinglish_words_found.length > 0) {
            console.log(`Hinglish words detected: ${Hinglish_words_found.join(', ')}`);
        }
        
        // Save the updated language state
        saveSessionToStorage();
        
        return {
            success: true,
            language_updated: true,
            current_language: detected_language,
            previous_language: CareerState.previousLanguage,
            message: `Language detected as ${detected_language} with ${confidence} confidence`
        };
    }

    // Additional tool handlers for new tools from realtime_tools.py
    function provideClarification(params) {
        const { question_id, clarification_type } = params;
        
        return {
            success: true,
            clarification_provided: true,
            question_id: question_id,
            type: clarification_type
        };
    }
    
    function detectEmotionalState(params) {
        const { detected_emotion, intensity, trigger, support_needed } = params;
        
        // Log emotional state
        console.log(`Emotional state detected: ${detected_emotion} (${intensity})`);
        
        if (support_needed) {
            addMessage('system', 'Based on the conversation, additional support may be beneficial.');
        }
        
        return {
            success: true,
            emotion_tracked: true,
            emotion: detected_emotion,
            intensity: intensity
        };
    }
    
    function adjustConversationDepth(params) {
        const { current_engagement, adjustment_action, reason } = params;
        
        console.log(`Adjusting conversation: ${adjustment_action} due to ${reason}`);
        
        return {
            success: true,
            adjustment_made: true,
            engagement_level: current_engagement,
            action: adjustment_action
        };
    }
    
    // Handler for stop_conversation tool
    function handleStopConversation(params) {
        const { save_progress = true } = params;
        
        if (save_progress) {
            saveSessionToStorage();
        }
        
        // Call the existing stopConversation function
        stopConversation();
        
        return {
            success: true,
            conversation_stopped: true,
            progress_saved: save_progress
        };
    }
    
    // Handler for trigger_logout tool
    function handleTriggerLogout(params) {
        const { confirm_logout = true } = params;
        
        if (confirm_logout) {
            // Clear session on explicit logout
            clearSessionFromStorage();
            
            // Call the existing handleLogout function
            handleLogout();
            
            return {
                success: true,
                logout_triggered: true,
                message: "Logging out and clearing session data"
            };
        }
        
        return {
            success: false,
            logout_triggered: false,
            message: "Logout cancelled"
        };
    }

    // Save career state to sessionStorage (deprecated - use saveSessionToStorage instead)
    function saveCareerState() {
        // Redirect to the new localStorage-based function
        saveSessionToStorage();
    }

    // Update progress display
    function updateProgressDisplay() {
        const total = CareerState.requiredQuestions.length + CareerState.optionalQuestions.length;
        const completed = CareerState.completedQuestions.length;
        const percentage = Math.round((completed / total) * 100);
        
        // You can add a progress bar to the UI if desired
        console.log(`Progress: ${completed}/${total} questions (${percentage}%)`);
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
                state: 'user-speaking',
                session_id: CareerState.sessionId,
                question_context: CareerState.currentQuestion,
                language_detected: CareerState.currentLanguage
            });
        }
    }

    // Handle response done
    function handleResponseDone(message) {
        if (message.response?.output?.[0]?.content?.[0]?.transcript) {
            const transcript = message.response.output[0].content[0].transcript;
            
            addMessage('assistant', transcript);
            
            // Save session state after each AI response
            saveSessionToStorage();
            
            // Log conversation
            socket.emit('conversation_update', {
                role: 'Assistant',
                message: transcript,
                state: 'ai-speaking',
                session_id: CareerState.sessionId,
                question_context: CareerState.currentQuestion
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
            label.textContent = type === 'assistant' ? 'Career Counselor' : 'System';
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
        updateConnectionStatus('Disconnected');
        setAnimationState(AnimationStates.IDLE);
        
        // Save final state to localStorage for resumption
        saveSessionToStorage();
        
        // Show progress summary
        const progress = getCareerProgress();
        addMessage('system', `Career counseling session paused. Completed ${progress.completed} out of ${progress.total} questions (${progress.percentage}%). You can resume later by clicking Start Session.`);
    }

    // Get career progress
    function getCareerProgress() {
        const total = CareerState.requiredQuestions.length + CareerState.optionalQuestions.length;
        const completed = CareerState.completedQuestions.length;
        const percentage = Math.round((completed / total) * 100);
        
        return {
            completed: completed,
            total: total,
            percentage: percentage,
            required_remaining: CareerState.requiredQuestions.filter(
                q => !CareerState.completedQuestions.includes(q)
            ).length,
            optional_remaining: CareerState.optionalQuestions.filter(
                q => !CareerState.completedQuestions.includes(q)
            ).length
        };
    }

    // Handle logout
    async function handleLogout() {
        if (isConnected) {
            stopConversation();
        }

        // Clear all session data on logout
        clearSessionFromStorage();
        
        // Clear user session markers
        localStorage.removeItem('user_session_active');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_email');
        
        // Clear sessionStorage
        sessionStorage.clear();

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

    socket.on('career_session_saved', (data) => {
        console.log('Career session saved:', data);
        addMessage('system', 'Your career counseling session has been saved to the server.');
    });
});
