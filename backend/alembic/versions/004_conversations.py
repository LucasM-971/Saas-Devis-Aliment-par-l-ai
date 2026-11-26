"""conversations : session_uid unique par entreprise, flow_state, last_activity_at

Revision ID: b2e4f6a8c0d1
Revises: a1c7d9e2f3b4
Create Date: 2026-07-12 21:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2e4f6a8c0d1'
down_revision: Union[str, None] = 'a1c7d9e2f3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # MySQL nomme la contrainte unique implicite d'après la colonne.
    op.drop_constraint('session_uid', 'conversations', type_='unique')
    op.create_unique_constraint(
        'uq_conversations_company_session', 'conversations', ['company_id', 'session_uid']
    )
    op.add_column('conversations', sa.Column('flow_state', sa.JSON(), nullable=True))
    op.add_column('conversations', sa.Column('last_activity_at', sa.DateTime(), nullable=True))
    # Backfill : la meilleure approximation du dernier tour pour l'existant.
    op.execute(
        "UPDATE conversations SET last_activity_at = COALESCE(completed_at, created_at)"
    )


def downgrade() -> None:
    op.drop_column('conversations', 'last_activity_at')
    op.drop_column('conversations', 'flow_state')
    op.drop_constraint('uq_conversations_company_session', 'conversations', type_='unique')
    op.create_unique_constraint('session_uid', 'conversations', ['session_uid'])
