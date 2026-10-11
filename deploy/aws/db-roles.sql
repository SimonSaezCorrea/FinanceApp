-- Least-privilege database users for production. Run ONCE as the RDS master user (fik_admin),
-- and again after restoring a snapshot into a new instance. Re-running is safe (it only resets
-- passwords and re-applies grants). Passwords come from Parameter Store, never from this file:
--   psql "<fik_admin URL>" -v app_pw="$(...DATABASE_APP_PASSWORD)" \
--        -v migrate_pw="$(...DATABASE_MIGRATE_PASSWORD)" -f db-roles.sql
--
--  fik_migrate  owns the schema and every table: `prisma migrate deploy` (DIRECT_DATABASE_URL).
--  fik_app      reads and writes ROWS only (SELECT/INSERT/UPDATE/DELETE): the running API and the
--               catalogue seed (DATABASE_URL). It cannot drop, alter or create tables, nor roles.
--  fik_admin    the RDS master: kept out of the server, for administration only.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', r)
FROM unnest(ARRAY['fik_migrate', 'fik_app']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

ALTER ROLE fik_migrate WITH LOGIN PASSWORD :'migrate_pw' NOCREATEDB NOCREATEROLE;
ALTER ROLE fik_app WITH LOGIN PASSWORD :'app_pw' NOCREATEDB NOCREATEROLE;

-- The master must be a member to hand ownership over (and to keep administering the objects).
GRANT fik_migrate TO fik_admin;
GRANT fik_app TO fik_admin;

REVOKE ALL ON DATABASE fik FROM PUBLIC;
GRANT CONNECT ON DATABASE fik TO fik_migrate, fik_app;

ALTER SCHEMA public OWNER TO fik_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Hand every existing table, sequence and type of the schema to fik_migrate.
SELECT format('ALTER TABLE public.%I OWNER TO fik_migrate', tablename)
FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'fik_migrate' \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO fik_migrate', sequencename)
FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> 'fik_migrate' \gexec
SELECT format('ALTER TYPE public.%I OWNER TO fik_migrate', t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'
  AND pg_get_userbyid(t.typowner) <> 'fik_migrate' \gexec

GRANT USAGE ON SCHEMA public TO fik_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fik_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fik_app;
-- Tables and sequences that future migrations create get the same rights automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE fik_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fik_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fik_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fik_app;
-- Prisma's migration history is none of the API's business.
REVOKE ALL ON public."_prisma_migrations" FROM fik_app;
