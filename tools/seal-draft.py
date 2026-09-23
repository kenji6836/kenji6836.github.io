#!/usr/bin/env python3
"""下書きを「リンクを知っている人だけが読める」形にする。

公開リポジトリに置いても中身が読めないよう、本文と画像をひとつの HTML に
まとめて AES-GCM で暗号化し、鍵は URL の # の後ろ（サーバーに送られない）に
入れる。鍵を含むリンクを知っている人だけがページを読める。

使い方:
  python3 tools/seal-draft.py <元のディレクトリ> <出力先ディレクトリ>
出力: <出力先>/index.html（鍵を読む小さなページ）と payload.bin（暗号文）
      標準出力に「鍵つきの URL の # 以降」を出す。
"""
import base64, hashlib, mimetypes, os, re, secrets, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def inline(src_dir: str) -> str:
    html = open(os.path.join(src_dir, "index.html"), encoding="utf-8").read()

    def data_uri(path: str) -> str:
        full = os.path.join(src_dir, path)
        mime = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return "data:%s;base64,%s" % (mime, base64.b64encode(open(full, "rb").read()).decode())

    # <link rel="stylesheet" href="x.css"> を <style> に畳む
    def css(m):
        p = m.group(1)
        if p.startswith(("http", "//", "data:")):
            return m.group(0)
        return "<style>\n%s\n</style>" % open(os.path.join(src_dir, p), encoding="utf-8").read()
    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>', css, html)

    # ローカル画像を data: に畳む
    def img(m):
        p = m.group(2)
        if p.startswith(("http", "//", "data:", "#")):
            return m.group(0)
        return '%s="%s"' % (m.group(1), data_uri(p))
    html = re.sub(r'\b(src|poster)="([^"]+)"', img, html)
    html = re.sub(r'url\((["\']?)([^)"\']+)\1\)',
                  lambda m: 'url(%s)' % data_uri(m.group(2))
                  if not m.group(2).startswith(("http", "//", "data:")) else m.group(0), html)
    return html

SHELL = """<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>限定公開のページ</title>
<style>body{margin:0;font:15px/1.8 system-ui,"Hiragino Sans",Meiryo,sans-serif;background:#f7f7f5;color:#1b1b1a;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.m{max-width:26em;text-align:center}h1{font-size:17px;margin:0 0 10px}p{margin:0;color:#5b5b57;font-size:14px}</style>
</head><body>
<div class="m" id="m"><h1>読み込んでいます</h1><p>少々お待ちください。</p></div>
<script>
(async () => {
  const say = (t, s) => document.getElementById('m').innerHTML =
    '<h1>' + t + '</h1><p>' + s + '</p>';
  const raw = (location.hash || '').replace(/^#k=/, '');
  if (!raw) return say('鍵がありません',
    'このページは、お渡ししたリンク全体（# の後ろを含む）からだけ開けます。');
  try {
    const b64u = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', b64u(raw), 'AES-GCM', false, ['decrypt']);
    const buf = new Uint8Array(await (await fetch('payload.bin', {cache:'no-store'})).arrayBuffer());
    const html = new TextDecoder().decode(
      await crypto.subtle.decrypt({name:'AES-GCM', iv: buf.slice(0,12)}, key, buf.slice(12)));
    document.open(); document.write(html); document.close();
  } catch (e) {
    say('開けませんでした',
      'リンクが途中で切れているか、古いリンクの可能性があります。');
  }
})();
</script>
</body></html>
"""

def main():
    src, out = sys.argv[1], sys.argv[2]
    html = inline(src)
    key = secrets.token_bytes(32)
    iv = secrets.token_bytes(12)
    blob = iv + AESGCM(key).encrypt(iv, html.encode("utf-8"), None)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(SHELL)
    open(os.path.join(out, "payload.bin"), "wb").write(blob)
    k = base64.urlsafe_b64encode(key).decode()
    print("inlined_bytes=%d payload_bytes=%d" % (len(html.encode()), len(blob)))
    print("sha256=%s" % hashlib.sha256(blob).hexdigest()[:16])
    print("FRAGMENT=#k=%s" % k)

if __name__ == "__main__":
    main()
