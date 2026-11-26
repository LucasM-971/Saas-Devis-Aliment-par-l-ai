"""mentions legales entreprise

Revision ID: a1c7d9e2f3b4
Revises: 5b134c13507e
Create Date: 2026-07-10 18:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c7d9e2f3b4'
down_revision: Union[str, None] = '5b134c13507e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('legal_form', sa.String(length=60), nullable=True))
    op.add_column('companies', sa.Column('share_capital', sa.String(length=40), nullable=True))
    op.add_column('companies', sa.Column('rcs_rm', sa.String(length=120), nullable=True))
    op.add_column('companies', sa.Column('ape_code', sa.String(length=10), nullable=True))
    op.add_column('companies', sa.Column('vat_number', sa.String(length=30), nullable=True))
    op.add_column(
        'companies',
        sa.Column('vat_exempt', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('companies', sa.Column('insurance_name', sa.String(length=120), nullable=True))
    op.add_column('companies', sa.Column('insurance_contract', sa.String(length=80), nullable=True))
    op.add_column('companies', sa.Column('insurance_coverage', sa.String(length=160), nullable=True))
    op.add_column('companies', sa.Column('mediator_name', sa.String(length=120), nullable=True))
    op.add_column('companies', sa.Column('mediator_url', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('companies', 'mediator_url')
    op.drop_column('companies', 'mediator_name')
    op.drop_column('companies', 'insurance_coverage')
    op.drop_column('companies', 'insurance_contract')
    op.drop_column('companies', 'insurance_name')
    op.drop_column('companies', 'vat_exempt')
    op.drop_column('companies', 'vat_number')
    op.drop_column('companies', 'ape_code')
    op.drop_column('companies', 'rcs_rm')
    op.drop_column('companies', 'share_capital')
    op.drop_column('companies', 'legal_form')
