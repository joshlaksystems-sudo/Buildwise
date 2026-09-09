# Physical application schemas

The backend supports an opt-in PostgreSQL schema per product while using one Neon database:

- `yardlogic` for YardLogic
- `ibim` for iBIM

This mode is disabled unless `PHYSICAL_APP_SCHEMAS=true`.

## Preparation

1. Take a Neon backup.
2. Export current `public` data.
3. Create the target schema:

```powershell
$env:DATABASE_URL="<neon-url>"
$env:DATABASE_SCHEMA="yardlogic"
npm run prisma:prepare-schema
```

Repeat with `DATABASE_SCHEMA=ibim`.

4. Apply the existing Prisma migration history to each schema using a schema-qualified `DATABASE_URL`:

```text
<neon-url>&schema=yardlogic
<neon-url>&schema=ibim
```

5. Copy only the matching rows from `public` into each schema. YardLogic rows are selected by `Business.applicationId = 'YARDLOGIC'`; iBIM rows by `Business.applicationId = 'IBIM'`. Do not copy `UNASSIGNED` rows.
6. Verify row counts, memberships, and login behavior in staging.
7. Deploy separate Vercel backend projects with:

```text
APPLICATION_ID=YARDLOGIC
DATABASE_SCHEMA=yardlogic
PHYSICAL_APP_SCHEMAS=true
```

and:

```text
APPLICATION_ID=IBIM
DATABASE_SCHEMA=ibim
PHYSICAL_APP_SCHEMAS=true
```

8. Point each frontend deployment at its matching backend.
9. Keep the old `public` schema read-only until verification and rollback sign-off are complete.

The application schema mode must not be enabled on an `APPLICATION_ID=ALL` deployment, because one process must never serve both physical product schemas.
