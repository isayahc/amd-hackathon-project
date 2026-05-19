# AgentCAD Backend

AG2-powered FastAPI backend for generating CadQuery models and exporting STEP files.

## Install

```bash
pip install agentcad-backend
```

For local development from this repository:

```bash
cd backend
pip install -e ".[dev]"
```

## Run

```bash
agentcad-backend-server --host 127.0.0.1 --port 8000
```

The package also includes a small CLI entry point:

```bash
agentcad-backend-cli --help
```

The package also exposes the ASGI app at:

```text
agentcad_backend.main:app
```

## Configuration

Configuration is read from environment variables or a `.env` file in the backend
directory.

- `OPENAI_API_KEY`: enables AG2/OpenAI generation. Without it, the backend returns
  deterministic fallback geometry.
- `OPENAI_MODEL`: overrides the model used by the CAD and animation agents.
- `AGENT_TEMPERATURE`: adjusts agent temperature where supported.

## Build and Publish

```bash
python -m build
python -m twine check dist/*
python -m twine upload dist/*
```

GitHub Actions publishes tagged backend releases automatically. Bump the version
in `pyproject.toml`, commit the change, then push a matching tag:

```bash
git tag backend-v0.1.1
git push origin backend-v0.1.1
```
