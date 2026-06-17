#!/usr/bin/env python3
"""Shared mockup component library (SVG -> PNG) for the Fixed Asset suite."""
import math, cairosvg

FONT = "Liberation Sans, DejaVu Sans, Arial, sans-serif"
MONO = "DejaVu Sans Mono, monospace"

BG="#F1F5F9"; CARD="#FFFFFF"; BORDER="#E2E8F0"; INK="#0F172A"; TXT="#334155"
MUTED="#64748B"; FAINT="#94A3B8"
INDIGO="#4F46E5"; INDIGO_D="#4338CA"; INDIGO_T="#EEF2FF"; INDIGO_L="#818CF8"
GREEN="#16A34A"; GREEN_T="#DCFCE7"; GREEN_TX="#166534"
AMBER="#D97706"; AMBER_T="#FEF3C7"; AMBER_TX="#92400E"
RED="#DC2626"; RED_T="#FEE2E2"; RED_TX="#991B1B"
SKY="#0284C7"; SKY_T="#E0F2FE"; SKY_TX="#075985"
VIOLET="#7C3AED"; VIOLET_T="#F5F3FF"
TEAL="#0D9488"; TEAL_T="#F0FDFA"
SLATE_T="#F1F5F9"; SLATE_TX="#475569"
SIDEBAR="#0F172A"; SIDEBAR2="#1E293B"

def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

class C:
    def __init__(s,w,h,bg=BG):
        s.e=[]; s.w=w; s.h=h
        s.e.append(f'<rect width="{w}" height="{h}" fill="{bg}"/>')
    def rect(s,x,y,w,h,r=0,fill=CARD,stroke=None,sw=1,op=1):
        st=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        o=f' opacity="{op}"' if op!=1 else ''
        s.e.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" ry="{r}" fill="{fill}"{st}{o}/>')
    def shadow(s,x,y,w,h,r=14):
        for dy,op in ((6,0.05),(3,0.05),(1,0.04)):
            s.e.append(f'<rect x="{x}" y="{y+dy}" width="{w}" height="{h}" rx="{r}" ry="{r}" fill="#0F172A" opacity="{op}"/>')
    def card(s,x,y,w,h,r=14):
        s.shadow(x,y,w,h,r); s.rect(x,y,w,h,r,CARD,BORDER,1)
    def text(s,x,y,t,size=14,fill=TXT,weight=400,anchor="start",family=FONT,ls=None,op=1):
        a=f' text-anchor="{anchor}"' if anchor!="start" else ''
        l=f' letter-spacing="{ls}"' if ls else ''
        o=f' opacity="{op}"' if op!=1 else ''
        s.e.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{fill}"{a}{l}{o}>{esc(t)}</text>')
    def line(s,x1,y1,x2,y2,stroke=BORDER,sw=1,op=1,dash=None):
        d=f' stroke-dasharray="{dash}"' if dash else ''
        s.e.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"{d}/>')
    def circle(s,cx,cy,r,fill,stroke=None,sw=1,op=1):
        st=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        s.e.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{st} opacity="{op}"/>')
    def path(s,d,fill="none",stroke=None,sw=2,op=1,cap="round",join="round"):
        st=f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}" stroke-linejoin="{join}"' if stroke else ''
        s.e.append(f'<path d="{d}" fill="{fill}"{st} opacity="{op}"/>')
    def pill(s,x,y,t,bg,fg,size=11,pad=10,h=20,weight=600):
        w=len(str(t))*size*0.56+pad*2
        s.rect(x,y,w,h,h/2,bg); s.text(x+w/2,y+h/2+size*0.35,t,size,fg,weight,"middle")
        return w
    def svg(s):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s.w}" height="{s.h}" '
                f'viewBox="0 0 {s.w} {s.h}">'+''.join(s.e)+'</svg>')
    def png(s,p):
        cairosvg.svg2png(bytestring=s.svg().encode(),write_to=p,output_width=s.w,output_height=s.h)

def icon(c,name,x,y,col,sz=18,sw=1.8):
    u=sz/18.0
    def P(d): c.path(d,stroke=col,sw=sw)
    if name=="grid":
        for dx,dy in ((0,0),(10,0),(0,10),(10,10)): c.rect(x+dx*u,y+dy*u,7*u,7*u,1.5*u,"none",col,sw)
    elif name=="register":
        c.rect(x+2*u,y+1*u,14*u,16*u,2*u,"none",col,sw)
        for i in range(3): c.line(x+5*u,y+(5+i*4)*u,x+13*u,y+(5+i*4)*u,col,sw)
    elif name=="calendar":
        c.rect(x+2*u,y+3*u,14*u,13*u,2*u,"none",col,sw); c.line(x+2*u,y+7*u,x+16*u,y+7*u,col,sw)
        c.line(x+6*u,y+1*u,x+6*u,y+5*u,col,sw); c.line(x+12*u,y+1*u,x+12*u,y+5*u,col,sw)
    elif name=="chart":
        c.line(x+3*u,y+2*u,x+3*u,y+16*u,col,sw); c.line(x+3*u,y+16*u,x+16*u,y+16*u,col,sw)
        for dx,hh in ((6,6),(9,9),(12,4),(14.5,11)): c.rect(x+dx*u,y+(16-hh)*u,1.6*u,hh*u,0.5*u,col)
    elif name=="survey":
        c.rect(x+3*u,y+2*u,12*u,14*u,2*u,"none",col,sw); P(f"M{x+6*u},{y+8*u} l{2*u},{2*u} l{4*u},{-4.5*u}")
    elif name=="catalog":
        c.rect(x+2*u,y+2*u,14*u,14*u,2*u,"none",col,sw); c.line(x+9*u,y+2*u,x+9*u,y+16*u,col,sw)
    elif name=="tools":
        P(f"M{x+3*u},{y+15*u} l{7*u},{-7*u}"); c.circle(x+12.5*u,y+5.5*u,3*u,"none",col,sw)
        P(f"M{x+11*u},{y+9*u} l{4*u},{4*u}")
    elif name=="report":
        c.rect(x+3*u,y+2*u,12*u,14*u,2*u,"none",col,sw)
        for i in range(3): c.line(x+6*u,y+(6+i*3)*u,x+12*u,y+(6+i*3)*u,col,sw)
    elif name=="search":
        c.circle(x+8*u,y+8*u,5*u,"none",col,sw); c.line(x+12*u,y+12*u,x+16*u,y+16*u,col,sw+0.3)
    elif name=="idcard":
        c.rect(x+2*u,y+3*u,14*u,12*u,2*u,"none",col,sw); c.circle(x+6*u,y+8*u,2*u,"none",col,sw)
        P(f"M{x+3.5*u},{y+13*u} q{2.5*u},{-3*u} {5*u},0"); c.line(x+10*u,y+7*u,x+14*u,y+7*u,col,sw); c.line(x+10*u,y+10*u,x+13*u,y+10*u,col,sw)
    elif name=="scan":
        for cx,cy,d in ((3,3,"tl"),(15,3,"tr"),(3,15,"bl"),(15,15,"br")):
            sx=x+cx*u; sy=y+cy*u
            hx=3*u if "l" in d else -3*u; vy=3*u if "t" in d else -3*u
            c.line(sx,sy,sx+hx,sy,col,sw); c.line(sx,sy,sx,sy+vy,col,sw)
        c.line(x+3*u,y+9*u,x+15*u,y+9*u,col,sw)
    elif name=="coins":
        c.circle(x+7*u,y+7*u,5*u,"none",col,sw); c.circle(x+11*u,y+11*u,5*u,"none",col,sw)
    elif name=="cloud":
        P(f"M{x+5*u},{y+13*u} a{3.5*u},{3.5*u} 0 0 1 0,{-7*u} a{4*u},{4*u} 0 0 1 {8*u},{-1*u} a{3*u},{3*u} 0 0 1 {0.5*u},{8*u} z")
    elif name=="upload":
        P(f"M{x+9*u},{y+12*u} l0,{-9*u}"); P(f"M{x+5.5*u},{y+6.5*u} l{3.5*u},{-3.5*u} l{3.5*u},{3.5*u}")
        P(f"M{x+3*u},{y+13*u} l0,{2*u} l{12*u},0 l0,{-2*u}")
    elif name=="download":
        P(f"M{x+9*u},{y+3*u} l0,{9*u}"); P(f"M{x+5.5*u},{y+8.5*u} l{3.5*u},{3.5*u} l{3.5*u},{-3.5*u}")
        P(f"M{x+3*u},{y+13*u} l0,{2*u} l{12*u},0 l0,{-2*u}")
    elif name=="box":
        P(f"M{x+9*u},{y+2*u} l{6*u},{3.5*u} l0,{7*u} l{-6*u},{3.5*u} l{-6*u},{-3.5*u} l0,{-7*u} z")
        c.line(x+3*u,y+5.5*u,x+9*u,y+9*u,col,sw); c.line(x+15*u,y+5.5*u,x+9*u,y+9*u,col,sw); c.line(x+9*u,y+9*u,x+9*u,y+16*u,col,sw)
    elif name=="copy":
        c.rect(x+5*u,y+5*u,9*u,11*u,2*u,"none",col,sw); c.rect(x+2.5*u,y+2*u,9*u,11*u,2*u,"none",col,sw)
    elif name=="scissors":
        c.circle(x+4*u,y+5*u,2.2*u,"none",col,sw); c.circle(x+4*u,y+13*u,2.2*u,"none",col,sw)
        P(f"M{x+6*u},{y+6*u} l{9*u},{6*u}"); P(f"M{x+6*u},{y+12*u} l{9*u},{-6*u}")
    elif name=="trash":
        P(f"M{x+4*u},{y+5*u} l{10*u},0 l{-1*u},{11*u} l{-8*u},0 z"); c.line(x+3*u,y+5*u,x+15*u,y+5*u,col,sw)
        P(f"M{x+7*u},{y+5*u} l0,{-2*u} l{4*u},0 l0,{2*u}")
    elif name=="import":
        P(f"M{x+9*u},{y+2*u} l0,{8*u}"); P(f"M{x+5.5*u},{y+7*u} l{3.5*u},{3.5*u} l{3.5*u},{-3.5*u}")
        P(f"M{x+3*u},{y+13*u} l0,{2*u} l{12*u},0 l0,{-2*u}")
    elif name=="bell":
        P(f"M{x+5*u},{y+13*u} q0,{-9*u} {4*u},{-9*u} q{4*u},0 {4*u},{9*u} z"); c.line(x+3.5*u,y+13*u,x+14.5*u,y+13*u,col,sw)
        P(f"M{x+7.5*u},{y+15*u} q{1.5*u},{2*u} {3*u},0")
    elif name=="wrench":
        P(f"M{x+3*u},{y+15*u} l{6.5*u},{-6.5*u}"); c.circle(x+12.5*u,y+5.5*u,3.2*u,"none",col,sw)
    elif name=="layers":
        P(f"M{x+9*u},{y+2*u} l{7*u},{4*u} l{-7*u},{4*u} l{-7*u},{-4*u} z"); P(f"M{x+2*u},{y+10*u} l{7*u},{4*u} l{7*u},{-4*u}")
    elif name=="alert":
        P(f"M{x+9*u},{y+2*u} l{7*u},{13*u} l{-14*u},0 z"); c.line(x+9*u,y+7*u,x+9*u,y+11*u,col,sw); c.circle(x+9*u,y+13*u,0.8*u,col)
    elif name=="clock":
        c.circle(x+9*u,y+9*u,7*u,"none",col,sw); P(f"M{x+9*u},{y+5*u} l0,{4*u} l{3*u},{2*u}")
    elif name=="check":
        c.circle(x+9*u,y+9*u,7*u,"none",col,sw); P(f"M{x+6*u},{y+9*u} l{2*u},{2*u} l{4*u},{-4.5*u}")
    elif name=="qr":
        c.rect(x+2*u,y+2*u,5*u,5*u,1*u,"none",col,sw); c.rect(x+11*u,y+2*u,5*u,5*u,1*u,"none",col,sw)
        c.rect(x+2*u,y+11*u,5*u,5*u,1*u,"none",col,sw); c.rect(x+11*u,y+11*u,2*u,2*u,0.5,col); c.rect(x+14*u,y+14*u,2*u,2*u,0.5,col)
    elif name=="pin":
        P(f"M{x+9*u},{y+2*u} a{5*u},{5*u} 0 0 1 {5*u},{5*u} q0,{4*u} {-5*u},{9*u} q{-5*u},{-5*u} {-5*u},{-9*u} a{5*u},{5*u} 0 0 1 {5*u},{-5*u} z")
        c.circle(x+9*u,y+7*u,1.8*u,"none",col,sw)
    elif name=="building":
        c.rect(x+3*u,y+2*u,12*u,14*u,1.5*u,"none",col,sw)
        for r in range(3):
            for cc in range(2): c.rect(x+(5.5+cc*4)*u,y+(5+r*3)*u,2*u,2*u,0.3*u,col)
    elif name=="dollar":
        c.circle(x+9*u,y+9*u,7*u,"none",col,sw); c.line(x+9*u,y+4.5*u,x+9*u,y+13.5*u,col,sw)
        P(f"M{x+11*u},{y+7*u} q0,{-2*u} {-2.5*u},{-2*u} q{-2.5*u},0 {-2.5*u},{2*u} q0,{2*u} {2.5*u},{2*u} q{2.5*u},0 {2.5*u},{2*u} q0,{2*u} {-2.5*u},{2*u} q{-2.5*u},0 {-2.5*u},{-2*u}")

def avatar(c,cx,cy,r,bg,initials,fg="#FFFFFF"):
    c.circle(cx,cy,r,bg); c.text(cx,cy+r*0.34,initials,r*0.82,fg,700,"middle")

# Navigation model: (group, [(icon,label,[NEW])...])
NAV=[
 ("OVERVIEW",[("grid","Dashboard"),("calendar","Monthly Breakdown"),("report","Fiscal Year Report"),("chart","Analytics & Insights","NEW")]),
 ("REGISTERS",[("register","Asset Register"),("catalog","Cost Catalog"),("search","Asset Lookup"),("idcard","Asset 360 Profile","NEW")]),
 ("OPERATIONS",[("wrench","Maintenance","NEW"),("survey","Board of Survey"),("trash","Asset Disposal"),("scan","Audit / Scan Mode","NEW")]),
 ("FINANCE",[("coins","Depreciation","NEW")]),
 ("DATA",[("import","Import Assets"),("cloud","Google Drive Import"),("upload","BOS Upload"),("box","Bulk Categories"),("copy","Duplicates Tracker"),("scissors","Code Parser")]),
 ("SYSTEM",[("tools","Tools & Utilities"),("bell","Notifications","NEW")]),
]

def shell(c, active, title, crumb, accent=INDIGO, accent_t=INDIGO_T):
    W=256
    c.rect(0,0,W,c.h,0,SIDEBAR)
    c.rect(20,22,34,34,9,accent); icon(c,"box",28,30,"#FFFFFF",18,1.9)
    c.text(64,38,"AssetHub",16,"#FFFFFF",700); c.text(64,53,"Fixed Asset Management",10.5,"#64748B",500)
    c.line(20,72,W-20,72,SIDEBAR2,1)
    y=92
    for group,items in NAV:
        c.text(22,y,group,9.5,"#475569",700,ls="0.8"); y+=14
        for it in items:
            ic,label=it[0],it[1]; new=len(it)>2
            is_active = (label==active)
            if is_active:
                c.rect(10,y-4,W-20,30,8,accent)
                icon(c,ic,22,y+2,"#FFFFFF",16,1.8); c.text(46,y+15,label,12.5,"#FFFFFF",600)
            else:
                icon(c,ic,22,y+2,"#94A3B8",16,1.7); c.text(46,y+15,label,12.5,"#CBD5E1",500)
            if new:
                tw=c.pill(W-46,y+1,"NEW",("#FFFFFF" if is_active else accent),(accent if is_active else "#FFFFFF"),8.5,6,15,700)
            y+=30
        y+=8
    uy=c.h-58
    c.line(20,uy-12,W-20,uy-12,SIDEBAR2,1)
    avatar(c,38,uy+14,16,accent,"RB"); c.text(62,uy+10,"R. Barrett",12,"#FFFFFF",600); c.text(62,uy+26,"Administrator",10,"#64748B",500)
    # topbar
    H=70
    c.rect(W,0,c.w-W,H,0,CARD); c.line(W,H,c.w,H,BORDER,1)
    c.text(W+28,32,title,20,INK,700); c.text(W+28,52,crumb,12,MUTED,500)
    sx=c.w-300; c.rect(sx,18,180,34,9,BG,BORDER,1); icon(c,"search",sx+10,26,FAINT,16,1.6); c.text(sx+34,40,"Search assets…",12.5,FAINT,400)
    bx=c.w-104; c.rect(bx,18,34,34,9,BG,BORDER,1); icon(c,"bell",bx+8,26,MUTED,18,1.6); c.circle(bx+27,23,4,RED)
    ax=c.w-60; avatar(c,ax+16,35,16,accent,"RB")
    return W

# ---------- shared content components ----------
def kpi(c,x,y,w,label,value,delta,up,ic,accent,accent_t,spark,h=104):
    c.card(x,y,w,h,14)
    c.rect(x+18,y+18,38,38,11,accent_t); icon(c,ic,x+28,y+28,accent,18,1.9)
    c.text(x+18,y+80,value,24,INK,700); c.text(x+18,y+97,label,12,MUTED,500)
    if delta:
        dc=GREEN_T if up else RED_T; dtx=GREEN_TX if up else RED_TX
        tw=len(delta)*6.5+24; c.rect(x+w-tw-16,y+20,tw,20,10,dc)
        ar=f"M{x+w-tw-4},{y+33} l3,-4 l3,4" if up else f"M{x+w-tw-4},{y+27} l3,4 l3,-4"
        c.path(ar,stroke=dtx,sw=1.7); c.text(x+w-tw+9,y+34,delta,10.5,dtx,700)
    if spark:
        sx=x+w-96; sy=y+86; sw_=80; sh=22; mx=max(spark); mn=min(spark)
        pts=[(sx+i*sw_/(len(spark)-1), sy-(v-mn)/(mx-mn+0.001)*sh) for i,v in enumerate(spark)]
        d="M"+" L".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
        c.path(d,stroke=accent,sw=2); c.path(d+f" L{pts[-1][0]:.1f},{sy} L{pts[0][0]:.1f},{sy} Z",fill=accent,op=0.08)

def kpi_row(c,x0,y,accent,accent_t,cards,gw=None,gap=18):
    gw=gw or (c.w-x0-56); n=len(cards); cw=(gw-(n-1)*gap)/n
    for i,cd in enumerate(cards):
        label,value,delta,up,ic,col,colt,spark = cd
        kpi(c,x0+28+i*(cw+gap),y,cw,label,value,delta,up,ic,col,colt,spark)
    return cw

def section(c,x,y,t,accent=None,action=None,sub=None):
    c.text(x,y,t,15,INK,700)
    if sub: c.text(x,y+17,sub,11.5,MUTED,500)
    if action: c.pill(x+ (c.w-2*x) ,y-13,action,accent,"#FFFFFF",11,12,22)

def table(c,x,y,w,h,title,cols,colx,rows,accent,sub=None,action="View all"):
    c.card(x,y,w,h,14)
    c.text(x+22,y+30,title,15,INK,700)
    if sub: c.text(x+22,y+47,sub,11,MUTED,500)
    if action: c.pill(x+w-22-(len(action)*6.5+24),y+16,action,accent,"#FFFFFF",11,12,22)
    hy=y+(64 if sub else 56); c.line(x+20,hy+10,x+w-20,hy+10,BORDER,1)
    for cx_,label in zip(colx,cols): c.text(x+cx_,hy+4,label,10,FAINT,700,ls="0.4")
    ry=hy+40
    for ri,row in enumerate(rows):
        if ri%2==1: c.rect(x+12,ry-21,w-24,32,7,BG)
        for cx_,cell in zip(colx,row):
            kind,val=cell
            if kind=="code": c.text(x+cx_,ry,val,12,accent,700,family=MONO)
            elif kind=="t": c.text(x+cx_,ry,val,12,TXT,500)
            elif kind=="strong": c.text(x+cx_,ry,val,12,INK,600)
            elif kind=="mut": c.text(x+cx_,ry,val,11.5,MUTED,500)
            elif kind=="badge": t,bg,fg=val; c.pill(x+cx_,ry-14,t,bg,fg,10,9,19)
            elif kind=="chk":
                c.rect(x+cx_,ry-13,16,16,4,(accent if val else CARD),(None if val else BORDER),1.4)
                if val: c.path(f"M{x+cx_+4},{ry-5} l3,3 l5,-6",stroke="#FFFFFF",sw=1.8)
            elif kind=="btn":
                t,bg,fg=val; bw2=len(t)*6.2+28; c.rect(x+cx_,ry-14,bw2,22,7,bg,(BORDER if bg==CARD else None),1.2)
                c.text(x+cx_+12,ry,t,11,fg,600); c.path(f"M{x+cx_+bw2-16},{ry-3} l3.5,3.5 l3.5,-3.5",stroke=fg,sw=1.5)
            elif kind=="bar":
                pct,col=val; bw=80; c.rect(x+cx_,ry-8,bw,6,3,BORDER); c.rect(x+cx_,ry-8,bw*pct/100,6,3,col)
                c.text(x+cx_+bw+8,ry,f"{pct}%",10.5,MUTED,600)
        ry+=37
    return ry

def bar_chart(c,x,y,w,h,title,cats,vals,accent,accent2=None,sub=None):
    c.card(x,y,w,h,14); c.text(x+22,y+30,title,15,INK,700)
    if sub: c.text(x+22,y+47,sub,11,MUTED,500)
    ax_x=x+52; ax_b=y+h-44; ax_t=y+(66 if sub else 58); ax_r=x+w-24; mx=max(vals)*1.15
    for i in range(5):
        gy=ax_b-(ax_b-ax_t)*i/4; c.line(ax_x,gy,ax_r,gy,BORDER,1,op=0.7)
        c.text(ax_x-10,gy+4,f"{mx*i/4:.0f}",9.5,FAINT,500,"end")
    n=len(vals); slot=(ax_r-ax_x)/n; bw=slot*0.5
    for i,(cat,v) in enumerate(zip(cats,vals)):
        bx=ax_x+slot*i+(slot-bw)/2; bh=(ax_b-ax_t)*v/mx
        col=accent if (accent2 is None or i%2==0) else accent2
        c.rect(bx,ax_b-bh,bw,bh,5,col); c.text(bx+bw/2,ax_b+16,cat,9.5,MUTED,500,"middle")

def line_chart(c,x,y,w,h,title,labels,series,sub=None):
    # series: list of (name,color,values)
    c.card(x,y,w,h,14); c.text(x+22,y+30,title,15,INK,700)
    if sub: c.text(x+22,y+47,sub,11,MUTED,500)
    ax_x=x+52; ax_b=y+h-44; ax_t=y+(70 if sub else 60); ax_r=x+w-24
    allv=[v for _,_,vs in series for v in vs]; mx=max(allv)*1.15; mn=0
    for i in range(5):
        gy=ax_b-(ax_b-ax_t)*i/4; c.line(ax_x,gy,ax_r,gy,BORDER,1,op=0.7)
        c.text(ax_x-10,gy+4,f"{mx*i/4:.0f}",9.5,FAINT,500,"end")
    n=len(labels)
    for i,lb in enumerate(labels):
        px=ax_x+(ax_r-ax_x)*i/(n-1); c.text(px,ax_b+16,lb,9.5,MUTED,500,"middle")
    for name,col,vs in series:
        pts=[(ax_x+(ax_r-ax_x)*i/(n-1), ax_b-(v-mn)/(mx-mn)*(ax_b-ax_t)) for i,v in enumerate(vs)]
        d="M"+" L".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
        c.path(d+f" L{pts[-1][0]:.1f},{ax_b} L{pts[0][0]:.1f},{ax_b} Z",fill=col,op=0.07)
        c.path(d,stroke=col,sw=2.4)
        for p in pts: c.circle(p[0],p[1],3,CARD,col,1.8)
    # legend
    lx=x+w-24; ly=y+30
    for name,col,vs in reversed(series):
        tw=len(name)*6.4+22; lx-=tw; c.circle(lx+5,ly-4,4,col); c.text(lx+14,ly,name,11,TXT,500)

def donut(c,x,y,w,h,title,segs,total_label,total_val):
    c.card(x,y,w,h,14); c.text(x+22,y+30,title,15,INK,700)
    cx=x+90; cy=y+h/2+12; ro=54; ri=37; ang=-90
    for label,val,col in segs:
        sweep=val/100*360; a0=math.radians(ang); a1=math.radians(ang+sweep)
        x0o=cx+ro*math.cos(a0); y0o=cy+ro*math.sin(a0); x1o=cx+ro*math.cos(a1); y1o=cy+ro*math.sin(a1)
        x0i=cx+ri*math.cos(a1); y0i=cy+ri*math.sin(a1); x1i=cx+ri*math.cos(a0); y1i=cy+ri*math.sin(a0)
        laf=1 if sweep>180 else 0
        c.path(f"M{x0o:.2f},{y0o:.2f} A{ro},{ro} 0 {laf} 1 {x1o:.2f},{y1o:.2f} L{x0i:.2f},{y0i:.2f} A{ri},{ri} 0 {laf} 0 {x1i:.2f},{y1i:.2f} Z",fill=col)
        ang+=sweep
    c.text(cx,cy-2,total_val,19,INK,700,"middle"); c.text(cx,cy+15,total_label,10,MUTED,500,"middle")
    ly=y+62; lx=x+170
    for label,val,col in segs:
        c.rect(lx,ly-10,11,11,3,col); c.text(lx+18,ly,label,11.5,TXT,500); c.text(x+w-22,ly,f"{val}%",11.5,INK,700,"end"); ly+=27

def filter_bar(c,x,y,w,accent,chips):
    c.card(x,y,w,56,12)
    c.rect(x+16,y+13,210,30,8,BG,BORDER,1); icon(c,"search",x+24,y+20,FAINT,15,1.6); c.text(x+46,y+33,"Search…",12,FAINT,400)
    cx=x+240
    for label in chips:
        tw=len(label)*6.6+34; c.rect(cx,y+13,tw,30,8,CARD,BORDER,1); c.text(cx+12,y+33,label,12,TXT,600)
        c.path(f"M{cx+tw-16},{y+25} l4,4 l4,-4",stroke=MUTED,sw=1.6); cx+=tw+10
    c.pill(x+w-118,y+15,"+ Add Asset",accent,"#FFFFFF",12,14,26)

def dropzone(c,x,y,w,h,accent,accent_t,label,sub):
    c.card(x,y,w,h,14)
    # dashed inner
    c.rect(x+24,y+24,w-48,h-48,12,accent_t,accent,1.5)
    c.e[-1]=c.e[-1].replace('/>',' stroke-dasharray="6 6"/>')
    cx=x+w/2; cy=y+h/2-10
    c.circle(cx,cy-6,26,CARD,accent,1.8); icon(c,"upload",cx-9,cy-16,accent,18,2)
    c.text(cx,cy+34,label,15,INK,700,"middle"); c.text(cx,cy+54,sub,12,MUTED,500,"middle")
    c.pill(cx-52,cy+68,"Browse files",accent,"#FFFFFF",12,16,28)

def wizard(c,x,y,w,accent,steps,active):
    c.card(c.w and x,y,w,72,12)
    n=len(steps); seg=(w-80)/(n-1); sx=x+40; ly=y+30
    for i in range(n-1):
        col=accent if i<active else BORDER; c.line(sx+i*seg+14,ly,sx+(i+1)*seg-14,ly,col,3)
    for i,st in enumerate(steps):
        cx=sx+i*seg
        if i<active: c.circle(cx,ly,13,accent); c.path(f"M{cx-5},{ly} l3,3 l6,-7",stroke="#FFFFFF",sw=2)
        elif i==active: c.circle(cx,ly,15,accent); c.text(cx,ly+4,str(i+1),12,"#FFFFFF",700,"middle")
        else: c.circle(cx,ly,13,CARD,BORDER,2); c.text(cx,ly+4,str(i+1),12,FAINT,700,"middle")
        c.text(cx,ly+32,st,10,(INK if i<=active else MUTED),(600 if i==active else 500),"middle")

def toast(c,x,y,kind,msg):
    cmap={"ok":(GREEN_T,GREEN,GREEN_TX,"check"),"warn":(AMBER_T,AMBER,AMBER_TX,"alert"),"info":(SKY_T,SKY,SKY_TX,"bell")}
    bg,ac,tx,ic=cmap[kind]; w=len(msg)*6.6+70
    c.shadow(x,y,w,46,12); c.rect(x,y,w,46,12,CARD,BORDER,1); c.rect(x,y,5,46,2,ac)
    c.rect(x+16,y+12,22,22,7,bg); icon(c,ic,x+22,y+18,ac,11,1.8); c.text(x+48,y+28,msg,12.5,INK,600)
    return w
