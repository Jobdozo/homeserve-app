#!/usr/bin/env bash
# Connects Tikdum's Facebook Page and Instagram account for posting (server/src/social.js).
# Asks for your Meta app's ID and secret and a user token from Graph API Explorer (secret and
# token typed at hidden prompts — never shown, saved in the shell history or kept), swaps the
# token for a Page token that doesn't expire, finds the Instagram account linked to the Page,
# checks the posting permissions, saves META_PAGE_ID / META_PAGE_TOKEN / META_IG_USER_ID in
# .env and restarts the API. Nothing is posted.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-meta.sh
#
# Safe to run again (e.g. after the Page token was revoked): it replaces the old lines.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
GRAPH="${META_GRAPH_URL:-https://graph.facebook.com/v23.0}"
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
command -v python3 >/dev/null || { echo "python3 is needed (apt install python3) — stopping."; exit 1; }

work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
# json FILE EXPR: prints a value from a JSON file (EXPR is Python on the parsed object `d`).
json() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); v=($2); print('' if v is None else v)" "$1" 2>/dev/null || true; }
graph_error() { json "$1" "d.get('error',{}).get('message')"; }

printf "Meta App ID (developers.facebook.com → your app → App settings → Basic): "
IFS= read -r APP_ID
APP_ID="$(printf %s "$APP_ID" | tr -d '[:space:]')"
case "$APP_ID" in '' | *[!0-9]*) echo "The App ID is a number. Nothing was changed."; exit 1 ;; esac
echo "(Paste with right-click → Paste or Ctrl+Shift+V — plain Ctrl+V doesn't work in most terminals.)"
printf "App secret (same page, click Show; it won't show here): "
IFS= read -rs SECRET; echo
SECRET="$(printf %s "$SECRET" | tr -d '[:space:]')"
if [ -z "$SECRET" ]; then echo "   Nothing was pasted for the App secret. Nothing was changed — run this again."; exit 1; fi
echo "   ✓ received (${#SECRET} characters — an App secret has 32)"
printf "User token from Graph API Explorer (it won't show): "
IFS= read -rs USER_TOKEN; echo
USER_TOKEN="$(printf %s "$USER_TOKEN" | tr -d '[:space:]')"
if [ -z "$USER_TOKEN" ]; then echo "   Nothing was pasted for the token. Nothing was changed — run this again."; exit 1; fi
echo "   ✓ received (${#USER_TOKEN} characters — a token is usually 150–300)"
# Secrets go to curl through files, so they never appear in the process list.
printf %s "$SECRET" > "$work/secret"
printf %s "$USER_TOKEN" > "$work/user"
unset SECRET USER_TOKEN

echo "== swapping the token for a long-lived one"
curl -s -G --max-time 20 "$GRAPH/oauth/access_token" -o "$work/ll.json" \
  --data-urlencode grant_type=fb_exchange_token --data-urlencode "client_id=$APP_ID" \
  --data-urlencode "client_secret@$work/secret" --data-urlencode "fb_exchange_token@$work/user" || true
json "$work/ll.json" "d.get('access_token')" > "$work/longuser"
if [ ! -s "$work/longuser" ] || [ "$(wc -c < "$work/longuser")" -lt 20 ]; then
  echo "Meta didn't accept it: $(graph_error "$work/ll.json")"
  echo "Check the App ID and secret, and make a fresh token in Graph API Explorer (they last about an hour). Nothing was changed."
  exit 1
fi
tr -d '\n' < "$work/longuser" > "$work/lu" && mv "$work/lu" "$work/longuser"

echo "== checking permissions"
curl -s -G --max-time 20 "$GRAPH/me/permissions" -o "$work/perms.json" --data-urlencode "access_token@$work/longuser" || true
granted="$(json "$work/perms.json" "' '.join(p['permission'] for p in d.get('data',[]) if p.get('status')=='granted')")"
missing=""
for p in pages_show_list pages_manage_posts pages_read_engagement; do
  case " $granted " in *" $p "*) ;; *) missing="$missing $p" ;; esac
done
if [ -n "$missing" ]; then
  echo "The token is missing:$missing"
  echo "In Graph API Explorer add them under Permissions, click Generate Access Token, and run this again. Nothing was changed."
  exit 1
fi
# Optional, for the Marketing Agent's results (comments, reach, Instagram saves/shares): posting
# works without them, the results just come back with fewer numbers.
extra=""
for p in pages_read_user_content read_insights instagram_manage_insights; do
  case " $granted " in *" $p "*) ;; *) extra="$extra $p" ;; esac
done
[ -n "$extra" ] && echo "Optional, for post results:$extra — add them in Graph API Explorer and run this again to read comments and reach."
ig_ok=yes
for p in instagram_basic instagram_content_publish; do
  case " $granted " in *" $p "*) ;; *) ig_ok=no ;; esac
done

echo "== finding your Pages"
curl -s -G --max-time 20 "$GRAPH/me/accounts" -o "$work/pages.json" \
  --data-urlencode "fields=id,name,access_token,instagram_business_account{id,username}" --data-urlencode "access_token@$work/longuser" || true
count="$(json "$work/pages.json" "len(d.get('data',[]))")"
if [ -z "$count" ] || [ "$count" = 0 ]; then
  echo "No Facebook Pages found for this login: $(graph_error "$work/pages.json")"
  echo "When generating the token, tick your Tikdum Page in the Facebook pop-up. Nothing was changed."
  exit 1
fi
pick=0
if [ "$count" -gt 1 ]; then
  json "$work/pages.json" "'\n'.join(f\"  {i+1}. {p['name']}\" for i,p in enumerate(d['data']))"
  printf "Which Page is Tikdum? Type its number: "
  IFS= read -r n
  case "$n" in '' | *[!0-9]*) echo "Type a number from the list. Nothing was changed."; exit 1 ;; esac
  [ "$n" -ge 1 ] && [ "$n" -le "$count" ] || { echo "Type a number from the list. Nothing was changed."; exit 1; }
  pick=$((n - 1))
fi
PAGE_ID="$(json "$work/pages.json" "d['data'][$pick]['id']")"
PAGE_NAME="$(json "$work/pages.json" "d['data'][$pick]['name']")"
json "$work/pages.json" "d['data'][$pick].get('access_token')" | tr -d '\n' > "$work/pagetoken"
IG_ID="$(json "$work/pages.json" "(d['data'][$pick].get('instagram_business_account') or {}).get('id')")"
IG_NAME="$(json "$work/pages.json" "(d['data'][$pick].get('instagram_business_account') or {}).get('username')")"
[ -s "$work/pagetoken" ] || { echo "Meta didn't give a Page token for $PAGE_NAME. Nothing was changed."; exit 1; }
echo "   Facebook Page: $PAGE_NAME"
if [ -n "$IG_ID" ]; then echo "   Instagram: @$IG_NAME"; else echo "   Instagram: none linked to this Page (posts go to Facebook only)"; fi
if [ -n "$IG_ID" ] && [ "$ig_ok" = no ]; then
  echo "   WARNING: the token lacks instagram_basic / instagram_content_publish — Instagram posts will fail."
  echo "   Add both in Graph API Explorer, generate a new token and run this again."
fi

tmp="$(mktemp)"
grep -vE '^META_(PAGE_ID|PAGE_TOKEN|IG_USER_ID)=' "$ENV_FILE" > "$tmp" || true
{
  printf 'META_PAGE_ID=%s\n' "$PAGE_ID"
  printf 'META_PAGE_TOKEN=%s\n' "$(cat "$work/pagetoken")"
  printf 'META_IG_USER_ID=%s\n' "$IG_ID"
} >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "== saved in .env (the token isn't shown)"

echo "== restarting the API"
bash deploy/build-images.sh server
echo
echo "FACEBOOK${IG_ID:+ + INSTAGRAM} CONNECTED. The Marketing Agent proposes a post every Monday, Wednesday and Friday"
echo "from 10 AM (and for any task titled \"Post: …\"); each one goes live only when you approve it."
