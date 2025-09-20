# OpenAI Realtime Voice Chat on Streamlit

A reference implementation of OpenAI's Realtime API integration with Streamlit, enabling voice conversations with an AI assistant. This implementation uses JavaScript with WebRTC to handle real-time audio streaming directly in the browser.

## Features

- Real-time voice conversations with OpenAI's GPT model
- WebRTC-based audio streaming implemented in JavaScript
- Live transcription of user speech
- Interactive chat interface
- Clear conversation history display

## Prerequisites

- Python 3.8 or higher
- OpenAI API key with access to the Realtime API
- Streamlit
- `uv` package installer (faster and more secure than pip)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/MatanyaP/streamlit-openai-realtime-voice.git
cd openai-realtime-voice-chat-on-streamlit
```

2. Install dependencies using uv:

```bash
uv sync
```

3. Create a `.streamlit/secrets.toml` file with your OpenAI API key:

```toml
OPENAI_API_KEY = "your-api-key-here"
```

## Usage

1. Start the Streamlit app:

```bash
uv run streamlit run main.py
```

2. Open your web browser and navigate to the provided URL (typically http://localhost:8501)

3. Click "Start Conversation" and allow microphone access when prompted

4. Begin speaking with the AI assistant

## Project Structure

```
.
├── README.md
├── main.py              # Main Streamlit application with embedded JavaScript
├── prompt_utils.py      # Prompt management utilities
├── st_utils.py         # Streamlit utility functions
├── pyproject.toml      # Project dependencies and metadata
└── .streamlit/
    └── secrets.toml    # API keys and secrets (create this file)
```

## Technical Implementation

### JavaScript Components

The application uses JavaScript to implement:

- WebRTC audio streaming
- Real-time audio capture from the microphone
- Data channel management for communication with OpenAI's servers
- Dynamic chat interface updates
- Audio playback of AI responses

The JavaScript code is embedded within the Streamlit app using the `components.v1.html` feature, allowing seamless integration between the Python backend and the browser-based audio handling.

### How It Works

1. The JavaScript code establishes a WebRTC connection with OpenAI's servers
2. User's audio is captured using the browser's `getUserMedia` API
3. Audio is streamed in real-time through WebRTC to OpenAI's Realtime API
4. The chat interface is dynamically updated using JavaScript DOM manipulation
5. All communication with OpenAI's servers is handled through WebRTC data channels

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. When modifying the application, be aware that you might need to work with both Python and JavaScript code:

- Python files handle the Streamlit interface and application logic
- JavaScript code (embedded in `main.py`) handles all real-time audio and WebRTC functionality

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the Realtime API
- Streamlit for the wonderful web app framework
- The WebRTC project for enabling real-time communication
- All contributors and users of this project
