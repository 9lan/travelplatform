# Prisma Migrations Guide

This guide covers how to safely modify your database schema using Prisma without losing existing data.

## Quick Reference

```bash
# Development (auto-apply changes)
pnpm --filter @travelplatform/shuttle-service db:push

# Production (create migration files)
pnpm --filter @travelplatform/shuttle-service db:migrate

# View current database
pnpm --filter @travelplatform/shuttle-service db:studio
```

## Development vs Production Workflow

### Development: `prisma db push`
- Directly applies schema changes to the database
- Does NOT create migration files
- Good for rapid prototyping
- **Warning**: May cause data loss for destructive changes

### Production: `prisma migrate dev`
- Creates migration files in `prisma/migrations/`
- Tracks schema history
- Safe for production deployments
- Allows rollbacks

---

## Common Scenarios

### 1. Adding a New Column

**Step 1**: Update `prisma/schema.prisma`

```prisma
model City {
  id           String    @id @default(cuid())
  name         String
  province     String?
  country      String    @default("Indonesia")  // ← New column with default
  // ... other fields
}
```

**Step 2**: Apply the change

```bash
# Development
pnpm db:push

# Production (creates migration file)
pnpm exec prisma migrate dev --name add_country_to_city
```

**Important**: When adding a required column to a table with existing data:
- Either provide a `@default()` value
- Or make it optional with `?`

### 2. Adding an Optional Column

```prisma
model Counter {
  id       String   @id @default(cuid())
  name     String
  website  String?  // ← Optional (nullable), safe to add
}
```

```bash
pnpm db:push  # Safe - no data loss
```

### 3. Removing a Column

**Warning**: This will delete all data in that column!

**Step 1**: Remove from schema

```prisma
model City {
  id       String  @id @default(cuid())
  name     String
  // province  String?  ← Removed
}
```

**Step 2**: Apply (Prisma will warn you)

```bash
pnpm db:push
# Prisma will show: "You are about to drop the column `province`"
# Type 'y' to confirm
```

### 4. Renaming a Column (Without Data Loss)

Prisma doesn't support renaming directly. Use this workaround:

**Step 1**: Add new column

```prisma
model City {
  id        String  @id
  name      String
  province  String?  // Old column
  state     String?  // New column
}
```

**Step 2**: Migrate data via SQL

```bash
pnpm exec prisma db execute --stdin <<< "UPDATE \"City\" SET state = province;"
```

**Step 3**: Remove old column

```prisma
model City {
  id     String  @id
  name   String
  state  String?  // Keep only new column
}
```

**Step 4**: Apply final schema

```bash
pnpm db:push
```

### 5. Changing Column Type

**Safe changes** (no data loss):
- `String` → `String?` (making optional)
- `Int` → `BigInt` (widening)

**Unsafe changes** (may lose data):
- `String?` → `String` (making required)
- `String` → `Int` (type change)

For unsafe changes, use a migration with custom SQL:

```bash
pnpm exec prisma migrate dev --name change_column_type --create-only
```

Then edit the generated migration file in `prisma/migrations/`.

### 6. Adding a Unique Constraint

```prisma
model City {
  id           String  @id @default(cuid())
  name         String
  providerCode String?
  providerId   String?

  @@unique([providerCode, providerId])  // ← Composite unique
}
```

**Warning**: This will fail if duplicate data exists!

**Check for duplicates first**:
```sql
SELECT "providerCode", "providerId", COUNT(*)
FROM "City"
GROUP BY "providerCode", "providerId"
HAVING COUNT(*) > 1;
```

### 7. Adding a Foreign Key

```prisma
model Counter {
  id      String  @id @default(cuid())
  name    String
  cityId  String
  city    City    @relation(fields: [cityId], references: [id])
}

model City {
  id       String    @id @default(cuid())
  name     String
  counters Counter[]
}
```

**Warning**: Existing `cityId` values must reference valid `City` records!

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `prisma db push` | Apply schema to database (dev) |
| `prisma migrate dev` | Create and apply migration (prod) |
| `prisma migrate dev --name <name>` | Create named migration |
| `prisma migrate dev --create-only` | Create migration without applying |
| `prisma migrate deploy` | Apply pending migrations (CI/CD) |
| `prisma migrate reset` | Reset database and apply all migrations |
| `prisma db pull` | Pull schema from existing database |
| `prisma generate` | Regenerate Prisma Client |
| `prisma studio` | Open visual database editor |
| `prisma db execute --stdin` | Execute raw SQL |

---

## Best Practices

### 1. Always backup before migrations
```bash
pg_dump -U shuttle shuttle > backup_$(date +%Y%m%d).sql
```

### 2. Use `--create-only` for complex changes
```bash
pnpm exec prisma migrate dev --name complex_change --create-only
# Edit the migration SQL
pnpm exec prisma migrate dev
```

### 3. Test migrations on a copy first
```bash
# Create test database
createdb shuttle_test
# Copy data
pg_dump shuttle | psql shuttle_test
# Test migration
DATABASE_URL="postgresql://...shuttle_test" pnpm exec prisma migrate dev
```

### 4. Handle nullable transitions carefully

**Making a column required**:
```sql
-- First, fill in missing values
UPDATE "City" SET province = 'Unknown' WHERE province IS NULL;
```
Then change `String?` to `String` in schema.

### 5. Use transactions for data migrations

```typescript
await prisma.$transaction(async (tx) => {
  // Step 1: Add data to new column
  await tx.$executeRaw`UPDATE "City" SET new_col = old_col`;

  // Step 2: Verify
  const count = await tx.city.count({ where: { new_col: null } });
  if (count > 0) throw new Error('Migration incomplete');
});
```

---

## Troubleshooting

### "Column already exists"
```bash
pnpm exec prisma db push --accept-data-loss
# Or reset: pnpm exec prisma migrate reset
```

### "Foreign key constraint failed"
Check that referenced records exist:
```sql
SELECT c.id FROM "Counter" c
LEFT JOIN "City" city ON c."cityId" = city.id
WHERE city.id IS NULL;
```

### "Unique constraint violation"
Find and fix duplicates before adding unique constraint.

### Schema drift (local vs database mismatch)
```bash
# Pull current database schema
pnpm exec prisma db pull

# Or reset to schema
pnpm exec prisma db push --force-reset  # WARNING: Deletes all data!
```

---

## Service-Specific Commands

Each service has its own database. Replace `shuttle-service` with the target service:

```bash
# Shuttle Service
pnpm --filter @travelplatform/shuttle-service db:push
pnpm --filter @travelplatform/shuttle-service db:studio

# Booking Service
pnpm --filter @travelplatform/booking-service db:push

# Payment Service
pnpm --filter @travelplatform/payment-service db:push
```
