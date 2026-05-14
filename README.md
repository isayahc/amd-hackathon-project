## Introduction
Why not make the palantir of manifacturing

## Prerequisites

- Python 3.11 or higher
- Node.js (for frontend development)
- Git

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd logic-gate
   ```

2. **Set up Python virtual environment:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install Python dependencies:**
   ```bash
   cd backend
   pip install -e .
   # Note: If uvicorn is not installed, install it explicitly:
   pip install uvicorn[standard]
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

5. **Set up frontend (optional for backend-only development):**
   ```bash
   cd ../frontend
   npm install
   ```

## Running

### Backend Only (with Uvicorn)

#### Development Mode
```bash
cd backend
source ../.venv/bin/activate  # On Windows: ..\venv\Scripts\activate

# Run with auto-reload for development
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Or run the module directly
python -m app.main
```

**From project root:**
```bash
# Activate virtual environment and run uvicorn
source .venv/bin/activate && cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Or use the full path to uvicorn
source .venv/bin/activate && .venv/bin/uvicorn backend/app/main:app --host 127.0.0.1 --port 8000 --reload
```

#### Production Mode
```bash
cd backend
source ../.venv/bin/activate

# Run with multiple workers for production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Or with SSL/TLS (if configured)
uvicorn app.main:app --host 0.0.0.0 --port 443 --ssl-keyfile /path/to/key.pem --ssl-certfile /path/to/cert.pem
```

**From project root:**
```bash
# Production with virtual environment
source .venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

#### Uvicorn Options

Common uvicorn command-line options:

- `--host`: Host to bind to (default: 127.0.0.1)
- `--port`: Port to bind to (default: 8000)
- `--reload`: Enable auto-reload on code changes (development only)
- `--workers`: Number of worker processes (production)
- `--log-level`: Logging level (debug, info, warning, error, critical)
- `--access-log`: Enable access logging
- `--ssl-keyfile` / `--ssl-certfile`: SSL certificate files

Example with full options:
```bash
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --log-level info \
  --access-log \
  --reload
```

### Full Stack Development

Use the provided development script to run both backend and frontend:

```bash
# From project root
./run-dev.sh
```

This will start:
- Backend on http://127.0.0.1:8000
- Frontend on http://127.0.0.1:5173

### STEP Generation CLI

From the backend directory, you can generate STEP files without starting the API server:

```bash
cd backend
../.venv/bin/python -m app.cli models
../.venv/bin/python -m app.cli generate "small bracket with center hole" --provider gemini --model gemini-2.5-flash
../.venv/bin/python -m app.cli history
../.venv/bin/python -m app.cli jobs
../.venv/bin/python -m app.cli job <job-id> --error
../.venv/bin/python -m app.cli render-video <object-id>
```

To continue a versioned design session, reuse the printed session UUID:

```bash
../.venv/bin/python -m app.cli generate "add two mounting ears" --provider gemini --model gemini-2.5-pro --session <session-uuid>
../.venv/bin/python -m app.cli history --session <session-uuid>
```

If the backend package is installed in editable mode, the console script is also available:

```bash
agentcad generate "small bracket with center hole" --provider gemini --model gemini-2.5-flash
agentcad jobs
agentcad job <job-id> --error
agentcad render-video <object-id> --width 960 --height 720 --fps 24 --duration 4
```

Rendered videos are cached in `backend/storage/videos`. The API can render/download the same MP4:

```bash
curl -o preview.mp4 "http://127.0.0.1:8000/api/objects/<object-id>/video?width=960&height=720&fps=24&duration=4"
```

### Docker (if available)

If you have Docker set up:

```bash
# Build and run with Docker
docker build -t logic-gate .
docker run -p 8000:8000 logic-gate
```

## Configuration

### Environment Variables

Key environment variables (see `.env.example`):

- `LLM_PROVIDER`: Choose "openai" or "gemini"
- `OPENAI_API_KEY`: Your OpenAI API key
- `GEMINI_API_KEY`: Your Google Gemini API key
- `METADATA_BACKEND`: Choose "local", "postgres", or "supabase"
- `POSTGRES_URL` / `SUPABASE_DB_URL`: PostgreSQL connection strings for non-local metadata
- `VIDEO_STORAGE_BACKEND`: Choose "local" or "minio"
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`: MinIO storage settings
- `AGENT_TEMPERATURE`: Model temperature (0.0-1.0)

Metadata defaults to local SQLite at `backend/storage/app.db`. Supabase metadata uses the Supabase Postgres connection string through `SUPABASE_DB_URL`.

Rendered videos default to local files under `backend/storage/videos`. With `VIDEO_STORAGE_BACKEND=minio`, rendered MP4s are uploaded to MinIO and the API returns either `VIDEO_PUBLIC_BASE_URL` links or presigned URLs.

### API Endpoints

Once running, the API will be available at:
- **API Documentation**: http://127.0.0.1:8000/api/docs
- **Alternative Docs**: http://127.0.0.1:8000/api/redoc
- **Health Check**: http://127.0.0.1:8000/api/health

## Troubleshooting

### Common Issues

**Module not found errors (fastapi, ag2, etc.):**
```bash
# Make sure you're in the virtual environment
source .venv/bin/activate
cd backend
pip install -e .
```

**"ModuleNotFoundError" when running uvicorn:**
```bash
# Make sure uvicorn is installed in the virtual environment
source .venv/bin/activate
pip install uvicorn[standard]

# Then run the server
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Or from project root:
source .venv/bin/activate && cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Port already in use:**
```bash
# Find process using the port
lsof -i :8000
# Or use a different port
uvicorn app.main:app --port 8001
```

**LLM configuration errors:**
- Check your `.env` file has the correct API keys
- For OpenAI: ensure `OPENAI_API_KEY` is set
- For Gemini: ensure `GEMINI_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` is set

**Database issues:**
- Check that the `backend/storage/app.db` file exists
- The database is automatically created on first run

### Logs

When running with the development script:
- Backend logs: `.run/logs/backend.log`
- Frontend logs: `.run/logs/frontend.log`

For manual uvicorn runs, logs appear in the terminal.

## Project Structure

```
logic-gate/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI application
│   │   ├── config.py       # Configuration settings
│   │   ├── routes.py       # API routes
│   │   ├── models.py       # Database models
│   │   ├── db.py          # Database setup
│   │   └── services/      # Business logic
│   ├── storage/           # File storage
│   └── pyproject.toml     # Python dependencies
├── frontend/              # Vue.js frontend
├── assets/               # Static assets
├── .venv/               # Python virtual environment
└── run-dev.sh          # Development runner script
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `cd backend && python -m pytest`
5. Submit a pull request

## License

[Add license information here]
