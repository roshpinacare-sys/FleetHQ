#!/bin/bash
# Clean env for all GitHub API work this session.
export GH_TOKEN="$(sed 's/\r$//' /home/z/my-project/upload/pat.env | tr -d '\n ')"
export GH_API="https://api.github.com"
export GH_ORG="roshpinacare-sys"
gh_raw() { # gh_raw <repo> <path> <ref>
  curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" \
    "$GH_API/repos/$GH_ORG/$1/contents/$2?ref=$3"
}
gh_json() { # gh_json <url-path>
  curl -s -H "Authorization: Bearer $GH_TOKEN" "$GH_API/$1"
}
