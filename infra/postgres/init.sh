#!/usr/bin/env bash
set -euo pipefail
# Runs only on an empty PostgreSQL volume. Passwords stay out of command output.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=worker_password="$WORKER_DB_PASSWORD" --set=identity_password="$IDENTITY_DB_PASSWORD" <<'SQL'
CREATE ROLE dattier_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE dattier_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT dattier_app TO dattier_worker;
CREATE ROLE dattier_web LOGIN PASSWORD :'app_password' IN ROLE dattier_app;
CREATE ROLE dattier_jobs LOGIN PASSWORD :'worker_password' IN ROLE dattier_worker;
CREATE ROLE dattier_identity LOGIN PASSWORD :'identity_password';
CREATE DATABASE dattier_identity OWNER dattier_identity;
SQL
