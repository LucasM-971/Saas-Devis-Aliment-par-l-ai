"""Import d'un devis depuis un fichier (PDF, DOCX ou texte).

extract_text : texte brut (cellules DOCX jointes par « | »).
parse_draft : brouillon éditable, via l'IA si configurée sinon heuristique.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

# Espaces spéciaux (insécable, fine insécable) rencontrés dans les nombres FR.
_NBSP = " "
_NNBSP = " "

# ─── Unités : jetons rencontrés dans les documents → valeur canonique du front ──
_UNIT_TOKENS: dict[str, str] = {
    "m²": "m2", "m2": "m2", "m^2": "m2", "mètre carré": "m2", "metre carre": "m2",
    "ml": "ml", "mètre linéaire": "ml", "metre lineaire": "ml",
    "m³": "m3", "m3": "m3",
    "heures": "hour", "heure": "hour", "hr": "hour", "h": "hour",
    "forfait": "flat", "forf": "flat",
    "unités": "unit", "unites": "unit", "unité": "unit", "unite": "unit",
    "pièces": "unit", "pieces": "unit", "pièce": "unit", "piece": "unit",
    "pce": "unit", "jours": "unit", "jour": "unit", "ens": "unit", "u": "unit",
}
_CANON_UNITS = {"m2", "ml", "m3", "unit", "hour", "flat"}

# Lignes de synthèse ou d'en-tête à ne jamais interpréter comme un poste.
_SKIP_LINE = re.compile(
    r"^\s*(sous[- ]?total|total|montant\s+(ht|ttc)|net\s+à\s+payer|"
    r"tva|t\.v\.a|acompte|remise|désignation|designation|description|"
    r"prix\s+unitaire|p\.?\s?u\.?|quantit[eé]|réf[ée]rence|devis\s+n|facture\s+n)\b",
    re.IGNORECASE,
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_CLIENT = re.compile(
    r"(?:client|destinataire|adress[ée]\s+à|[àa]\s+l['’]attention\s+de|"
    r"nom\s+du\s+client)\s*[:\-]?\s*(.+)",
    re.IGNORECASE,
)
_VAT = re.compile(r"t\.?v\.?a\.?[^0-9%]*(\d{1,2}(?:[.,]\d+)?)\s*%", re.IGNORECASE)

# Nombre : chiffres + séparateurs , . et espaces (normaux/insécables), rien d'autre.
_NUM_RE = re.compile(rf"^-?\d[\d .,{_NBSP}{_NNBSP}]*\d$|^-?\d$")
# Nombre « inline » (au sein d'une phrase), sans séparateur de milliers ambigu.
_INLINE_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


class UnsupportedFile(ValueError):
    """Type de fichier non pris en charge (ni PDF, ni DOCX, ni texte)."""


@dataclass
class DraftLine:
    label: str
    quantity: float = 1.0
    unit_price: float = 0.0
    unit: str = "unit"


@dataclass
class Draft:
    client_name: str = ""
    client_email: str | None = None
    vat_rate: float = 0.2
    notes: str | None = None
    lines: list[DraftLine] = field(default_factory=list)


# ─── Extraction de texte ───────────────────────────────────────────────────────

def extract_text(filename: str, content: bytes) -> str:
    """Renvoie le texte brut du fichier. Lève `UnsupportedFile` sinon."""
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    if ext == "pdf" or content[:5] == b"%PDF-":
        return _extract_pdf(content)
    if ext == "docx" or content[:2] == b"PK":  # docx = archive ZIP
        return _extract_docx(content)
    if ext in {"txt", "text", "md", "csv"}:
        return _decode_text(content)
    # Dernier recours : tenter un décodage texte (peut échouer proprement).
    text = _decode_text(content)
    if text.strip():
        return text
    raise UnsupportedFile("Format non pris en charge (PDF, DOCX ou texte attendu).")


def _decode_text(content: bytes) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dépendance absente
        raise UnsupportedFile("Lecture PDF indisponible sur ce serveur.") from exc
    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise UnsupportedFile("PDF illisible ou protégé.") from exc


def _extract_docx(content: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover - dépendance absente
        raise UnsupportedFile("Lecture DOCX indisponible sur ce serveur.") from exc
    try:
        doc = Document(io.BytesIO(content))
    except Exception as exc:
        raise UnsupportedFile("DOCX illisible.") from exc

    parts: list[str] = [p.text for p in doc.paragraphs if p.text.strip()]
    # Cellules jointes par « | » pour garder les colonnes
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return "\n".join(parts)


# ─── Analyse des nombres (formats FR et EN) ────────────────────────────────────

def _to_number(raw: str) -> float | None:
    """Convertit « 1 234,56 », « 1.234,56 », « 1,234.56 », « 25,00 € »… en float."""
    s = raw.strip().replace(_NBSP, " ").replace(_NNBSP, " ")
    s = re.sub(r"[€$£]", "", s).strip()
    if not _NUM_RE.match(s):
        return None
    s = s.replace(" ", "")
    has_comma, has_dot = "," in s, "." in s
    if has_comma and has_dot:
        # Le séparateur décimal est le dernier rencontré ; l'autre = milliers.
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif has_comma:
        s = s.replace(",", "") if s.count(",") > 1 else s.replace(",", ".")
    elif has_dot and s.count(".") > 1:
        s = s.replace(".", "")  # points = séparateurs de milliers
    try:
        return float(s)
    except ValueError:
        return None


def _looks_numeric(cell: str) -> bool:
    return "%" not in cell and _to_number(cell) is not None


def _split_cells(line: str) -> list[str]:
    """Découpe une ligne en cellules : « | », tabulations ou 2+ espaces."""
    if "|" in line:
        return [c.strip() for c in line.split("|")]
    if "\t" in line:
        return [c.strip() for c in line.split("\t")]
    return [c.strip() for c in re.split(r"\s{2,}", line)]


def _detect_unit(text: str) -> tuple[str, str]:
    """Repère une unité dans `text` ; renvoie (unité canonique, texte nettoyé)."""
    for token, canon in _UNIT_TOKENS.items():
        # Jeton isolé (bordé par un non-alphanumérique), insensible à la casse.
        pat = re.compile(rf"(?<![\wàâäéèêëôöùûüç]){re.escape(token)}(?![\wàâäéèêëôöùûüç])", re.IGNORECASE)
        if pat.search(text):
            cleaned = re.sub(r"\s{2,}", " ", pat.sub(" ", text, count=1)).strip(" .:-")
            return canon, cleaned
    return "unit", text


def _parse_line(line: str) -> DraftLine | None:
    """Tente d'extraire un poste (libellé + quantité + prix) d'une ligne."""
    if not line.strip() or _SKIP_LINE.match(line):
        return None

    cells = _split_cells(line)
    values = [v for v in (_to_number(c) for c in cells if _looks_numeric(c)) if v is not None]
    text_cells = [c for c in cells if c and not _looks_numeric(c)]

    other_cells: list[str] = []
    if values and text_cells:
        # Libellé = cellule texte la plus longue
        label_idx = max(range(len(text_cells)), key=lambda i: len(text_cells[i]))
        label = text_cells[label_idx]
        other_cells = [c for i, c in enumerate(text_cells) if i != label_idx]
    else:
        # Repli « inline » : nombres au fil du texte (séparateurs simples espaces).
        values = [v for v in (_to_number(n) for n in _INLINE_NUM_RE.findall(line)) if v is not None]
        if not values:
            return None
        label = re.split(r"\d", line, maxsplit=1)[0]

    if len(values) == 1:
        quantity, unit_price = 1.0, values[0]
    else:
        # Colonnes usuelles : Désignation | Qté | P.U. | (Total). Total ignoré.
        quantity, unit_price = values[0], values[1]
    if unit_price <= 0:
        return None

    label = label.strip(" .:-")
    unit = _unit_from(other_cells, label, line)
    # Ne retire l'unité du libellé que si aucune colonne unité n'existe
    if unit != "unit" and not other_cells:
        cleaned_unit, cleaned_label = _detect_unit(label)
        if cleaned_unit == unit:
            label = cleaned_label
    return DraftLine(label=label or "Poste", quantity=quantity or 1.0, unit_price=unit_price, unit=unit)


def _unit_from(other_cells: list[str], label: str, line: str) -> str:
    """Déduit l'unité : colonne dédiée d'abord, puis libellé, puis ligne entière."""
    for cell in other_cells:
        unit, rest = _detect_unit(cell)
        if unit != "unit" and not rest:  # cellule = uniquement une unité
            return unit
    unit, _ = _detect_unit(label)
    if unit != "unit":
        return unit
    unit, _ = _detect_unit(line)
    return unit


def _parse_meta(text: str, draft: Draft) -> None:
    """Renseigne client / e-mail / TVA / conditions à partir du texte complet."""
    email = _EMAIL.search(text)
    if email:
        draft.client_email = email.group(0)

    for line in text.splitlines():
        m = _CLIENT.search(line)
        if m:
            # On écarte une éventuelle adresse e-mail capturée dans le libellé.
            name = _EMAIL.sub("", m.group(1)).strip(" ,;:-")
            if name:
                draft.client_name = name[:120]
                break

    vat = _VAT.search(text)
    if vat:
        val = _to_number(vat.group(1))
        if val is not None:
            draft.vat_rate = round(val / 100, 4)

    # Conditions / mentions : bloc de texte suivant un mot-clé dédié.
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if re.match(r"\s*(conditions|modalit[ée]s|mentions)\b", line, re.IGNORECASE):
            note = " ".join(l.strip() for l in lines[i:] if l.strip())[:500]
            if note:
                draft.notes = note
            break


def _heuristic_parse(text: str) -> Draft:
    draft = Draft()
    for line in text.splitlines():
        parsed = _parse_line(line)
        if parsed:
            draft.lines.append(parsed)
    _parse_meta(text, draft)
    return draft


# ─── Extraction assistée par IA (optionnelle) ──────────────────────────────────

_LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "client_name": {"type": ["string", "null"]},
        "client_email": {"type": ["string", "null"]},
        "vat_rate": {"type": ["number", "null"]},
        "notes": {"type": ["string", "null"]},
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "quantity": {"type": "number"},
                    "unit_price": {"type": "number"},
                    "unit": {"enum": ["m2", "ml", "m3", "unit", "hour", "flat"]},
                },
                "required": ["label", "quantity", "unit_price", "unit"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["client_name", "client_email", "vat_rate", "notes", "lines"],
    "additionalProperties": False,
}

_LLM_SYSTEM = (
    "Tu extrais un devis à partir du texte brut d'un document (devis, facture, "
    "bordereau). Rends STRICTEMENT le JSON demandé, sans rien inventer.\n"
    "- lines : un objet par poste chiffré, avec libellé, quantité, prix unitaire HT "
    "(unit_price) et unité parmi m2, ml, m3, unit, hour, flat.\n"
    "- N'inclus jamais les lignes de synthèse (sous-total, total, TVA, acompte).\n"
    "- vat_rate : taux de TVA en ratio (0.2 pour 20 %). null si absent.\n"
    "- Si une valeur est absente, mets null (ou 1 pour une quantité manquante)."
)


def _llm_parse(text: str) -> Draft | None:
    """Extraction via le LLM ; renvoie None si indisponible ou en échec."""
    try:
        from app.llm.client import LLMUnavailable, _structured_call
    except ImportError:  # pragma: no cover
        return None
    try:
        data = _structured_call(
            system=_LLM_SYSTEM,
            messages=[{"role": "user", "content": text[:12000]}],
            schema=_LLM_SCHEMA,
        )
    except LLMUnavailable:
        return None
    except Exception:  # pragma: no cover - robustesse : jamais bloquer l'import
        return None

    lines: list[DraftLine] = []
    for item in data.get("lines") or []:
        try:
            price = float(item.get("unit_price") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        try:
            quantity = float(item.get("quantity") or 1) or 1.0
        except (TypeError, ValueError):
            quantity = 1.0
        unit = item.get("unit")
        lines.append(
            DraftLine(
                label=(str(item.get("label") or "Poste").strip()[:200]) or "Poste",
                quantity=quantity,
                unit_price=price,
                unit=unit if unit in _CANON_UNITS else "unit",
            )
        )
    if not lines:
        return None

    vat = data.get("vat_rate")
    return Draft(
        client_name=(data.get("client_name") or "").strip()[:120],
        client_email=(data.get("client_email") or None),
        vat_rate=float(vat) if isinstance(vat, (int, float)) and 0 <= vat <= 1 else 0.2,
        notes=(data.get("notes") or None),
        lines=lines,
    )


# ─── Point d'entrée ────────────────────────────────────────────────────────────

def parse_draft(text: str, *, use_llm: bool = True) -> Draft:
    """Analyse le texte en brouillon de devis (IA si possible, sinon heuristique)."""
    if use_llm:
        llm = _llm_parse(text)
        if llm is not None:
            return llm
    return _heuristic_parse(text)


def build_draft(filename: str, content: bytes, *, use_llm: bool = True) -> Draft:
    """Extrait le texte du fichier puis en déduit un brouillon de devis."""
    return parse_draft(extract_text(filename, content), use_llm=use_llm)
