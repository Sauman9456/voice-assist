"""
Career Counseling Realtime Voice Assistant - Tool Definitions
This module contains the tool specifications for managing the conversation flow
"""

# Tool definitions for the realtime API
CAREER_COUNSELING_TOOLS = [
    {
        "type": "function",
        "name": "track_survey_response",
        "description": """Record a student's response to a survey question. Use this whenever a student provides a substantive answer to one of your questions.
        
Preamble sample phrases:
- "Let me capture that..."
- "I'm noting that down..."
- "Let me record your response..."
- "Got it, let me save that..."
""",
        "parameters": {
            "type": "object",
            "properties": {
                "question_id": {
                    "type": "string",
                    "description": "The ID of the question being answered (e.g., 'intro', 'academic_status', 'career_confusion')",
                    "enum": [
                        "intro", "academic_status", "career_confusion", "interests",
                        "skills", "ai_fears", "industry_preference", "work_values",
                        "learning_style", "role_models", "obstacles", "timeline",
                        "experience", "support", "immediate_need"
                    ]
                },
                "response": {
                    "type": "string",
                    "description": "The student's complete response to the question"
                },
                "emotion_detected": {
                    "type": "string",
                    "description": "Any notable emotion detected in the response",
                    "enum": ["neutral", "anxious", "confused", "frustrated", "hopeful", "excited", "overwhelmed"]
                }
            },
            "required": ["question_id", "response"]
        }
    },
    {
        "type": "function",
        "name": "determine_next_question",
        "description": """Determine which question to ask next based on what has been covered and the student's profile. Call this immediately after tracking a response.""",
        "parameters": {
            "type": "object",
            "properties": {
                "completed_questions": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of question IDs that have already been asked"
                },
                "student_profile": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Student's first name"
                        },
                        "year": {
                            "type": "string",
                            "description": "Academic year (e.g., 'freshman', 'sophomore', 'junior', 'senior')"
                        },
                        "major": {
                            "type": "string",
                            "description": "Current major or 'undecided'"
                        },
                        "primary_concern": {
                            "type": "string",
                            "description": "Main career-related concern identified"
                        }
                    }
                },
                "skip_optional": {
                    "type": "boolean",
                    "description": "Whether to skip optional questions to keep survey shorter",
                    "default": False
                }
            },
            "required": ["completed_questions", "student_profile"]
        }
    },
    {
        "type": "function",
        "name": "check_completion_status",
        "description": """Check if enough information has been gathered to complete the survey. Returns whether minimum required questions have been answered.""",
        "parameters": {
            "type": "object",
            "properties": {
                "responses_count": {
                    "type": "integer",
                    "description": "Number of substantive responses collected"
                },
                "required_questions_answered": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of required question IDs that have been answered"
                },
                "conversation_duration": {
                    "type": "integer",
                    "description": "Duration of conversation in minutes"
                }
            },
            "required": ["responses_count", "required_questions_answered"]
        }
    },
    {
        "type": "function",
        "name": "end_session_summary",
        "description": """Generate and save a comprehensive summary of the career counseling session. Use when all necessary questions are answered or student requests to end.
        
Preamble sample phrases:
- "Let me summarize what we've discussed..."
- "I'm preparing your session summary..."
- "Let me compile everything we've covered...""",
        "parameters": {
            "type": "object",
            "properties": {
                "student_name": {
                    "type": "string",
                    "description": "Student's name"
                },
                "session_data": {
                    "type": "object",
                    "properties": {
                        "academic_info": {
                            "type": "object",
                            "properties": {
                                "year": {"type": "string"},
                                "major": {"type": "string"}
                            }
                        },
                        "career_concerns": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of career-related concerns"
                        },
                        "interests": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Identified interests and passions"
                        },
                        "skills": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Self-identified skills"
                        },
                        "ai_automation_fears": {
                            "type": "string",
                            "description": "Concerns about AI and job automation"
                        },
                        "preferred_industries": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "work_values": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Prioritized career values"
                        },
                        "obstacles": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "immediate_needs": {
                            "type": "string",
                            "description": "Most pressing need for career guidance"
                        }
                    }
                },
                "recommendations": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Initial recommendations based on the conversation"
                }
            },
            "required": ["student_name", "session_data"]
        }
    },
    {
        "type": "function",
        "name": "pause_conversation",
        "description": """Pause the current conversation when student requests a break. Saves current state for resumption.
        
Preamble sample phrases:
- "I'll pause our conversation here..."
- "Let me save your progress..."
- "Taking a break now...""",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Reason for pausing",
                    "enum": ["student_request", "time_limit", "technical_issue", "emotional_break"]
                },
                "current_question": {
                    "type": "string",
                    "description": "The question ID that was being discussed when paused"
                },
                "completed_questions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of questions already completed"
                },
                "session_notes": {
                    "type": "string",
                    "description": "Any important context to remember for resumption"
                }
            },
            "required": ["reason", "completed_questions"]
        }
    },
    {
        "type": "function",
        "name": "resume_conversation",
        "description": """Resume a previously paused conversation. Loads the saved state and continues from where left off.
        
Preamble sample phrases:
- "Welcome back! Let me load our previous conversation..."
- "Great to continue our discussion..."
- "Let's pick up where we left off...""",
        "parameters": {
            "type": "object",
            "properties": {
                "student_identifier": {
                    "type": "string",
                    "description": "Name or ID to identify returning student"
                },
                "load_context": {
                    "type": "boolean",
                    "description": "Whether to load and summarize previous context",
                    "default": True
                }
            },
            "required": ["student_identifier"]
        }
    },
    {
        "type": "function",
        "name": "provide_clarification",
        "description": """Provide clarification or examples when a student doesn't understand a question or needs more context.""",
        "parameters": {
            "type": "object",
            "properties": {
                "question_id": {
                    "type": "string",
                    "description": "The question that needs clarification"
                },
                "clarification_type": {
                    "type": "string",
                    "description": "Type of clarification needed",
                    "enum": ["definition", "example", "rephrase", "context"]
                }
            },
            "required": ["question_id", "clarification_type"]
        }
    },
    {
        "type": "function",
        "name": "detect_emotional_state",
        "description": """Detect and respond to student's emotional state, especially if they seem overwhelmed, anxious, or need support.""",
        "parameters": {
            "type": "object",
            "properties": {
                "detected_emotion": {
                    "type": "string",
                    "description": "Primary emotion detected",
                    "enum": ["anxiety", "overwhelm", "frustration", "confusion", "hopelessness", "neutral", "positive"]
                },
                "intensity": {
                    "type": "string",
                    "description": "Intensity of the emotion",
                    "enum": ["mild", "moderate", "severe"]
                },
                "trigger": {
                    "type": "string",
                    "description": "What triggered this emotional response"
                },
                "support_needed": {
                    "type": "boolean",
                    "description": "Whether professional support should be suggested"
                }
            },
            "required": ["detected_emotion", "intensity"]
        }
    },
    {
        "type": "function",
        "name": "adjust_conversation_depth",
        "description": """Adjust the depth and pace of questioning based on student engagement and responses.""",
        "parameters": {
            "type": "object",
            "properties": {
                "current_engagement": {
                    "type": "string",
                    "description": "Student's current engagement level",
                    "enum": ["highly_engaged", "moderately_engaged", "low_engagement", "disengaged"]
                },
                "adjustment_action": {
                    "type": "string",
                    "description": "How to adjust the conversation",
                    "enum": ["go_deeper", "maintain_pace", "speed_up", "wrap_up_soon"]
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for the adjustment"
                }
            },
            "required": ["current_engagement", "adjustment_action"]
        }
    }
]

# Tool response handlers (to be implemented in the main application)
TOOL_HANDLERS = {
    "track_survey_response": {
        "success_response": "I've recorded your response about {topic}.",
        "follow_up_action": "determine_next_question"
    },
    "determine_next_question": {
        "success_response": None,  # No verbal response, just ask the next question
        "follow_up_action": "ask_question"
    },
    "check_completion_status": {
        "success_response": "Let me check if we have enough information...",
        "follow_up_action": "end_or_continue"
    },
    "end_session_summary": {
        "success_response": "I've compiled a comprehensive summary of our conversation.",
        "follow_up_action": "close_session"
    },
    "pause_conversation": {
        "success_response": "I've saved our progress. Feel free to return whenever you're ready.",
        "follow_up_action": "save_state"
    },
    "resume_conversation": {
        "success_response": "Welcome back! I've loaded our previous conversation.",
        "follow_up_action": "continue_from_saved"
    },
    "provide_clarification": {
        "success_response": None,  # Clarification is provided directly
        "follow_up_action": "repeat_question"
    },
    "detect_emotional_state": {
        "success_response": None,  # Response varies based on emotion
        "follow_up_action": "provide_support"
    },
    "adjust_conversation_depth": {
        "success_response": None,  # Adjustment happens seamlessly
        "follow_up_action": "modify_approach"
    }
}

# Session state management structure
SESSION_STATE_SCHEMA = {
    "session_id": str,
    "student_info": {
        "name": str,
        "email": str,
        "timestamp": str
    },
    "conversation_state": {
        "current_question": str,
        "completed_questions": list,
        "pending_questions": list,
        "responses": dict,
        "emotional_trajectory": list,
        "engagement_level": str
    },
    "metadata": {
        "start_time": str,
        "last_interaction": str,
        "total_duration": int,
        "pause_count": int,
        "completion_percentage": float
    },
    "analysis": {
        "primary_concerns": list,
        "key_themes": list,
        "recommended_resources": list,
        "risk_factors": list
    }
}
