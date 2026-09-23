#!/usr/bin/env python3
"""
Career Switch v3 list generator.

Builds the <div id="list"> content in index.html from the data files,
so data fixes never require manual HTML surgery again.

Usage:
  python3 gen_list.py --check    # verify current index.html matches generated output
  python3 gen_list.py --write    # regenerate the list section in index.html

The static shell (head, styles, brand bar, search, footer) is preserved;
only the list div is regenerated.
"""
import json, re, sys, html as htmlmod

BASE = '/home/hatch/workspace/gethowmuch-net/career-switch-v3'
SPINE = f'{BASE}/data/spine-ows2025.json'
OVERLAY = f'{BASE}/data/roles-overlay.json'
INDEX = f'{BASE}/index.html'

def esc(s):
    return htmlmod.escape(str(s), quote=True)

def money(n):
    return '$' + f'{n:,}'

def build_list():
    spine = json.load(open(SPINE))
    overlay = json.load(open(OVERLAY))
    by_ssoc = {}
    for r in overlay['roles']:
        if r['mom_ssoc'] and r['wages']:
            by_ssoc.setdefault(r['mom_ssoc'], []).append(r)
    withheld_by_fam = {}
    for r in overlay['roles']:
        if r['band_status'] == 'withheld':
            fam = str(r.get('withheld_family') or '')
            withheld_by_fam.setdefault(fam, []).append(r)

    parts = ['<div id="list">\n']
    for g in spine['groups']:
        code = g['code']
        occs = [o for o in spine['occupations'] if o['group'] == code]
        parts.append(f'<section class="fam" id="fam-{code}" data-fam="{code}"><h2>{esc(g["title"])}</h2><div class="occlist">')
        for o in occs:
            ssoc = o['ssoc']
            roles = by_ssoc.get(ssoc, [])
            # data-title: occupation title + attached role titles (lowercased)
            dt = o['title'].lower()
            for r in roles:
                rt = r['title'].lower()
                if rt not in dt:
                    dt += ' ' + rt
            # badge if any attached role has a researched (non-OPEN) path
            badged = any((rr.get('reskill') or {}).get('path') != 'OPEN' for rr in roles)
            badge = ' <span class="pathbadge">switcher path</span>' if badged else ''
            wage = f"gross {money(o['gross']['p25'])}&ndash;{money(o['gross']['p75'])}"
            parts.append(
                f'<a class="occ" href="#occ-{ssoc}" data-fam="{code}" data-title="{esc(dt)}">'
                f'<span class="occ-t">{esc(o["title"])}{badge}</span>'
                f'<span class="occ-w mono">{wage}</span></a>'
            )
        # idxsub: withheld roles for this family
        wroles = withheld_by_fam.get(code, [])
        if wroles:
            parts.append('<div class="idxsub"><h3>Researched switcher paths without an official pay band</h3>'
                '<p class="fine">These roles have a career-index entry, but no MOM row is a fair proxy for '
                'their pay, so no band is shown rather than a guessed one. Reskill paths are marked where researched.</p>')
            for r in sorted(wroles, key=lambda x: x['title'].lower()):
                rid = r['role_id']
                researched = (r.get('reskill') or {}).get('path') != 'OPEN'
                if researched:
                    badge = ' <span class="pathbadge">switcher path</span>'
                else:
                    badge = ' <span class="pathbadge openbadge">path not yet researched</span>'
                parts.append(
                    f'<a class="occ idx" href="#role-{rid}" data-fam="{code}" data-title="{esc(r["title"].lower())}">'
                    f'<span class="occ-t">{esc(r["title"])}{badge}</span>'
                    f'<span class="occ-w">no official pay band</span></a>'
                )
            parts.append('</div>')
        parts.append('</div></section>\n')
    parts.append('</div>\n')
    return ''.join(parts)

def get_current_list():
    html = open(INDEX).read()
    start = html.find('<div id="list">')
    end = html.find('<div class="empty" id="empty">')
    return html[start:end].strip(), html[:start], html[end:]

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else '--check'
    generated = build_list().strip()
    current, header, footer = get_current_list()
    # Normalize whitespace for comparison
    gen_norm = re.sub(r'\s+', ' ', generated)
    cur_norm = re.sub(r'\s+', ' ', current)
    if mode == '--check':
        if gen_norm == cur_norm:
            print('CHECK PASS: index.html list matches generated output')
        else:
            print('CHECK FAIL: index.html list differs from generated output')
            # Find first difference
            for i, (a, b) in enumerate(zip(gen_norm, cur_norm)):
                if a != b:
                    print(f'First diff at char {i}:')
                    print(f'  generated: ...{gen_norm[max(0,i-100):i+100]}...')
                    print(f'  current:   ...{cur_norm[max(0,i-100):i+100]}...')
                    break
            if len(gen_norm) != len(cur_norm):
                print(f'Length: generated {len(gen_norm)}, current {len(cur_norm)}')
            sys.exit(1)
    elif mode == '--write':
        html = open(INDEX).read()
        start = html.find('<div id="list">')
        end = html.find('<div class="empty" id="empty">')
        new_html = html[:start] + build_list() + '\n' + html[end:]
        open(INDEX, 'w').write(new_html)
        print('WROTE: regenerated list section in index.html')
    else:
        print('Usage: gen_list.py --check | --write')
        sys.exit(2)

if __name__ == '__main__':
    main()
