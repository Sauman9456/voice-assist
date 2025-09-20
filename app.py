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

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting Flask app on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
