#!/usr/bin/env python3
"""Builds output/reports/<date>-15-ideeen.xlsx from content/ideas/<date>-15-ideeen.json (openpyxl).

Usage: python3 packages/content-ideas/scripts/make_xlsx.py [json] [xlsx]
One row per idea on "Overzicht", one sheet per idea with its table (numbers as real numbers), chart data and
calculation references. Then re-reads the file to verify it opens and the sheet count matches.
"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

root = Path(__file__).resolve().parents[3]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "content/ideas/2026-10-30-15-ideeen.json"
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "output/reports/2026-10-30-15-ideeen.xlsx"
doc = json.loads(src.read_text(encoding="utf-8"))
ideas = doc["ideas"]

HEAD = PatternFill("solid", fgColor="0B2A3D")
HEAD_FONT = Font(bold=True, color="FFFFFF")
WRAP = Alignment(wrap_text=True, vertical="top")
FORMAT = {"D": "Template D (tabel)", "C": "Template C (grafiek)", "A": "Template A (uitleg)"}
NUMFMT = {"eur": '"€"#,##0;[Red]-"€"#,##0', "eur2": '"€"#,##0.00;[Red]-"€"#,##0.00', "pct0": "0%", "pct1": "0.0%", "pct2": "0.00%", "duration": "0", "text": "@"}


def header(ws, row, values):
    for c, v in enumerate(values, 1):
        cell = ws.cell(row=row, column=c, value=v)
        cell.fill, cell.font, cell.alignment = HEAD, HEAD_FONT, WRAP


def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


wb = Workbook()
ws = wb.active
ws.title = "Overzicht"
cols = ["#", "Slug", "Categorie", "Format", "Soort", "Titel", "Haak 1 (vraag)", "Haak 2 (stelling)", "Haak 3 (contrast)",
        "Op scherm: titel", "Op scherm: regel", "Op scherm: voetregel", "CTA", "Storyboard (10 s)", "Aannames", "Caption",
        "Hashtags", "Compliance en fact-check", "Bronnen of data nodig", "DATA NODIG van eigenaar (bron + peildatum + periode)",
        "Achtergrond (clip: locatie)", "Duurzaamheid (1-5)", "Duurzaamheid: toelichting", "Duurzaamheid: varianten", "Overlap bestaande reeksen"]
header(ws, 1, cols)
for i in ideas:
    needed = ""
    if i["dataNeeded"]:
        needed = "\n".join(i["dataNeeded"]["items"]) + "\nEscalatie: " + i["dataNeeded"]["complianceEscalation"] + "\nImport: " + i["dataNeeded"]["importCommand"]
    ws.append([
        i["id"], i["slug"], i["category"], FORMAT[i["format"]],
        "Berekend (finance-engine)" if i["dataOrigin"] == "calculated" else "SJABLOON (data nodig)",
        i["title"], i["hooks"][0]["text"], i["hooks"][1]["text"], i["hooks"][2]["text"],
        i["onScreen"]["title"], i["onScreen"]["subtitle"], i["onScreen"]["footer"], i["cta"],
        "\n".join(f'{s["second"]}s: {s["visual"]} | {s["onScreen"]}' for s in i["storyboard"]),
        "\n".join(i["assumptions"]), i["caption"], " ".join(i["hashtags"]),
        "\n".join(i["compliance"]), "\n".join(i["sourcesNeeded"]), needed,
        f'{i["background"]["clipId"]}: {i["background"]["location"]}',
        i["sustainability"]["score"], i["sustainability"]["rationale"], i["sustainability"]["variants"], i["sustainability"]["overlapWithExistingSeries"],
    ])
for row in ws.iter_rows(min_row=2):
    for c in row:
        c.alignment = WRAP
widths(ws, [4, 26, 16, 18, 20, 36, 34, 34, 34, 34, 34, 28, 28, 70, 60, 70, 30, 60, 50, 50, 28, 10, 40, 40, 40])
ws.freeze_panes = "G2"

wa = wb.create_sheet("Aannames")
header(wa, 1, ["Onderwerp", "Tekst"])
wa.append(["Status", doc["note"]])
wa.append(["Aanname categorieën", doc["categoryInspirationAssumption"]])
for a in doc["globalAssumptions"]:
    wa.append(["Gemeenschappelijke aanname", a])
for row in wa.iter_rows(min_row=2):
    for c in row:
        c.alignment = WRAP
widths(wa, [30, 130])

for i in ideas:
    name = f'{i["id"]:02d} {i["slug"]}'[:31]
    s = wb.create_sheet(name)
    s["A1"] = i["title"]
    s["A1"].font = Font(bold=True, size=13)
    s["A2"] = f'{i["category"]} | {FORMAT[i["format"]]} | {"berekend" if i["dataOrigin"] == "calculated" else "SJABLOON: DATA NODIG van eigenaar"}'
    s["A3"] = i["onScreen"]["subtitle"]
    cols_ = i["table"]["columns"]
    header(s, 5, [c["label"] + (" (maanden)" if c["unit"] == "duration" else "") for c in cols_] + ["Weergave in beeld (laatste kolom: calculationRef)"])
    r0 = 6
    for n, r in enumerate(i["table"]["rows"]):
        for ci, c in enumerate(cols_, 1):
            if c["kind"] == "value" and c["unit"] != "text" and c["key"] in r["values"]:
                cell = s.cell(row=r0 + n, column=ci, value=r["values"][c["key"]])
                cell.number_format = NUMFMT[c["unit"]]
            else:
                s.cell(row=r0 + n, column=ci, value=r["cells"][c["key"]])
            if r["highlight"]:
                s.cell(row=r0 + n, column=ci).fill = PatternFill("solid", fgColor="E6F4B8")
        shown = " | ".join(r["cells"][c["key"]] for c in cols_)
        s.cell(row=r0 + n, column=len(cols_) + 1, value=shown)
    row = r0 + len(i["table"]["rows"]) + 1
    s.cell(row=row, column=1, value="Inputs").font = Font(bold=True)
    for k, v in i["inputs"].items():
        row += 1
        s.cell(row=row, column=1, value=k)
        s.cell(row=row, column=2, value=v)
    if i.get("chart"):
        row += 2
        s.cell(row=row, column=1, value=f'Grafiekdata: {i["chart"]["title"]} ({i["chart"]["calculation"]})').font = Font(bold=True)
        row += 1
        header(s, row, [i["chart"]["xLabel"]] + [x["label"] for x in i["chart"]["series"]])
        for p_i, p in enumerate(i["chart"]["series"][0]["points"]):
            row += 1
            s.cell(row=row, column=1, value=p["x"])
            for si, ser in enumerate(i["chart"]["series"], 2):
                cell = s.cell(row=row, column=si, value=ser["points"][p_i]["y"])
                cell.number_format = NUMFMT["eur"]
    row += 2
    s.cell(row=row, column=1, value="Rekenreferenties (claims)").font = Font(bold=True)
    row += 1
    header(s, row, ["Sleutel", "Tekst", "Waarde", "Eenheid", "calculationRef"])
    for cl in i["claims"]:
        row += 1
        s.cell(row=row, column=1, value=cl["key"])
        s.cell(row=row, column=2, value=cl["text"])
        c = s.cell(row=row, column=3, value=cl["value"])
        c.number_format = NUMFMT[cl["unit"]]
        s.cell(row=row, column=4, value=cl["unit"])
        s.cell(row=row, column=5, value=cl["calculationRef"])
    if not i["claims"]:
        row += 1
        s.cell(row=row, column=1, value="Geen: sjabloon zonder cijfers. Eerst data van de eigenaar nodig.")
    widths(s, [34, 26, 22, 22, 60, 60])

dst.parent.mkdir(parents=True, exist_ok=True)
wb.save(dst)

# verify: re-open and check
check = load_workbook(dst, data_only=True)
assert len(check.sheetnames) == 2 + len(ideas), check.sheetnames
ov = check["Overzicht"]
assert ov.max_row == 1 + len(ideas), ov.max_row
assert [ov.cell(row=r, column=1).value for r in range(2, ov.max_row + 1)] == [i["id"] for i in ideas]
for i in ideas:
    sh = check[f'{i["id"]:02d} {i["slug"]}'[:31]]
    first = i["table"]["rows"][0]
    for ci, c in enumerate(i["table"]["columns"], 1):
        if c["kind"] == "value" and c["unit"] != "text" and c["key"] in first["values"]:
            assert abs(sh.cell(row=6, column=ci).value - first["values"][c["key"]]) < 1e-9
print(f"OK {dst} sheets={len(check.sheetnames)} rows={ov.max_row - 1}")
