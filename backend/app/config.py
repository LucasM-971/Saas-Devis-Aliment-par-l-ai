from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://devis:devis@localhost:3306/devis_ai"
    secret_key: str = "change-me"
    # "dev" ou "prod" ; en prod, les comptes seedés à privilèges ont un mot de passe aléatoire
    environment: str = "dev"
    access_token_expire_minutes: int = 60 * 24
    # Fournisseur LLM : "anthropic" (défaut), "gemini", "mistral" ou "ollama" (local).
    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    mistral_api_key: str = ""
    mistral_model: str = "mistral-small-latest"
    # Ollama tourne sur l'hôte : depuis Docker, il est joignable via host.docker.internal.
    ollama_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "qwen2.5:7b"
    frontend_url: str = "http://localhost:5173"
    # Limitation de débit des endpoints publics / auth (désactivable en local).
    rate_limit_enabled: bool = True
    # Lire X-Forwarded-For uniquement derrière un proxy de confiance
    trust_proxy_headers: bool = False
    # E-mails : "console" (dev, affiche dans les logs) ou "smtp" (production).
    email_mode: str = "console"
    email_from: str = "Devis AI <no-reply@devis-ai.fr>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # L'envoi est synchrone dans la requête : timeout court, erreur nette.
    smtp_timeout_seconds: int = 8
    # Sentry activé si un DSN est fourni
    sentry_dsn: str = ""

    # Refuse de démarrer en prod avec une clé faible
    @model_validator(mode="after")
    def _check_secret_key(self) -> "Settings":
        if self.environment == "prod":
            key = self.secret_key
            weak = key.lower() in {"change-me", "changeme", "secret"} or "changer-moi" in key.lower()
            if weak or len(key) < 32:
                raise ValueError(
                    "SECRET_KEY faible ou par défaut en production : définir une clé "
                    "aléatoire d'au moins 32 caractères (python -c \"import secrets; print(secrets.token_urlsafe(48))\")."
                )
        return self


settings = Settings()
