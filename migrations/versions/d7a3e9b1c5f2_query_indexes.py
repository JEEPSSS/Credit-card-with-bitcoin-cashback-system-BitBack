"""indexes for the foreign key and hot filtered queries

Each index is justified by a measured query plan on Postgres 16 with 40k
purchases, 100k alerts and 40k notifications (docs/BACKEND_HARDENING.md, F30):

- reward_events.transaction_id: the only foreign key without an index.
  Deleting an account with 20,000 purchases spent 25.9 s in this table's
  foreign-key check, a full scan per deleted purchase.
- price_alerts, pending only: the once-a-minute sweep scanned all 100k alerts
  to find 200 pending ones.
- notifications, unread only: the unread count read a user's whole history.
- transaction_risk_scores, flagged only: the fraud screen read every score to
  find the 2% that were flagged.

Revision ID: d7a3e9b1c5f2
Revises: c4e2a1f6b8d3
Create Date: 2026-10-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7a3e9b1c5f2'
down_revision: Union[str, None] = 'c4e2a1f6b8d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _partial(column: str, value: bool) -> dict:
    clause = sa.text(f"{column} = {'true' if value else 'false'}")
    return {"postgresql_where": clause, "sqlite_where": clause}


def upgrade() -> None:
    op.create_index('ix_reward_events_transaction_id', 'reward_events', ['transaction_id'])
    op.create_index('ix_price_alert_pending', 'price_alerts', ['user_id'],
                    **_partial('is_triggered', False))
    op.create_index('ix_notification_unread', 'notifications', ['user_id'],
                    **_partial('is_read', False))
    op.create_index('ix_risk_flagged', 'transaction_risk_scores', ['user_id'],
                    **_partial('is_anomaly', True))


def downgrade() -> None:
    op.drop_index('ix_risk_flagged', table_name='transaction_risk_scores')
    op.drop_index('ix_notification_unread', table_name='notifications')
    op.drop_index('ix_price_alert_pending', table_name='price_alerts')
    op.drop_index('ix_reward_events_transaction_id', table_name='reward_events')
