import av
import numpy as np

def audio_frame_to_pcm_audio(frame: av.AudioFrame) -> bytes:
    """
    Convert an AudioFrame to PCM audio bytes.

    Args:
        frame (av.AudioFrame): Input audio frame

    Returns:
        bytes: PCM audio data
    """
    return frame.to_ndarray().tobytes()

def pcm_audio_to_audio_frame(
    pcm_audio: bytes,
    *,
    format: str,
    layout: str,
    sample_rate: int
) -> av.AudioFrame:
    """
    Convert PCM audio bytes to an AudioFrame.

    Args:
        pcm_audio (bytes): Input PCM audio data
        format (str): Audio format string
        layout (str): Channel layout
        sample_rate (int): Audio sample rate

    Returns:
        av.AudioFrame: Configured audio frame
    """
    raw_data = np.frombuffer(pcm_audio, np.int16).reshape(1, -1)
    frame = av.AudioFrame.from_ndarray(raw_data, format=format, layout=layout)
    frame.sample_rate = sample_rate
    return frame

def get_blank_audio_frame(
    *,
    format: str,
    layout: str,
    samples: int,
    sample_rate: int
) -> av.AudioFrame:
    """
    Create a blank audio frame with specified parameters.

    Args:
        format (str): Audio format string
        layout (str): Channel layout
        samples (int): Number of samples
        sample_rate (int): Audio sample rate

    Returns:
        av.AudioFrame: Blank audio frame
    """
    frame = av.AudioFrame(format=format, layout=layout, samples=samples)
    for p in frame.planes:
        p.update(bytes(p.buffer_size))
    frame.sample_rate = sample_rate
    return frame
