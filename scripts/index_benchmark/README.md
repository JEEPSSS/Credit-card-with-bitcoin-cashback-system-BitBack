# Index benchmark (docs/BACKEND_HARDENING.md, F30)

Reproduces the before/after timings for migration `d7a3e9b1c5f2`.

```bash
createdb bench
export DATABASE_URL=postgresql://localhost/bench
alembic upgrade c4e2a1f6b8d3          # the schema before the indexes
psql bench -f scripts/index_benchmark/seed.sql
psql bench -f scripts/index_benchmark/queries.sql
psql bench -f scripts/index_benchmark/delete_account.sql   # runs inside a rolled-back transaction
alembic upgrade head                  # adds the indexes
psql bench -c "ANALYZE"
psql bench -f scripts/index_benchmark/queries.sql
psql bench -f scripts/index_benchmark/delete_account.sql
```

Absolute times depend on the machine; the ratios and the plan changes
(sequential scan to index scan) are what carry over.
