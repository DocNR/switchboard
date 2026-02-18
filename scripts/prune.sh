#!/usr/bin/env bash
# prunestr - prune dormant follows from your Nostr follow list
#
# Usage:
#   NOSTR_SECRET_KEY=nsec1... ./prune.sh [options]
#
# Options:
#   --months N      flag follows with no activity in last N months (default: 6)
#   --concurrency N parallel relay queries (default: 30)
#   --dry-run       print dormant pubkeys but don't publish anything
#   --output FILE   save pruned follow list JSON to file (don't publish)
#   --kinds K,K,..  event kinds to consider as "active" (default: 1,6)
#
# Requires: nak, jq
#
# Notes:
#   - Only checks a set of well-known relays + relay hints from your kind 3 tags.
#     Follows who only post to obscure relays may be incorrectly flagged as dormant.
#   - Set NOSTR_SECRET_KEY to your nsec/hex key. For dry-run you can use NOSTR_PUBKEY
#     (hex) instead and skip publishing.

set -eu

# ── defaults ──────────────────────────────────────────────────────────────────
MONTHS=6
CONCURRENCY=30
DRY_RUN=false
OUTPUT_FILE=""
KINDS="1,6"
FALLBACK_RELAYS=(
  wss://relay.damus.io
  wss://nos.lol
  wss://relay.nostr.band
  wss://offchain.pub
  wss://relay.snort.social
)

# ── arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --months)      MONTHS="$2";      shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true;     shift   ;;
    --output)      OUTPUT_FILE="$2"; shift 2 ;;
    --kinds)       KINDS="$2";       shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── sanity checks ─────────────────────────────────────────────────────────────
if ! command -v nak &>/dev/null; then echo "Error: nak not found in PATH"; exit 1; fi
if ! command -v jq  &>/dev/null; then echo "Error: jq not found in PATH";  exit 1; fi

if [[ -z "${NOSTR_SECRET_KEY:-}" && -z "${NOSTR_PUBKEY:-}" ]]; then
  echo "Error: set NOSTR_SECRET_KEY (nsec/hex) or NOSTR_PUBKEY (hex, dry-run only)"
  exit 1
fi

# Derive pubkey from secret key if provided
if [[ -n "${NOSTR_SECRET_KEY:-}" ]]; then
  PUBKEY=$(nak key public "$NOSTR_SECRET_KEY" 2>/dev/null)
else
  PUBKEY="$NOSTR_PUBKEY"
fi

if [[ -z "$PUBKEY" ]]; then
  echo "Error: could not derive pubkey"
  exit 1
fi

# ── compute cutoff timestamp ──────────────────────────────────────────────────
# macOS uses -v, GNU date uses -d
CUTOFF=$(date -v-${MONTHS}m +%s 2>/dev/null || date -d "${MONTHS} months ago" +%s)
CUTOFF_DATE=$(date -r "$CUTOFF" 2>/dev/null || date -d "@$CUTOFF")

# Convert kinds string to nak flags: "1,6" -> "-k 1 -k 6"
KIND_FLAGS=$(echo "$KINDS" | tr ',' '\n' | sed 's/^/-k /' | tr '\n' ' ')

echo "══════════════════════════════════════════════"
echo " prunestr"
echo "══════════════════════════════════════════════"
echo " pubkey   : ${PUBKEY:0:16}..."
echo " cutoff   : $CUTOFF_DATE (${MONTHS} months ago)"
echo " kinds    : $KINDS"
echo " dry-run  : $DRY_RUN"
echo "══════════════════════════════════════════════"
echo ""

# ── fetch follow list ─────────────────────────────────────────────────────────
echo "→ Fetching your kind 3 (follow list)..."

FOLLOW_EVENT=$(nak req -k 3 -a "$PUBKEY" -l 1 "${FALLBACK_RELAYS[@]}" 2>/dev/null | { head -1; cat >/dev/null; } || true)

if [[ -z "$FOLLOW_EVENT" ]]; then
  echo "Error: could not fetch your follow list from any relay"
  exit 1
fi

# Extract follows: pubkey<TAB>relay_hint (relay_hint may be empty)
FOLLOWS_TSV=$(echo "$FOLLOW_EVENT" | jq -r '.tags[] | select(.[0] == "p") | [.[1], (.[2] // "")] | @tsv')
TOTAL=$(echo "$FOLLOWS_TSV" | grep -c . || true)

echo "  found $TOTAL follows"
echo ""

# ── check activity per follow ─────────────────────────────────────────────────
echo "→ Checking activity (${CONCURRENCY} parallel queries)..."
echo "  This may take a few minutes for large follow lists."
echo ""

ACTIVE_FILE=$(mktemp)
DORMANT_FILE=$(mktemp)

check_one() {
  local pubkey="$1"
  local relay_hint="$2"

  # Build relay list: hint first (most likely to have their events), then fallbacks
  local relays=()
  if [[ -n "$relay_hint" && "$relay_hint" == wss://* ]]; then
    relays+=("$relay_hint")
  fi
  relays+=("${FALLBACK_RELAYS[@]}")

  # Ask for 1 recent event of the specified kinds from this author
  # shellcheck disable=SC2086
  local result
  result=$(nak req $KIND_FLAGS -a "$pubkey" -l 1 -s "$CUTOFF" \
    "${relays[@]}" 2>/dev/null | { head -1; cat >/dev/null; } || true)

  if [[ -n "$result" ]]; then
    echo "$pubkey" >> "$ACTIVE_FILE"
  else
    echo "$pubkey" >> "$DORMANT_FILE"
  fi
}

# Run checks in batches of CONCURRENCY (bash 3.2-compatible)
# </dev/null is critical: nak reads stdin if available, which would drain the
# here-string that the while loop is reading from.
BATCH_NUM=0
CHECKED=0
while IFS=$'\t' read -r pubkey relay_hint; do
  check_one "$pubkey" "$relay_hint" </dev/null &
  BATCH_NUM=$((BATCH_NUM + 1))
  if (( BATCH_NUM >= CONCURRENCY )); then
    wait || true
    CHECKED=$((CHECKED + BATCH_NUM))
    printf "  %d / %d checked\n" "$CHECKED" "$TOTAL"
    BATCH_NUM=0
  fi
done <<< "$FOLLOWS_TSV"

# drain final partial batch
wait || true
CHECKED=$((CHECKED + BATCH_NUM))
printf "  %d / %d checked\n" "$CHECKED" "$TOTAL"

ACTIVE_COUNT=$(grep -c . "$ACTIVE_FILE" 2>/dev/null || echo 0)
DORMANT_COUNT=$(grep -c . "$DORMANT_FILE" 2>/dev/null || echo 0)

echo ""
echo "══════════════════════════════════════════════"
echo " Results"
echo "══════════════════════════════════════════════"
echo " Total follows  : $TOTAL"
echo " Active         : $ACTIVE_COUNT  (had kind $KINDS activity in last ${MONTHS}m)"
echo " Dormant        : $DORMANT_COUNT (candidates for removal)"
echo "══════════════════════════════════════════════"
echo ""

if [[ "$DORMANT_COUNT" -eq 0 ]]; then
  echo "No dormant follows found. Nothing to prune."
  rm -f "$ACTIVE_FILE" "$DORMANT_FILE"
  
  exit 0
fi

# ── build pruned kind 3 event ─────────────────────────────────────────────────

# Read dormant pubkeys into a JSON array for jq
DORMANT_JSON=$(jq -R -s 'split("\n") | map(select(. != ""))' "$DORMANT_FILE")

# Filter the follow list: keep all non-p tags + p tags not in dormant set
PRUNED_EVENT=$(echo "$FOLLOW_EVENT" | jq \
  --argjson dormant "$DORMANT_JSON" \
  '
    .tags = [
      .tags[] |
      if .[0] == "p" then
        if (.[ 1] as $pk | $dormant | index($pk)) == null then . else empty end
      else
        .
      end
    ]
    | del(.id, .sig, .created_at)
  '
)

if [[ "$DRY_RUN" == true ]]; then
  echo "Dormant follows (dry run — not publishing):"
  echo "--------------------------------------------"
  cat "$DORMANT_FILE"
  echo ""
  echo "Pruned event (not signed):"
  echo "$PRUNED_EVENT" | jq .
  rm -f "$ACTIVE_FILE" "$DORMANT_FILE"
  exit 0
fi

if [[ -n "$OUTPUT_FILE" ]]; then
  echo "$PRUNED_EVENT" > "$OUTPUT_FILE"
  echo "→ Pruned event saved to $OUTPUT_FILE (not published)"
  echo "  Sign and publish with:"
  echo "    cat $OUTPUT_FILE | nak event --sec \$NOSTR_SECRET_KEY ${FALLBACK_RELAYS[*]}"
  rm -f "$ACTIVE_FILE" "$DORMANT_FILE"
  exit 0
fi

if [[ -z "${NOSTR_SECRET_KEY:-}" ]]; then
  echo "Error: NOSTR_SECRET_KEY required to publish. Use --dry-run or --output."
  rm -f "$ACTIVE_FILE" "$DORMANT_FILE"
  exit 1
fi

echo "→ Publishing pruned follow list to relays..."
echo "  (Removing $DORMANT_COUNT follows, keeping $ACTIVE_COUNT)"
echo ""

echo "$PRUNED_EVENT" | nak event --sec "$NOSTR_SECRET_KEY" "${FALLBACK_RELAYS[@]}"

echo ""
echo "Done. Follow list pruned from $TOTAL → $ACTIVE_COUNT follows."

rm -f "$ACTIVE_FILE" "$DORMANT_FILE"
