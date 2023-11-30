# Copy this as `.env` (Don't forget the dot in front of the filename!)

# OpenAI's API Key. You will be charged for the usage of this key.
OPENAI_API_KEY="FILL_YOUR_API_KEY"
# The remaining variables are optional ================================

# Base directory of the translated content.
GPT_TRANSLATOR_BASE_DIR="../en_GB/QFramework_v1.0_Guide"

# Prompt file to use for the translation.
# PROMPT_FILE="prompt.md"

# HTTPS Proxy (e.g, "https://proxy.example.com:8080")
# HTTPS_PROXY=""

# Default language model. One of 'gpt-3.5-turbo', 'gpt-4' and 'gpt-4-32k'.
# MODEL_NAME="gpt-3.5-turbo"

# Soft limit of the token size, used to split the file into fragments.
# FRAGMENT_TOKEN_SIZE=2048

# Sampling temperature, i.e., randomness of the generated text.
# TEMPERATURE=0.1

# If you hit the API rate limit, you can set this to a positive number.
# API is not called more frequently than the given interval (in seconds).
# API_CALL_INTERVAL=0