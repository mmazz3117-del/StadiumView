#!/usr/bin/env python3
"""Build a fail-closed, app-bounded 2026 CFBD snapshot and Pages artifact.

Production: python scripts/build_stadium_records.py --source . --output _site --season 2026
Local portable source: use --source dist instead. CFBD_API_KEY is read from the
process environment only. Responses stay in memory; neither credentials nor
raw provider data are written, printed, cached, or included in the artifact.
Only this app's reviewed overall/conference display labels are embedded in catalog.js.
Pillow 12.3.0 produces hosting-only lossless WebP artwork; every decoded pixel
and native dimension is verified. Original source PNGs are never rewritten.
No authenticated coverage is assumed: a missing school (including Ivy/FCS)
blocks the entire build, preserving the previous successful Pages deployment.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request

SEASON = 2026  # Deliberate season pin; review coverage before changing next season.
RECORD_MARKER = "window.STADIUM_ATLAS_RECORDS = null;"
CATALOG_MARKER = "window.STADIUMS = "
ROOT_FILES = frozenset({"index.html", "styles.css", "app.js", "catalog.js", "site.webmanifest"})
ASSET_SUFFIXES = frozenset({".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp", ".avif"})
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_GAMES = 30  # Sanity ceiling; never infer a record from absent data.

# Stadium IDs and display names are local, reviewed app data. Error summaries
# only use these known names, never arbitrary strings returned by the API.
SCHOOLS = {
    'oregon-autzen': ('Oregon', 'fbs'),
    'penn-state-beaver': ('Penn State', 'fbs'),
    'michigan-stadium': ('Michigan', 'fbs'),
    'lsu-tiger': ('LSU', 'fbs'),
    'tennessee-neyland': ('Tennessee', 'fbs'),
    'washington-husky': ('Washington', 'fbs'),
    'alabama-bryant-denny': ('Alabama', 'fbs'),
    'ohio-state-ohio-stadium': ('Ohio State', 'fbs'),
    'notre-dame': ('Notre Dame', 'fbs'),
    'texas-dkr-memorial': ('Texas', 'fbs'),
    'clemson-memorial': ('Clemson', 'fbs'),
    'georgia-sanford': ('Georgia', 'fbs'),
    'florida-ben-hill-griffin': ('Florida', 'fbs'),
    'florida-state-doak-campbell': ('Florida State', 'fbs'),
    'oklahoma-memorial-stadium': ('Oklahoma', 'fbs'),
    'texas-am-kyle-field': ('Texas A&M', 'fbs'),
    'brown-brown-stadium': ('Brown', 'fcs'),
    'columbia-wien-stadium': ('Columbia', 'fcs'),
    'cornell-schoellkopf': ('Cornell', 'fcs'),
    'dartmouth-memorial': ('Dartmouth', 'fcs'),
    'harvard-stadium': ('Harvard', 'fcs'),
    'penn-franklin-field': ('Penn', 'fcs'),
    'princeton-powers': ('Princeton', 'fcs'),
    'yale-bowl': ('Yale', 'fcs'),
    'auburn-jordan-hare-stadium': ('Auburn', 'fbs'),
    'arkansas-razorback-stadium': ('Arkansas', 'fbs'),
    'ole-miss-vaught-hemingway-stadium': ('Ole Miss', 'fbs'),
    'mississippi-state-davis-wade-stadium': ('Mississippi State', 'fbs'),
    'missouri-memorial-stadium': ('Missouri', 'fbs'),
    'kentucky-kroger-field': ('Kentucky', 'fbs'),
    'south-carolina-williams-brice-stadium': ('South Carolina', 'fbs'),
    'vanderbilt-firstbank-stadium': ('Vanderbilt', 'fbs'),
    'usc-los-angeles-memorial-coliseum': ('USC', 'fbs'),
    'ucla-rose-bowl': ('UCLA', 'fbs'),
    'wisconsin-camp-randall': ('Wisconsin', 'fbs'),
    'iowa-kinnick': ('Iowa', 'fbs'),
    'nebraska-memorial': ('Nebraska', 'fbs'),
    'michigan-state-spartan': ('Michigan State', 'fbs'),
    'minnesota-huntington-bank': ('Minnesota', 'fbs'),
    'virginia-tech-lane-stadium': ('Virginia Tech', 'fbs'),
    'virginia-scott-stadium': ('Virginia', 'fbs'),
    'north-carolina-kenan-stadium': ('North Carolina', 'fbs'),
    'nc-state-carter-finley': ('NC State', 'fbs'),
    'duke-wallace-wade-stadium': ('Duke', 'fbs'),
    'arizona-arizona-stadium': ('Arizona', 'fbs'),
    'arizona-state-sun-devil-stadium': ('Arizona State', 'fbs'),
    'byu-lavell-edwards': ('BYU', 'fbs'),
    'colorado-folsom-field': ('Colorado', 'fbs'),
    'utah-rice-eccles': ('Utah', 'fbs'),
    'iowa-state-jack-trice': ('Iowa State', 'fbs'),
    'kansas-memorial-stadium': ('Kansas', 'fbs'),
    'kansas-state-bill-snyder-family': ('Kansas State', 'fbs'),
    'oklahoma-state-boone-pickens': ('Oklahoma State', 'fbs'),
    'texas-tech-jones-stadium': ('Texas Tech', 'fbs'),
    'baylor-mclane': ('Baylor', 'fbs'),
    'tcu-amon-g-carter': ('TCU', 'fbs'),
    'houston-stadium': ('Houston', 'fbs'),
    'ucf-bounce-house': ('UCF', 'fbs'),
    'cincinnati-nippert': ('Cincinnati', 'fbs'),
    'west-virginia-milan-puskar': ('West Virginia', 'fbs'),
    'miami-joe-robbie-stadium': ('Miami', 'fbs'),
    'louisville-cardinal-stadium': ('Louisville', 'fbs'),
    'pittsburgh-north-shore-stadium': ('Pittsburgh', 'fbs'),
    'georgia-tech-bobby-dodd': ('Georgia Tech', 'fbs'),
    'indiana-memorial-stadium': ('Indiana', 'fbs'),
    'illinois-memorial-stadium': ('Illinois', 'fbs'),
    'maryland-secu-stadium': ('Maryland', 'fbs'),
    'northwestern-ryan-field': ('Northwestern', 'fbs'),
    'purdue-ross-ade': ('Purdue', 'fbs'),
    'rutgers-shi-stadium': ('Rutgers', 'fbs'),
    'boston-college-alumni': ('Boston College', 'fbs'),
    'california-memorial-stadium': ('California', 'fbs'),
    'smu-ford-stadium': ('SMU', 'fbs'),
    'stanford-stadium': ('Stanford', 'fbs'),
    'syracuse-jma-wireless-dome': ('Syracuse', 'fbs'),
    'wake-forest-allegacy-stadium': ('Wake Forest', 'fbs'),
    'boise-state-albertsons': ('Boise State', 'fbs'),
    'colorado-state-canvas': ('Colorado State', 'fbs'),
    'fresno-state-valley-childrens': ('Fresno State', 'fbs'),
    'san-diego-state-snapdragon': ('San Diego State', 'fbs'),
    'oregon-state-reser': ('Oregon State', 'fbs'),
    'washington-state-martin': ('Washington State', 'fbs'),
    'utah-state-maverik': ('Utah State', 'fbs'),
    'texas-state-bobcat-stadium': ('Texas State', 'fbs'),
    'army-michie': ('Army', 'fbs'),
    'navy-marine-corps-memorial': ('Navy', 'fbs'),
    'air-force-falcon': ('Air Force', 'fbs'),
    'memphis-simmons-bank-liberty': ('Memphis', 'fbs'),
    'tulane-yulman': ('Tulane', 'fbs'),
    'south-florida-raymond-james': ('South Florida', 'fbs'),
    'unlv-allegiant': ('UNLV', 'fbs'),
    'hawaii-ching-complex': ("Hawai'i", 'fbs'),
    'app-state-kidd-brewer': ('App State', 'fbs'),
    'james-madison-bridgeforth': ('James Madison', 'fbs'),
    'charlotte-jerry-richardson': ('Charlotte', 'fbs'),
    'east-carolina-dowdy-ficklen': ('East Carolina', 'fbs'),
    'florida-atlantic-flagler-stadium': ('Florida Atlantic', 'fbs'),
    'north-texas-datcu': ('North Texas', 'fbs'),
    'rice-first-community-stadium': ('Rice', 'fbs'),
    'temple-lincoln-financial': ('Temple', 'fbs'),
    'tulsa-chapman': ('Tulsa', 'fbs'),
    'uab-protective-stadium': ('UAB', 'fbs'),
    'utsa-alamodome': ('UTSA', 'fbs'),
    'nevada-mackay': ('Nevada', 'fbs'),
    'new-mexico-university-stadium': ('New Mexico', 'fbs'),
    'north-dakota-state-fargodome': ('North Dakota State', 'fbs'),
    'northern-illinois-huskie-stadium': ('Northern Illinois', 'fbs'),
    'san-jose-state-cefcu': ('San José State', 'fbs'),
    'utep-sun-bowl': ('UTEP', 'fbs'),
    'wyoming-war-memorial': ('Wyoming', 'fbs'),
    'uconn-rentschler-field': ('UConn', 'fbs'),
    'coastal-carolina-brooks-stadium': ('Coastal Carolina', 'fbs'),
    'georgia-southern-paulson': ('Georgia Southern', 'fbs'),
    'marshall-joan-edwards': ('Marshall', 'fbs'),
    'akron-infocision': ('Akron', 'fbs'),
    'ball-state-scheumann': ('Ball State', 'fbs'),
    'bowling-green-doyt-perry': ('Bowling Green', 'fbs'),
    'buffalo-broadview': ('Buffalo', 'fbs'),
    'central-michigan-kelly-shorts': ('Central Michigan', 'fbs'),
    'eastern-michigan-rynearson': ('Eastern Michigan', 'fbs'),
    'kent-state-dix': ('Kent State', 'fbs'),
    'miami-yager': ('Miami (OH)', 'fbs'),
    'ohio-peden': ('Ohio', 'fbs'),
    'toledo-glass-bowl': ('Toledo', 'fbs'),
    'umass-mcguirk': ('Massachusetts', 'fbs'),
    'western-michigan-waldo': ('Western Michigan', 'fbs'),
    'sacramento-state-hornet': ('Sacramento State', 'fbs'),
    'fiu-pitbull': ('Florida International', 'fbs'),
    'jacksonville-state-amfirst': ('Jacksonville State', 'fbs'),
    'kennesaw-state-fifth-third': ('Kennesaw State', 'fbs'),
    'liberty-williams': ('Liberty', 'fbs'),
    'middle-tennessee-floyd': ('Middle Tennessee', 'fbs'),
    'new-mexico-state-aggie-memorial': ('New Mexico State', 'fbs'),
    'sam-houston-bowers': ('Sam Houston', 'fbs'),
    'western-kentucky-houchens-smith': ('Western Kentucky', 'fbs'),
    'arkansas-state-centennial': ('Arkansas State', 'fbs'),
    'georgia-state-center-parc': ('Georgia State', 'fbs'),
    'louisiana-lourdes': ('Louisiana', 'fbs'),
    'louisiana-tech-joe-aillet': ('Louisiana Tech', 'fbs'),
    'ulm-st-francis': ('UL Monroe', 'fbs'),
    'old-dominion-ballard': ('Old Dominion', 'fbs'),
    'south-alabama-hancock-whitney': ('South Alabama', 'fbs'),
    'southern-miss-renasant': ('Southern Miss', 'fbs'),
    'troy-veterans-memorial': ('Troy', 'fbs'),
    'delaware-stadium': ('Delaware', 'fbs'),
    'richmond-robins': ('Richmond', 'fcs'),
    'villanova-stadium': ('Villanova', 'fcs'),
    'william-mary-zable': ('William & Mary', 'fcs'),
    'furman-paladin': ('Furman', 'fcs'),
    'montana-washington-grizzly': ('Montana', 'fcs'),
    'montana-state-bobcat': ('Montana State', 'fcs'),
    'eastern-washington-roos': ('Eastern Washington', 'fcs'),
    'weber-state-stewart': ('Weber State', 'fcs'),
    'cal-poly-spanos': ('Cal Poly', 'fcs'),
    'missouri-state-plaster': ('Missouri State', 'fbs'),
    'south-dakota-state-dykhouse': ('South Dakota State', 'fcs'),
    'illinois-state-hancock': ('Illinois State', 'fcs'),
    'southern-illinois-saluki': ('Southern Illinois', 'fcs'),
    'youngstown-state-stambaugh': ('Youngstown State', 'fcs'),
    'uc-davis-health': ('UC Davis', 'fcs'),
    'chattanooga-finley': ('Chattanooga', 'fcs'),
    'florida-am-bragg': ('Florida A&M', 'fcs'),
    'jackson-state-veterans': ('Jackson State', 'fcs'),
    'southern-mumford': ('Southern', 'fcs'),
}
# The 164 reviewed identities include 2 FBS and 18 FCS additions for v1.12.0. Public
# FBS directory identities were checked at https://collegefootballdata.com/teams
# (2026-10-14); canonical provider spellings include "Hawai'i" and "App State".
# These names are intentionally not replaced by Hawaii or Appalachian State.
# San José State retains the provider directory accent; UConn is its canonical name.
# North Dakota State is a new FBS Mountain West member in 2026.
# Miami is the ACC school;
# Miami (OH) is the separate MAC school and must never match Miami.
# New canonical identities include Florida International, Massachusetts, and UL Monroe. Public identities do
# not establish authenticated 2026 records coverage, which every run validates.
# New FCS name strings have historical public corroboration, not current
# authenticated coverage. The authenticated build
# must verify all current team IDs, classifications, and records before publication.
# These are explicit identities, not fuzzy matches or generic abbreviations.
# API alternateNames/abbreviation fields are deliberately not used as a fallback.
# Reviewed UI labels are separate from provider identities. This mapping only
# validates catalog display text; it never participates in provider matching.
DISPLAY_NAMES = {
    "california-memorial-stadium": "Cal",
    "south-florida-raymond-james": "USF",
    "hawaii-ching-complex": "Hawai‘i",
    "app-state-kidd-brewer": "Appalachian State",
    'umass-mcguirk': 'UMass',
    'fiu-pitbull': 'FIU',
    'ulm-st-francis': 'ULM',
}

# Explicit football independents: preserve null conference records.
INDEPENDENT_STADIUMS = frozenset({"notre-dame", "uconn-rentschler-field"})

# v1.9.2 adds one interior view after the two existing exterior views for these
# two enclosed venues only. Keep the count exact so missing or unexpected
# artwork still fails preflight before credentials or provider access.
INTERIOR_VIEW_STADIUMS = frozenset({
    "syracuse-jma-wireless-dome",
    "unlv-allegiant",
})

EXPLICIT_ALIASES = {
    "lsu-tiger": ("Louisiana State", "Louisiana State University"),
    "penn-franklin-field": ("Pennsylvania", "University of Pennsylvania"),
    "ole-miss-vaught-hemingway-stadium": ("Mississippi", "University of Mississippi"),
    "nc-state-carter-finley": ("North Carolina State", "North Carolina State University"),
    "usc-los-angeles-memorial-coliseum": ("Southern California", "University of Southern California"),
    "ucla-rose-bowl": ("University of California, Los Angeles",),
}


class BuildError(Exception):
    """A controlled error containing only a fixed reason and known school names."""

    def __init__(self, reason: str, school_ids=()):
        self.reason = reason
        self.school_ids = tuple(sorted(set(school_ids) & SCHOOLS.keys()))
        super().__init__(reason)

    def public_message(self) -> str:
        names = ", ".join(SCHOOLS[sid][0] for sid in self.school_ids)
        return self.reason + (f" Schools: {names}." if names else "")


def canonical(value) -> str:
    return " ".join(value.split()).casefold() if isinstance(value, str) else ""


def accepted_names(stadium_id: str) -> set[str]:
    school, _ = SCHOOLS[stadium_id]
    return {canonical(name) for name in (school, *EXPLICIT_ALIASES.get(stadium_id, ()))}


def integer(value, minimum=0, maximum=None) -> bool:
    return type(value) is int and value >= minimum and (maximum is None or value <= maximum)


def strict_json(text: str):
    def pairs(items):
        obj = {}
        for key, value in items:
            if key in obj:
                raise ValueError("Duplicate JSON key")
            obj[key] = value
        return obj

    def reject_constant(_):
        raise ValueError("Non-finite JSON number")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=reject_constant)


def checked_file(source: Path, relative: str) -> Path:
    """Reject traversal, symlinks, and nonfiles before opening/copying anything."""
    parts = PurePosixPath(relative).parts
    if not parts or PurePosixPath(relative).is_absolute() or any(p in {".", ".."} for p in parts):
        raise BuildError("Unsafe site file reference; build stopped.")
    candidate = source
    for part in parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise BuildError("Symbolic links are not allowed in the site artifact.")
    if not candidate.is_file() or not candidate.resolve().is_relative_to(source.resolve()):
        raise BuildError("A required site file is missing or unsafe.")
    return candidate


def validate_catalog(catalog) -> None:
    """Require the complete reviewed school set before any records can join it."""
    if not isinstance(catalog, list) or len(catalog) != len(SCHOOLS):
        raise BuildError(f"The catalog must contain exactly {len(SCHOOLS)} reviewed schools.")
    found = set()
    for item in catalog:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or item["id"] not in SCHOOLS:
            raise BuildError("The catalog contains an unrecognized school.")
        sid = item["id"]
        name, classification = SCHOOLS[sid]
        if sid in found:
            raise BuildError("The catalog contains duplicate stadium IDs.", [sid])
        if item.get("school") != DISPLAY_NAMES.get(sid, name) or item.get("classification") != f"NCAA Division I {classification.upper()}":
            raise BuildError("The catalog identity or football classification has changed.", [sid])
        expected_views = 3 if sid in INTERIOR_VIEW_STADIUMS else 2
        if not isinstance(item.get("views"), list) or len(item["views"]) != expected_views:
            count_label = "three" if expected_views == 3 else "two"
            raise BuildError(f"This reviewed stadium must have exactly {count_label} views.", [sid])
        found.add(sid)
    if found != SCHOOLS.keys():
        raise BuildError("The catalog is missing reviewed schools.", SCHOOLS.keys() - found)


def read_catalog(source: Path) -> tuple[str, list[dict]]:
    try:
        text = checked_file(source, "catalog.js").read_text(encoding="utf-8")
        if text.count(CATALOG_MARKER) != 1 or text.count(RECORD_MARKER) != 1:
            raise BuildError("The catalog needs exactly one empty records marker and one stadium array.")
        prefix, raw = text.split(CATALOG_MARKER)
        if RECORD_MARKER not in prefix or not raw.rstrip().endswith(";"):
            raise BuildError("The catalog layout is not supported; build stopped.")
        catalog = strict_json(raw.rstrip()[:-1])
        validate_catalog(catalog)
        return text, catalog
    except (UnicodeError, ValueError, TypeError, OSError):
        raise BuildError("The local catalog could not be read or parsed safely.") from None


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = set()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"src", "href", "poster"} and value and value.startswith("assets/"):
                self.assets.add(value)


def asset_reference(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"assets/[A-Za-z0-9_./-]+", value):
        raise BuildError("An image reference is not an allowed local asset path.")
    path = PurePosixPath(value)
    if any(p.startswith(".") for p in path.parts) or path.suffix.lower() not in ASSET_SUFFIXES:
        raise BuildError("An image reference is not an allowed local asset path.")
    return value


def required_site_files(source: Path, catalog: list[dict]) -> set[str]:
    """Exactly the five public app files and referenced images/icons, no globbing."""
    try:
        references = set()
        for item in catalog:
            for view in item["views"]:
                if not isinstance(view, dict):
                    raise BuildError("A catalog image reference is malformed.", [item["id"]])
                references.add(asset_reference(view.get("src")))
        parser = AssetReferences()
        parser.feed(checked_file(source, "index.html").read_text(encoding="utf-8"))
        references.update(asset_reference(value) for value in parser.assets)
        manifest = strict_json(checked_file(source, "site.webmanifest").read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or not isinstance(manifest.get("icons"), list):
            raise BuildError("The site manifest is malformed.")
        references.update(asset_reference(icon["src"]) for icon in manifest["icons"])
        css = checked_file(source, "styles.css").read_text(encoding="utf-8")
        for value in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)", css):
            if value.startswith("assets/"):
                references.add(asset_reference(value))
        files = set(ROOT_FILES) | references
        for relative in files:
            checked_file(source, relative)
        return files
    except (UnicodeError, ValueError, KeyError, TypeError, OSError):
        raise BuildError("Required site assets could not be validated.") from None


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never send an Authorization header to a redirected destination.
        raise BuildError("The provider returned a redirect; build stopped.")


def fetch_json(endpoint: str, key: str):
    if endpoint not in {"teams", "records"}:
        raise BuildError("Unsupported provider endpoint; build stopped.")
    request = urllib.request.Request(
        f"https://api.collegefootballdata.com/{endpoint}?year={SEASON}",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "User-Agent": "StadiumAtlasRecords/1"},
    )
    try:
        opener = urllib.request.build_opener(NoRedirects())
        with opener.open(request, timeout=30) as response:
            if response.status != 200:
                raise BuildError("The provider returned an unexpected HTTP status; build stopped.")
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise BuildError("The provider response exceeded the safe size limit.")
        # All provider data stays in this process's memory; never log raw/errors.
        return strict_json(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        status = exc.code if integer(exc.code, 100, 599) else "unknown"
        raise BuildError(f"The provider returned HTTP {status}; build stopped.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise BuildError("The provider could not be reached; build stopped.") from None
    except (ValueError, UnicodeError, TypeError):
        raise BuildError("The provider returned invalid JSON; build stopped.") from None


def resolve_teams(metadata) -> dict[str, dict]:
    if not isinstance(metadata, list) or not metadata or len(metadata) > 10000:
        raise BuildError("Team metadata is missing or malformed.")
    by_id = defaultdict(list)
    by_name = defaultdict(list)
    for row in metadata:
        if not isinstance(row, dict) or not integer(row.get("id"), 1) or not canonical(row.get("school")):
            raise BuildError("Team metadata contains a malformed identity.")
        by_id[row["id"]].append(row)
        by_name[canonical(row["school"])].append(row)
    resolved = {}
    failures = defaultdict(list)
    used_ids = {}
    for sid, (_, expected_class) in SCHOOLS.items():
        candidates = [row for name in accepted_names(sid) for row in by_name.get(name, [])]
        if not candidates:
            failures["Missing team metadata."].append(sid)
            continue
        if len(candidates) != 1 or len(by_id[candidates[0]["id"]]) != 1:
            failures["Ambiguous or duplicate team metadata."].append(sid)
            continue
        row = candidates[0]
        if row.get("classification") != expected_class:
            failures["Team metadata has the wrong football classification."].append(sid)
            continue
        if row["id"] in used_ids:
            failures["A provider team ID maps to multiple schools."].extend([sid, used_ids[row["id"]]])
            continue
        used_ids[row["id"]] = sid
        resolved[sid] = row
    if failures:
        raise BuildError(" ".join(sorted(failures)), [sid for ids in failures.values() for sid in ids])
    return resolved


def validate_counts(value, sid: str) -> dict:
    if not isinstance(value, dict) or any(not integer(value.get(field), 0, MAX_GAMES) for field in ("games", "wins", "losses", "ties")):
        raise BuildError("A record has missing or invalid nonnegative integer counts.", [sid])
    if value["games"] != value["wins"] + value["losses"] + value["ties"]:
        raise BuildError("A record's games do not equal wins plus losses plus ties.", [sid])
    return value


def record_label(counts: dict) -> str:
    values = [counts["wins"], counts["losses"]]
    if counts["ties"]:
        values.append(counts["ties"])
    return "-".join(map(str, values))


def make_snapshot(catalog: list[dict], metadata, records, now=None) -> dict:
    validate_catalog(catalog)
    resolved = resolve_teams(metadata)
    if not isinstance(records, list) or not records or len(records) > 10000:
        raise BuildError("Season records are missing or malformed.")
    by_id = defaultdict(list)
    for record in records:
        if not isinstance(record, dict) or not integer(record.get("teamId"), 1):
            raise BuildError("Season records contain a malformed team ID.")
        by_id[record["teamId"]].append(record)
    rows, failures = [], []
    for item in catalog:
        sid = item["id"]
        try:
            selected = by_id.get(resolved[sid]["id"], [])
            if len(selected) != 1:
                raise BuildError("Season records are missing or have duplicate team IDs.", [sid])
            record = selected[0]
            if type(record.get("year")) is not int or record["year"] != SEASON:
                raise BuildError("A record is missing the explicitly selected 2026 season.", [sid])
            if canonical(record.get("team")) not in accepted_names(sid):
                raise BuildError("A record's team name does not match its verified team ID.", [sid])
            if record.get("classification") != SCHOOLS[sid][1]:
                raise BuildError("A record has the wrong football classification.", [sid])
            total = validate_counts(record.get("total"), sid)
            conference_label = None
            if sid not in INDEPENDENT_STADIUMS:
                conference = validate_counts(record.get("conferenceGames"), sid)
                if any(conference[field] > total[field] for field in ("games", "wins", "losses", "ties")):
                    raise BuildError("Conference counts exceed the overall record.", [sid])
                conference_label = record_label(conference)
            # Notre Dame and UConn are football independents: conferenceGames
            # may legitimately be missing/null. Never display a provider 0-0.
            rows.append({"stadiumId": sid, "overall": record_label(total),
                         "conference": conference_label})
        except BuildError as exc:
            failures.append(exc)
    if failures:
        raise BuildError(" ".join(sorted({failure.reason for failure in failures})),
                         [sid for failure in failures for sid in failure.school_ids])
    if len(rows) != len(SCHOOLS) or {row["stadiumId"] for row in rows} != SCHOOLS.keys():
        raise BuildError(f"The complete {len(SCHOOLS)}-school snapshot could not be verified.")
    checked = now or datetime.now(timezone.utc)
    if not isinstance(checked, datetime) or checked.tzinfo is None:
        raise BuildError("A valid UTC check time is required.")
    return {"schemaVersion": 1, "season": SEASON,
            "checkedAt": checked.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "source": "CollegeFootballData", "rows": rows}


def hosted_artwork_plan(catalog_text: str) -> tuple[str, dict[str, tuple[str, tuple[int, int]]]]:
    prefix, raw = catalog_text.split(CATALOG_MARKER)
    catalog = strict_json(raw.rstrip()[:-1])
    plan = {}
    for item in catalog:
        for view in item["views"]:
            original = asset_reference(view["src"])
            if not original.endswith(".png") or any(not integer(view.get(key), 1, 20000) for key in ("width", "height")):
                raise BuildError("Stadium artwork must be original PNGs with valid native dimensions.", [item["id"]])
            size = (view["width"], view["height"])
            hosted = str(PurePosixPath(original).with_suffix(".webp"))
            if original in plan and plan[original] != (hosted, size):
                raise BuildError("Repeated artwork references disagree about native dimensions.", [item["id"]])
            plan[original] = (hosted, size)
            view["src"] = hosted
    hosted_text = prefix + CATALOG_MARKER + json.dumps(catalog, ensure_ascii=False, indent=2) + ";\n"
    return hosted_text, plan


def encode_lossless(source: Path, destination: Path, size: tuple[int, int]):
    try:
        from PIL import Image
        with Image.open(source) as original:
            if original.format != "PNG" or original.mode != "RGB" or original.info.get("icc_profile"):
                raise BuildError("Stadium artwork has an unsupported image mode or color profile.")
            if original.size != size:
                raise BuildError("Stadium artwork does not match its catalog's native dimensions.")
            pixels = original.tobytes()
            original.save(destination, "WEBP", lossless=True, quality=100, method=4, exact=True)
        with Image.open(destination) as decoded:
            if decoded.format != "WEBP" or decoded.mode != "RGB" or decoded.size != size or decoded.tobytes() != pixels:
                raise BuildError("Lossless artwork verification failed; build stopped.")
    except (ImportError, OSError, ValueError):
        raise BuildError("Stadium artwork could not be encoded and checked losslessly. Check the pinned Pillow installation.") from None


def build_artifact(source: Path, output: Path, catalog_text: str, snapshot: dict, files: set[str]):
    # Refuse to replace an existing path. Failure never changes source/user files
    # or an older artifact. The workflow always runs in a fresh hosted checkout.
    if output.exists() or output.is_symlink() or output.resolve() == source.resolve():
        raise BuildError("The output path must be new; existing files were preserved.")
    if not output.parent.is_dir():
        raise BuildError("The output parent directory does not exist.")
    hosted_catalog, artwork = hosted_artwork_plan(catalog_text)
    hosted_files = (files - artwork.keys()) | {value[0] for value in artwork.values()}
    if len(hosted_files) != len(files):
        raise BuildError("Hosted artwork paths collide with another required site file.")
    embedded = "window.STADIUM_ATLAS_RECORDS = " + json.dumps(snapshot, ensure_ascii=True, separators=(",", ":")) + ";"
    with tempfile.TemporaryDirectory(prefix=".stadium-records-stage-", dir=output.parent) as temporary:
        stage = Path(temporary) / "site"
        stage.mkdir()
        for relative in sorted(files - artwork.keys()):
            original = checked_file(source, relative)
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if relative == "catalog.js":
                destination.write_text(hosted_catalog.replace(RECORD_MARKER, embedded, 1), encoding="utf-8")
            elif relative == "index.html":
                html = original.read_text(encoding="utf-8")
                for before, (after, _) in artwork.items():
                    html = html.replace(before, after)
                destination.write_text(html, encoding="utf-8")
            else:
                # Logos/icons keep original bytes. Only stadium art is encoded.
                shutil.copyfile(original, destination)
        def encode(item):
            relative, (hosted, size) = item
            destination = stage / hosted
            destination.parent.mkdir(parents=True, exist_ok=True)
            encode_lossless(checked_file(source, relative), destination, size)
        with ThreadPoolExecutor(max_workers=4) as workers:
            list(workers.map(encode, artwork.items()))
        actual = {p.relative_to(stage).as_posix() for p in stage.rglob("*") if p.is_file()}
        if actual != hosted_files:
            raise BuildError("The sanitized site artifact did not match its allowlist.")
        stage.rename(output)


def report(message: str, success=False):
    status = "Build validated" if success else "Refresh stopped"
    text = f"{status}: {message}"
    print(text)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as summary:
                summary.write(f"## Stadium Atlas records\n\n{text}\n\n")
                summary.write("Only a complete, validated 2026 snapshot may be deployed. No raw API data is published.\n")
                if not success:
                    summary.write("No replacement artifact was published by this step. The last successful Pages deployment is unchanged.\n")
        except OSError:
            # Never print exception text or environment paths.
            print("The GitHub Step Summary could not be written.")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("_site"))
    parser.add_argument("--season", type=int, choices=[SEASON], default=SEASON)
    args = parser.parse_args(argv)
    try:
        catalog_text, catalog = read_catalog(args.source)
        files = required_site_files(args.source, catalog)
        if args.output.exists() or args.output.is_symlink():
            raise BuildError("The output path must be new; existing files were preserved.")
        key = os.environ.get("CFBD_API_KEY", "")
        if not key or key != key.strip() or any(char.isspace() for char in key):
            raise BuildError("The CFBD_API_KEY repository secret is missing or invalid.")
        metadata = fetch_json("teams", key)
        records = fetch_json("records", key)
        del key
        snapshot = make_snapshot(catalog, metadata, records)
        del metadata, records
        build_artifact(args.source, args.output, catalog_text, snapshot, files)
        fbs_count = sum(classification == "fbs" for _, classification in SCHOOLS.values())
        fcs_count = sum(classification == "fcs" for _, classification in SCHOOLS.values())
        report(f"All {len(SCHOOLS)} schools ({fbs_count} FBS and {fcs_count} FCS) passed identity, season, classification, and record checks. All hosted stadium artwork passed pixel-identical lossless checks. The artifact is ready for the separate Pages deployment job.", success=True)
        return 0
    except BuildError as exc:
        report(exc.public_message())
    except Exception:
        # Never emit a traceback, provider body, headers, request URL, or secret.
        report("An unexpected validation or build failure occurred; no replacement site was published.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
