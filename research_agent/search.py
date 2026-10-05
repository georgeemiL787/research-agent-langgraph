import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit
import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS

def canonical(url):
    p=urlsplit(url)
    return urlunsplit((p.scheme.lower(),p.netloc.lower(),p.path or "/",p.query,""))

def public_url(url):
    p=urlsplit(url)
    if p.scheme not in ("http","https") or not p.hostname or p.username or p.password:
        raise ValueError("Not a public HTTP URL")
    if p.port not in (None,80,443): raise ValueError("Nonstandard port refused")
    addresses=socket.getaddrinfo(p.hostname,p.port or 443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Private or special network address refused")
    return url

class WebSearch:
    def search(self, query, limit):
        return [{"title":r.get("title",""),"url":r["href"],"snippet":r.get("body","")}
                for r in DDGS(timeout=15).text(query,max_results=limit)]
    def fetch(self, url):
        # Validate each redirect; no cookies or credentials are sent.
        with httpx.Client(timeout=15,follow_redirects=False,trust_env=False,
                          headers={"User-Agent":"LocalResearchAgent/1.0"}) as client:
            for _ in range(5):
                public_url(url)
                with client.stream("GET",url) as r:
                    if r.is_redirect:
                        url=str(r.url.join(r.headers["location"])); continue
                    r.raise_for_status()
                    if "text/html" not in r.headers.get("content-type",""): return "", "Unsupported content type"
                    data=bytearray()
                    for chunk in r.iter_bytes():
                        data.extend(chunk)
                        if len(data)>1_000_000: raise ValueError("Page too large")
                soup=BeautifulSoup(bytes(data),"html.parser")
                for node in soup(["script","style","nav","footer","header"]): node.decompose()
                main=soup.find("main") or soup.find("article") or soup
                return " ".join(main.stripped_strings)[:4500], ""
        raise ValueError("Too many redirects")
