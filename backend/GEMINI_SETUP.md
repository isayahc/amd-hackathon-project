# Google Gemini Configuration Guide

This project now supports both **OpenAI** and **Google Gemini** as LLM providers for code generation and animation planning.

## Quick Start

### Option 1: Using OpenAI (Default)
```bash
export OPENAI_API_KEY="your-openai-key"
export LLM_PROVIDER="openai"
export OPENAI_MODEL="gpt-4.1"
```

### Option 2: Using Google Gemini with API Key
```bash
export GEMINI_API_KEY="your-gemini-key"
export LLM_PROVIDER="gemini"
export GEMINI_MODEL="gemini-2.5-flash"
```

### Option 3: Using Google Gemini with Google Cloud Project
```bash
export GEMINI_PROJECT_ID="your-project-id"
export GEMINI_LOCATION="us-west1"  # or other regions
export LLM_PROVIDER="gemini"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

## Configuration Details

### Environment Variables

#### LLM Provider Selection
- `LLM_PROVIDER`: Set to `"openai"` (default) or `"gemini"`

#### OpenAI Configuration
- `OPENAI_API_KEY`: Your OpenAI API key (required for OpenAI)
- `OPENAI_MODEL`: Model name (default: `"gpt-4.1"`)

#### Google Gemini Configuration
Gemini supports three authentication methods:

1. **Direct API Key** (simplest)
   - `GEMINI_API_KEY`: Your Google GenAI API key
   - `GEMINI_MODEL`: Model name (default: `"gemini-2.5-flash"`)

2. **Google Cloud Service Account**
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account JSON key file
   - `GEMINI_PROJECT_ID`: Your Google Cloud project ID
   - `GEMINI_LOCATION`: Region for the API (default: `"us-west1"`)

3. **Default Google Cloud Auth**
   - Set `GEMINI_PROJECT_ID` and `GEMINI_LOCATION`
   - Let Google Cloud SDK use default credentials from your system

#### Other Settings
- `AGENT_TEMPERATURE`: Model temperature (default: `"0.1"`)

## Available Gemini Models

- `gemini-2.5-flash` - Fast, efficient model (recommended for most tasks)
- `gemini-2.5-pro` - More capable, slower
- `gemini-3.1-pro-preview` - Latest preview model with extended thinking

## Gemini Features Supported

✅ Streaming  
✅ Function/tool calling  
✅ Structured outputs  
✅ Token usage and cost tracking  
✅ Vision capabilities (multimodal)  
✅ Extended thinking (with Gemini 3.1)

## Installation

Install the gemini dependencies:

```bash
pip install -U ag2[gemini]
```

Or to upgrade existing installation:

```bash
pip install -U ag2[openai,gemini]
```

## Example .env File

```env
# LLM Provider: "openai" or "gemini"
LLM_PROVIDER=gemini

# OpenAI Settings (if using OpenAI)
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4.1

# Google Gemini Settings (if using Gemini)
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
# OR use Google Cloud project:
# GEMINI_PROJECT_ID=your-project-id
# GEMINI_LOCATION=us-west1
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Agent Settings
AGENT_TEMPERATURE=0.1
```

## Getting Gemini API Keys

### Method 1: Direct API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy and use in `GEMINI_API_KEY`

### Method 2: Google Cloud Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable the "Generative Language API"
4. Create a service account and download the JSON key
5. Set `GOOGLE_APPLICATION_CREDENTIALS` to the key file path

## Switching Providers

To switch from OpenAI to Gemini (or vice versa):

```bash
# Switch to Gemini
export LLM_PROVIDER=gemini
export GEMINI_API_KEY=your-key

# Or back to OpenAI
export LLM_PROVIDER=openai
export OPENAI_API_KEY=your-key
```

No code changes needed - just update environment variables and restart the application.

## Main Distinctions Between Gemini and OpenAI

### Gemini-Specific Features
- **System Instructions**: Gemini accepts system instructions that are passed to the `system_instruction` field
- **Multiple Authentication Methods**: Supports direct API key, service accounts, and default Google Cloud auth
- **Extended Thinking**: Some Gemini models support extended thinking capabilities
- **Vision**: Native vision capabilities in all Gemini models

### OpenAI-Specific Features
- **Mature Ecosystem**: Extensive documentation and community support
- **Cost Predictability**: Well-established pricing models

## Troubleshooting

### "LLM configuration error"
- Check that the selected provider's credentials are set
- For OpenAI: Verify `OPENAI_API_KEY` is set
- For Gemini: Verify either `GEMINI_API_KEY` or `GEMINI_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS` is set

### "Missing API key"
- For Gemini API key method: Set `GEMINI_API_KEY` environment variable
- For Google Cloud auth: Set `GOOGLE_APPLICATION_CREDENTIALS` and `GEMINI_PROJECT_ID`

### "Unsupported LLM provider"
- Check that `LLM_PROVIDER` is set to either `"openai"` or `"gemini"`

## Links

- [AG2 Gemini Documentation](https://docs.ag2.ai/latest/docs/user-guide/models/google-gemini/)
- [Google Gemini API](https://ai.google.dev)
- [Google Cloud Console](https://console.cloud.google.com)
