#!/usr/bin/env python3
"""レーン V 納品物の配置（冪等）: site/src/v/*/out → assets/works/v-* ・ site/lanes/v/kit/* ・ 独立ページ（design/channel-brand/ design/mitsumori/ ads/mitsumori/）
実行: ~/Workspace/app-factory/tools/imagegen/.venv/bin/python site/src/v/assemble.py（cv2 が要る）"""
import shutil, os, re, cv2
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..','..')); V=os.path.join(R,'site/src/v')
missing=[]
def P(*a): return os.path.join(*a)
def cp(src,dst):
    s=P(V,src); d=P(R,dst)
    if not os.path.exists(s): missing.append(src); return
    os.makedirs(os.path.dirname(d),exist_ok=True); shutil.copy2(s,d)
def jpg(src,dst,width=None,q=86):
    s=P(V,src); d=P(R,dst)
    if not os.path.exists(s): missing.append(src); return
    im=cv2.imread(s,cv2.IMREAD_COLOR)
    if width and im.shape[1]>width: im=cv2.resize(im,(width,int(im.shape[0]*width/im.shape[1])),interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(d),exist_ok=True); cv2.imwrite(d,im,[cv2.IMWRITE_JPEG_QUALITY,q])
def png(src,dst,width=None):
    s=P(V,src); d=P(R,dst)
    if not os.path.exists(s): missing.append(src); return
    im=cv2.imread(s,cv2.IMREAD_UNCHANGED)
    if width and im.shape[1]>width: im=cv2.resize(im,(width,int(im.shape[0]*width/im.shape[1])),interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(d),exist_ok=True); cv2.imwrite(d,im)
# ---- shorts → assets/works + kit
# 動画: 原本 mp4（SNS 投稿用マスター）は site/lanes/v/kit/shorts/ に置く。assets/works には check_site の 3MB 制限に合わせて再エンコード（本体が ffmpeg で実施済み: mp4 crf25 / webm crf38・再実行時は上書きしない）
for nn,slug in (('01','portfolio'),('02','reachlab'),('03','autopilot')):
    cp(f'shorts/{nn}/out/v-short-{nn}-{slug}-poster.jpg',f'assets/works/v-short-{nn}-{slug}-poster.jpg')
    for i in range(1,7): cp(f'shorts/{nn}/out/sb-{i}.jpg',f'assets/works/v-short-{nn}-sb-{i}.jpg')
# ---- brand → kit（原本 PNG）+ assets/works（表示用）
for f in ('icon-mark-1024.png','icon-photo-1024.png','icon-mark-400.png','icon-photo-400.png','x-header-1500x500.png','yt-banner-2560x1440.png','post-square-1080.png','post-vertical-1080x1920.png','post-x-1600x900.png','intro.mp4','intro.webm','outro.mp4','outro.webm','intro-poster.jpg','outro-poster.jpg'):
    cp(f'brand/out/{f}',f'site/lanes/v/kit/brand/{f}')
cp('brand/logo.svg','site/lanes/v/kit/brand/logo.svg'); cp('brand/brand.css','site/lanes/v/kit/brand/brand.css')
png('brand/out/icon-photo-1024.png','assets/works/v-brand-icon.png',512)
jpg('brand/out/x-header-1500x500.png','assets/works/v-brand-x-header.jpg',1500)
jpg('brand/out/yt-banner-2560x1440.png','assets/works/v-brand-yt-banner.jpg',1600)
jpg('brand/out/post-square-1080.png','assets/works/v-brand-post-1.jpg',1080)
jpg('brand/out/post-vertical-1080x1920.png','assets/works/v-brand-post-2.jpg',1080)
jpg('brand/out/post-x-1600x900.png','assets/works/v-brand-post-3.jpg',1600)
for f in ('intro.mp4','intro.webm','intro-poster.jpg','outro.mp4','outro.webm','outro-poster.jpg'): cp(f'brand/out/{f}',f'assets/works/v-brand-{f}')
# ---- ads → kit + assets/works（adset 5 スロット）
for f in ('ad-a-square-1080.jpg','ad-b-square-1080.jpg','ad-a-story-1080x1920.jpg','ad-a-landscape-1200x628.jpg','ad-a-rect-300x250.jpg','ad-a-rect-300x250@2x.jpg','ad-a-leaderboard-728x90.jpg','ad-a-leaderboard-728x90@2x.jpg','ad-a-x-1600x900.jpg'):
    cp(f'ads/out/{f}',f'site/lanes/v/kit/ads/{f}')
for src,dst in (('ad-a-square-1080.jpg','v-ad-square-a.jpg'),('ad-b-square-1080.jpg','v-ad-square-b.jpg'),('ad-a-story-1080x1920.jpg','v-ad-story.jpg'),('ad-a-landscape-1200x628.jpg','v-ad-landscape.jpg'),('ad-a-rect-300x250@2x.jpg','v-ad-rect.jpg'),('ad-a-leaderboard-728x90@2x.jpg','v-ad-leaderboard.jpg'),('ad-a-x-1600x900.jpg','v-ad-x.jpg')):
    cp(f'ads/out/{src}',f'assets/works/{dst}')
# ---- design system → assets/works（表示用スクショ）
def crop_top(src,dst,width=1600,height=1000):
    s=P(V,src); d=P(R,dst)
    if not os.path.exists(s): missing.append(src); return
    im=cv2.imread(s); im=cv2.resize(im,(width,int(im.shape[0]*width/im.shape[1])),interpolation=cv2.INTER_AREA)[:height]
    cv2.imwrite(d,im,[cv2.IMWRITE_JPEG_QUALITY,86])
crop_top('design/out/system-1280.png','assets/works/v-ds-1.jpg'); crop_top('design/out/system-dark.png','assets/works/v-ds-2.jpg')
# ---- 独立ページ
def page(src_html,dst_dir,assets,rewrite=()):
    s=P(V,src_html)
    if not os.path.exists(s): missing.append(src_html); return
    html=open(s,encoding='utf-8').read()
    for a,b in rewrite: html=html.replace(a,b)
    os.makedirs(P(R,dst_dir),exist_ok=True); open(P(R,dst_dir,'index.html'),'w',encoding='utf-8').write(html)
    for a in assets: cp(a[0],P(dst_dir,a[1]))
jpg('brand/out/yt-banner-2560x1440.png','design/channel-brand/out/yt-banner-2560x1440.jpg',2560)
page('brand/guide.html','design/channel-brand',[(f'brand/out/{f}',f'out/{f}') for f in ('icon-mark-400.png','icon-photo-400.png','x-header-1500x500.png','post-square-1080.png','post-vertical-1080x1920.png','post-x-1600x900.png')]+[('brand/brand.css','brand.css'),('brand/logo.svg','logo.svg')],
     rewrite=[('./out/yt-banner-2560x1440.png','./out/yt-banner-2560x1440.jpg')])
page('ads/compare.html','ads/mitsumori',[(f'ads/out/{f}',f'out/{f}') for f in ('ad-a-square-1080.jpg','ad-b-square-1080.jpg','ad-a-story-1080x1920.jpg','ad-a-landscape-1200x628.jpg','ad-a-x-1600x900.jpg','ad-a-rect-300x250@2x.jpg','ad-a-leaderboard-728x90@2x.jpg')])
page('design/system.html','design/mitsumori',[])
print('MISSING:',missing) if missing else print('assemble OK')
