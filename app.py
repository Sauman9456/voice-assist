import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from pathlib import Path
import time

# Load environment variables
load_dotenv()

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', str(uuid.uuid4()))
app.config['SESSION_TYPE'] = 'filesystem'

# Enable CORS and WebSocket support
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create sessions directory if it doesn't exist
SESSIONS_DIR = Path('sessions')
SESSIONS_DIR.mkdir(exist_ok=True)

# Create career summaries directory
CAREER_DIR = Path('sessions/career_summaries')
CAREER_DIR.mkdir(exist_ok=True, parents=True)

# Session management
class SessionManager:
    def __init__(self):
        self.active_sessions = {}
    
    def create_session(self, user_email, user_name):
        """Create a new user session with logging file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        session_id = str(uuid.uuid4())
        
        # Clean email for filename
        safe_email = user_email.replace('@', '_at_').replace('.', '_')
        session_file = SESSIONS_DIR / f"{safe_email}_{timestamp}.txt"
        
        session_data = {
            'id': session_id,
            'email': user_email,
            'name': user_name,
            'start_time': datetime.now(),
            'file_path': session_file,
            'conversation': []
        }
        
        # Write initial session info to file
        with open(session_file, 'w', encoding='utf-8') as f:
            f.write(f"Session Started: {datetime.now().isoformat()}\n")
            f.write(f"User: {user_name} ({user_email})\n")
            f.write(f"Session ID: {session_id}\n")
            f.write("-" * 80 + "\n\n")
        
        self.active_sessions[session_id] = session_data
        logger.info(f"Created session {session_id} for {user_email}")
        return session_id
    
    def log_conversation(self, session_id, role, message):
        """Log conversation to session file in real-time"""
        if session_id not in self.active_sessions:
            logger.warning(f"Session {session_id} not found")
            return
        
        session_data = self.active_sessions[session_id]
        timestamp = datetime.now().strftime('%H:%M:%S')
        
        # Add to memory
        session_data['conversation'].append({
            'timestamp': timestamp,
            'role': role,
            'message': message
        })
        
        # Write to file immediately
        try:
            with open(session_data['file_path'], 'a', encoding='utf-8') as f:
                f.write(f"[{timestamp}] {role}: {message}\n")
        except Exception as e:
            logger.error(f"Error writing to session file: {e}")
    
    def end_session(self, session_id):
        """End a session and finalize the log file"""
        if session_id not in self.active_sessions:
            return
        
        session_data = self.active_sessions[session_id]
        
        # Write session end to file
        try:
            with open(session_data['file_path'], 'a', encoding='utf-8') as f:
                f.write(f"\n{'-' * 80}\n")
                f.write(f"Session Ended: {datetime.now().isoformat()}\n")
                duration = datetime.now() - session_data['start_time']
                f.write(f"Duration: {duration}\n")
        except Exception as e:
            logger.error(f"Error finalizing session file: {e}")
        
        del self.active_sessions[session_id]
        logger.info(f"Ended session {session_id}")

# Initialize session manager
session_manager = SessionManager()

# Career Counseling Session Management
class CareerCounselingManager:
    def __init__(self):
        self.career_sessions = {}
        self.paused_sessions = {}
    
    def create_career_session(self, user_id, user_name, user_email):
        """Create a new career counseling session"""
        career_session_id = f"career_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        self.career_sessions[career_session_id] = {
            'id': career_session_id,
            'user_id': user_id,
            'user_name': user_name,
            'user_email': user_email,
            'start_time': datetime.now(),
            'completed_questions': [],
            'responses': {},
            'state': 'active',
            'emotional_trajectory': []
        }
        
        logger.info(f"Created career counseling session {career_session_id} for {user_name}")
        return career_session_id
    
    def save_response(self, career_session_id, question_id, response, emotion=None):
        """Save a student's response to a question"""
        if career_session_id not in self.career_sessions:
            return False
        
        session = self.career_sessions[career_session_id]
        session['responses'][question_id] = {
            'response': response,
            'timestamp': datetime.now().isoformat(),
            'emotion': emotion or 'neutral'
        }
        
        if question_id not in session['completed_questions']:
            session['completed_questions'].append(question_id)
        
        if emotion:
            session['emotional_trajectory'].append({
                'question_id': question_id,
                'emotion': emotion,
                'timestamp': datetime.now().isoformat()
            })
        
        return True
    
    def pause_session(self, career_session_id, current_question=None):
        """Pause a career counseling session"""
        if career_session_id not in self.career_sessions:
            return False
        
        session = self.career_sessions[career_session_id]
        session['state'] = 'paused'
        session['paused_at'] = datetime.now().isoformat()
        session['current_question'] = current_question
        
        # Move to paused sessions
        self.paused_sessions[career_session_id] = session
        del self.career_sessions[career_session_id]
        
        logger.info(f"Paused career session {career_session_id}")
        return True
    
    def resume_session(self, career_session_id):
        """Resume a paused career counseling session"""
        if career_session_id not in self.paused_sessions:
            return None
        
        session = self.paused_sessions[career_session_id]
        session['state'] = 'active'
        session['resumed_at'] = datetime.now().isoformat()
        
        # Move back to active sessions
        self.career_sessions[career_session_id] = session
        del self.paused_sessions[career_session_id]
        
        logger.info(f"Resumed career session {career_session_id}")
        return session
    
    def save_summary(self, career_session_id, summary_data):
        """Save career counseling summary to file"""
        if career_session_id not in self.career_sessions:
            return None
        
        session = self.career_sessions[career_session_id]
        
        # Create filename
        safe_email = session['user_email'].replace('@', '_at_').replace('.', '_')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        summary_file = CAREER_DIR / f"{safe_email}_{timestamp}_summary.json"
        
        # Prepare complete summary
        complete_summary = {
            'session_id': career_session_id,
            'user': {
                'name': session['user_name'],
                'email': session['user_email']
            },
            'timing': {
                'start': session['start_time'].isoformat(),
                'end': datetime.now().isoformat(),
                'duration_minutes': int((datetime.now() - session['start_time']).total_seconds() / 60)
            },
            'questions_answered': len(session['completed_questions']),
            'completed_questions': session['completed_questions'],
            'responses': session['responses'],
            'emotional_trajectory': session['emotional_trajectory'],
            'analysis': summary_data.get('session_data', {}),
            'recommendations': summary_data.get('recommendations', [])
        }
        
        # Save to file
        try:
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(complete_summary, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved career summary to {summary_file}")
            return str(summary_file)
        except Exception as e:
            logger.error(f"Error saving career summary: {e}")
            return None

# Initialize career counseling manager
career_manager = CareerCounselingManager()

# Routes
@app.route('/')
def index():
    """Main page - check if user is registered"""
    if 'user_id' not in session:
        return redirect(url_for('register'))
    return render_template('chat.html')

@app.route('/register')
def register():
    """User registration page"""
    return render_template('register.html')

@app.route('/api/register', methods=['POST'])
def api_register():
    """Handle user registration"""
    data = request.json
    user_email = data.get('email')
    user_name = data.get('name')
    
    if not user_email or not user_name:
        return jsonify({'error': 'Name and email are required'}), 400
    
    # Create session
    session_id = session_manager.create_session(user_email, user_name)
    
    # Store in Flask session
    session['user_id'] = session_id
    session['user_email'] = user_email
    session['user_name'] = user_name
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'redirect': url_for('index')
    })

@app.route('/api/config')
def get_config():
    """Get configuration for WebRTC"""
    return jsonify({
        'api_key': os.getenv('AZURE_OPENAI_API_KEY', ''),
        'sessions_url': os.getenv('SESSIONS_URL', 
            'https://new-voice-assist.openai.azure.com/openai/realtimeapi/sessions?api-version=2025-04-01-preview'),
        'webrtc_url': os.getenv('WEBRTC_URL', 
            'https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc'),
        'deployment': os.getenv('DEPLOYMENT', 'gpt-realtime'),
        'voice': os.getenv('VOICE', 'alloy')
    })

@app.route('/api/logout', methods=['POST'])
def logout():
    """End session and logout"""
    if 'user_id' in session:
        session_manager.end_session(session['user_id'])
        session.clear()
    return jsonify({'success': True, 'redirect': url_for('register')})

# WebSocket events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
    emit('connected', {'status': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {request.sid}")

@socketio.on('conversation_update')
def handle_conversation_update(data):
    """Handle conversation updates for logging"""
    session_id = session.get('user_id')
    if session_id:
        role = data.get('role', 'Unknown')
        message = data.get('message', '')
        session_manager.log_conversation(session_id, role, message)
        
        # Broadcast state change to update animations
        emit('state_change', {'state': data.get('state', 'idle')}, broadcast=True)

@socketio.on('state_change')
def handle_state_change(data):
    """Handle state changes for animation updates"""
    state = data.get('state', 'idle')
    emit('animation_state', {'state': state}, broadcast=True)

# Career Counseling WebSocket Events
@socketio.on('career_start')
def handle_career_start():
    """Initialize a career counseling session"""
    user_id = session.get('user_id')
    user_name = session.get('user_name')
    user_email = session.get('user_email')
    
    if not user_id:
        emit('career_error', {'error': 'User not authenticated'})
        return
    
    # Create career counseling session
    career_session_id = career_manager.create_career_session(user_id, user_name, user_email)
    session['career_session_id'] = career_session_id
    
    # Log the start
    session_manager.log_conversation(user_id, 'System', 'Started career counseling session')
    
    emit('career_started', {
        'success': True,
        'career_session_id': career_session_id,
        'message': 'Career counseling session initialized'
    })
    
    logger.info(f"Started career counseling for {user_name} ({career_session_id})")

@socketio.on('career_response')
def handle_career_response(data):
    """Handle career counseling survey responses"""
    career_session_id = session.get('career_session_id')
    user_id = session.get('user_id')
    
    if not career_session_id:
        emit('career_error', {'error': 'No active career counseling session'})
        return
    
    question_id = data.get('question_id')
    response = data.get('response')
    emotion = data.get('emotion', 'neutral')
    
    # Save the response
    success = career_manager.save_response(career_session_id, question_id, response, emotion)
    
    if success:
        # Log to main session
        session_manager.log_conversation(
            user_id, 
            'Career Response', 
            f"Q:{question_id} - A:{response[:100]}..."
        )
        
        emit('career_response_saved', {
            'success': True,
            'question_id': question_id,
            'questions_completed': len(career_manager.career_sessions[career_session_id]['completed_questions'])
        })
    else:
        emit('career_error', {'error': 'Failed to save response'})

@socketio.on('career_pause')
def handle_career_pause(data):
    """Pause the career counseling session"""
    career_session_id = session.get('career_session_id')
    
    if not career_session_id:
        emit('career_error', {'error': 'No active career counseling session'})
        return
    
    current_question = data.get('current_question')
    success = career_manager.pause_session(career_session_id, current_question)
    
    if success:
        emit('career_paused', {
            'success': True,
            'career_session_id': career_session_id,
            'message': 'Session paused. You can resume anytime.'
        })
        logger.info(f"Paused career session {career_session_id}")
    else:
        emit('career_error', {'error': 'Failed to pause session'})

@socketio.on('career_resume')
def handle_career_resume(data):
    """Resume a paused career counseling session"""
    career_session_id = data.get('career_session_id')
    
    if not career_session_id:
        # Try to find by user
        user_email = session.get('user_email')
        for sid, sess in career_manager.paused_sessions.items():
            if sess['user_email'] == user_email:
                career_session_id = sid
                break
    
    if not career_session_id:
        emit('career_error', {'error': 'No paused session found'})
        return
    
    resumed_session = career_manager.resume_session(career_session_id)
    
    if resumed_session:
        session['career_session_id'] = career_session_id
        
        emit('career_resumed', {
            'success': True,
            'career_session_id': career_session_id,
            'current_question': resumed_session.get('current_question'),
            'completed_questions': resumed_session['completed_questions'],
            'message': 'Session resumed successfully'
        })
        logger.info(f"Resumed career session {career_session_id}")
    else:
        emit('career_error', {'error': 'Failed to resume session'})

@socketio.on('career_summary')
def handle_career_summary(data):
    """Save career counseling summary"""
    career_session_id = session.get('career_session_id') or data.get('session_id')
    user_id = session.get('user_id')
    
    if not career_session_id or career_session_id not in career_manager.career_sessions:
        emit('career_error', {'error': 'No active career counseling session'})
        return
    
    # Save the summary
    summary_file = career_manager.save_summary(career_session_id, data)
    
    if summary_file:
        # Log to main session
        total_questions = data.get('total_questions_answered', 0)
        session_manager.log_conversation(
            user_id,
            'Career Summary',
            f"Completed career counseling with {total_questions} questions answered"
        )
        
        emit('summary_saved', {
            'success': True,
            'file': summary_file,
            'message': 'Career counseling summary saved successfully'
        })
        
        # Clean up the career session
        del career_manager.career_sessions[career_session_id]
        if 'career_session_id' in session:
            del session['career_session_id']
        
        logger.info(f"Saved career summary for session {career_session_id}")
    else:
        emit('career_error', {'error': 'Failed to save summary'})

@socketio.on('career_progress')
def handle_career_progress():
    """Get current career counseling progress"""
    career_session_id = session.get('career_session_id')
    
    if not career_session_id or career_session_id not in career_manager.career_sessions:
        emit('career_progress', {
            'active': False,
            'questions_completed': 0,
            'responses': {}
        })
        return
    
    session_data = career_manager.career_sessions[career_session_id]
    
    emit('career_progress', {
        'active': True,
        'career_session_id': career_session_id,
        'questions_completed': len(session_data['completed_questions']),
        'completed_questions': session_data['completed_questions'],
        'emotional_trajectory': session_data['emotional_trajectory']
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting Flask app on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
