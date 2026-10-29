#!/usr/bin/env bash
# Prints one person's login key for AUTH_KEYS (see docs/deploy-railway.md): the SHA-256 that public/login.html
# computes from the same email and password. Several people: join their keys with "|".
set -euo pipefail

read -rp "Email: " email
IFS= read -rsp "Пароль: " password
echo >&2

email=$(printf '%s' "$email" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
printf 'docscan\n%s\n%s' "$email" "$password" | shasum -a 256 | cut -d' ' -f1
