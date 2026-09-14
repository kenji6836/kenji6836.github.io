#!/usr/bin/env python3
"""自作 BGM 合成（権利クリア・支出ゼロ）: ローファイ寄りのテック系ビート 26 秒・96 BPM・D メジャー系 4 コード進行。
出力 making-26s.wav（44.1kHz stereo）。ffmpeg loudnorm で -16 LUFS に揃える。"""
import numpy as np, subprocess, sys
SR=44100; DUR=26.0; BPM=96; BEAT=60/BPM; N=int(SR*DUR); t=np.arange(N)/SR
rng=np.random.default_rng(3)
def note(f): return f
def midi(m): return 440*2**((m-69)/12)
def env(n, a, d, s, r, dur):
    e=np.zeros(n); A=int(a*SR); D=int(d*SR); R=int(r*SR); H=max(0,int(dur*SR)-A-D)
    seg=[np.linspace(0,1,A,endpoint=False), np.linspace(1,s,D,endpoint=False), np.full(H,s), np.linspace(s,0,R,endpoint=False)]
    x=np.concatenate(seg)[:n]; e[:len(x)]=x; return e
def lowpass(x, cutoff):
    rc=1/(2*np.pi*cutoff); a=1/(1+rc*SR); y=np.zeros_like(x); acc=0.0
    for i in range(len(x)): acc+=a*(x[i]-acc); y[i]=acc
    return y
def lp_fast(x, cutoff):  # vectorized via scipy-less trick: use FFT lowpass
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X*=1/(1+(f/cutoff)**4); return np.fft.irfft(X,len(x))
mix=np.zeros(N)
# --- chords: Dmaj7 | Bm7 | Gmaj7 | A(add9) — 2 bars each? use 1 bar each, loop
chords=[[62,66,69,73],[59,62,66,69],[55,59,62,66],[57,61,64,71]]
bar=BEAT*4
pad=np.zeros(N)
for b in range(int(DUR/bar)+1):
    ch=chords[b%4]; st=int(b*bar*SR); ln=int(bar*SR*1.05); n=min(ln,N-st)
    if n<=0: break
    seg=np.zeros(n); tt=np.arange(n)/SR
    for m in ch:
        f=midi(m-12); seg+=0.22*np.sin(2*np.pi*f*tt)+0.10*np.sin(2*np.pi*f*2*tt+0.3)+0.05*np.sign(np.sin(2*np.pi*f*0.5*tt))*0.4
    seg*=env(n,0.25,0.4,0.7,0.6,bar); pad[st:st+n]+=seg
pad=lp_fast(pad,900); mix+=0.55*pad
# --- arpeggio pluck (8th notes)
pl=np.zeros(N); step=BEAT/2
i=0
while i*step<DUR:
    b=int(i*step//bar)%4; ch=chords[b]; pattern=[0,2,1,3,2,0,3,1]; m=ch[pattern[i%8]]+12
    if (i%16) in (7,15): i+=1; continue
    st=int(i*step*SR); n=min(int(0.5*SR),N-st); tt=np.arange(n)/SR; f=midi(m)
    x=(0.5*np.sin(2*np.pi*f*tt)+0.3*np.sin(2*np.pi*f*2*tt)+0.15*np.sin(2*np.pi*f*3*tt))*env(n,0.004,0.18,0.15,0.2,0.28)
    pl[st:st+n]+=x; i+=1
pl=lp_fast(pl,3200); mix+=0.32*pl
# --- bass (root, quarter notes with slight swing)
bs=np.zeros(N)
for b in range(int(DUR/bar)+1):
    root=chords[b%4][0]-24
    for q in [0,1.5,2,3.5]:
        st=int((b*bar+q*BEAT)*SR); n=min(int(0.42*SR),N-st)
        if n<=0: continue
        tt=np.arange(n)/SR; f=midi(root)
        x=(0.8*np.sin(2*np.pi*f*tt)+0.2*np.sin(2*np.pi*2*f*tt))*env(n,0.006,0.25,0.4,0.12,0.3); bs[st:st+n]+=x
mix+=0.5*bs
# --- drums
dr=np.zeros(N)
def kick(st):
    n=int(0.32*SR); tt=np.arange(n)/SR; f=110*np.exp(-tt*22)+42; x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*9); dr[st:st+n]+=0.9*x[:min(n,N-st)]
def hat(st,vol=0.25,dec=45):
    n=int(0.12*SR); x=rng.normal(0,1,n)*np.exp(-np.arange(n)/SR*dec); x=x-lp_fast(x,4000); dr[st:st+n]+=vol*x[:min(n,N-st)]
def snare(st):
    n=int(0.22*SR); tt=np.arange(n)/SR; x=(rng.normal(0,1,n)*np.exp(-tt*18))*0.7+np.sin(2*np.pi*185*tt)*np.exp(-tt*25)*0.5; dr[st:st+n]+=0.55*x[:min(n,N-st)]
beat_i=0
while beat_i*BEAT<DUR-0.4:
    st=int(beat_i*BEAT*SR)
    if beat_i>=2:  # intro 2 beats without drums
        if beat_i%4 in (0,2): kick(st)
        if beat_i%4 in (1,3): snare(st)
        hat(st,0.22); hat(st+int(BEAT/2*SR),0.14,60)
    beat_i+=1
mix+=0.9*dr
# --- ducking (sidechain-like) on pad+pluck by kick
duck=np.ones(N)
for k in range(2,int(DUR/BEAT)):
    if k%2==0:
        st=int(k*BEAT*SR); n=int(0.25*SR); duck[st:st+n]*=np.linspace(0.55,1,n)[:min(n,N-st)]
mix=0.9*dr+ (0.55*pad+0.32*pl)*duck + 0.5*bs
# --- vinyl-ish noise bed
noise=lp_fast(rng.normal(0,1,N),1800)*0.012; mix+=noise
# --- simple reverb (feedback delay)
d1=int(0.171*SR); d2=int(0.257*SR); rv=np.zeros(N)
x=mix.copy()
for d,g in ((d1,0.28),(d2,0.2)):
    y=np.zeros(N); y[d:]=x[:-d]*g; rv+=y
mix+=lp_fast(rv,2500)*0.6
# --- fades: in 0.3s, out 23.0→26.0
fade=np.ones(N); fi=int(0.3*SR); fade[:fi]=np.linspace(0,1,fi); fo=int(23.0*SR); fade[fo:]=np.linspace(1,0,N-fo)**1.5
mix*=fade
mix/=np.max(np.abs(mix))*1.05
st=np.stack([mix*0.98, np.roll(mix,int(0.0008*SR))*0.98],1)  # subtle stereo width
import wave
with wave.open('raw.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg','-y','-loglevel','error','-i','raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','44100','making-26s.wav'],check=True)
print('wrote making-26s.wav')
