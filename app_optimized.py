import os
import json
import uuid
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from pathlib import Path
import time
import threading
from queue import Queue, Empty
from collections import defaultdict
import atexit
from azure.storage.blob import BlobServiceClient, ContentSettings, BlobType
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
import concurrent.futures
from functools import lru_cache
import asyncio
from werkzeug.middleware.proxy_fix import ProxyFix

# Load environment variables
load_dotenv()

# Create Flask app with optimizations
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', str(uuid.uuid4()))
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000  # 1 year cache for static files

# Add proxy fix for Azure
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Enable CORS and WebSocket support - auto-detect async mode
CORS(app)

# Detect the best async mode
async_mode = None
try:
    import eventlet
    async_mode = 'eventlet'
except ImportError:
    try:
        import gevent
        async_mode = 'gevent'
    except ImportError:
        async_mode = 'threading'

# Configure logging - reduce verbosity
logging.basicConfig(
    level=logging.WARNING,  # Changed from INFO to WARNING to reduce logging overhead
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode=async_mode,  # Auto-detect best async mode
    ping_timeout=60,
    ping_interval=25,
    logger=False,
    engineio_logger=False
)

logger.info(f"SocketIO initialized with async_mode: {async_mode}")

# Performance configuration - optimized for Azure
BATCH_SIZE = 25  # Increased batch size
FLUSH_INTERVAL = 10  # Increased flush interval
MAX_WORKERS = 5  # Increased workers for concurrent operations
USE_APPEND_BLOB = True
CACHE_TTL = 300  # 5 minutes cache TTL

# Azure Blob Storage configuration
AZURE_CONNECTION_STRING = os.getenv('AZURE_STORAGE_CONNECTION_STRING')
CONTAINER_NAME = os.getenv('CONTAINER_NAME', 'new-voice-assist')
STORAGE_ACCOUNT_NAME = os.getenv('STORAGE_ACCOUNT_NAME', 'recruitmentresume')

# Initialize Azure Blob Storage client with optimized connection pooling
blob_service_client = None
container_client = None
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)

try:
    if AZURE_CONNECTION_STRING and AZURE_CONNECTION_STRING != 'YOUR_AZURE_STORAGE_CONNECTION_STRING_HERE':
        # Configure connection pooling with more aggressive settings
        blob_service_client = BlobServiceClient.from_connection_string(
            AZURE_CONNECTION_STRING,
            max_single_get_size=8*1024*1024,  # 8MB chunks
            max_chunk_get_size=8*1024*1024,   # 8MB chunks
            max_single_put_size=64*1024*1024, # 64MB for single put
            max_block_size=4*1024*1024        # 4MB blocks
        )
        container_client = blob_service_client.get_container_client(CONTAINER_NAME)
        
        # Ensure container exists
        try:
            container_client.get_container_properties()
        except ResourceNotFoundError:
            container_client = blob_service_client.create_container(CONTAINER_NAME)
            logger.info(f"Created container: {CONTAINER_NAME}")
        
        logger.info("Azure Blob Storage connected successfully with optimizations enabled")
    else:
        logger.warning("Azure Storage connection string not configured. Using local storage fallback.")
except Exception as e:
    logger.error(f"Failed to initialize Azure Blob Storage: {e}")
    logger.warning("Using local storage fallback.")

# Create local sessions directory as fallback
SESSIONS_DIR = Path('sessions')
SESSIONS_DIR.mkdir(exist_ok=True)

# Create career summaries directory as fallback
CAREER_DIR = Path('sessions/career_summaries')
CAREER_DIR.mkdir(exist_ok=True, parents=True)

# Optimized Azure Storage Manager with caching and batching
class OptimizedAzureStorageManager:
    def __init__(self):
        self.cache = {}  # In-memory cache for session data
        self.cache_timestamps = {}  # Track cache age
        self.message_queue = defaultdict(list)  # Queue messages for batching
        self.lock = threading.RLock()  # Use RLock for recursive locking
        self.flush_timer = None
        self.write_futures = {}  # Track async write operations
        self.start_periodic_flush()
        
    def start_periodic_flush(self):
        """Start a timer to periodically flush queued messages"""
        if self.flush_timer:
            self.flush_timer.cancel()
        self.flush_timer = threading.Timer(FLUSH_INTERVAL, self._periodic_flush)
        self.flush_timer.daemon = True
        self.flush_timer.start()
    
    def _periodic_flush(self):
        """Periodically flush all queued messages"""
        try:
            self.flush_all_queues()
            self._cleanup_old_cache()  # Clean old cache entries
        except Exception as e:
            logger.error(f"Error in periodic flush: {e}")
        finally:
            self.start_periodic_flush()
    
    def _cleanup_old_cache(self):
        """Remove cache entries older than TTL"""
        current_time = time.time()
        with self.lock:
            keys_to_remove = [
                key for key, timestamp in self.cache_timestamps.items()
                if current_time - timestamp > CACHE_TTL
            ]
            for key in keys_to_remove:
                del self.cache[key]
                del self.cache_timestamps[key]
    
    def save_to_blob_async(self, blob_name, data, content_type='application/json'):
        """Save data to Azure Blob Storage asynchronously with deduplication"""
        if not container_client:
            return None
        
        # Check if we already have a pending write for this blob
        with self.lock:
            if blob_name in self.write_futures:
                # Return existing future to avoid duplicate writes
                return self.write_futures[blob_name]
        
        def _save():
            try:
                blob_client = container_client.get_blob_client(blob_name)
                
                # Convert data to JSON string if it's a dict or list
                if isinstance(data, (dict, list)):
                    data_str = json.dumps(data, ensure_ascii=False)
                else:
                    data_str = data
                
                # Upload the blob with optimized settings
                blob_client.upload_blob(
                    data_str,
                    overwrite=True,
                    content_settings=ContentSettings(
                        content_type=content_type,
                        cache_control='max-age=3600'  # 1 hour browser cache
                    ),
                    metadata={'timestamp': str(time.time())}
                )
                
                # Update cache
                with self.lock:
                    self.cache[blob_name] = data if isinstance(data, dict) else json.loads(data_str)
                    self.cache_timestamps[blob_name] = time.time()
                    # Remove from pending writes
                    if blob_name in self.write_futures:
                        del self.write_futures[blob_name]
                
                return f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}"
            except Exception as e:
                logger.error(f"Failed to save to Azure Blob Storage: {e}")
                with self.lock:
                    if blob_name in self.write_futures:
                        del self.write_futures[blob_name]
                return None
        
        # Submit to thread pool for async execution
        future = thread_pool.submit(_save)
        
        # Track the future
        with self.lock:
            self.write_futures[blob_name] = future
        
        return future
    
    @lru_cache(maxsize=128)
    def _get_blob_metadata(self, blob_name):
        """Get blob metadata with caching"""
        if not container_client:
            return None
        
        try:
            blob_client = container_client.get_blob_client(blob_name)
            properties = blob_client.get_blob_properties()
            return {
                'size': properties.size,
                'last_modified': properties.last_modified,
                'etag': properties.etag
            }
        except:
            return None
    
    def get_cached_or_read(self, blob_name):
        """Get data from cache or read from blob if not cached"""
        current_time = time.time()
        
        with self.lock:
            # Check if we have valid cached data
            if blob_name in self.cache and blob_name in self.cache_timestamps:
                cache_age = current_time - self.cache_timestamps[blob_name]
                if cache_age < CACHE_TTL:
                    return self.cache[blob_name]
        
        # Read from blob if not in cache or cache expired
        data = self.read_from_blob(blob_name)
        if data:
            with self.lock:
                self.cache[blob_name] = data
                self.cache_timestamps[blob_name] = current_time
        return data
    
    def read_from_blob(self, blob_name):
        """Read data from Azure Blob Storage with retry logic"""
        if not container_client:
            return None
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                blob_client = container_client.get_blob_client(blob_name)
                download_stream = blob_client.download_blob()
                data = download_stream.readall()
                
                # Try to parse as JSON
                try:
                    return json.loads(data)
                except:
                    return data.decode('utf-8')
            except ResourceNotFoundError:
                return None
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to read from Azure Blob Storage after {max_retries} attempts: {e}")
                    return None
                time.sleep(0.5 * (attempt + 1))  # Exponential backoff
    
    def queue_message(self, blob_name, message_entry):
        """Queue a message for batched writing"""
        with self.lock:
            self.message_queue[blob_name].append(message_entry)
            
            # Flush if batch size reached
            if len(self.message_queue[blob_name]) >= BATCH_SIZE:
                self._flush_blob_queue(blob_name)
    
    def _flush_blob_queue(self, blob_name):
        """Flush queued messages for a specific blob"""
        if blob_name not in self.message_queue or not self.message_queue[blob_name]:
            return
        
        messages_to_write = self.message_queue[blob_name].copy()
        self.message_queue[blob_name].clear()
        
        # Submit batch write to thread pool
        thread_pool.submit(self._write_batch, blob_name, messages_to_write)
    
    def _write_batch(self, blob_name, messages):
        """Write a batch of messages to blob"""
        try:
            # Get current data from cache or blob
            existing_data = self.get_cached_or_read(blob_name)
            
            if existing_data is None:
                existing_data = {
                    'session_id': blob_name.split('/')[-1].replace('.json', ''),
                    'messages': []
                }
            
            # Add all messages
            if 'messages' not in existing_data:
                existing_data['messages'] = []
            existing_data['messages'].extend(messages)
            
            # Update cache
            current_time = time.time()
            with self.lock:
                self.cache[blob_name] = existing_data
                self.cache_timestamps[blob_name] = current_time
            
            # Write to blob
            blob_client = container_client.get_blob_client(blob_name)
            data_str = json.dumps(existing_data, ensure_ascii=False)
            
            blob_client.upload_blob(
                data_str,
                overwrite=True,
                content_settings=ContentSettings(
                    content_type='application/json',
                    cache_control='max-age=3600'
                ),
                metadata={'timestamp': str(current_time)}
            )
            
        except Exception as e:
            logger.error(f"Failed to write batch to blob {blob_name}: {e}")
    
    def flush_all_queues(self):
        """Flush all queued messages"""
        with self.lock:
            blob_names = list(self.message_queue.keys())
        
        for blob_name in blob_names:
            with self.lock:
                self._flush_blob_queue(blob_name)
    
    def invalidate_cache(self, blob_name=None):
        """Remove a blob from cache or clear all cache"""
        with self.lock:
            if blob_name:
                if blob_name in self.cache:
                    del self.cache[blob_name]
                if blob_name in self.cache_timestamps:
                    del self.cache_timestamps[blob_name]
            else:
                # Clear all cache
                self.cache.clear()
                self.cache_timestamps.clear()

# Initialize optimized storage manager
storage_manager = OptimizedAzureStorageManager()

# Register cleanup on exit
def cleanup():
    """Clean up resources on application exit"""
    storage_manager.flush_all_queues()
    thread_pool.shutdown(wait=True, cancel_futures=False)
    if storage_manager.flush_timer:
        storage_manager.flush_timer.cancel()

atexit.register(cleanup)

# Optimized Session management
class OptimizedSessionManager:
    def __init__(self):
        self.active_sessions = {}
        self.session_lock = threading.RLock()
    
    def create_session(self, user_email, user_name):
        """Create a new user session with logging file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        session_id = str(uuid.uuid4())
        
        # Clean email for filename
        safe_email = user_email.replace('@', '_at_').replace('.', '_')
        
        # Azure blob name in session folder
        blob_name = f"session/{safe_email}_{timestamp}.json"
        
        # Local file path as fallback
        session_file = SESSIONS_DIR / f"{safe_email}_{timestamp}.json"
        
        session_data = {
            'id': session_id,
            'email': user_email,
            'name': user_name,
            'start_time': datetime.now().isoformat(),
            'blob_name': blob_name,
            'file_path': str(session_file),
            'conversation': []
        }
        
        # Initialize session with metadata
        initial_data = {
            'session_id': session_id,
            'user': {
                'name': user_name,
                'email': user_email
            },
            'start_time': datetime.now().isoformat(),
            'messages': []
        }
        
        # Save initial data asynchronously
        if container_client:
            storage_manager.save_to_blob_async(blob_name, initial_data)
            # Pre-cache the initial data
            with storage_manager.lock:
                storage_manager.cache[blob_name] = initial_data
                storage_manager.cache_timestamps[blob_name] = time.time()
        else:
            # Fallback to local storage
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(initial_data, f, indent=2, ensure_ascii=False)
        
        with self.session_lock:
            self.active_sessions[session_id] = session_data
        
        logger.info(f"Created session {session_id} for {user_email}")
        return session_id
    
    def log_conversation(self, session_id, role, message):
        """Log conversation to session file using optimized batching"""
        with self.session_lock:
            if session_id not in self.active_sessions:
                logger.warning(f"Session {session_id} not found")
                return
            
            session_data = self.active_sessions[session_id]
        
        timestamp = datetime.now().isoformat()
        
        # Create message entry
        message_entry = {
            'timestamp': timestamp,
            'role': 'user' if role in ['User', 'Career Response'] else 'assistant',
            'content': message[:1000]  # Limit message size to prevent memory issues
        }
        
        # Add to memory
        session_data['conversation'].append(message_entry)
        
        # Keep conversation list bounded to prevent memory issues
        if len(session_data['conversation']) > 1000:
            session_data['conversation'] = session_data['conversation'][-500:]
        
        # Queue message for batched writing
        blob_name = session_data['blob_name']
        if container_client:
            storage_manager.queue_message(blob_name, message_entry)
        else:
            # Fallback to local storage with error handling
            try:
                file_path = Path(session_data['file_path'])
                if file_path.exists():
                    with open(file_path, 'r', encoding='utf-8') as f:
                        local_data = json.load(f)
                else:
                    local_data = {
                        'session_id': session_id,
                        'user': {
                            'name': session_data.get('name', 'Unknown'),
                            'email': session_data.get('email', 'Unknown')
                        },
                        'start_time': session_data.get('start_time', datetime.now().isoformat()),
                        'messages': []
                    }
                
                local_data['messages'].append(message_entry)
                
                # Keep messages bounded
                if len(local_data['messages']) > 1000:
                    local_data['messages'] = local_data['messages'][-500:]
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(local_data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"Error writing to local session file: {e}")
    
    def end_session(self, session_id):
        """End a session and finalize the log file"""
        with self.session_lock:
            if session_id not in self.active_sessions:
                return
            
            session_data = self.active_sessions[session_id].copy()
            del self.active_sessions[session_id]
        
        end_time = datetime.now()
        blob_name = session_data['blob_name']
        
        # Flush any pending messages
        if container_client:
            with storage_manager.lock:
                storage_manager._flush_blob_queue(blob_name)
        
        # Calculate duration
        start_time = datetime.fromisoformat(session_data['start_time'])
        duration = str(end_time - start_time)
        
        # Update session data with end information
        def finalize_session():
            try:
                existing_data = storage_manager.get_cached_or_read(blob_name)
                
                if existing_data:
                    # Update with end information
                    existing_data['end_time'] = end_time.isoformat()
                    existing_data['duration'] = duration
                    existing_data['total_messages'] = len(existing_data.get('messages', []))
                    
                    # Save final data
                    storage_manager.save_to_blob_async(blob_name, existing_data)
                    storage_manager.invalidate_cache(blob_name)
            except Exception as e:
                logger.error(f"Error finalizing session: {e}")
        
        if container_client:
            thread_pool.submit(finalize_session)
        else:
            # Fallback to local storage
            try:
                file_path = Path(session_data['file_path'])
                if file_path.exists():
                    with open(file_path, 'r', encoding='utf-8') as f:
                        local_data = json.load(f)
                    
                    local_data['end_time'] = end_time.isoformat()
                    local_data['duration'] = duration
                    local_data['total_messages'] = len(local_data.get('messages', []))
                    
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(local_data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"Error finalizing local session file: {e}")
        
        logger.info(f"Ended session {session_id}")

# Initialize optimized session manager
session_manager = OptimizedSessionManager()

# Career Counseling Session Management (using optimized storage)
class OptimizedCareerCounselingManager:
    def __init__(self):
        self.career_sessions = {}
        self.paused_sessions = {}
        self.session_lock = threading.RLock()
    
    def create_career_session(self, user_id, user_name, user_email):
        """Create a new career counseling session"""
        career_session_id = f"career_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        with self.session_lock:
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
        with self.session_lock:
            if career_session_id not in self.career_sessions:
                return False
            
            session = self.career_sessions[career_session_id]
            session['responses'][question_id] = {
                'response': response[:500],  # Limit response size
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
        with self.session_lock:
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
        with self.session_lock:
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
        """Save career counseling summary to Azure Blob Storage"""
        with self.session_lock:
            if career_session_id not in self.career_sessions:
                return None
            
            session = self.career_sessions[career_session_id].copy()
        
        # Create filename
        safe_email = session['user_email'].replace('@', '_at_').replace('.', '_')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Azure blob name in summary folder
        blob_name = f"summary/{safe_email}_{timestamp}_summary.json"
        
        # Local file path as fallback
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
        
        # Save asynchronously
        if container_client:
            future = storage_manager.save_to_blob_async(blob_name, complete_summary)
            # Don't wait for completion to avoid blocking
            logger.info(f"Saving career summary to Azure: {blob_name}")
            return f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}"
        
        # Fallback to local storage
        try:
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(complete_summary, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved career summary locally: {summary_file}")
            return str(summary_file)
        except Exception as e:
            logger.error(f"Error saving career summary: {e}")
            return None

# Initialize optimized career counseling manager
career_manager = OptimizedCareerCounselingManager()

# Routes with caching headers
@app.route('/')
def index():
    """Main page - check if user is registered"""
    if 'user_id' not in session:
        return redirect(url_for('register'))
    response = render_template('chat.html')
    return response

@app.route('/register')
def register():
    """User registration page"""
    response = render_template('register.html')
    return response

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
    session.permanent = True  # Make session permanent with expiry
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'redirect': url_for('index')
    })

@app.route('/api/config')
@lru_cache(maxsize=1)  # Cache config as it doesn't change
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

# Health check endpoint for Azure
@app.route('/health')
def health_check():
    """Health check endpoint for Azure App Service"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

# WebSocket events - optimized handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'status': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    pass  # Removed logging to reduce overhead

@socketio.on('conversation_update')
def handle_conversation_update(data):
    """Handle conversation updates for logging"""
    session_id = session.get('user_id')
    if session_id:
        role = data.get('role', 'Unknown')
        message = data.get('message', '')
        
        # Log asynchronously
        thread_pool.submit(session_manager.log_conversation, session_id, role, message)
        
        # Broadcast state change only if needed
        state = data.get('state')
        if state and state != 'idle':
            emit('state_change', {'state': state}, room=request.sid)

@socketio.on('state_change')
def handle_state_change(data):
    """Handle state changes for animation updates"""
    state = data.get('state', 'idle')
    if state != 'idle':  # Only broadcast non-idle states
        emit('animation_state', {'state': state}, room=request.sid)

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
    thread_pool.submit(session_manager.log_conversation, user_id, 'System', 'Started career counseling session')
    
    emit('career_started', {
        'success': True,
        'career_session_id': career_session_id,
        'message': 'Career counseling session initialized'
    })

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
        # Log asynchronously
        thread_pool.submit(
            session_manager.log_conversation,
            user_id, 
            'Career Response', 
            f"Q:{question_id} - A:{response[:100]}..."
        )
        
        emit('career_response_saved', {
            'success': True,
            'question_id': question_id,
            'questions_completed': len(career_manager.career_sessions.get(career_session_id, {}).get('completed_questions', []))
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
    else:
        emit('career_error', {'error': 'Failed to pause session'})

@socketio.on('career_resume')
def handle_career_resume(data):
    """Resume a paused career counseling session"""
    career_session_id = data.get('career_session_id')
    
    if not career_session_id:
        # Try to find by user
        user_email = session.get('user_email')
        with career_manager.session_lock:
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
    else:
        emit('career_error', {'error': 'Failed to resume session'})

@socketio.on('career_summary')
def handle_career_summary(data):
    """Save career counseling summary"""
    career_session_id = session.get('career_session_id') or data.get('session_id')
    user_id = session.get('user_id')
    
    with career_manager.session_lock:
        if not career_session_id or career_session_id not in career_manager.career_sessions:
            emit('career_error', {'error': 'No active career counseling session'})
            return
    
    # Save the summary
    summary_location = career_manager.save_summary(career_session_id, data)
    
    if summary_location:
        # Log asynchronously
        total_questions = data.get('total_questions_answered', 0)
        thread_pool.submit(
            session_manager.log_conversation,
            user_id,
            'Career Summary',
            f"Completed career counseling with {total_questions} questions answered"
        )
        
        emit('summary_saved', {
            'success': True,
            'location': summary_location,
            'message': 'Career counseling summary saved successfully'
        })
        
        # Clean up the career session
        with career_manager.session_lock:
            if career_session_id in career_manager.career_sessions:
                del career_manager.career_sessions[career_session_id]
        if 'career_session_id' in session:
            del session['career_session_id']
    else:
        emit('career_error', {'error': 'Failed to save summary'})

@socketio.on('career_progress')
def handle_career_progress():
    """Get current career counseling progress"""
    career_session_id = session.get('career_session_id')
    
    with career_manager.session_lock:
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
    port = int(os.getenv('PORT', 8080))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    # Check Azure Storage connectivity
    if container_client:
        logger.info(f"Azure Storage configured: Container '{CONTAINER_NAME}' in account '{STORAGE_ACCOUNT_NAME}'")
        logger.info(f"Performance optimizations enabled: Batch size={BATCH_SIZE}, Flush interval={FLUSH_INTERVAL}s")
    else:
        logger.warning("Azure Storage not configured - using local file storage")
    
    logger.info(f"Starting Flask app on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
