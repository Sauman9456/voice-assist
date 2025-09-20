import logging
import streamlit as st

@st.cache_resource
def get_logger(name: str, level: int = logging.DEBUG) -> logging.Logger:
    """
    Create and return a cached logger instance

    Args:
        name (str): Logger name
        level (int): Logging level (default: DEBUG)

    Returns:
        logging.Logger: Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Add handler if none exists
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(level)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
