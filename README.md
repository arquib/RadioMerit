# RadioMerit

Hospital allocation by order of merit for a batch of doctors selected for a postgraduate radiology training
programme (built for one intake in Sri Lanka). Each doctor ranks hospitals, optionally names a preferred
consultant, and everyone watches a live allocation until the admin publishes it. **Unofficial**: it only helps
a batch coordinate among itself.

The project was built for a single selection round and is archived. The bundled seed data is synthetic
("Demo Doctor NN"); no real doctors, hospitals' staff or credentials are in this repository.

## How the allocation works

Serial dictatorship by merit. Doctors are processed in merit order (#1 first); each gets the first hospital on
their list (1st → 2nd → 3rd) that still has a free seat. If all three are full they are unallocated for the round.
Truthful ranking is always best, submission order does not matter, and the result is deterministic.
The logic is a pure function in `lib/allocate.ts` (tests in `tests/`).

**One round, always live.** Everyone ranks 3 hospitals, except merit #1 (ranks 1: always gets it) and #2 (ranks 2). There is no second round: a doctor whose hospitals are all
filled by doctors above them is shown as **Not allocated**. Nothing about the allocation is stored: it is always
computed from the current hospitals, seats, choices and manual placements (`liveResults` in `lib/rounds.ts`), so
the admin can add/remove hospitals and change seats at any time and every doctor sees the effect within 10 s
(pages refresh themselves, `components/LiveRefresh.tsx`). Hospitals with 0 seats stay selectable. Only manual
placements are stored (`Allocation` rows with `overridden = true`); a hospital with one cannot be deleted.

**Consultants.** Each hospital can list its consultants (trainers) with seats (usually 1; a consultant can take
more than one trainee). Add them on the admin Hospitals page. For each
ranked hospital a doctor may name a preferred consultant or "any". Hospitals are allocated first, unchanged, so
naming a consultant never costs a hospital. Then, inside each hospital (`assignConsultants` in `lib/allocate.ts`):
pass 1 in merit order gives named consultants while they have seats; pass 2 in merit order gives everyone else
("any", or whose consultant was taken) the first consultant with a free seat. Doctors see "preferred" /
"assigned" / "consultant to be arranged". Removing a consultant turns preferences for them into "any".

**Admin flow:** add hospitals → open → (doctors choose, everyone watches the live table) → lock → publish as
final. Publishing only labels the result final for doctors; seat/hospital changes after that still change it
(the Hospitals page warns). Manual placement (with a note) is possible once locked.

**Sign-in.** One shared doctor password, then the doctor taps their name ("Yes, this is me"). There is deliberately no
per-doctor PIN, so anyone with the doctor password can act as any doctor. That suits a small trusted group; the
audit log records each save under the name used.

## Stack and layout

Next.js 16 / React 19 / Prisma 7 / Postgres, plain CSS. `docker-compose.yml` runs a one-off `migrate` container
and the `radiomerit` web service (port 3000, put it behind your own reverse proxy with TLS). It expects an
existing Postgres container reachable as host `db` on an external Docker network (`DB_NETWORK`, default
`shared_default`) holding a database and role both named `radiomerit`.

## Passwords and secrets

`.env` (git-ignored, mode 600): `ADMIN_PASSWORD`, `DOCTOR_PASSWORD` (shared by the batch), `SESSION_SECRET`,
`RADIOMERIT_DB_PASSWORD`, `DATABASE_URL` (for host-side CLI). Copy `.env.example` to `.env` and fill it in.
To change a password: edit `.env`, then `docker compose up -d`.

## Commands

```bash
docker compose up -d --build            # build, migrate, restart
docker compose logs -f radiomerit
./scripts/backup.sh                     # pg_dump to backups/, 7 days kept; see PG_EXEC / PG_USER in the script
npm test                                # vitest
npx prisma db seed                      # idempotent: 23 synthetic doctors + Round 1 draft
MERIT_LIST_CSV=/path/real.csv npx prisma db seed   # your own list (header: order,indexNo,name); do not commit it
npx tsx scripts/rehearse.ts             # fake TEST hospitals + random choices (DRAFT/OPEN only); never once real choices exist
```

The DB role has no CREATEDB, so create migrations with
`prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
(needs a shadow DB: use `--from-schema` of the previous schema file, or write the SQL by hand) and apply with
`prisma migrate deploy` (the `migrate` container does this on every `docker compose up`).

Doctor names can be edited on the admin Doctors page.
