#!/usr/bin/env python3
"""Generate modern redesign mockups (SVG -> PNG) for the Asset Dashboard suite."""
import math, cairosvg, os

FONT = "Liberation Sans, DejaVu Sans, Arial, sans-serif"
MONO = "DejaVu Sans Mono, monospace"

# ---- Unified design tokens ----
BG      = "#F1F5F9"
CARD    = "#FFFFFF"
BORDER  = "#E2E8F0"
INK     = "#0F172A"
TXT     = "#334155"
MUTED   = "#64748B"
FAINT   = "#94A3B8"

INDIGO  = "#4F46E5"; INDIGO_D="#4338CA"; INDIGO_T="#EEF2FF"
VIOLET  = "#7C3AED"; VIOLET_D="#6D28D9"; VIOLET_T="#F5F3FF"
TEAL    = "#0D9488"; TEAL_D  ="#0F766E"; TEAL_T  ="#F0FDFA"
GREEN   = "#16A34A"; GREEN_T ="#DCFCE7"; GREEN_TX="#166534"
AMBER   = "#D97706"; AMBER_T ="#FEF3C7"; AMBER_TX="#92400E"
RED     = "#DC2626"; RED_T   ="#FEE2E2"; RED_TX  ="#991B1B"
SKY     = "#0284C7"; SKY_T   ="#E0F2FE"; SKY_TX  ="#075985"
SLATE_T = "#F1F5F9"; SLATE_TX="#475569"

SIDEBAR = "#0F172A"
SIDEBAR2= "#1E293B"

def esc(s): return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

class C:
    def __init__(s,w,h,bg=BG):
        s.e=[]; s.w=w; s.h=h
        s.e.append(f'<rect x="0" y="0" width="{w}" height="{h}" fill="{bg}"/>')
    def raw(s,x): s.e.append(x)
    def rect(s,x,y,w,h,r=0,fill=CARD,stroke=None,sw=1,op=1):
        st=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        o=f' opacity="{op}"' if op!=1 else ''
        s.e.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" ry="{r}" fill="{fill}"{st}{o}/>')
    def shadow(s,x,y,w,h,r=14):
        # soft simulated shadow via stacked translucent offset rects
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
        w=len(t)*size*0.58+pad*2
        s.rect(x,y,w,h,h/2,bg); s.text(x+w/2,y+h/2+size*0.36,t,size,fg,weight,"middle")
        return w
    def svg(s):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s.w}" height="{s.h}" '
                f'viewBox="0 0 {s.w} {s.h}">'+''.join(s.e)+'</svg>')
    def png(s,path):
        cairosvg.svg2png(bytestring=s.svg().encode(),write_to=path,output_width=s.w,output_height=s.h)

# ---------- line icons (18px box, drawn at given top-left, stroke color) ----------
def icon(c,name,x,y,col,sz=18,sw=1.8):
    u=sz/18.0
    def P(d): c.path(d,stroke=col,sw=sw)
    if name=="grid":
        for dx,dy in ((0,0),(10,0),(0,10),(10,10)):
            c.rect(x+dx*u,y+dy*u,7*u,7*u,1.5*u,"none",col,sw)
    elif name=="register":
        c.rect(x+2*u,y+1*u,14*u,16*u,2*u,"none",col,sw);
        for i in range(3): c.line(x+5*u,y+(5+i*4)*u,x+13*u,y+(5+i*4)*u,col,sw)
    elif name=="calendar":
        c.rect(x+2*u,y+3*u,14*u,13*u,2*u,"none",col,sw); c.line(x+2*u,y+7*u,x+16*u,y+7*u,col,sw)
        c.line(x+6*u,y+1*u,x+6*u,y+5*u,col,sw); c.line(x+12*u,y+1*u,x+12*u,y+5*u,col,sw)
    elif name=="chart":
        c.line(x+3*u,y+2*u,x+3*u,y+16*u,col,sw); c.line(x+3*u,y+16*u,x+16*u,y+16*u,col,sw)
        for dx,hh in ((6,6),(9,9),(12,4),(14.5,11)):
            c.rect(x+dx*u,y+(16-hh)*u,1.6*u,hh*u,0.5*u,col)
    elif name=="survey":
        c.rect(x+3*u,y+2*u,12*u,14*u,2*u,"none",col,sw); P(f"M{x+6*u},{y+8*u} l{2*u},{2*u} l{4*u},{-4.5*u}")
    elif name=="catalog":
        c.rect(x+2*u,y+2*u,14*u,14*u,2*u,"none",col,sw); c.line(x+9*u,y+2*u,x+9*u,y+16*u,col,sw)
    elif name=="tools":
        P(f"M{x+3*u},{y+15*u} l{6*u},{-6*u}"); c.circle(x+12*u,y+6*u,3*u,"none",col,sw)
    elif name=="report":
        c.rect(x+3*u,y+2*u,12*u,14*u,2*u,"none",col,sw)
        for i in range(3): c.line(x+6*u,y+(6+i*3)*u,x+12*u,y+(6+i*3)*u,col,sw)
    elif name=="cart":
        c.circle(x+7*u,y+15*u,1.3*u,col); c.circle(x+13*u,y+15*u,1.3*u,col)
        P(f"M{x+2*u},{y+3*u} l{2.5*u},0 l{2*u},{9*u} l{8*u},0 l{1.5*u},{-6*u} l{-10*u},0")
    elif name=="doc":
        P(f"M{x+4*u},{y+2*u} l{7*u},0 l{4*u},{4*u} l0,{10*u} l{-11*u},0 z");
        for i in range(3): c.line(x+6.5*u,y+(8+i*2.5)*u,x+12*u,y+(8+i*2.5)*u,col,sw)
    elif name=="scale":  # evaluation
        c.line(x+9*u,y+2*u,x+9*u,y+15*u,col,sw); c.line(x+4*u,y+15*u,x+14*u,y+15*u,col,sw)
        c.line(x+3*u,y+5*u,x+15*u,y+5*u,col,sw); c.circle(x+3*u,y+5*u,1.2*u,col); c.circle(x+15*u,y+5*u,1.2*u,col)
    elif name=="check":
        c.circle(x+9*u,y+9*u,7*u,"none",col,sw); P(f"M{x+6*u},{y+9*u} l{2*u},{2*u} l{4*u},{-4.5*u}")
    elif name=="building":
        c.rect(x+3*u,y+2*u,12*u,14*u,1.5*u,"none",col,sw)
        for r in range(3):
            for cc in range(2): c.rect(x+(5.5+cc*4)*u,y+(5+r*3)*u,2*u,2*u,0.3*u,col)
    elif name=="box":
        P(f"M{x+9*u},{y+2*u} l{6*u},{3.5*u} l0,{7*u} l{-6*u},{3.5*u} l{-6*u},{-3.5*u} l0,{-7*u} z")
        c.line(x+3*u,y+5.5*u,x+9*u,y+9*u,col,sw); c.line(x+15*u,y+5.5*u,x+9*u,y+9*u,col,sw); c.line(x+9*u,y+9*u,x+9*u,y+16*u,col,sw)
    elif name=="receive":
        P(f"M{x+9*u},{y+2*u} l0,{8*u}"); P(f"M{x+5.5*u},{y+7*u} l{3.5*u},{3.5*u} l{3.5*u},{-3.5*u}")
        P(f"M{x+3*u},{y+13*u} l0,{2*u} l{12*u},0 l0,{-2*u}")
    elif name=="issue":
        P(f"M{x+9*u},{y+10*u} l0,{-8*u}"); P(f"M{x+5.5*u},{y+5.5*u} l{3.5*u},{-3.5*u} l{3.5*u},{3.5*u}")
        P(f"M{x+3*u},{y+13*u} l0,{2*u} l{12*u},0 l0,{-2*u}")
    elif name=="alert":
        P(f"M{x+9*u},{y+2*u} l{7*u},{13*u} l{-14*u},0 z"); c.line(x+9*u,y+7*u,x+9*u,y+11*u,col,sw); c.circle(x+9*u,y+13*u,0.8*u,col)
    elif name=="clock":
        c.circle(x+9*u,y+9*u,7*u,"none",col,sw); P(f"M{x+9*u},{y+5*u} l0,{4*u} l{3*u},{2*u}")
    elif name=="search":
        c.circle(x+8*u,y+8*u,5*u,"none",col,sw); c.line(x+12*u,y+12*u,x+16*u,y+16*u,col,sw+0.3)
    elif name=="bell":
        P(f"M{x+5*u},{y+13*u} q0,{-9*u} {4*u},{-9*u} q{4*u},0 {4*u},{9*u} z"); c.line(x+3.5*u,y+13*u,x+14.5*u,y+13*u,col,sw)
        P(f"M{x+7.5*u},{y+15*u} q{1.5*u},{2*u} {3*u},0")
    elif name=="layers":
        P(f"M{x+9*u},{y+2*u} l{7*u},{4*u} l{-7*u},{4*u} l{-7*u},{-4*u} z"); P(f"M{x+2*u},{y+10*u} l{7*u},{4*u} l{7*u},{-4*u}")

def avatar(c,cx,cy,r,bg,initials,fg="#FFFFFF"):
    c.circle(cx,cy,r,bg); c.text(cx,cy+r*0.34,initials,r*0.85,fg,700,"middle")

# ---------- sidebar ----------
def sidebar(c,title,sub,accent,accent_t,items,active_idx,user_name,user_role,user_init):
    W=248; H=c.h
    c.rect(0,0,W,H,0,SIDEBAR)
    # brand
    c.rect(20,24,34,34,9,accent)
    icon(c,"box",28,32,"#FFFFFF",18,1.9)
    c.text(64,40,title,16,"#FFFFFF",700)
    c.text(64,56,sub,11,"#64748B",500)
    c.line(20,80,W-20,80,"#1E293B",1)
    y=100
    for i,(ic,label) in enumerate(items):
        if i==active_idx:
            c.rect(12,y-6,W-24,40,10,accent)
            icon(c,ic,28,y+4,"#FFFFFF",18,1.9)
            c.text(58,y+19,label,13.5,"#FFFFFF",600)
            c.rect(W-6,y-6,4,40,2,"#FFFFFF",op=0.0)
        else:
            icon(c,ic,28,y+4,"#94A3B8",18,1.7)
            c.text(58,y+19,label,13.5,"#CBD5E1",500)
        y+=46
    # section divider label
    # user card bottom
    uy=H-80
    c.line(20,uy-10,W-20,uy-10,"#1E293B",1)
    avatar(c,40,uy+18,18,accent,user_init)
    c.text(68,uy+14,user_name,13,"#FFFFFF",600)
    c.text(68,uy+30,user_role,11,"#64748B",500)
    return W

# ---------- topbar ----------
def topbar(c,x0,title,crumb,accent,user_init):
    H=70
    c.rect(x0,0,c.w-x0,H,0,CARD)
    c.line(x0,H,c.w,H,BORDER,1)
    c.text(x0+28,32,title,20,INK,700)
    c.text(x0+28,52,crumb,12,MUTED,500)
    # search box
    sx=c.w-470; c.rect(sx,18,250,34,9,BG,BORDER,1)
    icon(c,"search",sx+10,26,FAINT,16,1.6)
    c.text(sx+34,40,"Search…",13,FAINT,400)
    # bell
    bx=c.w-188; c.rect(bx,18,34,34,9,BG,BORDER,1); icon(c,"bell",bx+8,26,MUTED,18,1.6)
    c.circle(bx+27,23,4,RED)
    # dark toggle
    tx=c.w-144; c.rect(tx,18,34,34,9,BG,BORDER,1)
    c.circle(tx+17,35,7,"none",MUTED,1.6); c.path(f"M{tx+20},{tx*0+28} a6,6 0 1 0 0,12 z".replace(f"{tx+20}",f"{tx+20}"),fill=MUTED)
    # avatar + name
    ax=c.w-96; avatar(c,ax+16,35,16,accent,user_init); c.text(ax+40,40,"Account",13,TXT,600)

# ---------- KPI card ----------
def kpi(c,x,y,w,label,value,delta,delta_up,ic,accent,accent_t,spark):
    h=108
    c.card(x,y,w,h,14)
    c.rect(x+20,y+20,40,40,11,accent_t)
    icon(c,ic,x+31,y+31,accent,18,1.9)
    c.text(x+20,y+82,value,26,INK,700)
    c.text(x+20,y+100,label,12.5,MUTED,500)
    # delta chip top-right
    dc = GREEN_T if delta_up else RED_T
    dtx= GREEN_TX if delta_up else RED_TX
    tw=len(delta)*7+26
    c.rect(x+w-tw-18,y+22,tw,22,11,dc)
    arrow = f"M{x+w-tw-6},{y+36} l3,-4 l3,4" if delta_up else f"M{x+w-tw-6},{y+30} l3,4 l3,-4"
    c.path(arrow,stroke=dtx,sw=1.8)
    c.text(x+w-tw+8,y+37,delta,11,dtx,700)
    # sparkline
    sx=x+w-110; sy=y+88; sw_=92; sh=24
    pts=[]
    mx=max(spark); mn=min(spark)
    for i,v in enumerate(spark):
        px=sx+i*sw_/(len(spark)-1); py=sy-(v-mn)/(mx-mn+0.001)*sh
        pts.append((px,py))
    d="M"+" L".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
    c.path(d,stroke=accent,sw=2)
    area=d+f" L{pts[-1][0]:.1f},{sy} L{pts[0][0]:.1f},{sy} Z"
    c.path(area,fill=accent,op=0.08)

# ---------- bar chart ----------
def bar_chart(c,x,y,w,h,title,cats,vals,accent,accent2=None):
    c.card(x,y,w,h,14)
    c.text(x+22,y+32,title,15,INK,700)
    c.text(x+22,y+50,"Fiscal year 2025/26 · J$ millions",11.5,MUTED,500)
    ax_x=x+50; ax_b=y+h-46; ax_t=y+72; ax_r=x+w-24
    mx=max(vals)*1.15
    # gridlines
    for i in range(5):
        gy=ax_b-(ax_b-ax_t)*i/4
        c.line(ax_x,gy,ax_r,gy,BORDER,1,op=0.7)
        c.text(ax_x-10,gy+4,f"{mx*i/4:.0f}",10,FAINT,500,"end")
    n=len(vals); slot=(ax_r-ax_x)/n; bw=slot*0.5
    for i,(cat,v) in enumerate(zip(cats,vals)):
        bx=ax_x+slot*i+(slot-bw)/2
        bh=(ax_b-ax_t)*v/mx
        col=accent if (accent2 is None or i%2==0) else accent2
        c.rect(bx,ax_b-bh,bw,bh,5,col)
        c.text(bx+bw/2,ax_b+18,cat,10.5,MUTED,500,"middle")

# ---------- donut ----------
def donut(c,x,y,w,h,title,segs,total_label,total_val):
    c.card(x,y,w,h,14)
    c.text(x+22,y+32,title,15,INK,700)
    cx=x+95; cy=y+h/2+14; ro=58; ri=40
    ang=-90
    for label,val,col in segs:
        sweep=val/100*360
        a0=math.radians(ang); a1=math.radians(ang+sweep)
        x0o=cx+ro*math.cos(a0); y0o=cy+ro*math.sin(a0)
        x1o=cx+ro*math.cos(a1); y1o=cy+ro*math.sin(a1)
        x0i=cx+ri*math.cos(a1); y0i=cy+ri*math.sin(a1)
        x1i=cx+ri*math.cos(a0); y1i=cy+ri*math.sin(a0)
        laf=1 if sweep>180 else 0
        d=(f"M{x0o:.2f},{y0o:.2f} A{ro},{ro} 0 {laf} 1 {x1o:.2f},{y1o:.2f} "
           f"L{x0i:.2f},{y0i:.2f} A{ri},{ri} 0 {laf} 0 {x1i:.2f},{y1i:.2f} Z")
        c.path(d,fill=col)
        ang+=sweep
    c.text(cx,cy-2,total_val,22,INK,700,"middle")
    c.text(cx,cy+16,total_label,11,MUTED,500,"middle")
    # legend
    ly=y+70; lx=x+185
    for label,val,col in segs:
        c.rect(lx,ly-10,12,12,3,col)
        c.text(lx+20,ly,label,12,TXT,500)
        c.text(x+w-24,ly,f"{val}%",12,INK,700,"end")
        ly+=30

# ---------- table ----------
def table(c,x,y,w,h,title,cols,colx,rows,accent):
    c.card(x,y,w,h,14)
    c.text(x+22,y+32,title,15,INK,700)
    c.pill(x+w-90,y+18,"View all",accent,"#FFFFFF",11,12,22)
    hy=y+58
    c.line(x+20,hy+12,x+w-20,hy+12,BORDER,1)
    for cx_,(label) in zip(colx,cols):
        c.text(x+cx_,hy+6,label,10.5,FAINT,700,ls="0.4")
    ry=hy+44
    for ri,row in enumerate(rows):
        if ri%2==1:
            c.rect(x+12,ry-22,w-24,34,7,BG)
        for ci,(cx_,cell) in enumerate(zip(colx,row)):
            kind,val=cell
            if kind=="code":
                c.text(x+cx_,ry,val,12.5,accent,700,family=MONO)
            elif kind=="t":
                c.text(x+cx_,ry,val,12.5,TXT,500)
            elif kind=="strong":
                c.text(x+cx_,ry,val,12.5,INK,600)
            elif kind=="badge":
                txt,bg,fg=val; c.pill(x+cx_,ry-15,txt,bg,fg,10.5,9,20)
            elif kind=="bar":
                pct,col=val; bw=90
                c.rect(x+cx_,ry-9,bw,7,3.5,BORDER)
                c.rect(x+cx_,ry-9,bw*pct/100,7,3.5,col)
                c.text(x+cx_+bw+8,ry,f"{pct}%",11,MUTED,600)
        ry+=38

os.makedirs("mockups/out",exist_ok=True)

# =================== 1. ASSET DASHBOARD ===================
def asset_dashboard():
    c=C(1440,1024)
    items=[("grid","Dashboard"),("register","Asset Register"),("calendar","Monthly Breakdown"),
           ("survey","Board of Survey"),("catalog","Cost Catalog"),("tools","Tools & Utilities"),
           ("report","Reports")]
    x0=sidebar(c,"AssetHub","Fixed Asset Management",INDIGO,INDIGO_T,items,0,"R. Barrett","Administrator","RB")
    topbar(c,x0,"Asset Dashboard","Overview · St. Ann's Bay Regional Hospital",INDIGO,"RB")
    px=x0+28; py=92; gw=c.w-x0-56
    cw=(gw-3*20)/4
    kpi(c,px+0*(cw+20),py,cw,"Total Assets","4,812","+3.2%",True,"box",INDIGO,INDIGO_T,[5,6,5.5,7,8,7.5,9])
    kpi(c,px+1*(cw+20),py,cw,"Total Asset Value","J$1.94B","+5.1%",True,"chart",GREEN,GREEN_T,[4,5,6,5,7,8,9])
    kpi(c,px+2*(cw+20),py,cw,"Active Warranties","1,256","-1.4%",False,"survey",SKY,SKY_T,[8,7,7.5,6,6.5,6,5.5])
    kpi(c,px+3*(cw+20),py,cw,"Pending Survey","37","+8 new",True,"alert",AMBER,AMBER_T,[2,3,2.5,4,3.5,5,6])
    # charts row
    cy=py+128
    bw=gw*0.60
    bar_chart(c,px,cy,bw,300,"Asset Value by Category",
              ["Medical","Furniture","IT/Tech","Vehicles","Appliance","Industrial","Other"],
              [420,180,260,310,140,90,70],INDIGO,"#818CF8")
    donut(c,px+bw+20,cy,gw-bw-20,300,"Asset Distribution",
          [("Medical Equipment",38,INDIGO),("Furniture & Fittings",24,"#818CF8"),
           ("IT & Technology",18,SKY),("Vehicles",12,GREEN),("Other",8,FAINT)],"Total","4,812")
    # table
    ty=cy+320
    cols=["ASSET CODE","DESCRIPTION","CATEGORY","LOCATION","VALUE","STATUS"]
    colx=[24,150,360,510,650,760]
    rows=[
      [("code","SABRH-MED-0481"),("strong","Philips MX450 Patient Monitor"),("badge",("Medical",INDIGO_T,INDIGO)),("t","ICU Ward A"),("strong","J$1,240,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
      [("code","SABRH-FUR-1180"),("strong","Adjustable Hospital Bed"),("badge",("Furniture",AMBER_T,AMBER_TX)),("t","Ward B-3"),("strong","J$385,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
      [("code","SABRH-ITX-0912"),("strong","Dell OptiPlex Workstation"),("badge",("IT/Tech",SKY_T,SKY_TX)),("t","Records Office"),("strong","J$210,000"),("badge",("Maintenance",AMBER_T,AMBER_TX))],
      [("code","SABRH-VEH-0033"),("strong","Toyota Hiace Ambulance"),("badge",("Vehicle",GREEN_T,GREEN_TX)),("t","Transport Bay"),("strong","J$6,800,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
      [("code","SABRH-MED-0500"),("strong","GE Vivid Ultrasound Unit"),("badge",("Medical",INDIGO_T,INDIGO)),("t","Radiology"),("strong","J$3,150,000"),("badge",("Board of Survey",RED_T,RED_TX))],
    ]
    table(c,px,ty,gw,260,"Recent Asset Activity",cols,colx,rows,INDIGO)
    c.png("mockups/out/01_asset_dashboard.png")
    print("asset dashboard done")

# =================== 2. PROCUREMENT ===================
def procurement():
    c=C(1440,1024)
    items=[("grid","Dashboard"),("doc","Requisitions"),("report","Quotations"),("scale","Evaluation"),
           ("check","Approvals"),("cart","Purchase Orders"),("building","Suppliers"),("chart","Reports")]
    x0=sidebar(c,"ProcureFlow","GOJ Procurement",VIOLET,VIOLET_T,items,0,"R. Barrett","Procurement Officer","RB")
    topbar(c,x0,"Procurement","Dashboard · Government of Jamaica compliant",VIOLET,"RB")
    px=x0+28; py=92; gw=c.w-x0-56
    cw=(gw-3*20)/4
    kpi(c,px+0*(cw+20),py,cw,"Open Requisitions","28","+6 this wk",True,"doc",VIOLET,VIOLET_T,[3,4,5,4,6,7,8])
    kpi(c,px+1*(cw+20),py,cw,"Pending Approvals","11","-2",False,"check",AMBER,AMBER_T,[6,5,7,6,5,4,3])
    kpi(c,px+2*(cw+20),py,cw,"POs This Month","42","+12%",True,"cart",INDIGO,INDIGO_T,[4,5,6,7,6,8,9])
    kpi(c,px+3*(cw+20),py,cw,"Spend YTD","J$312M","+9.4%",True,"chart",GREEN,GREEN_T,[4,5,5.5,6,7,8,9])
    # lifecycle stepper card
    sy=py+128
    c.card(px,sy,gw,128,14)
    c.text(px+22,sy+32,"Procurement Lifecycle",15,INK,700)
    c.text(px+22,sy+50,"GOJ standard 7-stage process — current requisition REQ-2026-0142",11.5,MUTED,500)
    steps=["Requisition","Quotation","Evaluation","Approval","Purchase Order","Delivery","Payment"]
    states=["done","done","done","active","todo","todo","todo"]
    n=len(steps); seg=(gw-80)/(n-1); sx=px+40; ly=sy+92
    # connecting line
    for i in range(n-1):
        col=VIOLET if states[i]=="done" else BORDER
        c.line(sx+i*seg+16,ly,sx+(i+1)*seg-16,ly,col,3)
    for i,(st,state) in enumerate(zip(steps,states)):
        cx=sx+i*seg
        if state=="done":
            c.circle(cx,ly,15,VIOLET); c.path(f"M{cx-6},{ly} l4,4 l7,-8",stroke="#FFFFFF",sw=2.2)
        elif state=="active":
            c.circle(cx,ly,17,VIOLET_T); c.circle(cx,ly,15,VIOLET); c.text(cx,ly+5,str(i+1),13,"#FFFFFF",700,"middle")
        else:
            c.circle(cx,ly,15,"#FFFFFF",BORDER,2); c.text(cx,ly+5,str(i+1),13,FAINT,700,"middle")
        c.text(cx,ly+38,st,10.5,(INK if state!="todo" else MUTED),(600 if state=="active" else 500),"middle")
    # tables: POs (left) + approvals (right)
    ty=sy+148
    tw=gw*0.62
    cols=["PO NUMBER","SUPPLIER","DEPARTMENT","VALUE","STATUS"]
    colx=[24,150,330,470,600]
    rows=[
      [("code","PO-2026-0311"),("strong","MedSupply Jamaica Ltd"),("t","Pharmacy"),("strong","J$2.4M"),("badge",("Issued",SKY_T,SKY_TX))],
      [("code","PO-2026-0310"),("strong","Caribbean Medical Co"),("t","ICU"),("strong","J$880K"),("badge",("Delivered",GREEN_T,GREEN_TX))],
      [("code","PO-2026-0309"),("strong","Island Office Supplies"),("t","Admin"),("strong","J$145K"),("badge",("Paid",GREEN_T,GREEN_TX))],
      [("code","PO-2026-0308"),("strong","TechPro Solutions"),("t","IT"),("strong","J$1.1M"),("badge",("Pending",AMBER_T,AMBER_TX))],
      [("code","PO-2026-0307"),("strong","Jamaica Lab Systems"),("t","Laboratory"),("strong","J$3.6M"),("badge",("Issued",SKY_T,SKY_TX))],
    ]
    table(c,px,ty,tw,300,"Recent Purchase Orders",cols,colx,rows,VIOLET)
    # approvals card
    ax=px+tw+20; aw=gw-tw-20
    c.card(ax,ty,aw,300,14)
    c.text(ax+22,ty+32,"Awaiting Your Approval",15,INK,700)
    c.pill(ax+aw-58,ty+18,"11",RED,"#FFFFFF",11,10,22)
    appr=[("REQ-0142","Surgical consumables","J$1.9M",RED_T,RED_TX,"High"),
          ("REQ-0141","Ward furniture x12","J$640K",AMBER_T,AMBER_TX,"Medium"),
          ("REQ-0139","Printer toner (bulk)","J$92K",SLATE_T,SLATE_TX,"Low"),
          ("REQ-0138","Diagnostic reagents","J$2.3M",RED_T,RED_TX,"High")]
    ry=ty+62
    for code,desc,val,bg,fg,pr in appr:
        c.rect(ax+18,ry,aw-36,52,10,BG,BORDER,1)
        c.text(ax+32,ry+22,code,12,VIOLET,700,family=MONO)
        c.pill(ax+aw-78,ry+8,pr,bg,fg,10,9,19)
        c.text(ax+32,ry+40,desc,12,TXT,500)
        c.text(ax+aw-32,ry+40,val,12,INK,700,"end")
        ry+=60
    c.png("mockups/out/02_procurement.png")
    print("procurement done")

# =================== 3. STORES ===================
def stores():
    c=C(1440,1024)
    items=[("grid","Dashboard"),("layers","Stock Items"),("receive","Receive Stock"),("issue","Issue Stock"),
           ("doc","Requisitions"),("alert","Reorder Alerts"),("clock","Expiry Alerts"),("report","Reports")]
    x0=sidebar(c,"StoreKeep","Stores & Inventory",TEAL,TEAL_T,items,0,"R. Barrett","Stores Manager","RB")
    topbar(c,x0,"Stores & Inventory","Dashboard · Main Medical Store",TEAL,"RB")
    px=x0+28; py=92; gw=c.w-x0-56
    cw=(gw-3*20)/4
    kpi(c,px+0*(cw+20),py,cw,"Total SKUs","1,847","+24",True,"layers",TEAL,TEAL_T,[5,6,6.5,7,7,8,8.5])
    kpi(c,px+1*(cw+20),py,cw,"Stock Value","J$84.2M","+2.8%",True,"chart",GREEN,GREEN_T,[4,5,6,6,7,8,9])
    kpi(c,px+2*(cw+20),py,cw,"Low / Out of Stock","53","+9",False,"alert",AMBER,AMBER_T,[2,3,4,3,5,6,7])
    kpi(c,px+3*(cw+20),py,cw,"Expiring ≤90 days","18","+4",False,"clock",RED,RED_T,[1,2,2,3,3,4,5])
    # inventory table (left) + side column
    ty=py+128
    tw=gw*0.62
    cols=["ITEM","SKU","ON HAND","STOCK LEVEL","STATUS"]
    colx=[24,210,320,400,560]
    rows=[
      [("strong","Nitrile Gloves (M)"),("code","CONS-0142"),("t","8,400"),("bar",(82,TEAL)),("badge",("In Stock",GREEN_T,GREEN_TX))],
      [("strong","IV Cannula 18G"),("code","CONS-0331"),("t","640"),("bar",(28,AMBER)),("badge",("Low",AMBER_T,AMBER_TX))],
      [("strong","Paracetamol 500mg"),("code","PHAR-0088"),("t","120"),("bar",(9,RED)),("badge",("Critical",RED_T,RED_TX))],
      [("strong","Surgical Masks"),("code","CONS-0007"),("t","12,500"),("bar",(95,TEAL)),("badge",("In Stock",GREEN_T,GREEN_TX))],
      [("strong","Insulin Vials"),("code","PHAR-0210"),("t","0"),("bar",(0,RED)),("badge",("Out",SLATE_T,SLATE_TX))],
      [("strong","Gauze Swabs"),("code","CONS-0455"),("t","3,200"),("bar",(58,TEAL)),("badge",("In Stock",GREEN_T,GREEN_TX))],
    ]
    table(c,px,ty,tw,340,"Inventory Overview",cols,colx,rows,TEAL)
    # side: reorder alerts
    ax=px+tw+20; aw=gw-tw-20
    c.card(ax,ty,aw,164,14)
    c.text(ax+22,ty+32,"Reorder Alerts",15,INK,700)
    c.pill(ax+aw-58,ty+18,"53",RED,"#FFFFFF",11,10,22)
    al=[("Paracetamol 500mg","120 / 1,000",RED_T,RED_TX),
        ("IV Cannula 18G","640 / 2,000",AMBER_T,AMBER_TX),
        ("Insulin Vials","0 / 500",RED_T,RED_TX)]
    ry=ty+54
    for name,qty,bg,fg in al:
        c.circle(ax+28,ry+8,4,fg)
        c.text(ax+42,ry+12,name,12,TXT,600)
        c.text(ax+aw-22,ry+12,qty,11.5,MUTED,500,"end")
        ry+=34
    # side: stock by category donut
    donut(c,ax,ty+184,aw,156,"Stock Value by Category",
          [("Pharmaceuticals",46,TEAL),("Consumables",31,"#5EEAD4"),("Lab Reagents",14,SKY),("Other",9,FAINT)],"Total","J$84M")
    c.png("mockups/out/03_stores.png")
    print("stores done")

# =================== 4. DESIGN SYSTEM / STYLE GUIDE ===================
def styleguide():
    c=C(1440,900)
    c.rect(0,0,c.w,c.h,0,CARD)
    c.rect(0,0,c.w,96,0,SIDEBAR)
    c.rect(40,30,38,38,10,INDIGO); icon(c,"box",48,39,"#FFFFFF",18,1.9)
    c.text(90,48,"Proposed Unified Design System",20,"#FFFFFF",700)
    c.text(90,70,"One shared visual language across Assets · Procurement · Stores",12.5,"#94A3B8",500)
    # palette
    c.text(56,150,"COLOR PALETTE",13,INK,700,ls="0.5")
    sw=[("Indigo / Assets",INDIGO),("Violet / Procurement",VIOLET),("Teal / Stores",TEAL),
        ("Success",GREEN),("Warning",AMBER),("Danger",RED),("Info",SKY)]
    x=56
    for name,col in sw:
        c.rect(x,168,150,64,12,col); c.text(x+12,256,name,12,TXT,600); c.text(x+12,274,col,11,MUTED,500,family=MONO)
        x+=176
    neut=[("Ink",INK),("Text",TXT),("Muted",MUTED),("Border",BORDER),("BG",BG),("Card",CARD)]
    x=56
    for name,col in neut:
        c.rect(x,300,150,44,10,col,BORDER,1); c.text(x+12,366,name,12,TXT,600); c.text(x+12,384,col,11,MUTED,500,family=MONO)
        x+=176
    # typography
    c.text(56,440,"TYPOGRAPHY — Inter / system stack",13,INK,700,ls="0.5")
    c.text(56,480,"Display 26 / 700",26,INK,700)
    c.text(56,512,"Heading 20 / 700",20,INK,700)
    c.text(56,540,"Title 15 / 600",15,INK,600)
    c.text(56,566,"Body 13 — clear, legible, professional",13,TXT,400)
    c.text(56,590,"Caption 11 / muted",11,MUTED,500)
    # buttons
    c.text(56,650,"BUTTONS & BADGES",13,INK,700,ls="0.5")
    c.rect(56,668,128,40,10,INDIGO); c.text(120,693,"Primary",13,"#FFFFFF",600,"middle")
    c.rect(196,668,128,40,10,CARD,BORDER,1.4); c.text(260,693,"Secondary",13,TXT,600,"middle")
    c.rect(336,668,128,40,10,GREEN); c.text(400,693,"Success",13,"#FFFFFF",600,"middle")
    c.rect(476,668,128,40,10,CARD,RED,1.4); c.text(540,693,"Danger",13,RED,600,"middle")
    bx=56
    for txt,bg,fg in [("In Service",GREEN_T,GREEN_TX),("Low Stock",AMBER_T,AMBER_TX),("Critical",RED_T,RED_TX),
                      ("Issued",SKY_T,SKY_TX),("Medical",INDIGO_T,INDIGO),("Closed",SLATE_T,SLATE_TX)]:
        bx+=c.pill(bx,732,txt,bg,fg,12,12,26)+12
    # right column: before/after upgrades
    rx=820
    c.rect(rx,150,564,704,16,BG,BORDER,1)
    c.text(rx+28,190,"Key Upgrades vs. Current Design",16,INK,700)
    pairs=[
        ("Emoji icons (🏠 📊 ⚠️)","Consistent SVG line-icon set"),
        ("Orange / purple / green split","Unified neutral system + one accent per module"),
        ("Gradient headers everywhere","Clean white app bar, flat accents"),
        ("Heavy drop shadows on all cards","Subtle 1px borders + soft elevation"),
        ("Plain KPI numbers","KPI cards with trend deltas + sparklines"),
        ("Static, unsortable tables","Zebra rows, status pills, inline data bars"),
        ("alert() pop-ups","Inline toasts & validation states"),
        ("'Inter' named but never loaded","Web font actually loaded for crisp type"),
    ]
    yy=224
    for old,new in pairs:
        c.circle(rx+38,yy+6,4,RED); c.text(rx+54,yy+10,old,12.5,MUTED,500)
        c.path(f"M{rx+44},{yy+26} l0,12",stroke=BORDER,sw=1.4)
        c.circle(rx+38,yy+44,4,GREEN); c.path(f"M{rx+34},{yy+44} l3,3 l5,-6",stroke=GREEN,sw=2)
        c.text(rx+54,yy+48,new,12.5,INK,600)
        yy+=78
    c.png("mockups/out/04_design_system.png")
    print("styleguide done")

asset_dashboard()
procurement()
stores()
styleguide()
print("ALL DONE")
