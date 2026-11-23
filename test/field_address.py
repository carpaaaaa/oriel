#!/usr/bin/env python3
"""What a line typed in the field means (studio/03 §1.2, §1.7, §1.9, §1.10,
§1.8 sendable): Address.swift, Engine.swift, Keyword.swift, SiteSearch.swift,
EngineSuggest.sendable, with the Mac's own examples."""
import os, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-address")
b.launch()
t = b.T()


def a(text, **kw):
    return b.call({"do": "field.address", "text": text, **kw})


def same(got, want, what):
    t.ok(got == want, f"{what}: {got!r}" + ("" if got == want else f" (want {want!r})"))


# §1.2 addresses
same(a("github.com")["address"], "https://github.com/", "a host gets https")
same(a("localhost:3000")["address"], "http://localhost:3000/", "localhost gets http")
same(a("10.io")["address"], "https://10.io/", "10.io is a website, not 10/8")
same(a("10.0.0.5")["address"], "http://10.0.0.5/", "10.x private: http")
same(a("192.168.1.1:8080/admin")["address"], "http://192.168.1.1:8080/admin", "192.168.x private: http")
same(a("172.20.1.1")["address"], "http://172.20.1.1/", "172.16-31 private: http")
same(a("172.32.1.1")["address"], "https://172.32.1.1/", "172.32 is public: https")
same(a("8.8.8.8")["address"], "https://8.8.8.8/", "four public numbers: https")
same(a("0.0.0.0:8000")["address"], "http://0.0.0.0:8000/", "0.0.0.0 is an address")
same(a("0.0.0.0:8000")["resolved"], "http://localhost:8000/", "0.0.0.0 is opened as localhost")
same(a("[::1]:3000")["address"], "http://[::1]:3000/", "[::1]:port in http")
same(a("printer.local")["address"], "http://printer.local/", "*.local: http")
same(a("app.localhost")["address"], "http://app.localhost/", "*.localhost: http")
same(a("1.2.3")["address"], None, "1.2.3 is a version number")
same(a("x.c")["address"], None, "a one-letter ending isn't a domain")
same(a("foo.123")["address"], None, "digits at the end aren't a domain")
same(a("-a.com")["address"], None, "a label can't start with a dash")
same(a("user@host.com")["address"], None, "an email address is refused")
same(a("hello world")["address"], None, "words with a space aren't an address")
same(a("todo")["address"], None, "one word isn't an address")
same(a("ftp://x.com")["address"], None, "a scheme not Search's is refused")
same(a("mailto:x@y.com")["address"], None, "mailto: is somebody else's")
same(a("about:blank")["address"], "about:blank", "about: as it is")
same(a("oriel://settings")["address"], "oriel://settings", "oriel:// pages")
same(a("search://settings")["address"], None, "the old search:// is no longer ours")
same(a("münchen.de")["address"], "https://xn--mnchen-3ya.de/", "letters of any language")
same(a("HTTPS://Example.COM/A")["address"], "https://example.com/A", "a scheme typed is taken at its word")

# files, only on Return
fd, path = tempfile.mkstemp(suffix=".txt")
os.close(fd)
got = a(path)
t.ok(got["file"] and got["file"].startswith("file://") and got["file"].endswith(".txt"), "a file on the disk becomes file://")
same(a(path + ".nothere")["file"], None, "a path to nothing is not a file")
same(a(os.path.dirname(path))["file"], None, "a folder is not a file")
os.unlink(path)

# editable, identity
same(a("", url="https://example.com/")["editable"], "example.com", "editable: https home without scheme or slash")
same(a("", url="http://example.com/")["editable"], "http://example.com/", "editable: http to a public host stays written")
same(a("", url="http://localhost:3000/")["editable"], "localhost:3000", "editable: localhost loses its http")
same(a("", url="https://github.com/a/b?q=1")["editable"], "github.com/a/b?q=1", "editable: path and query")
same(a("", url="https://example.com/#top")["editable"], "example.com/#top", "editable: a fragment keeps the slash")
same(a("", url="https://User:Pw@Example.com/a#x")["identity"], "https://example.com/a", "identity: no name, password, fragment")

# §1.7 engines and their words
g = a("a b&c=d/é")["destination"]
same(g, "https://www.google.com/search?q=a%20b%26c%3Dd%2F%C3%A9", "Google, words encoded leaving only A-Z a-z 0-9 - . _ ~")
same(a("it's (x)*!")["destination"], "https://www.google.com/search?q=it%27s%20%28x%29%2A%21", "even ' ( ) * ! are encoded")
want = {
    "duckduckgo": "https://duckduckgo.com/?q=cats",
    "bing": "https://www.bing.com/search?q=cats",
    "ecosia": "https://www.ecosia.org/search?q=cats",
    "startpage": "https://www.startpage.com/sp/search?query=cats",
    "kagi": "https://kagi.com/search?q=cats",
    "brave": "https://search.brave.com/search?q=cats",
    "qwant": "https://www.qwant.com/?q=cats",
}
for engine, url in want.items():
    b.cmd("prefs.set", key="search.engine", value=engine)
    same(a("cats")["destination"], url, f"engine {engine}")
b.cmd("prefs.set", key="search.engine", value="custom")
b.cmd("prefs.set", key="search.custom", value="example.org/find?w={searchTerms}")
same(a("cats")["destination"], "https://example.org/find?w=cats", "custom: {searchTerms} and no scheme")
b.cmd("prefs.set", key="search.custom", value="https://%s.evil.com/")
same(a("cats")["destination"], "https://www.google.com/search?q=cats", "custom whose host changes falls back to Google")
b.cmd("prefs.set", key="search.engine", value="google")

# §1.10 site shortcuts
b.cmd("prefs.set", key="search.keywords", value=[
    {"keyword": "yt", "template": "https://www.youtube.com/results?search_query=%s"},
    {"keyword": "bad", "template": "https://%s.example.com/"},
    {"keyword": "two", "template": "https://example.com/?a=%s&b=%s"},
])
same(a("yt cats")["destination"], "https://www.youtube.com/results?search_query=cats", "yt cats goes to YouTube")
same(a("YT  cute cats ")["destination"], "https://www.youtube.com/results?search_query=cute%20cats", "the word in any case, the rest trimmed")
same(a("yt")["destination"], "https://www.google.com/search?q=yt", "the word alone is a search")
same(a("bad cats")["destination"], "https://www.google.com/search?q=bad%20cats", "%s in the host is never followed")
same(a("two cats")["destination"], "https://www.google.com/search?q=two%20cats", "%s twice is never followed")

# §1.9 searching a site: which one the words name
for typed, site in [("red", "Reddit"), ("yt", "YouTube"), ("you", "YouTube"), ("goo", "Google"), ("google m", "Google Maps"),
                    ("maps", "Google Maps"), ("wiki", "Wikipedia"), ("so", "Stack Overflow"), ("gpt", "ChatGPT"),
                    ("twitter", "X"), ("gh", "GitHub"), ("red panda", None), ("r", None), ("red/x", None)]:
    same(a(typed)["site"], site, f"site for {typed!r}")

# §1.8 what may be sent to the engine
for text, ok in [("cats", True), ("c++ tutorial", True), ("github.com", False), ("a@b.com hi", False), ("x:y", False),
                 ("/usr/bin", False), ("~/x", False), ("abc123def456gh", False), ("1234-5678-90", False),
                 ("a" * 81, False), ("c:\\temp", False)]:
    same(a(text)["sendable"], ok, f"sendable {text[:20]!r}")

t.done()
