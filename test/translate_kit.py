#!/usr/bin/env python3
"""What the translate tests share (not a test itself): a local site with an
Italian and a French page (links, bold, code, translate="no", attributes),
a tab on one of them, and the module's bench requests.

    import translate_kit as k
    k.world("translate-page", fake=True)
    tab = k.open_page("it")
    k.translate(tab, "en")
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
# The real models, fetched once from Mozilla for every run of the tests.
SHARED_MODELS = ROOT / "out" / "translate-models"

IT = """<!doctype html><html lang="it"><head><meta charset="utf-8"><title>La cucina toscana</title></head>
<body style="font: 16px sans-serif">
<h1 id="h">La cucina toscana</h1>
<p id="p1">Leggi il nostro <a id="a1" href="/ricette">articolo sulle ricette</a> della <b id="b1">nonna</b> e scopri i segreti della tradizione.</p>
<p id="p2">La biblioteca comunale apre alle nove del mattino, tutti i giorni tranne la domenica.</p>
<p id="p3">Usa il comando <code id="c1">ls -la</code> per vedere tutti i file della cartella.</p>
<p id="nt" translate="no">Questo testo resta in italiano.</p>
<p id="p5">Il treno per Firenze parte dalla stazione centrale ogni ora.</p>
<img id="img" alt="Una bella foto del mare d'estate" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<input id="in" placeholder="Cerca una ricetta">
<ul><li id="li1">Pane fresco e olio d'oliva</li><li id="li2">Formaggio e vino rosso</li></ul>
<div id="later"></div>
</body></html>"""

FR = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>La bibliothèque</title></head>
<body>
<h1 id="h">La bibliothèque de la ville</h1>
<p id="p1">La bibliothèque ouvre à neuf heures du matin, tous les jours sauf le dimanche.</p>
<p id="p2">Lisez notre <a id="a1" href="/livres">article sur les livres</a> et découvrez nos <b id="b1">nouveautés</b>.</p>
</body></html>"""

EN = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The library</title></head>
<body><p id="p1">The library opens at nine in the morning, every day except Sunday.</p></body></html>"""

# An Italian page quoting French and English (each block from its own language).
MIXED = """<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Citazioni</title></head><body>
<p id="it1">Il museo della città è aperto tutti i giorni dalle dieci alle sei di sera.</p>
<blockquote id="fr1">Le musée de la ville est ouvert tous les jours de dix heures à six heures du soir.</blockquote>
<blockquote id="en1">The city museum is open every day from ten in the morning until six in the evening.</blockquote>
<p id="it2">I biglietti si comprano alla cassa vicino all'ingresso principale del museo.</p>
</body></html>"""

# A page of a usual length: some forty paragraphs of a guide, about 12,000 characters.
_GUIDE = [
    "Firenze è il capoluogo della Toscana e una delle città più visitate d'Italia.",
    "Il centro storico è stato dichiarato patrimonio dell'umanità nel 1982.",
    "La cattedrale di Santa Maria del Fiore domina la città con la sua cupola rossa.",
    "La cupola fu progettata da Filippo Brunelleschi all'inizio del Quattrocento.",
    "Per salire in cima bisogna affrontare più di quattrocento gradini.",
    "Dalla terrazza si vede tutta la valle dell'Arno e le colline intorno.",
    "La Galleria degli Uffizi conserva una delle collezioni d'arte più importanti del mondo.",
    "Conviene prenotare la visita con qualche giorno di anticipo, soprattutto d'estate.",
    "Il Ponte Vecchio è famoso per le botteghe degli orafi che lo occupano da secoli.",
    "Durante la guerra fu l'unico ponte della città a non essere distrutto.",
    "Piazza della Signoria è il cuore politico di Firenze fin dal Medioevo.",
    "Davanti a Palazzo Vecchio si trova una copia del David di Michelangelo.",
    "L'originale è custodito nella Galleria dell'Accademia, non lontano dal Duomo.",
    "Il giardino di Boboli si estende alle spalle di Palazzo Pitti.",
    "Nei pomeriggi di primavera è il posto ideale per una passeggiata all'ombra.",
    "La cucina fiorentina è semplice e si basa su ingredienti di stagione.",
    "La bistecca alla fiorentina si cuoce alla brace e si serve al sangue.",
    "La ribollita è una zuppa di pane, cavolo nero e fagioli.",
    "Il mercato centrale di San Lorenzo è aperto tutte le mattine tranne la domenica.",
    "Al piano superiore ci sono banchi dove si può mangiare a qualsiasi ora.",
    "Molti musei sono chiusi il lunedì, quindi è meglio controllare gli orari.",
    "La prima domenica del mese l'ingresso nei musei statali è gratuito.",
    "La città si gira facilmente a piedi, perché le distanze sono brevi.",
    "Gli autobus elettrici collegano il centro con i quartieri più lontani.",
    "La tranvia porta dalla stazione di Santa Maria Novella all'aeroporto in venti minuti.",
    "In auto è difficile entrare nel centro, che è una zona a traffico limitato.",
    "I parcheggi più comodi si trovano vicino alla Fortezza da Basso.",
    "Le colline di Fiesole offrono una vista splendida sulla città al tramonto.",
    "Il teatro romano di Fiesole ospita concerti e spettacoli durante l'estate.",
    "In settembre la festa della Rificolona riempie le strade di lanterne colorate.",
    "Il calcio storico si gioca ogni anno in piazza Santa Croce a giugno.",
    "Le squadre rappresentano i quattro quartieri storici della città.",
    "La basilica di Santa Croce custodisce le tombe di molti italiani illustri.",
    "Tra loro ci sono Michelangelo, Galileo Galilei e Niccolò Machiavelli.",
    "L'Oltrarno è il quartiere degli artigiani, delle botteghe e dei piccoli ristoranti.",
    "Qui si possono vedere al lavoro restauratori, liutai e rilegatori di libri.",
    "Il clima è caldo d'estate e piuttosto freddo e umido d'inverno.",
    "La stagione migliore per visitare la città è la primavera o l'autunno.",
    "Molti viaggiatori scelgono Firenze come base per esplorare il Chianti.",
    "Le cantine della zona organizzano visite e degustazioni su prenotazione.",
]
MEDIUM = ("<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>Guida di Firenze</title></head><body style=\"font: 15px sans-serif\">"
          "<h1>Guida di Firenze</h1>"
          + "".join(f"<p>{a} {b} <a href=\"#s{i}\">{c}</a> <b>{d.split(' ')[0]}</b> {' '.join(d.split(' ')[1:])}</p>"
                    for i, (a, b, c, d) in enumerate(zip(_GUIDE, _GUIDE[1:] + _GUIDE[:1], _GUIDE[2:] + _GUIDE[:2], _GUIDE[3:] + _GUIDE[:3])))
          + "</body></html>")

PAGES = {"/it": IT, "/fr": FR, "/en": EN, "/mixed": MIXED, "/medium": MEDIUM}


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        body = PAGES.get(self.path.split("?")[0], "<title>404</title>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


_server = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=_server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{_server.server_address[1]}"

ENV = {}


def world(name, fake=False, shared_models=False, env=None, wipe=True, prefs=None):
    """A world of its own; fake: the stand-in translator (marks each piece)."""
    b.use(name, wipe=wipe)
    ENV.clear()
    if fake:
        ENV["SEARCH_TRANSLATE_FAKE"] = "1"
    if shared_models:
        SHARED_MODELS.mkdir(parents=True, exist_ok=True)
        ENV["SEARCH_TRANSLATE_MODELS"] = str(SHARED_MODELS)
    ENV.update(env or {})
    if prefs:
        f = b.folder() / "prefs.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(prefs))


def launch():
    b.launch(env=ENV)
    time.sleep(0.6)


def tabs_state():
    return b.call({"do": "tabs.state"})


def find_tab(id):
    for w in tabs_state()["windows"]:
        for row in w["rows"].values():
            for t in row["tabs"]:
                if t["id"] == id:
                    return t
    return None


def open_page(name):
    id = b.cmd("tab.open", url=f"{BASE}/{name}", foreground=True)
    b.wait_for(lambda: (t := find_tab(id)) and not t["loading"] and t["url"].endswith("/" + name), what=f"page {name}")
    b.wait_for(lambda: b.ev(id, "document.readyState") == "complete", what="page loaded")
    return id


def translate(tab, to="en"):
    return b.cmd("page.translate", id=tab, to=to)


def wait_done(tab, within=180):
    """The first full pass: the report, and the tab's mark."""
    r = b.call({"do": "translate.wait", "id": tab, "within": within}, timeout=within + 10)
    return r.get("report"), r.get("mark")


def report(tab):
    r = b.call({"do": "translate.report", "id": tab})
    return r.get("report"), r.get("mark")


def mark(tab):
    st = b.state()
    t = (st["windows"][0].get("translate") or {}).get("tabs") or {}
    return t.get(tab)


def text(tab, sel):
    return b.ev(tab, f"(document.querySelector({json.dumps(sel)}) || {{}}).textContent")


def attr(tab, sel, name):
    return b.ev(tab, f"document.querySelector({json.dumps(sel)}).getAttribute({json.dumps(name)})")


def body(tab):
    return b.ev(tab, "document.documentElement.outerHTML")
