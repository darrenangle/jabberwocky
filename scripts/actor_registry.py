from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

try:
    import tomllib  # py311+
except Exception:  # pragma: no cover
    tomllib = None  # type: ignore


@dataclass
class Provider:
    name: str
    base_url: str
    api_key_env: str
    default_headers_env: Dict[str, str] = field(default_factory=dict)


@dataclass
class ActorConfig:
    provider: str
    model: str
    base_url: str
    api_key: Optional[str] = None
    api_key_env: Optional[str] = None
    default_headers: Dict[str, str] = field(default_factory=dict)

    def resolve_api_key(self) -> Optional[str]:
        if self.api_key:
            return self.api_key
        if self.api_key_env:
            return os.getenv(self.api_key_env)
        return None


class ActorRegistry:
    """Simple provider+model registry with sane defaults.

    Supports built-ins for OpenAI, Groq, OpenRouter, and local vLLM.
    Can be extended via a TOML or JSON file with two optional sections:

    [providers.<name>]
    base_url = "..."
    api_key_env = "ENV_VAR"

    [models.<alias>]
    provider = "openrouter"
    model = "anthropic/claude-3.5-sonnet"
    base_url = "..."              # optional override
    api_key_env = "..."           # optional override
    [models.<alias>.default_headers]
    HTTP-Referer = "https://your.site"
    X-Title = "Your Site"
    """

    def __init__(self):
        # Built-in providers
        self.providers: Dict[str, Provider] = {
            "openai": Provider(
                name="openai",
                base_url="https://api.openai.com/v1",
                api_key_env="OPENAI_API_KEY",
            ),
            "groq": Provider(
                name="groq",
                base_url="https://api.groq.com/openai/v1",
                api_key_env="GROQ_API_KEY",
            ),
            "openrouter": Provider(
                name="openrouter",
                base_url="https://openrouter.ai/api/v1",
                api_key_env="OPENROUTER_API_KEY",
                default_headers_env={
                    "HTTP-Referer": "OPENROUTER_HTTP_REFERER",
                    "X-Title": "OPENROUTER_X_TITLE",
                },
            ),
            "vllm": Provider(
                name="vllm",
                base_url=os.getenv("VLLM_BASE_URL", "http://127.0.0.1:8000/v1"),
                api_key_env=os.getenv("VLLM_API_KEY_ENV", "VLLM_API_KEY"),
            ),
        }

        # Built-in model aliases (minimal examples; extend via file)
        self.models: Dict[str, Dict[str, Any]] = {
            # OpenAI
            "gpt-4.1-nano": {"provider": "openai", "model": "gpt-4.1-nano"},
            "gpt-4.1-mini": {"provider": "openai", "model": "gpt-4.1-mini"},
            "gpt-4.1": {"provider": "openai", "model": "gpt-4.1"},
            "gpt-5-nano": {"provider": "openai", "model": "gpt-5-nano"},
            "gpt-5-mini": {"provider": "openai", "model": "gpt-5-mini"},
            "gpt-5": {"provider": "openai", "model": "gpt-5"},
            # Groq examples
            "groq:llama-3.1-70b": {"provider": "groq", "model": "llama-3.1-70b"},
            # OpenRouter examples (provider/model style)
            "gpt-4o": {"provider": "openrouter", "model": "openai/gpt-4o"},
            "sonnet-3.5": {"provider": "openrouter", "model": "anthropic/claude-3.5-sonnet"},
            # Curated OpenRouter top models
            "grok-code-fast-1": {"provider": "openrouter", "model": "x-ai/grok-code-fast-1"},
            "claude-sonnet-4": {"provider": "openrouter", "model": "anthropic/claude-sonnet-4"},
            "deepseek-chat-v3.1-free": {"provider": "openrouter", "model": "deepseek/deepseek-chat-v3.1:free"},
            "llama-4-scout-free": {"provider": "openrouter", "model": "meta-llama/llama-4-scout:free"},
            "llama-4-maverick-free": {"provider": "openrouter", "model": "meta-llama/llama-4-maverick:free"},
            "gemini-2.5-flash": {"provider": "openrouter", "model": "google/gemini-2.5-flash"},
            "gemini-2.5-pro": {"provider": "openrouter", "model": "google/gemini-2.5-pro"},
            "gemini-2.5-flash-lite": {"provider": "openrouter", "model": "google/gemini-2.5-flash-lite"},
            "qwen3-30b-a3b": {"provider": "openrouter", "model": "qwen/qwen3-30b-a3b"},
            "claude-3.7-sonnet": {"provider": "openrouter", "model": "anthropic/claude-3.7-sonnet"},
        }

    def load_file(self, path: str) -> None:
        import json

        if not os.path.exists(path):
            raise FileNotFoundError(path)
        data: Dict[str, Any]
        if path.endswith(".toml"):
            if tomllib is None:
                raise RuntimeError("tomllib is unavailable; use Python 3.11+ or provide JSON")
            with open(path, "rb") as f:
                data = tomllib.load(f)
        elif path.endswith(".json"):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            raise ValueError("Registry file must be .toml or .json")

        # Providers
        for name, cfg in (data.get("providers") or {}).items():
            self.providers[name] = Provider(
                name=name,
                base_url=cfg.get("base_url") or self.providers.get(name, Provider(name, "", "")).base_url,
                api_key_env=cfg.get("api_key_env") or self.providers.get(name, Provider(name, "", "")).api_key_env,
                default_headers_env=cfg.get("default_headers_env") or {},
            )

        # Models
        for alias, cfg in (data.get("models") or {}).items():
            if isinstance(cfg, str):
                # e.g., "openrouter:anthropic/claude-3.5-sonnet"
                self.models[alias] = self._parse_inline_spec(cfg)
            elif isinstance(cfg, dict):
                self.models[alias] = cfg
            else:
                raise ValueError(f"Unsupported model entry for {alias}")

    def _parse_inline_spec(self, spec: str) -> Dict[str, Any]:
        # Accept forms like "openrouter:anthropic/claude-3.5-sonnet" or "openai:gpt-4o-mini"
        if ":" in spec:
            provider, model = spec.split(":", 1)
            provider = provider.strip()
            model = model.strip()
            return {"provider": provider, "model": model}
        return {"provider": "openai", "model": spec}

    def resolve(self, name_or_spec: str, *,
                base_url: Optional[str] = None,
                api_key: Optional[str] = None,
                provider: Optional[str] = None,
                default_headers: Optional[Dict[str, str]] = None) -> ActorConfig:
        """Resolve a model alias or provider:model spec into a concrete ActorConfig.

        Precedence of fields if provided by both registry and kwargs:
          explicit kwargs > registry model entry > provider defaults.
        """
        # Start with registry model or inline spec
        entry = self.models.get(name_or_spec)
        if entry is None:
            entry = self._parse_inline_spec(name_or_spec)

        prov_name = provider or entry.get("provider") or "openai"
        if prov_name not in self.providers:
            raise ValueError(f"Unknown provider '{prov_name}' in spec '{name_or_spec}'")
        prov = self.providers[prov_name]

        model = entry.get("model") or name_or_spec
        base = base_url or entry.get("base_url") or prov.base_url
        api_key_env = entry.get("api_key_env") or prov.api_key_env

        # Build default headers, preferring explicit kwargs and entry overrides
        headers: Dict[str, str] = {}
        # Provider default headers via env mapping
        for hdr, env_name in (prov.default_headers_env or {}).items():
            val = os.getenv(env_name)
            if val:
                headers[hdr] = val
        # Entry-level specific headers
        headers.update(entry.get("default_headers") or {})
        # Explicit override wins
        if default_headers:
            headers.update(default_headers)

        return ActorConfig(
            provider=prov_name,
            model=model,
            base_url=base,
            api_key=(api_key or os.getenv(api_key_env)),
            api_key_env=api_key_env,
            default_headers=headers,
        )

__all__ = ["ActorRegistry", "ActorConfig", "Provider"]
