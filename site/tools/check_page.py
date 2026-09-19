#!/usr/bin/env python3
"""独立ページ（/lp/ /cases/ など check_site 対象外）の自前検査。
usage: python3 site/tools/check_page.py <html>... [--root DIR]
検査: タグ対応・h1=1・id 重複・img alt/width/height・lang=ja・title/description・
      外部 script/css（Google Fonts 以外）禁止・_blank は noopener・内部リンク/画像の実在・
      禁止語・ページサイズ・svg に title か aria-label。"""
import re, sys, os
from html.parser import HTMLParser
from urllib.parse import urlsplit

def norm_url(u):
    """ブラウザ相当の正規化: 制御文字/空白を除去し、バックスラッシュをスラッシュに"""
    return re.sub(r"[\x00-\x20\x7f]", "", u).replace("\\", "/")

def is_external(u):
    u = norm_url(u)
    return "://" in u or u.startswith("//")

def allowed_external(kind, u):
    """外部リソースは Google Fonts の CSS（https・ホスト完全一致）だけ許可。script は一切不可"""
    if kind != "css": return False
    u = norm_url(u)
    sp = urlsplit("https:" + u if u.startswith("//") else u)
    return sp.scheme == "https" and sp.hostname == "fonts.googleapis.com"

VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
BANNED = ["副業","会社員","想定案件","モック","準備中","Lorem","TODO","{{"]
MAX_BYTES = 160_000

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.stack=[]; s.errs=[]; s.ids={}; s.h1=0; s.imgs=[]; s.links=[]; s.ext=[]; s.lang=None
        s.title=False; s.desc=False; s.svgs=[]; s.in_title=False; s.text_bits=[]
    def handle_starttag(s,tag,attrs):
        ln=s.getpos()[0]
        names=[k for k,_ in attrs]
        if len(names)!=len(set(names)): s.errs.append(f"L{ln}: duplicate attribute on <{tag}> ({sorted(set(k for k in names if names.count(k)>1))})")
        a={}
        for k,v in attrs: a.setdefault(k,v)  # ブラウザ同様に最初の値を採用
        if tag=="base": s.errs.append(f"L{ln}: <base> is not allowed (relative URLs would resolve to another origin)")
        if tag=="html": s.lang=a.get("lang")
        if tag=="title": s.title=True; s.in_title=True
        if tag=="meta" and a.get("name")=="description" and a.get("content"): s.desc=True
        if tag=="h1": s.h1+=1
        if "id" in a: s.ids.setdefault(a["id"],[]).append(ln)
        if tag=="img":
            s.imgs.append((ln,a))
        if tag=="a" and a.get("href"): s.links.append((ln,a))
        if tag=="script" and a.get("src"): s.ext.append((ln,"script",a["src"]))
        if tag=="link":
            rel=set((a.get("rel") or "").lower().split())
            if "stylesheet" in rel: s.ext.append((ln,"css",a.get("href","")))
            if rel & {"preload","prefetch","modulepreload"}:
                s.ext.append((ln,"css" if (a.get("as") or "").lower()=="style" else "script",a.get("href","")))
        if tag=="svg": s.svgs.append((ln,a,len(s.stack)))
        if tag=="source" and a.get("src"): s.imgs.append((ln,a))
        if tag not in VOID: s.stack.append((tag,ln))
    def handle_startendtag(s,tag,attrs):
        if tag in VOID or tag in ("path","rect","circle","use","line","polyline","polygon","ellipse","stop"): s.handle_starttag(tag,attrs) if tag in VOID else None
        else: s.handle_starttag(tag,attrs); s.handle_endtag(tag)
    def handle_endtag(s,tag):
        if tag=="title": s.in_title=False
        if tag in VOID: return
        if not s.stack: s.errs.append(f"L{s.getpos()[0]}: stray </{tag}>"); return
        t,ln=s.stack[-1]
        if t==tag: s.stack.pop(); return
        # try to find in stack (misnesting)
        names=[x[0] for x in s.stack]
        if tag in names:
            idx=len(names)-1-names[::-1].index(tag)
            for x in s.stack[idx+1:]: s.errs.append(f"L{x[1]}: <{x[0]}> not closed before </{tag}> (L{s.getpos()[0]})")
            del s.stack[idx:]
        else: s.errs.append(f"L{s.getpos()[0]}: unexpected </{tag}> (open: {t} L{ln})")
    def handle_data(s,d): s.text_bits.append(d)

def check(path, root):
    raw=open(path,encoding="utf-8").read(); errs=[]; warns=[]
    p=P(); p.feed(raw); p.close()
    errs+=p.errs
    for t,ln in p.stack: errs.append(f"L{ln}: <{t}> never closed")
    if p.lang!="ja": errs.append("html lang != ja")
    if not p.title: errs.append("no <title>")
    if not p.desc: errs.append("no meta description")
    if p.h1!=1: errs.append(f"h1 count = {p.h1}")
    for i,l in p.ids.items():
        if len(l)>1: errs.append(f"duplicate id '{i}' at L{l}")
    for ln,a in p.imgs:
        src=a.get("src","")
        if a.get("alt") is None and "src" in a and not src.endswith((".mp4",".webm")): errs.append(f"L{ln}: img without alt ({src})")
        if is_external(src): errs.append(f"L{ln}: external image {src}")
        elif src.startswith("/"):
            fp=os.path.join(root,src.split("?")[0].lstrip("/"))
            if not os.path.exists(fp): errs.append(f"L{ln}: missing file {src}")
            if "?v=" not in src: warns.append(f"L{ln}: image without ?v= cache-bust {src}")
        if "width" not in a or "height" not in a:
            if not src.endswith((".mp4",".webm")): warns.append(f"L{ln}: img without width/height {src}")
    for ln,kind,u in p.ext:
        if is_external(u) and not allowed_external(kind, u): errs.append(f"L{ln}: external {kind} {u}")
    for ln,a in p.links:
        h=a["href"]
        hn=norm_url(h).lower()  # ブラウザの URL 解釈に寄せて制御文字/空白を除去し小文字化
        if hn.startswith(("mailto:","tel:","javascript:","data:","vbscript:")): errs.append(f"L{ln}: forbidden link scheme {h}")
        if (a.get("target") or "").lower()=="_blank" and "noopener" not in (a.get("rel") or "").lower().split(): errs.append(f"L{ln}: _blank without noopener {h}")
        if h.startswith("/"):
            base=h.split("#")[0].split("?")[0]
            fp=os.path.join(root,base.lstrip("/"))
            if base.endswith("/"): fp=os.path.join(fp,"index.html")
            if not os.path.exists(fp): warns.append(f"L{ln}: internal link target not found {h}")
        elif h.startswith("#") and h!="#":
            if h[1:] not in p.ids: errs.append(f"L{ln}: anchor #{h[1:]} not found")
    for ln,a,_ in p.svgs:
        if a.get("aria-hidden")=="true" or a.get("focusable")=="false": continue
        if not (a.get("aria-label") or a.get("aria-labelledby") or a.get("role")=="presentation"):
            warns.append(f"L{ln}: svg without aria-label/labelledby")
    text=re.sub(r"<(style|script)[^>]*>.*?</\1>","",raw,flags=re.S)
    for w in BANNED:
        for m in re.finditer(re.escape(w),text):
            errs.append(f"banned word '{w}' at offset {m.start()}: …{text[max(0,m.start()-20):m.start()+20]!r}")
    if len(raw.encode())>MAX_BYTES: errs.append(f"page {len(raw.encode())} bytes > {MAX_BYTES}")
    return errs,warns

if __name__=="__main__":
    args=sys.argv[1:]; root=os.getcwd()
    if "--root" in args: i=args.index("--root"); root=args[i+1]; del args[i:i+2]
    bad=0
    for f in args:
        e,w=check(f,root)
        print(f"== {f}: {len(e)} errors, {len(w)} warnings")
        for x in e: print("  ERR", x)
        for x in w: print("  warn", x)
        bad+=len(e)
    sys.exit(1 if bad else 0)
