"""quotes : envoi pilote (retouche artisan, statut e-mail, PDF stocké)

- artisan_edited : posé par PATCH /quotes — un brouillon retouché n'est plus
  jamais écrasé par un tour de chat du prospect.
- email_status : résultat du dernier envoi (none/sent/failed, envoi synchrone).
- sent_pdf : le PDF réellement envoyé au client (document légal immuable,
  indépendant des lignes de devis qui restent éditables).

Revision ID: c3f5a7b9d2e4
Revises: b2e4f6a8c0d1
Create Date: 2026-07-12 21:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = 'c3f5a7b9d2e4'
down_revision: Union[str, None] = 'b2e4f6a8c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'quotes',
        sa.Column('artisan_edited', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'quotes',
        sa.Column(
            'email_status',
            sa.Enum('none', 'sent', 'failed'),
            nullable=False,
            server_default='none',
        ),
    )
    op.add_column('quotes', sa.Column('sent_pdf', mysql.MEDIUMBLOB(), nullable=True))


def downgrade() -> None:
    op.drop_column('quotes', 'sent_pdf')
    op.drop_column('quotes', 'email_status')
    op.drop_column('quotes', 'artisan_edited')
