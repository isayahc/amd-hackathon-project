# Google Gemini Integration Summary

## What Was Added

Your AgentCAD backend now supports **Google Gemini** as an alternative to OpenAI for code generation and animation planning.

## Files Modified/Created

### Modified Files
- **pyproject.toml**: Added `gemini` to AG2 dependencies
- **app/config.py**: Extended Settings dataclass with Gemini configuration options
- **app/services/cadquery_agent.py**: Updated to use flexible LLM configuration
- **app/services/animation_agent.py**: Updated to use flexible LLM configuration

### New Files
- **app/llm_config.py**: Helper module for building LLM configurations for both providers
- **GEMINI_SETUP.md**: Comprehensive setup and configuration guide
- **.env.example**: Example environment variables template
- **OAI_CONFIG_LIST.example.json**: Example AG2 config list with Gemini entries

## Quick Start

### 1. Install Dependencies
```bash
cd backend
pip install -U ag2[gemini]
```

### 2. Configure Environment
Add to your `.env` file:

**Option A: Using Gemini API Key**
```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.5-flash
```

**Option B: Using Google Cloud Project**
```bash
LLM_PROVIDER=gemini
GEMINI_PROJECT_ID=your-project-id
GEMINI_LOCATION=us-west1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

**Option C: Keep Using OpenAI (default)**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
```

### 3. Restart Your Backend
```bash
python -m app.main
# or use your deployment method
```

## Key Features

✅ **No Code Changes Required**: Switch providers by just changing environment variables  
✅ **Multiple Auth Methods**: API key, service account, or default Google Cloud auth  
✅ **Feature Parity**: Both providers support the same capabilities  
✅ **Graceful Fallbacks**: If LLM fails, the system falls back to simple defaults  
✅ **Model Selection**: Choose from different models within each provider  

## Supported Gemini Models

- `gemini-2.5-flash` - Fast and efficient (recommended)
- `gemini-2.5-pro` - More capable
- `gemini-3.1-pro-preview` - Latest with extended thinking

## Configuration Priority

The LLM configuration is built based on the `LLM_PROVIDER` setting:

1. If `LLM_PROVIDER=openai`: Uses `OPENAI_API_KEY` and `OPENAI_MODEL`
2. If `LLM_PROVIDER=gemini`: Uses one of these in order:
   - `GEMINI_API_KEY` (direct API key)
   - `GOOGLE_APPLICATION_CREDENTIALS` (service account)
   - `GEMINI_PROJECT_ID` (Google Cloud project)

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `LLM_PROVIDER` | Provider to use | No | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | For OpenAI | - |
| `OPENAI_MODEL` | OpenAI model name | No | `gpt-4.1` |
| `GEMINI_API_KEY` | Gemini API key | For Gemini (if no GCP) | - |
| `GEMINI_PROJECT_ID` | Google Cloud project ID | For Gemini (if no API key) | - |
| `GEMINI_LOCATION` | Google Cloud region | No | `us-west1` |
| `GEMINI_MODEL` | Gemini model name | No | `gemini-2.5-flash` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | For GCP auth | - |
| `AGENT_TEMPERATURE` | Model temperature | No | `0.1` |

## Getting Gemini API Keys

### Free Tier (API Key)
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Use in `GEMINI_API_KEY`

### Google Cloud (Service Account)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create/select a project
3. Enable "Generative Language API"
4. Create a service account
5. Download JSON key
6. Set `GOOGLE_APPLICATION_CREDENTIALS` to the file path

## Testing Configuration

Check that your configuration is working:

```bash
# These environment variables should be set correctly
echo $LLM_PROVIDER
echo $GEMINI_API_KEY  # or $OPENAI_API_KEY
```

Start the backend and verify agent generation works:

```bash
cd backend
python -m app.main
```

## Switching Providers

To switch from OpenAI to Gemini or vice versa:

1. Update `LLM_PROVIDER` in `.env`
2. Ensure appropriate API keys are set
3. Restart the backend
4. No code changes needed!

## Documentation

For detailed setup instructions and troubleshooting, see [GEMINI_SETUP.md](./GEMINI_SETUP.md)

For AG2's Gemini documentation, visit:  
https://docs.ag2.ai/latest/docs/user-guide/models/google-gemini/

## Support

If you encounter issues:
1. Check [GEMINI_SETUP.md](./GEMINI_SETUP.md) troubleshooting section
2. Verify environment variables are set correctly
3. Ensure API keys have appropriate permissions
4. Check backend logs for detailed error messages
