#!/usr/bin/env bash
set -euo pipefail
# Runs only on an empty PostgreSQL volume. Passwords stay out of command output.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=worker_password="$WORKER_DB_PASSWORD" --set=identity_password="$IDENTITY_DB_PASSWORD" <<'SQL'
CREATE ROLE atacuisine_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE atacuisine_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT atacuisine_app TO atacuisine_worker;
CREATE ROLE atacuisine_web LOGIN PASSWORD :'app_password' IN ROLE atacuisine_app;
CREATE ROLE atacuisine_jobs LOGIN PASSWORD :'worker_password' IN ROLE atacuisine_worker;
CREATE ROLE atacuisine_identity LOGIN PASSWORD :'identity_password';
CREATE DATABASE atacuisine_identity OWNER atacuisine_identity;
SQL
