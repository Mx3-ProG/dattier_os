#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?Use a dedicated backup database credential}"
: "${BACKUP_DESTINATION:?Use an encrypted external backup destination directory}"
umask 077
mkdir -p "$BACKUP_DESTINATION"
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$BACKUP_DESTINATION/atacuisine-$backup_stamp.dump"
pg_dump --format=custom --file="$backup_path" "$BACKUP_DATABASE_URL"
pg_restore --list "$backup_path" > "$backup_path.manifest"
shasum -a 256 "$backup_path" > "$backup_path.sha256"
printf '%s\n' "Backup complete: $backup_path"
