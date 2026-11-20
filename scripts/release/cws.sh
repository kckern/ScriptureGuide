#!/usr/bin/env bash
# Chrome Web Store API v2 for the Scripture Guide extension.
#   cws.sh status            print a one-line summary; exit 2 if rejected or taken down
#   cws.sh cancel-pending    cancel a submission still in review (no-op otherwise)
#   cws.sh upload ZIP        upload a package and wait for it to process
#   cws.sh publish           submit the uploaded package for review
# Needs TOKEN (OAuth token with the chromewebstore scope) and PUBLISHER_ID.
# fetchStatus omits fields that are unset: submittedItemRevisionStatus (nothing submitted since
# the last publish), lastAsyncUploadState (no upload in 24 hours), takenDown and warned (false).
set -euo pipefail
: "${TOKEN:?set TOKEN}" "${PUBLISHER_ID:?set PUBLISHER_ID}"
EXTENSION_ID="${EXTENSION_ID:-lkagejkikblabiegfnehlknmlgckhgan}"
API=https://chromewebstore.googleapis.com
ITEM="publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")

# curl that prints the response body, or on an HTTP error writes Google's reason to stderr and fails
api() {
  local out code
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w '%{http_code}' "${AUTH[@]}" "$@") || { cat "$out" >&2; rm -f "$out"; return 1; }
  if [ "$code" -ge 400 ]; then echo "HTTP $code from $*: $(cat "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}

fetch_status() { api "${API}/v2/${ITEM}:fetchStatus"; }

case "${1:-}" in
  status)
    s=$(fetch_status)
    live=$(jq -r '[.publishedItemRevisionStatus.distributionChannels[]?.crxVersion] | first // "none"' <<<"$s")
    sub=$(jq -r '.submittedItemRevisionStatus.state // "none"' <<<"$s")
    subv=$(jq -r '[.submittedItemRevisionStatus.distributionChannels[]?.crxVersion] | first // ""' <<<"$s")
    down=$(jq -r '.takenDown // false' <<<"$s")
    warned=$(jq -r '.warned // false' <<<"$s")
    echo "live=${live} submitted=${sub}${subv:+ (${subv})} takenDown=${down}$([ "$warned" = true ] && echo ' warned=true')"
    if [ "$sub" = REJECTED ] || [ "$down" = true ]; then exit 2; fi ;;
  cancel-pending)
    s=$(fetch_status)
    sub=$(jq -r '.submittedItemRevisionStatus.state // "none"' <<<"$s")
    if [ "$sub" = PENDING_REVIEW ]; then
      # POST with an empty body; -d '' sends Content-Length: 0
      api -X POST -d '' "${API}/v2/${ITEM}:cancelSubmission"
      echo "cancelled the submission that was pending review"
    fi ;;
  upload)
    zip="${2:?usage: cws.sh upload ZIP}"
    r=$(api -H 'Content-Type: application/zip' --data-binary @"$zip" "${API}/upload/v2/${ITEM}:upload")
    echo "upload: $r"
    state=$(jq -r .uploadState <<<"$r")
    for _ in $(seq 1 30); do
      # The reference names the in-progress value both IN_PROGRESS and UPLOAD_IN_PROGRESS
      case "$state" in IN_PROGRESS|UPLOAD_IN_PROGRESS) ;; *) break ;; esac
      sleep 10
      s=$(fetch_status)
      state=$(jq -r '.lastAsyncUploadState // "NOT_FOUND"' <<<"$s")
      echo "upload state: $state"
    done
    [ "$state" = SUCCEEDED ] || { echo "::error::upload ended in state $state"; exit 1; } ;;
  publish)
    # No --fail: a rejected submission's reason is in the body, so print it first
    r=$(curl -sS "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"publishType":"DEFAULT_PUBLISH"}' "${API}/v2/${ITEM}:publish")
    echo "publish: $r"
    case "$(jq -r .state <<<"$r")" in
      PENDING_REVIEW|PUBLISHED|STAGED|PUBLISHED_TO_TESTERS) ;;
      *) echo "::error::publish was not accepted"; exit 1 ;;
    esac ;;
  *) sed -n '2,7p' "$0"; exit 64 ;;
esac
