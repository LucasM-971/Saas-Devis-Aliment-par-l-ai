from typing import Literal

from pydantic import BaseModel, Field

# Bornes serveur de la surface publique : le rate limit borne la FRÉQUENCE,
# ceci borne la TAILLE (coût LLM facturable + écritures JSON en base).
# La machine à états (lot B) raccourcira encore les tours réels.
MAX_HISTORY_MESSAGES = 60
MAX_MESSAGE_CHARS = 2000


# Une entrée question / réponse de la base de connaissances.
class QAItem(BaseModel):
    question: str
    answer: str


# Un message à boutons : déclenché quand le prospect dit quelque chose de proche du trigger.
class BlocItem(BaseModel):
    trigger: str
    text: str
    buttons: list[str] = Field(default_factory=list)


# Tarif au m² d'une catégorie de travaux (sol, mur…), éventuellement par zone.
class TarifM2Item(BaseModel):
    categorie: str = Field(default="", max_length=80)
    zone: str = Field(default="", max_length=80)
    prix: str = Field(default="", max_length=20)


# Un tour de conversation déjà échangé (pour le contexte multi-tours).
class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_MESSAGE_CHARS)


# Corps de la requête envoyée par le widget / la page hébergée : l'entreprise est
# identifiée par son public_id, la base de connaissances est lue en base.
class ChatRequest(BaseModel):
    company_public_id: str = Field(max_length=36)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    # Identifiant de session côté navigateur : permet la persistance par tour.
    # Absent (ancien widget) → le serveur en génère un et le renvoie.
    session_uid: str | None = Field(default=None, max_length=36)


# Corps de l'aperçu du dashboard (authentifié) : teste une base de connaissances
# non sauvegardée, transportée dans le corps.
class ChatPreviewRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    qas: list[QAItem] = Field(default_factory=list)
    blocs: list[BlocItem] = Field(default_factory=list)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    prix_m2: str | None = None
    tarifs_m2: list[TarifM2Item] = Field(default_factory=list, max_length=50)


# Réponse renvoyée au widget : texte du bot + boutons de suivi.
class ChatResponse(BaseModel):
    answer: str
    buttons: list[str] = Field(default_factory=list)
    # Renvoyé par /chat/message pour que le client adopte l'uid de session
    # (null sur l'aperçu du dashboard, qui ne persiste rien).
    session_uid: str | None = None


# ─── Extraction structurée (qualification → devis) ───────────────────────────
# Le LLM ne fait QUE de l'extraction : il n'invente ni prix ni total.


# Un service proposé par l'entreprise (cible d'éligibilité).
class ServiceRef(BaseModel):
    slug: str
    name: str


# Un poste chiffrable de la grille, présenté au LLM pour qu'il y associe des quantités.
class CatalogItem(BaseModel):
    id: str
    label: str
    unit: str
    service_slug: str | None = None


# Coordonnées du prospect, extraites seulement si elles apparaissent explicitement.
class ExtractedCustomer(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None


# Un poste retenu par le LLM : identifiant de la grille + quantité (jamais de prix).
class ExtractedLineItem(BaseModel):
    price_item_id: str
    quantity: float


# Résultat de l'extraction : la matière première du chiffrage déterministe.
class ExtractionResult(BaseModel):
    service_slug: str | None = None
    postal_code: str | None = None
    customer: ExtractedCustomer = Field(default_factory=ExtractedCustomer)
    items: list[ExtractedLineItem] = Field(default_factory=list)
    notes: str | None = None
