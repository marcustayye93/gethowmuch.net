#!/usr/bin/env python3
"""gen_guided.py — build the guided-questionnaire payload from the v3 spine.

Inputs:
  ../career-switch-v3/data/roles-overlay.json   (171 roles, wage bands, gates, paths)
  ../../career-switch-grok-audit/roles-tags-v1.json  (tag assignments)

Output:
  guided-payload.json — one small record per role. Deliberately minimal:
  no weights, no scores, no rankings, no demand, no midpoints. Withheld bands
  are absent, not hidden.

Grok hard rule enforced here: no function may take a band and a number and
return a boolean. This script ships data, not decisions.
"""
import json
import re
import sys
from pathlib import Path

OVERLAY = Path(__file__).parent.parent / "data" / "roles-overlay.json"
TAGS = Path(__file__).parent.parent.parent.parent / "career-switch-grok-audit" / "roles-tags-v1.json"
OUT = Path(__file__).parent / "guided-payload.json"

ALLOWED_TAG_RE = re.compile(r"^T(0[1-9]|10)$")


def slug(title):
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def path_line(summary):
    if not summary:
        return ""
    s = summary.strip()
    if "not yet researched" in s.lower():
        return ""
    return s[:120]


def main():
    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))
    if not TAGS.exists():
        sys.exit("tags file missing: %s" % TAGS)
    tagdoc = json.loads(TAGS.read_text(encoding="utf-8"))
    tags = tagdoc["tags"]

    roles = overlay["roles"]
    assert len(roles) == 171, "expected 171 roles, got %d" % len(roles)

    out = []
    for r in roles:
        rid = r["role_id"]
        if rid not in tags:
            sys.exit("role %s missing from tags file" % rid)
        tlist = tags[rid]
        for t in tlist:
            if not ALLOWED_TAG_RE.match(t):
                sys.exit("role %s has invalid tag %s" % (rid, t))

        rec = {
            "id": rid,
            "name": r["title"],
            "slug": slug(r["title"]),
            "map": r["band_status"],  # exact | proxy | withheld
            "basis": "gross monthly, incumbent",
            "lic": r["gate"]["type"],  # none|cert|portfolio|licence|open|employer
            "tags": sorted(set(tlist)),
        }
        wages = (r.get("wages") or {}).get("gross") or {}
        if r["band_status"] != "withheld" and wages.get("p25") and wages.get("p75"):
            rec["floor"] = wages["p25"]
            rec["ceil"] = wages["p75"]
        pl = path_line(r.get("path_summary"))
        rec["path"] = bool(pl)
        if pl:
            rec["pathline"] = pl
        out.append(rec)

    # Alphabetical by name, tie-break on id. This is the ONLY ordering rule.
    out.sort(key=lambda x: (x["name"].lower(), x["id"]))

    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("wrote %s with %d records" % (OUT, len(out)))


if __name__ == "__main__":
    main()
