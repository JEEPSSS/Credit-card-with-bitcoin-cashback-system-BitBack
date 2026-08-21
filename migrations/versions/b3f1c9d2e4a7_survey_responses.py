"""survey responses

Revision ID: b3f1c9d2e4a7
Revises: aa9dea22afcc
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f1c9d2e4a7'
down_revision: Union[str, None] = 'aa9dea22afcc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('survey_responses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(length=10), nullable=False),
    sa.Column('screened_out', sa.Boolean(), nullable=False),
    sa.Column('q1', sa.Integer(), nullable=True),
    sa.Column('q2', sa.Integer(), nullable=True),
    sa.Column('q3', sa.Integer(), nullable=True),
    sa.Column('q4', sa.Integer(), nullable=True),
    sa.Column('q5', sa.Integer(), nullable=True),
    sa.Column('q6', sa.Integer(), nullable=True),
    sa.Column('q7', sa.Integer(), nullable=True),
    sa.Column('q8', sa.String(length=20), nullable=True),
    sa.Column('q9', sa.Text(), nullable=True),
    sa.Column('q10', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('survey_responses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_survey_responses_created_at'), ['created_at'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('survey_responses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_survey_responses_created_at'))
    op.drop_table('survey_responses')
