"""LLM configuration helpers for both OpenAI and Google Gemini."""

from __future__ import annotations

from typing import Any

from app.config import Settings


# OPENAI_MODELS = ["gpt-4.1"]
OPENAI_MODELS = ["gpt-5.5"]
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.1-pro-preview"]


def build_llm_config(settings: Settings) -> dict[str, Any]:
    """
    Build LLM configuration based on the selected provider.
    
    Supports:
    - OpenAI: Uses OPENAI_API_KEY and OPENAI_MODEL
    - Google Gemini: Uses GEMINI_API_KEY or Google Cloud credentials
    
    Args:
        settings: Application settings
        
    Returns:
        Dictionary containing AG2 LLM configuration
        
    Raises:
        ValueError: If no valid LLM provider is configured
    """
    provider = settings.llm_provider.lower()
    
    if provider == "openai":
        return _build_openai_config(settings)
    elif provider == "gemini":
        return _build_gemini_config(settings)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


def _build_openai_config(settings: Settings) -> dict[str, Any]:
    """Build OpenAI LLM configuration."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required for OpenAI provider")
    
    return {
        "config_list": [
            {
                "model": settings.openai_model,
                "api_key": settings.openai_api_key,
            }
        ],
    }


def _build_gemini_config(settings: Settings) -> dict[str, Any]:
    """
    Build Google Gemini LLM configuration.
    
    Supports three authentication methods:
    1. API Key: GEMINI_API_KEY environment variable
    2. Google Cloud Service Account: GOOGLE_APPLICATION_CREDENTIALS pointing to JSON key file
    3. Default Google Cloud credentials: If neither of the above are set
    """
    config_entry: dict[str, Any] = {
        "model": settings.gemini_model,
        "api_type": "google",
    }
    
    # Method 1: Direct API Key
    if settings.gemini_api_key:
        config_entry["api_key"] = settings.gemini_api_key
    # Method 2: Service Account with explicit credentials file
    elif settings.gemini_credentials_file:
        config_entry["google_application_credentials"] = settings.gemini_credentials_file
    # Method 3: Google Cloud Project credentials
    elif settings.gemini_project_id:
        config_entry["project_id"] = settings.gemini_project_id
        if settings.gemini_location:
            config_entry["location"] = settings.gemini_location
    # Method 4: Default Google Cloud authentication
    # (GOOGLE_APPLICATION_CREDENTIALS will be picked up by the library)
    
    # If project_id is configured, add location
    if settings.gemini_project_id and "project_id" not in config_entry:
        config_entry["project_id"] = settings.gemini_project_id
        if settings.gemini_location:
            config_entry["location"] = settings.gemini_location
    
    return {
        "config_list": [config_entry],
    }


def get_provider_info(settings: Settings) -> dict[str, str]:
    """Get information about the currently configured LLM provider."""
    provider = settings.llm_provider.lower()
    
    if provider == "openai":
        return {
            "provider": "openai",
            "model": settings.openai_model,
            "authenticated": bool(settings.openai_api_key),
        }
    elif provider == "gemini":
        auth_method = "none"
        if settings.gemini_api_key:
            auth_method = "api_key"
        elif settings.gemini_credentials_file:
            auth_method = "service_account"
        elif settings.gemini_project_id:
            auth_method = "project_id"
        
        return {
            "provider": "gemini",
            "model": settings.gemini_model,
            "authentication": auth_method,
            "project_id": settings.gemini_project_id or "not_configured",
        }
    else:
        return {"error": f"Unknown provider: {provider}"}


def list_llm_options(settings: Settings) -> dict[str, Any]:
    """Return supported LLM providers and model choices without exposing secrets."""
    selected_provider = settings.llm_provider.lower()
    selected_model = _selected_model(settings, selected_provider)

    return {
        "selected_provider": selected_provider,
        "selected_model": selected_model,
        "providers": [
            _provider_option(
                provider="openai",
                configured=bool(settings.openai_api_key),
                selected_provider=selected_provider,
                selected_model=selected_model,
                authentication="api_key" if settings.openai_api_key else "none",
                configured_model=settings.openai_model,
                supported_models=OPENAI_MODELS,
            ),
            _provider_option(
                provider="gemini",
                configured=_has_gemini_auth(settings),
                selected_provider=selected_provider,
                selected_model=selected_model,
                authentication=_gemini_authentication(settings),
                configured_model=settings.gemini_model,
                supported_models=GEMINI_MODELS,
            ),
        ],
    }


def _selected_model(settings: Settings, selected_provider: str) -> str | None:
    if selected_provider == "openai":
        return settings.openai_model
    if selected_provider == "gemini":
        return settings.gemini_model
    return None


def _provider_option(
    *,
    provider: str,
    configured: bool,
    selected_provider: str,
    selected_model: str | None,
    authentication: str,
    configured_model: str,
    supported_models: list[str],
) -> dict[str, Any]:
    model_names = _dedupe([configured_model, *supported_models])
    return {
        "provider": provider,
        "configured": configured,
        "selected": provider == selected_provider,
        "authentication": authentication,
        "models": [
            {
                "provider": provider,
                "model": model,
                "selected": provider == selected_provider and model == selected_model,
            }
            for model in model_names
        ],
    }


def _has_gemini_auth(settings: Settings) -> bool:
    return bool(
        settings.gemini_api_key
        or settings.gemini_credentials_file
        or settings.gemini_project_id
    )


def _gemini_authentication(settings: Settings) -> str:
    if settings.gemini_api_key:
        return "api_key"
    if settings.gemini_credentials_file:
        return "service_account"
    if settings.gemini_project_id:
        return "project_id"
    return "none"


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
