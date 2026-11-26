"""Envoi d'e-mails : SMTP en production, console en développement.

Mode « console » (défaut) : le contenu est journalisé, aucun réseau — les
parcours qui envoient des e-mails restent testables sans serveur SMTP.
"""

import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from app.config import settings

# Une pièce jointe : (nom de fichier, contenu, type MIME complet).
Attachment = tuple[str, bytes, str]

logger = logging.getLogger("devis_ai.email")
# Handler dédié : les e-mails « console » restent visibles même quand la
# configuration de logging du serveur (uvicorn) ignore les loggers applicatifs.
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s %(name)s | %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

_TEMPLATES_DIR = Path(__file__).parent / "templates"


class EmailNotConfigured(RuntimeError):
    """Mode SMTP demandé mais serveur non configuré."""


def render_template(name: str, **context: str) -> str:
    html = (_TEMPLATES_DIR / name).read_text(encoding="utf-8")
    return html.format(**context)


# Neutralise les retours à la ligne dans une valeur d'en-tête (To, Subject…) :
# un \r\n injecté dans un nom d'entreprise ou une adresse permettrait sinon
# d'ajouter des en-têtes SMTP arbitraires (Bcc, etc.).
def _header_value(value: str) -> str:
    return " ".join(str(value).splitlines())


def send_email(
    *, to: str, subject: str, html: str, attachments: list[Attachment] | None = None
) -> None:
    to = _header_value(to)
    subject = _header_value(subject)
    if settings.email_mode == "console":
        joined = ", ".join(
            f"{name} ({len(content)} o, {mimetype})" for name, content, mimetype in attachments or []
        )
        logger.info(
            "EMAIL (console) → %s | %s%s\n%s",
            to, subject, f" | PJ : {joined}" if joined else "", html,
        )
        return

    if not settings.smtp_host:
        raise EmailNotConfigured("SMTP_HOST manquant (email_mode=smtp)")

    message = MIMEMultipart("mixed")
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.attach(MIMEText(html, "html", "utf-8"))
    # MIMEApplication force le type principal application/* — suffisant ici
    # (seul le PDF du devis transite par cette voie aujourd'hui).
    for name, content, mimetype in attachments or []:
        subtype = mimetype.partition("/")[2] or "octet-stream"
        part = MIMEApplication(content, _subtype=subtype)
        part.add_header("Content-Disposition", "attachment", filename=_header_value(name))
        message.attach(part)

    # Timeout court : l'envoi est SYNCHRONE dans la requête HTTP (volume pilote) —
    # mieux vaut une erreur nette et un réessai qu'un artisan qui fixe un spinner.
    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
    ) as server:
        server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.email_from, [to], message.as_string())
