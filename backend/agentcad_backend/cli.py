from __future__ import annotations

import argparse

import uvicorn


def server_main() -> None:
    parser = argparse.ArgumentParser(description="Run the AgentCAD FastAPI backend.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind.")
    parser.add_argument("--port", default=8000, type=int, help="Port to bind.")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for local development.",
    )
    args = parser.parse_args()

    uvicorn.run(
        "agentcad_backend.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


def cli_main() -> None:
    parser = argparse.ArgumentParser(description="AgentCAD backend command line tools.")
    parser.parse_args()


def main() -> None:
    server_main()


if __name__ == "__main__":
    main()
