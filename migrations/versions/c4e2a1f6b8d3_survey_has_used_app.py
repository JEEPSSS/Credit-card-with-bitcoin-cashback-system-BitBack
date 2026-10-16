"""survey has_used_app

Revision ID: c4e2a1f6b8d3
Revises: b3f1c9d2e4a7
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e2a1f6b8d3'
down_revision: Union[str, None] = 'b3f1c9d2e4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('survey_responses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('has_used_app', sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('survey_responses', schema=None) as batch_op:
        batch_op.drop_column('has_used_app')
