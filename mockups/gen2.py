#!/usr/bin/env python3
import os, math, traceback
from lib import *

OUT="mockups/pages"; os.makedirs(OUT,exist_ok=True)
A=INDIGO; AT=INDIGO_T            # unified asset-module accent
X=284; W=1128; TOP=92
def page(active,title,crumb,h=1040):
    c=C(1440,h); shell(c,active,title,crumb,A,AT); return c

def card_head(c,x,y,t,sub=None,action=None,aw=None):
    c.text(x+22,y+30,t,15,INK,700)
    if sub: c.text(x+22,y+47,sub,11,MUTED,500)

PAGES=[]
def reg(fn): PAGES.append(fn); return fn

# 1 DASHBOARD
@reg
def p_dashboard():
    c=page("Dashboard","Asset Dashboard","Overview · St. Ann's Bay Regional Hospital")
    kpi_row(c,256,TOP,A,AT,[
        ("Total Assets","4,812","+3.2%",True,"box",INDIGO,INDIGO_T,[5,6,5.5,7,8,7.5,9]),
        ("Total Asset Value","J$1.94B","+5.1%",True,"chart",GREEN,GREEN_T,[4,5,6,5,7,8,9]),
        ("Active Warranties","1,256","-1.4%",False,"check",SKY,SKY_T,[8,7,7.5,6,6,5.5,5]),
        ("Pending Survey","37","+8",True,"alert",AMBER,AMBER_T,[2,3,2.5,4,3.5,5,6])])
    cy=TOP+120; bw=W*0.6
    bar_chart(c,X,cy,bw,290,"Asset Value by Category",["Medical","Furniture","IT","Vehicles","Applnce","Indust","Other"],[420,180,260,310,140,90,70],INDIGO,INDIGO_L,sub="Fiscal year 2025/26 · J$ millions")
    donut(c,X+bw+20,cy,W-bw-20,290,"Distribution",[("Medical",38,INDIGO),("Furniture",24,INDIGO_L),("IT/Tech",18,SKY),("Vehicles",12,GREEN),("Other",8,FAINT)],"Total","4,812")
    ty=cy+310
    table(c,X,ty,W,300,"Recent Asset Activity",["ASSET CODE","DESCRIPTION","CATEGORY","LOCATION","VALUE","STATUS"],[24,150,360,500,650,770],[
        [("code","SABRH-MED-0481"),("strong","Philips MX450 Monitor"),("badge",("Medical",INDIGO_T,INDIGO)),("t","ICU Ward A"),("strong","J$1,240,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-FUR-1180"),("strong","Adjustable Hospital Bed"),("badge",("Furniture",AMBER_T,AMBER_TX)),("t","Ward B-3"),("strong","J$385,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-ITX-0912"),("strong","Dell OptiPlex Workstation"),("badge",("IT/Tech",SKY_T,SKY_TX)),("t","Records Office"),("strong","J$210,000"),("badge",("Maintenance",AMBER_T,AMBER_TX))],
        [("code","SABRH-VEH-0033"),("strong","Toyota Hiace Ambulance"),("badge",("Vehicle",GREEN_T,GREEN_TX)),("t","Transport Bay"),("strong","J$6,800,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-MED-0500"),("strong","GE Vivid Ultrasound"),("badge",("Medical",INDIGO_T,INDIGO)),("t","Radiology"),("strong","J$3,150,000"),("badge",("Board of Survey",RED_T,RED_TX))],
    ],A,sub="Latest additions, transfers and status changes")
    return c,"01_dashboard"

# 2 MONTHLY BREAKDOWN
@reg
def p_monthly():
    c=page("Monthly Breakdown","Monthly Breakdown","Fiscal Year 2025/26 · asset additions by month")
    kpi_row(c,256,TOP,A,AT,[
        ("FY Additions","J$214M","+5.1%",True,"chart",INDIGO,INDIGO_T,[3,4,5,6,7,8,9]),
        ("Peak Month","March","",True,"calendar",GREEN,GREEN_T,None),
        ("Avg / Month","J$17.8M","+2%",True,"coins",SKY,SKY_T,[4,5,4,6,5,7,6]),
        ("Items Added","612","+34",True,"box",AMBER,AMBER_T,[2,4,3,5,6,5,7])])
    cy=TOP+120
    line_chart(c,X,cy,W,250,"Monthly Acquisition Value",["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"],
               [("Value J$m",INDIGO,[12,15,11,18,14,20,17,22,16,19,24,26])],sub="Apr 2025 – Mar 2026")
    gy=cy+270
    months=["April","May","June","July","Aug","Sept","Oct","Nov","Dec","Jan","Feb","March"]
    vals=[12,15,11,18,14,20,17,22,16,19,24,26]; qty=[40,55,38,61,49,70,58,72,52,63,80,88]
    cw=(W-3*16)/4; ch=110
    for i,m in enumerate(months):
        r=i//4; col=i%4; cx=X+col*(cw+16); cyy=gy+r*(ch+16)
        c.card(cx,cyy,cw,ch,12)
        c.rect(cx,cyy,4,ch,2,INDIGO)
        c.text(cx+18,cyy+28,m,13,INK,700); c.text(cx+18,cyy+46,"FY 2025/26",10,MUTED,500)
        c.text(cx+18,cyy+74,f"J${vals[i]}.0M",18,INDIGO,700); c.text(cx+18,cyy+92,f"{qty[i]} items added",11,MUTED,500)
        c.rect(cx+cw-58,cyy+18,40,22,8,INDIGO_T); c.text(cx+cw-38,cyy+33,f"+{qty[i]}",11,INDIGO,700,"middle")
    return c,"02_monthly_breakdown"

# 3 FISCAL YEAR REPORT
@reg
def p_fiscal():
    c=page("Fiscal Year Report","Fiscal Year Report","FY 2025/26 · statutory asset movement summary")
    # action buttons top-right
    c.pill(c.w-250,30,"Export PDF",A,"#FFFFFF",12,14,28); c.rect(c.w-130,30,96,28,8,CARD,BORDER,1.3); c.text(c.w-82,49,"Print",12,TXT,600,"middle"); icon(c,"report",c.w-118,34,MUTED,16,1.6)
    kpi_row(c,256,TOP,A,AT,[
        ("Opening NBV","J$1.78B","",True,"coins",SKY,SKY_T,None),
        ("Additions","+J$214M","+5.1%",True,"import",GREEN,GREEN_T,[3,4,5,6,7,8,9]),
        ("Disposals","-J$54M","",False,"trash",RED,RED_T,None),
        ("Closing NBV","J$1.94B","+9%",True,"check",INDIGO,INDIGO_T,[4,5,6,6,7,8,9])])
    cy=TOP+120; lw=W*0.55
    line_chart(c,X,cy,lw,260,"Net Book Value by Quarter",["Q1","Q2","Q3","Q4"],
               [("Gross",SKY,[1850,1910,1980,2040]),("NBV",INDIGO,[1780,1820,1880,1940])],sub="J$ millions")
    donut(c,X+lw+20,cy,W-lw-20,260,"Value by Class",[("Medical",41,INDIGO),("Vehicles",19,GREEN),("IT",16,SKY),("Furniture",14,INDIGO_L),("Other",10,FAINT)],"Total","J$1.94B")
    ty=cy+280
    table(c,X,ty,W,300,"Movement Summary by Asset Class",["ASSET CLASS","OPENING","ADDITIONS","DISPOSALS","DEPRECIATION","CLOSING NBV"],[24,200,340,470,610,800],[
        [("strong","Medical Equipment"),("t","J$720M"),("t","+J$96M"),("t","-J$18M"),("mut","-J$42M"),("strong","J$756M")],
        [("strong","Vehicles"),("t","J$340M"),("t","+J$28M"),("t","-J$22M"),("mut","-J$26M"),("strong","J$320M")],
        [("strong","IT & Technology"),("t","J$260M"),("t","+J$44M"),("t","-J$6M"),("mut","-J$18M"),("strong","J$280M")],
        [("strong","Furniture & Fittings"),("t","J$240M"),("t","+J$30M"),("t","-J$5M"),("mut","-J$12M"),("strong","J$253M")],
        [("strong","Other Assets"),("t","J$220M"),("t","+J$16M"),("t","-J$3M"),("mut","-J$8M"),("strong","J$225M")],
    ],A,action=None)
    return c,"03_fiscal_year_report"

# 4 ANALYTICS (NEW)
@reg
def p_analytics():
    c=page("Analytics & Insights","Analytics & Insights","Portfolio intelligence · NEW")
    # insight callouts
    ins=[("Medical equipment value up 12% YoY","Driven by ICU monitor refresh",GREEN_T,GREEN_TX,"chart"),
         ("18 assets past useful life","Consider Board of Survey review",AMBER_T,AMBER_TX,"alert"),
         ("Radiology = highest value/dept","J$412M across 96 assets",SKY_T,SKY_TX,"building")]
    iw=(W-2*16)/3
    for i,(t,s,bg,tx,ic) in enumerate(ins):
        ix=X+i*(iw+16); c.card(ix,TOP,iw,84,12); c.rect(ix,TOP,4,84,2,tx)
        c.rect(ix+16,TOP+18,34,34,9,bg); icon(c,ic,ix+24,TOP+26,tx,16,1.8)
        c.text(ix+60,TOP+34,t,12.5,INK,700); c.text(ix+60,TOP+54,s,11,MUTED,500)
    cy=TOP+104; hw=(W-20)/2
    line_chart(c,X,cy,hw,250,"Portfolio Value Trend",["'21","'22","'23","'24","'25","'26"],
               [("Value",INDIGO,[1.2,1.35,1.5,1.62,1.78,1.94])],sub="J$ billions, last 6 years")
    bar_chart(c,X+hw+20,cy,hw,250,"Asset Age Profile",["0-2y","3-5y","6-8y","9-11y","12y+"],[1240,1580,920,640,432],GREEN,sub="Count of assets by age band")
    cy2=cy+270
    bar_chart(c,X,cy2,hw,250,"Value by Department",["Radiol","ICU","Surgery","Lab","Wards","Admin"],[412,360,280,210,180,90],SKY,sub="J$ millions")
    donut(c,X+hw+20,cy2,hw,250,"Condition Mix",[("Good",62,GREEN),("Fair",24,AMBER),("Poor",9,RED),("Unrated",5,FAINT)],"Assets","4,812")
    return c,"04_analytics_insights"

# 5 ASSET REGISTER
@reg
def p_register():
    c=page("Asset Register","Asset Register","Complete ledger · 4,812 assets")
    filter_bar(c,X,TOP,W,A,["Category","Location","Status","FY Acquired"])
    ty=TOP+72
    rows=[
        [("code","SABRH-MED-0481"),("strong","Philips MX450 Monitor"),("badge",("Medical",INDIGO_T,INDIGO)),("t","ICU Ward A"),("t","2024"),("strong","J$1,240,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-MED-0500"),("strong","GE Vivid Ultrasound"),("badge",("Medical",INDIGO_T,INDIGO)),("t","Radiology"),("t","2021"),("strong","J$3,150,000"),("badge",("Survey",RED_T,RED_TX))],
        [("code","SABRH-FUR-1180"),("strong","Adjustable Hospital Bed"),("badge",("Furniture",AMBER_T,AMBER_TX)),("t","Ward B-3"),("t","2023"),("strong","J$385,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-ITX-0912"),("strong","Dell OptiPlex Workstation"),("badge",("IT/Tech",SKY_T,SKY_TX)),("t","Records"),("t","2022"),("strong","J$210,000"),("badge",("Maintenance",AMBER_T,AMBER_TX))],
        [("code","SABRH-VEH-0033"),("strong","Toyota Hiace Ambulance"),("badge",("Vehicle",GREEN_T,GREEN_TX)),("t","Transport"),("t","2020"),("strong","J$6,800,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-MED-0612"),("strong","Defibrillator ZOLL R"),("badge",("Medical",INDIGO_T,INDIGO)),("t","ER Bay 2"),("t","2024"),("strong","J$540,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-APP-0220"),("strong","Vaccine Refrigerator"),("badge",("Applnce",VIOLET_T,VIOLET)),("t","Pharmacy"),("t","2023"),("strong","J$420,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
        [("code","SABRH-ITX-0944"),("strong","Network Switch 48-port"),("badge",("IT/Tech",SKY_T,SKY_TX)),("t","Server Room"),("t","2025"),("strong","J$190,000"),("badge",("In Service",GREEN_T,GREEN_TX))],
    ]
    table(c,X,ty,W,560,"All Assets",["ASSET CODE","DESCRIPTION","CATEGORY","LOCATION","FY","VALUE","STATUS"],[24,150,360,500,610,690,830],rows,A,action="Export")
    # pagination
    py=ty+540; c.text(X+22,py,"Showing 1–8 of 4,812",11.5,MUTED,500)
    for i,lbl in enumerate(["‹","1","2","3","4","›"]):
        bx=X+W-220+i*36; act=(lbl=="1")
        c.rect(bx,py-16,30,26,7,(A if act else CARD),(None if act else BORDER),1); c.text(bx+15,py+2,lbl,12,("#FFFFFF" if act else TXT),600,"middle")
    return c,"05_asset_register"

# 6 COST CATALOG
@reg
def p_catalog():
    c=page("Cost Catalog","Cost Catalog","Reference pricing database · 1,340 items")
    kpi_row(c,256,TOP,A,AT,[
        ("Catalog Items","1,340","+22",True,"catalog",INDIGO,INDIGO_T,[4,5,6,6,7,8,9]),
        ("Categories","18","",True,"box",SKY,SKY_T,None),
        ("Avg Unit Cost","J$248K","+1.2%",True,"coins",GREEN,GREEN_T,[5,5,6,6,7,7,8]),
        ("Last Updated","Today","",True,"clock",AMBER,AMBER_T,None)])
    ty=TOP+120
    table(c,X,ty,W,460,"Reference Price List",["CATALOG CODE","ITEM DESCRIPTION","CATEGORY","UNIT COST","SUPPLIER","UPDATED"],[24,170,440,580,720,940],[
        [("code","CAT-MED-1001"),("strong","Patient Monitor, Multipara"),("badge",("Medical",INDIGO_T,INDIGO)),("strong","J$1,180,000"),("t","Philips"),("mut","2026-06-10")],
        [("code","CAT-MED-1044"),("strong","Ultrasound Scanner, Portable"),("badge",("Medical",INDIGO_T,INDIGO)),("strong","J$2,950,000"),("t","GE Health"),("mut","2026-05-28")],
        [("code","CAT-FUR-2010"),("strong","Hospital Bed, Electric 3-fn"),("badge",("Furniture",AMBER_T,AMBER_TX)),("strong","J$372,000"),("t","Hill-Rom"),("mut","2026-06-02")],
        [("code","CAT-ITX-3007"),("strong","Desktop Workstation i5"),("badge",("IT/Tech",SKY_T,SKY_TX)),("strong","J$205,000"),("t","Dell"),("mut","2026-06-12")],
        [("code","CAT-APP-4002"),("strong","Vaccine Refrigerator 200L"),("badge",("Applnce",VIOLET_T,VIOLET)),("strong","J$410,000"),("t","Haier"),("mut","2026-04-19")],
        [("code","CAT-VEH-5001"),("strong","Ambulance, Type B"),("badge",("Vehicle",GREEN_T,GREEN_TX)),("strong","J$6,750,000"),("t","Toyota"),("mut","2026-03-30")],
    ],A,action="+ Add Item")
    return c,"06_cost_catalog"

# 7 ASSET LOOKUP
@reg
def p_lookup():
    c=page("Asset Lookup","Asset Code Lookup","Scan or search any asset code")
    # big search
    sw=W; c.card(X,TOP,sw,90,14)
    c.rect(X+24,TOP+26,sw-260,40,10,BG,BORDER,1.4); icon(c,"search",X+38,TOP+38,FAINT,18,1.8)
    c.text(X+66,TOP+51,"SABRH-MED-0481",14,INK,600,family=MONO)
    c.pill(X+sw-220,TOP+28,"Search",A,"#FFFFFF",13,18,36)
    c.rect(X+sw-150,TOP+28,40,36,9,CARD,BORDER,1.3); icon(c,"qr",X+sw-142,TOP+34,MUTED,18,1.8)
    # result card
    ry=TOP+114; rw=W*0.62
    c.card(X,ry,rw,360,14)
    c.pill(X+22,ry+22,"Match found",GREEN_T,GREEN_TX,11,12,24)
    c.text(X+22,ry+76,"Philips MX450 Patient Monitor",19,INK,700)
    c.text(X+22,ry+98,"SABRH-MED-0481",13,A,700,family=MONO)
    fields=[("Category","Medical Equipment"),("Location","ICU Ward A"),("Acquired","12 Mar 2024"),
            ("Current Value","J$1,240,000"),("Warranty","Valid to Mar 2027"),("Condition","Good")]
    fy=ry+130
    for i,(k,v) in enumerate(fields):
        col=i%2; r=i//2; fx=X+22+col*((rw-44)/2); fyy=fy+r*56
        c.text(fx,fyy,k.upper(),9.5,FAINT,700,ls="0.4"); c.text(fx,fyy+20,v,13.5,INK,600)
    c.pill(X+22,ry+318,"View 360 Profile",A,"#FFFFFF",12,16,28)
    c.rect(X+186,ry+318,76,28,14,CARD,BORDER,1.3); c.text(X+224,ry+337,"Edit",12,TXT,600,"middle")
    # QR side card
    qx=X+rw+20; qw=W-rw-20
    c.card(qx,ry,qw,360,14); c.text(qx+22,ry+34,"Asset QR / Barcode",14,INK,700)
    qs=160; qcx=qx+qw/2-qs/2; qcy=ry+70
    c.rect(qcx,qcy,qs,qs,10,CARD,BORDER,1.4)
    # fake QR grid
    import random; random.seed(7)
    for gy in range(8):
        for gx in range(8):
            if random.random()>0.45: c.rect(qcx+14+gx*16.5,qcy+14+gy*16.5,15,15,2,INK)
    c.text(qx+qw/2,ry+260,"SABRH-MED-0481",13,INK,700,"middle",family=MONO)
    c.pill(qx+22,ry+288,"Print Label",A,"#FFFFFF",12,16,28);
    c.rect(qx+150,ry+288,qw-172,28,14,CARD,BORDER,1.3); c.text(qx+150+(qw-172)/2,ry+306,"Download PNG",12,TXT,600,"middle")
    return c,"07_asset_lookup"

# 8 ASSET 360 (NEW)
@reg
def p_profile():
    c=page("Asset 360 Profile","Asset 360 Profile","SABRH-MED-0481 · NEW")
    # hero
    hw=W; c.card(X,TOP,hw,150,14)
    c.rect(X+22,TOP+22,150,106,12,BG,BORDER,1); icon(c,"box",X+82,TOP+62,FAINT,28,1.6); c.text(X+97,TOP+118,"Photo",10,FAINT,500,"middle")
    c.text(X+190,TOP+44,"Philips MX450 Patient Monitor",20,INK,700)
    c.text(X+190,TOP+66,"SABRH-MED-0481",13,A,700,family=MONO)
    c.pill(X+190,TOP+82,"In Service",GREEN_T,GREEN_TX,11,11,22); c.pill(X+285,TOP+82,"Medical",INDIGO_T,INDIGO,11,11,22); c.pill(X+370,TOP+82,"ICU Ward A",SKY_T,SKY_TX,11,11,22)
    c.text(X+190,TOP+126,"Acquired 12 Mar 2024  ·  Supplier: Philips  ·  PO-2024-0188",11.5,MUTED,500)
    # qr
    c.rect(X+hw-130,TOP+22,106,106,10,CARD,BORDER,1.2)
    import random; random.seed(3)
    for gy in range(7):
        for gx in range(7):
            if random.random()>0.45: c.rect(X+hw-122+gx*13.5,TOP+30+gy*13.5,12,12,1.5,INK)
    # tabs
    tabs=["Overview","Maintenance","Documents","History","Depreciation"]
    tyy=TOP+170; tx=X
    for i,t in enumerate(tabs):
        tw=len(t)*7.4+34; act=i==0
        c.text(tx+tw/2,tyy+18,t,12.5,(A if act else MUTED),(700 if act else 500),"middle")
        if act: c.rect(tx,tyy+30,tw,3,2,A)
        tx+=tw+8
    c.line(X,tyy+33,X+W,tyy+33,BORDER,1)
    # left: spec grid + timeline ; right widgets
    by=tyy+50; lw=W*0.58
    c.card(X,by,lw,400,14); c.text(X+22,by+30,"Specifications",15,INK,700)
    specs=[("Manufacturer","Philips"),("Model","IntelliVue MX450"),("Serial No.","CN-44820193"),
           ("Category","Medical Equipment"),("Useful Life","8 years"),("Acquisition Cost","J$1,400,000"),
           ("Department","Intensive Care"),("Funding Source","Capital Grant 2024")]
    sy=by+58
    for i,(k,v) in enumerate(specs):
        col=i%2; r=i//2; fx=X+22+col*((lw-44)/2); fyy=sy+r*46
        c.text(fx,fyy,k.upper(),9,FAINT,700,ls="0.4"); c.text(fx,fyy+18,v,13,INK,600)
    # lifecycle timeline
    c.line(X+22,sy+200,X+lw-22,sy+200,BORDER,1)
    c.text(X+22,sy+232,"Lifecycle",13,INK,700)
    tl=[("Acquired","Mar 2024",GREEN),("Commissioned","Apr 2024",GREEN),("Service x3","2024-25",SKY),("Now: In Service","Jun 2026",A),("Survey due","2032",FAINT)]
    seg=(lw-80)/(len(tl)-1); lx=X+40; lyy=sy+270
    for i in range(len(tl)-1): c.line(lx+i*seg,lyy,lx+(i+1)*seg,lyy,(tl[i][2] if tl[i][2]!=FAINT else BORDER),3)
    for i,(t,d,col) in enumerate(tl):
        cx=lx+i*seg; c.circle(cx,lyy,7,col); c.text(cx,lyy+24,t,9.5,INK,600,"middle"); c.text(cx,lyy+38,d,9,MUTED,500,"middle")
    # right widgets
    rx=X+lw+20; rw=W-lw-20
    c.card(rx,by,rw,128,14); c.text(rx+22,by+30,"Warranty",14,INK,700)
    # ring
    rcx=rx+58; rcy=by+86; rr=34
    c.circle(rcx,rcy,rr,"none",BORDER,7); c.path(f"M{rcx},{rcy-rr} A{rr},{rr} 0 1 1 {rcx-0.1},{rcy-rr}",stroke=GREEN,sw=7)
    c.text(rcx,rcy+5,"68%",15,INK,700,"middle")
    c.text(rx+108,by+72,"Valid",12,MUTED,500); c.text(rx+108,by+92,"9 months left",14,GREEN_TX,700); c.text(rx+108,by+110,"Expires Mar 2027",11,MUTED,500)
    c.card(rx,by+148,rw,128,14); c.text(rx+22,by+178,"Net Book Value",14,INK,700)
    c.text(rx+22,by+214,"J$1,015,000",20,INK,700); c.text(rx+22,by+234,"Depreciated 27.5%",11.5,MUTED,500)
    c.rect(rx+22,by+248,rw-44,8,4,BORDER); c.rect(rx+22,by+248,(rw-44)*0.275,8,4,A)
    c.card(rx,by+296,rw,104,14); c.text(rx+22,by+326,"Open Actions",14,INK,700)
    c.pill(rx+22,by+344,"Calibration due in 14 days",AMBER_T,AMBER_TX,11,11,22)
    c.pill(rx+22,by+372,"2 documents missing",RED_T,RED_TX,11,11,22)
    return c,"08_asset_360_profile"

# 9 MAINTENANCE (NEW)
@reg
def p_maintenance():
    c=page("Maintenance","Maintenance & Service","Preventive maintenance & work orders · NEW")
    kpi_row(c,256,TOP,A,AT,[
        ("Due This Week","9","+3",True,"wrench",AMBER,AMBER_T,[2,3,4,3,5,4,6]),
        ("Overdue","4","",False,"alert",RED,RED_T,None),
        ("Completed MTD","37","+12",True,"check",GREEN,GREEN_T,[3,4,5,6,7,8,9]),
        ("Equipment Uptime","98.2%","+0.4%",True,"chart",SKY,SKY_T,[7,7,8,8,9,9,9])])
    ty=TOP+120; lw=W*0.62
    table(c,X,ty,lw,400,"Upcoming Maintenance",["ASSET","TYPE","DUE","ASSIGNEE","STATUS"],[24,210,330,440,560],[
        [("strong","MX450 Monitor"),("badge",("Calibration",SKY_T,SKY_TX)),("t","19 Jun"),("t","K. Brown"),("badge",("Scheduled",SKY_T,SKY_TX))],
        [("strong","Ultrasound GE"),("badge",("Inspection",VIOLET_T,VIOLET)),("t","17 Jun"),("t","K. Brown"),("badge",("Overdue",RED_T,RED_TX))],
        [("strong","Vaccine Fridge"),("badge",("Service",AMBER_T,AMBER_TX)),("t","21 Jun"),("t","R. Allen"),("badge",("Scheduled",SKY_T,SKY_TX))],
        [("strong","Ambulance #33"),("badge",("Service",AMBER_T,AMBER_TX)),("t","24 Jun"),("t","Fleet Dept"),("badge",("Scheduled",SKY_T,SKY_TX))],
        [("strong","Defibrillator"),("badge",("Calibration",SKY_T,SKY_TX)),("t","15 Jun"),("t","K. Brown"),("badge",("In Progress",AMBER_T,AMBER_TX))],
        [("strong","Autoclave Unit"),("badge",("Inspection",VIOLET_T,VIOLET)),("t","28 Jun"),("t","Biomed"),("badge",("Scheduled",SKY_T,SKY_TX))],
    ],A,action="+ Work Order")
    rx=X+lw+20; rw=W-lw-20
    c.card(rx,ty,rw,190,14); c.text(rx+22,ty+30,"This Week",14,INK,700)
    days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; cnt=[2,1,3,0,2,1,0]
    dw=(rw-44)/7
    for i,d in enumerate(days):
        dx=rx+22+i*dw; c.text(dx+dw/2,ty+58,d,10,MUTED,600,"middle")
        bh=cnt[i]*22+4; c.rect(dx+6,ty+150-bh,dw-12,bh,5,(A if cnt[i] else BORDER))
        if cnt[i]: c.text(dx+dw/2,ty+148-bh-4,str(cnt[i]),10,INK,700,"middle")
    c.card(rx,ty+210,rw,190,14); c.text(rx+22,ty+240,"Service Alerts",14,INK,700)
    al=[("Ultrasound GE","Overdue 2 days",RED_TX),("Defib battery","Replace soon",AMBER_TX),("Monitor x4","Calibration window",SKY_TX)]
    ay=ty+272
    for n,s,col in al:
        c.circle(rx+28,ay+8,4,col); c.text(rx+42,ay+12,n,12,INK,600); c.text(rx+rw-22,ay+12,s,11,MUTED,500,"end"); ay+=38
    return c,"09_maintenance"

# 10 BOARD OF SURVEY
@reg
def p_survey():
    c=page("Board of Survey","Board of Survey","Asset condition review & write-off recommendations")
    kpi_row(c,256,TOP,A,AT,[
        ("Pending Review","37","+8",True,"survey",AMBER,AMBER_T,[3,4,5,4,6,5,7]),
        ("Approved","124","",True,"check",GREEN,GREEN_T,None),
        ("Value at Risk","J$54M","",False,"coins",RED,RED_T,None),
        ("This FY","161","+19",True,"calendar",INDIGO,INDIGO_T,[4,5,6,7,7,8,9])])
    ty=TOP+120
    table(c,X,ty,W,560,"Survey Queue",["ASSET CODE","DESCRIPTION","CONDITION","REASON","NBV","DECISION"],[24,170,420,560,720,850],[
        [("code","SABRH-MED-0500"),("strong","GE Vivid Ultrasound"),("badge",("Poor",RED_T,RED_TX)),("t","Beyond repair"),("strong","J$3.15M"),("badge",("Approve",GREEN_T,GREEN_TX))],
        [("code","SABRH-ITX-0210"),("strong","HP LaserJet Printer"),("badge",("Poor",RED_T,RED_TX)),("t","Obsolete"),("strong","J$12K"),("badge",("Approve",GREEN_T,GREEN_TX))],
        [("code","SABRH-FUR-0455"),("strong","Office Chairs x14"),("badge",("Fair",AMBER_T,AMBER_TX)),("t","Wear & tear"),("strong","J$84K"),("badge",("Review",AMBER_T,AMBER_TX))],
        [("code","SABRH-VEH-0011"),("strong","Service Van (2009)"),("badge",("Poor",RED_T,RED_TX)),("t","Uneconomic"),("strong","J$180K"),("badge",("Approve",GREEN_T,GREEN_TX))],
        [("code","SABRH-MED-0331"),("strong","Infusion Pump x6"),("badge",("Fair",AMBER_T,AMBER_TX)),("t","Recalled"),("strong","J$420K"),("badge",("Reject",RED_T,RED_TX))],
        [("code","SABRH-APP-0102"),("strong","Ward AC Units x3"),("badge",("Poor",RED_T,RED_TX)),("t","Non-functional"),("strong","J$210K"),("badge",("Approve",GREEN_T,GREEN_TX))],
        [("code","SABRH-ITX-0588"),("strong","Desktop PCs x9"),("badge",("Fair",AMBER_T,AMBER_TX)),("t","End of life"),("strong","J$160K"),("badge",("Review",AMBER_T,AMBER_TX))],
        [("code","SABRH-FUR-0890"),("strong","Filing Cabinets x8"),("badge",("Poor",RED_T,RED_TX)),("t","Damaged"),("strong","J$48K"),("badge",("Approve",GREEN_T,GREEN_TX))],
    ],A,action="Export")
    return c,"10_board_of_survey"

# 11 ASSET DISPOSAL
@reg
def p_disposal():
    c=page("Asset Disposal","Asset Disposal","Approved write-offs & disposal records")
    kpi_row(c,256,TOP,A,AT,[
        ("Disposed YTD","124","+19",True,"trash",INDIGO,INDIGO_T,[3,4,5,6,7,8,9]),
        ("Write-off Value","J$54M","",False,"coins",RED,RED_T,None),
        ("Pending Approval","11","",False,"clock",AMBER,AMBER_T,None),
        ("Recovered (Sale)","J$3.2M","+8%",True,"check",GREEN,GREEN_T,[2,3,3,4,5,6,7])])
    ty=TOP+120; lw=W*0.64
    table(c,X,ty,lw,400,"Disposal Records",["CODE","ASSET","METHOD","NBV","DATE","STATUS"],[24,130,330,450,560,690],[
        [("code","MED-0500"),("strong","GE Ultrasound"),("badge",("Scrapped",SLATE_T,SLATE_TX)),("strong","J$3.15M"),("mut","12 Jun"),("badge",("Complete",GREEN_T,GREEN_TX))],
        [("code","VEH-0011"),("strong","Service Van"),("badge",("Auctioned",SKY_T,SKY_TX)),("strong","J$180K"),("mut","08 Jun"),("badge",("Complete",GREEN_T,GREEN_TX))],
        [("code","ITX-0210"),("strong","HP Printer"),("badge",("Recycled",GREEN_T,GREEN_TX)),("strong","J$12K"),("mut","04 Jun"),("badge",("Complete",GREEN_T,GREEN_TX))],
        [("code","APP-0102"),("strong","AC Units x3"),("badge",("Scrapped",SLATE_T,SLATE_TX)),("strong","J$210K"),("mut","02 Jun"),("badge",("Pending",AMBER_T,AMBER_TX))],
        [("code","FUR-0890"),("strong","Filing Cabinets"),("badge",("Donated",VIOLET_T,VIOLET)),("strong","J$48K"),("mut","28 May"),("badge",("Pending",AMBER_T,AMBER_TX))],
    ],A,action="+ Record")
    rx=X+lw+20; rw=W-lw-20
    donut(c,rx,ty,rw,400,"Disposal Method",[("Scrapped",44,SLATE_TX),("Auctioned",26,SKY),("Recycled",18,GREEN),("Donated",12,VIOLET)],"Items","124")
    return c,"11_asset_disposal"

# 12 AUDIT / SCAN MODE (NEW)
@reg
def p_scan():
    c=page("Audit / Scan Mode","Audit / Scan Mode","Physical verification walk-around · NEW")
    kpi_row(c,256,TOP,A,AT,[
        ("Session Scanned","148","",True,"scan",INDIGO,INDIGO_T,[2,4,5,6,7,8,9]),
        ("Verified Present","139","",True,"check",GREEN,GREEN_T,None),
        ("Flagged Missing","6","",False,"alert",RED,RED_T,None),
        ("Location","ICU Ward A","",True,"pin",SKY,SKY_T,None)])
    ty=TOP+120
    # phone frame center-left
    pw=300; ph=400; px=X+40;
    c.shadow(px,ty,pw,ph,28); c.rect(px,ty,pw,ph,28,INK)
    c.rect(px+12,ty+12,pw-24,ph-24,20,"#0B1220")
    # camera viewfinder
    vfy=ty+30
    icon(c,"scan",px+pw/2-30,vfy+30,"#475569",60,1.6)
    # scan frame corners
    fx=px+40; fy=vfy+20; fw=pw-80; fh=140
    for cx,cy,hx,hy in [(fx,fy,22,22),(fx+fw,fy,-22,22),(fx,fy+fh,22,-22),(fx+fw,fy+fh,-22,-22)]:
        c.line(cx,cy,cx+hx,cy,A,3); c.line(cx,cy,cx,cy+hy,A,3)
    c.line(fx,fy+fh/2,fx+fw,fy+fh/2,A,2,op=0.7)
    # matched card inside phone
    my=fy+fh+24
    c.rect(px+24,my,pw-48,120,14,CARD)
    c.text(px+40,my+28,"SABRH-MED-0481",12,A,700,family=MONO)
    c.pill(px+pw-120,my+14,"Matched",GREEN_T,GREEN_TX,10,9,20)
    c.text(px+40,my+50,"Philips MX450 Monitor",13,INK,700)
    c.text(px+40,my+68,"Expected: ICU Ward A",11,MUTED,500)
    c.pill(px+40,my+82,"Confirm Present",GREEN,"#FFFFFF",11,14,26);
    c.rect(px+182,my+82,80,26,13,CARD,RED,1.3); c.text(px+222,my+99,"Flag",11,RED,700,"middle")
    # right: progress + recent scans
    rx=px+pw+50; rw=X+W-rx
    c.card(rx,ty,rw,150,14); c.text(rx+22,ty+30,"Audit Progress — ICU Ward A",15,INK,700)
    c.text(rx+22,ty+58,"148 of 162 assets accounted for",12,MUTED,500)
    c.rect(rx+22,ty+74,rw-44,14,7,BORDER); c.rect(rx+22,ty+74,(rw-44)*148/162,14,7,GREEN)
    c.text(rx+22,ty+112,"91% complete",13,GREEN_TX,700)
    c.pill(rx+rw-170,ty+100,"Finish & Report",A,"#FFFFFF",12,16,28)
    table(c,rx,ty+170,rw,230,"Recent Scans",["TIME","ASSET","RESULT"],[24,110,330],[
        [("mut","10:42"),("strong","MX450 Monitor"),("badge",("Present",GREEN_T,GREEN_TX))],
        [("mut","10:41"),("strong","Infusion Pump"),("badge",("Present",GREEN_T,GREEN_TX))],
        [("mut","10:39"),("strong","Vital Signs Cart"),("badge",("Missing",RED_T,RED_TX))],
        [("mut","10:37"),("strong","Suction Unit"),("badge",("Present",GREEN_T,GREEN_TX))],
    ],A,action=None)
    return c,"12_audit_scan_mode"

# 13 DEPRECIATION (NEW)
@reg
def p_depreciation():
    c=page("Depreciation","Depreciation & Net Book Value","Automated schedules · NEW")
    kpi_row(c,256,TOP,A,AT,[
        ("Gross Value","J$2.68B","",True,"coins",SKY,SKY_T,None),
        ("Accum. Depreciation","J$740M","",False,"chart",AMBER,AMBER_T,None),
        ("Net Book Value","J$1.94B","",True,"check",INDIGO,INDIGO_T,[9,8,7,7,6,6,5]),
        ("Depreciation FY","J$118M","+4%",False,"calendar",RED,RED_T,[3,4,5,5,6,7,8])])
    # method chips
    my=TOP+120
    c.text(X,my+4,"Method:",12,MUTED,600)
    for i,m in enumerate(["Straight-Line","Reducing Balance","Units of Production"]):
        tw=len(m)*6.8+28; mx=X+72+i*(tw+10); act=i==0
        c.rect(mx,my-14,tw,28,14,(A if act else CARD),(None if act else BORDER),1.3); c.text(mx+tw/2,my+4,m,11.5,("#FFFFFF" if act else TXT),600,"middle")
    cy=my+30; lw=W*0.55
    line_chart(c,X,cy,lw,270,"Net Book Value Projection",["'24","'25","'26","'27","'28","'29","'30","'31"],
               [("NBV",INDIGO,[1400,1230,1015,840,690,560,440,330])],sub="Sample asset · MX450 Monitor, J$'000")
    table(c,X+lw+20,cy,W-lw-20,270,"Schedule",["YEAR","OPENING","DEP.","CLOSING NBV"],[20,90,200,300],[
        [("t","2024"),("t","1,400"),("mut","170"),("strong","1,230")],
        [("t","2025"),("t","1,230"),("mut","215"),("strong","1,015")],
        [("t","2026"),("t","1,015"),("mut","175"),("strong","840")],
        [("t","2027"),("t","840"),("mut","150"),("strong","690")],
        [("t","2028"),("t","690"),("mut","130"),("strong","560")],
    ],A,action=None)
    ty=cy+290
    table(c,X,ty,W,200,"Depreciation by Asset Class (FY 2025/26)",["ASSET CLASS","GROSS","RATE","ACCUM. DEP","NBV"],[24,260,440,560,760],[
        [("strong","Medical Equipment"),("t","J$1.02B"),("badge",("12.5%",INDIGO_T,INDIGO)),("mut","J$264M"),("strong","J$756M")],
        [("strong","Vehicles"),("t","J$520M"),("badge",("20%",AMBER_T,AMBER_TX)),("mut","J$200M"),("strong","J$320M")],
        [("strong","IT & Technology"),("t","J$410M"),("badge",("33%",RED_T,RED_TX)),("mut","J$130M"),("strong","J$280M")],
    ],A,action=None)
    return c,"13_depreciation"

# 14 IMPORT ASSETS
@reg
def p_import():
    c=page("Import Assets","Import Assets","Bulk upload from Excel / CSV")
    wizard(c,X,TOP,W,A,["Upload","Map Columns","Validate","Import"],1)
    dy=TOP+88; dw=W*0.5
    dropzone(c,X,dy,dw,250,A,AT,"Drag & drop your file","XLSX or CSV, up to 10 MB")
    # mapping preview
    mx=X+dw+20; mw=W-dw-20
    c.card(mx,dy,mw,250,14); c.text(mx+22,dy+30,"Column Mapping",15,INK,700)
    maps=[("Column A","Asset Code"),("Column B","Description"),("Column C","Category"),("Column D","Location"),("Column E","Acquisition Cost")]
    yy=dy+58
    for src,dst in maps:
        c.rect(mx+22,yy,150,30,7,BG,BORDER,1); c.text(mx+34,yy+20,src,12,MUTED,500)
        c.path(f"M{mx+182},{yy+15} l16,0 M{mx+194},{yy+10} l5,5 l-5,5",stroke=A,sw=1.8)
        c.rect(mx+210,yy,mw-232,30,7,CARD,A,1.3); c.text(mx+224,yy+20,dst,12,INK,600); icon(c,"check",mx+mw-44,yy+7,GREEN,16,1.8)
        yy+=38
    # preview table
    ty=dy+270
    table(c,X,ty,W,250,"Preview — 612 rows ready",["ASSET CODE","DESCRIPTION","CATEGORY","LOCATION","COST","VALIDATION"],[24,170,420,560,690,830],[
        [("code","SABRH-MED-0700"),("strong","Syringe Pump"),("badge",("Medical",INDIGO_T,INDIGO)),("t","ICU"),("t","J$240K"),("badge",("Valid",GREEN_T,GREEN_TX))],
        [("code","SABRH-FUR-1300"),("strong","Exam Couch"),("badge",("Furniture",AMBER_T,AMBER_TX)),("t","OPD"),("t","J$95K"),("badge",("Valid",GREEN_T,GREEN_TX))],
        [("code","SABRH-???-0001"),("strong","Trolley (no category)"),("badge",("Missing",RED_T,RED_TX)),("t","Stores"),("t","J$30K"),("badge",("Needs fix",AMBER_T,AMBER_TX))],
    ],A,action=None)
    c.pill(X+W-180,ty+18,"Import 612 assets",A,"#FFFFFF",12,16,30)
    return c,"14_import_assets"

# 15 GOOGLE DRIVE IMPORT
@reg
def p_drive():
    c=page("Google Drive Import","Google Drive Import","Sync asset workbooks from Drive")
    cy=TOP; cw=W*0.42
    c.card(X,cy,cw,170,14)
    c.rect(X+22,cy+22,46,46,11,SKY_T); icon(c,"cloud",X+33,cy+34,SKY,22,1.9)
    c.text(X+82,cy+44,"Google Drive",16,INK,700); c.pill(X+82,cy+56,"Connected",GREEN_T,GREEN_TX,11,11,22)
    c.text(X+22,cy+110,"Account: assets@sabrh.gov.jm",12,MUTED,500)
    c.text(X+22,cy+134,"Last sync: Today, 09:14 · 4,812 records",12,MUTED,500)
    c.pill(X+22,cy+146,"Sync now",A,"#FFFFFF",12,16,28); c.rect(X+148,cy+146,96,28,14,CARD,BORDER,1.3); c.text(X+196,cy+165,"Disconnect",11.5,TXT,600,"middle")
    # status tiles
    sx=X+cw+20; sw=W-cw-20
    for i,(lbl,val,ic,col,colt) in enumerate([("Synced Files","24","check",GREEN,GREEN_T),("Pending","2","clock",AMBER,AMBER_T),("Errors","0","alert",SKY,SKY_T)]):
        tw=(sw-2*16)/3; tx=sx+i*(tw+16); c.card(tx,cy,tw,170,14)
        c.rect(tx+20,cy+22,40,40,11,colt); icon(c,ic,tx+30,cy+32,col,18,1.9)
        c.text(tx+20,cy+110,val,26,INK,700); c.text(tx+20,cy+134,lbl,12,MUTED,500)
    ty=cy+190
    table(c,X,ty,W,330,"Drive Files",["FILE NAME","FOLDER","RECORDS","MODIFIED","STATUS"],[24,330,520,650,860],[
        [("strong","Asset_Register_FY2526.xlsx"),("t","/Assets/Master"),("t","4,812"),("mut","Today 09:14"),("badge",("Synced",GREEN_T,GREEN_TX))],
        [("strong","BOS_June2026.xlsx"),("t","/Assets/Survey"),("t","37"),("mut","Today 08:50"),("badge",("Synced",GREEN_T,GREEN_TX))],
        [("strong","New_Acquisitions.csv"),("t","/Assets/Inbox"),("t","612"),("mut","2 min ago"),("badge",("Pending",AMBER_T,AMBER_TX))],
        [("strong","Cost_Catalog_2026.xlsx"),("t","/Assets/Ref"),("t","1,340"),("mut","Yesterday"),("badge",("Synced",GREEN_T,GREEN_TX))],
    ],A,action="Refresh")
    return c,"15_google_drive_import"

# 16 BOS UPLOAD
@reg
def p_bosupload():
    c=page("BOS Upload","Board of Survey Upload","Batch upload survey decisions")
    wizard(c,X,TOP,W,A,["Upload File","Parse","Review","Submit"],2)
    dy=TOP+88
    dropzone(c,X,dy,W*0.42,230,A,AT,"Upload BOS spreadsheet","Signed survey form export (.xlsx)")
    tx=X+W*0.42+20
    table(c,tx,dy,W-W*0.42-20,230,"Parsed Survey Rows — 37 found",["ASSET","CONDITION","DECISION","CHECK"],[20,200,330,470],[
        [("strong","GE Ultrasound"),("badge",("Poor",RED_T,RED_TX)),("t","Write-off"),("badge",("OK",GREEN_T,GREEN_TX))],
        [("strong","HP Printer"),("badge",("Poor",RED_T,RED_TX)),("t","Write-off"),("badge",("OK",GREEN_T,GREEN_TX))],
        [("strong","Office Chairs"),("badge",("Fair",AMBER_T,AMBER_TX)),("t","Retain"),("badge",("OK",GREEN_T,GREEN_TX))],
        [("strong","Unknown code"),("badge",("—",SLATE_T,SLATE_TX)),("t","?"),("badge",("Error",RED_T,RED_TX))],
    ],A,action=None)
    ty=dy+250
    c.card(X,ty,W,180,14)
    c.text(X+22,ty+34,"Validation Summary",15,INK,700)
    for i,(lbl,val,col,colt) in enumerate([("Valid rows","34",GREEN,GREEN_T),("Warnings","2",AMBER,AMBER_T),("Errors","1",RED,RED_T)]):
        bx=X+22+i*240; c.rect(bx,ty+58,220,80,12,colt)
        c.text(bx+20,ty+100,val,28,col,700); c.text(bx+20,ty+124,lbl,12,col,600)
    c.pill(X+W-200,ty+90,"Submit 34 decisions",A,"#FFFFFF",12,16,30)
    return c,"16_bos_upload"

# 17 BULK CATEGORIES
@reg
def p_bulkcat():
    c=page("Bulk Categories","Bulk Categories","Mass-assign categories to uncategorised assets")
    # bulk toolbar
    c.rect(X,TOP,W,52,12,INDIGO); c.text(X+22,TOP+31,"42 assets selected",13.5,"#FFFFFF",700)
    c.rect(X+W-360,TOP+11,150,30,8,"#FFFFFF",op=0.16); c.text(X+W-345,TOP+31,"Set category",12,"#FFFFFF",600); c.path(f"M{X+W-238},{TOP+23} l4,4 l4,-4",stroke="#FFFFFF",sw=1.8)
    c.pill(X+W-196,TOP+12,"Apply to 42",CARD,INDIGO,12,16,28)
    c.rect(X+W-60,TOP+11,40,30,8,"#FFFFFF",op=0.16); c.path(f"M{X+W-46},{TOP+20} l12,12 M{X+W-34},{TOP+20} l-12,12",stroke="#FFFFFF",sw=1.8)
    ty=TOP+72
    rows=[]
    data=[("SABRH-XXX-0001","Stainless Trolley","Stores"),("SABRH-XXX-0002","Wall Clock","Admin"),
          ("SABRH-XXX-0003","Wheelchair","OPD"),("SABRH-XXX-0004","Notice Board","Ward A"),
          ("SABRH-XXX-0005","Step Stool","Theatre"),("SABRH-XXX-0006","Water Dispenser","Lobby"),
          ("SABRH-XXX-0007","Drip Stand","ICU"),("SABRH-XXX-0008","Bedside Locker","Ward B")]
    for code,desc,loc in data:
        rows.append([("chk",True),("code",code),("strong",desc),("t",loc),("badge",("Uncategorised",RED_T,RED_TX)),("btn",("Assign",CARD,A))])
    table(c,X,ty,W,500,"Uncategorised Assets",["","ASSET CODE","DESCRIPTION","LOCATION","CURRENT","NEW CATEGORY"],[24,70,250,520,640,820],rows,A,action=None)
    return c,"17_bulk_categories"

# 18 DUPLICATES TRACKER
@reg
def p_dupes():
    c=page("Duplicates Tracker","Duplicates Tracker","Detect & merge duplicate asset records")
    kpi_row(c,256,TOP,A,AT,[
        ("Groups Found","23","",False,"copy",AMBER,AMBER_T,None),
        ("Potential Dupes","58","",False,"alert",RED,RED_T,None),
        ("Resolved","312","+14",True,"check",GREEN,GREEN_T,[3,4,5,6,7,8,9]),
        ("Saved Value","J$8.4M","",True,"coins",INDIGO,INDIGO_T,None)])
    ty=TOP+120
    groups=[("SABRH-MED-0481","SABRH-MED-0481-A","Philips MX450 Monitor","98% match"),
            ("SABRH-FUR-1180","SABRH-FUR-1181","Adjustable Hospital Bed","92% match"),
            ("SABRH-ITX-0912","SABRH-ITX-9120","Dell OptiPlex Workstation","87% match")]
    gy=ty
    for a,b,desc,match in groups:
        c.card(X,gy,W,128,14)
        c.text(X+22,gy+30,desc,14,INK,700); c.pill(X+W-130,gy+16,match,AMBER_T,AMBER_TX,11,12,24)
        for i,code in enumerate([a,b]):
            cx=X+22+i*((W-44)/2); c.rect(cx,gy+48,(W-66)/2,60,10,BG,BORDER,1)
            c.text(cx+16,gy+74,code,12.5,A,700,family=MONO); c.text(cx+16,gy+94,"ICU Ward A · J$1,240,000 · 2024",11,MUTED,500)
            if i==0: c.pill(cx+(W-66)/2-90,gy+58,"Keep",GREEN_T,GREEN_TX,10.5,10,20)
            else: c.pill(cx+(W-66)/2-100,gy+58,"Merge →",A,"#FFFFFF",10.5,10,20)
        gy+=144
    return c,"18_duplicates_tracker"

# 19 CODE PARSER
@reg
def p_parser():
    c=page("Code Parser","Asset Code Parser","Decode the structure of any asset code")
    c.card(X,TOP,W,96,14)
    c.text(X+22,TOP+34,"Enter asset code",13,MUTED,600)
    c.rect(X+22,TOP+46,W-260,38,9,BG,BORDER,1.4); c.text(X+38,TOP+71,"SABRH-MED-0481",16,INK,700,family=MONO)
    c.pill(X+W-210,TOP+48,"Parse code",A,"#FFFFFF",13,18,36)
    # segments
    sy=TOP+120
    segs=[("SABRH","Facility","St. Ann's Bay Regional Hospital",INDIGO),
          ("MED","Category","Medical Equipment",SKY),
          ("0481","Sequence","Asset #481 in class",GREEN)]
    sw=(W-2*16)/3
    for i,(code,label,mean,col) in enumerate(segs):
        sx=X+i*(sw+16); c.card(sx,sy,sw,150,14); c.rect(sx,sy,4,150,2,col)
        c.text(sx+24,sy+34,label.upper(),10,FAINT,700,ls="0.5")
        c.text(sx+24,sy+74,code,26,col,700,family=MONO)
        c.text(sx+24,sy+104,mean,12.5,INK,600)
        c.text(sx+24,sy+126,"Valid segment",11,GREEN_TX,500)
    ty=sy+170
    table(c,X,ty,W,250,"Segment Reference",["SEGMENT","TYPE","ALLOWED VALUES","EXAMPLE"],[24,220,400,820],[
        [("strong","Facility"),("t","5-letter prefix"),("mut","SABRH, KPH, UHWI …"),("code","SABRH")],
        [("strong","Category"),("t","3-letter class"),("mut","MED, FUR, ITX, VEH, APP"),("code","MED")],
        [("strong","Sequence"),("t","4-digit number"),("mut","0001 – 9999"),("code","0481")],
    ],A,action=None)
    return c,"19_code_parser"

# 20 TOOLS & UTILITIES
@reg
def p_tools():
    c=page("Tools & Utilities","Tools & Utilities","Generators, printers & helpers")
    tools=[("qr","QR Code Generator","Create scannable codes for any asset",INDIGO,INDIGO_T),
           ("box","Barcode Generator","Code-128 barcodes for labels",SKY,SKY_T),
           ("register","Label Printing","Batch-print asset labels (Avery)",GREEN,GREEN_T),
           ("coins","Depreciation Calculator","Quick NBV & schedule estimate",AMBER,AMBER_T),
           ("copy","Bulk Edit","Update many assets at once",VIOLET,VIOLET_T),
           ("download","Export Centre","CSV / Excel / PDF exports",TEAL,TEAL_T)]
    cw=(W-2*20)/3; ch=170
    for i,(ic,t,d,col,colt) in enumerate(tools):
        r=i//3; cl=i%3; cx=X+cl*(cw+20); cyy=TOP+r*(ch+20)
        c.card(cx,cyy,cw,ch,14)
        c.rect(cx+24,cyy+24,52,52,13,colt); icon(c,ic,cx+40,cyy+40,col,20,2)
        c.text(cx+24,cyy+104,t,15,INK,700); c.text(cx+24,cyy+126,d,11.5,MUTED,500)
        c.pill(cx+24,cyy+138,"Open",col,"#FFFFFF",11.5,14,26)
    return c,"20_tools_utilities"

# 21 NOTIFICATIONS (NEW)
@reg
def p_notify():
    c=page("Notifications","Notifications Center","Alerts across warranty, maintenance & survey · NEW")
    # filter chips
    chips=[("All",True),("Warranty",False),("Maintenance",False),("Survey",False),("Stock",False)]
    cxx=X
    for lbl,act in chips:
        tw=len(lbl)*7+30; c.rect(cxx,TOP,tw,30,15,(A if act else CARD),(None if act else BORDER),1.2); c.text(cxx+tw/2,TOP+20,lbl,12,("#FFFFFF" if act else TXT),600,"middle"); cxx+=tw+10
    c.text(X+W-130,TOP+20,"Mark all read",12,A,600)
    ty=TOP+48; lw=W*0.64
    c.card(X,ty,lw,470,14)
    c.text(X+22,ty+30,"Today",13,INK,700)
    feed=[("alert",AMBER,AMBER_T,"Calibration due","MX450 Monitor (ICU) due in 14 days","2h ago",True),
          ("clock",RED,RED_T,"Warranty expiring","6 assets expire within 30 days","4h ago",True),
          ("survey",SKY,SKY_T,"Survey approved","GE Ultrasound approved for write-off","5h ago",False),
          ("wrench",VIOLET,VIOLET_T,"Maintenance overdue","Ultrasound GE inspection overdue 2 days","6h ago",True)]
    yy=ty+50
    for ic,col,colt,title,body,when,unread in feed:
        if unread: c.circle(X+16,yy+18,3.5,A)
        c.rect(X+30,yy,40,40,11,colt); icon(c,ic,X+40,yy+10,col,18,1.9)
        c.text(X+82,yy+16,title,13.5,INK,700); c.text(X+82,yy+36,body,12,MUTED,500)
        c.text(X+lw-22,yy+16,when,11,FAINT,500,"end"); yy+=64
    c.text(X+22,yy+8,"Earlier",13,INK,700); yy+=30
    for ic,col,colt,title,body,when in [("check",GREEN,GREEN_T,"Import complete","612 new assets imported","Yesterday"),("box",INDIGO,INDIGO_T,"3 duplicates merged","Saved J$2.1M in double-counting","Yesterday")]:
        c.rect(X+30,yy,40,40,11,colt); icon(c,ic,X+40,yy+10,col,18,1.9)
        c.text(X+82,yy+16,title,13.5,INK,700); c.text(X+82,yy+36,body,12,MUTED,500)
        c.text(X+lw-22,yy+16,when,11,FAINT,500,"end"); yy+=64
    # right: summary + toasts demo
    rx=X+lw+20; rw=W-lw-20
    c.card(rx,ty,rw,210,14); c.text(rx+22,ty+30,"Alert Summary",14,INK,700)
    for i,(lbl,val,col) in enumerate([("Warranty",12,AMBER_TX),("Maintenance",9,VIOLET),("Survey",37,SKY_TX),("Out of warranty",6,RED_TX)]):
        c.text(rx+22,ty+62+i*34,lbl,12.5,TXT,600); c.text(rx+rw-22,ty+62+i*34,str(val),13,col,700,"end")
        c.line(rx+22,ty+74+i*34,rx+rw-22,ty+74+i*34,BORDER,1)
    c.card(rx,ty+230,rw,240,14); c.text(rx+22,ty+260,"In-app Toasts (replaces alert())",13.5,INK,700)
    toast(c,rx+22,ty+280,"ok","Asset saved successfully")
    toast(c,rx+22,ty+336,"warn","2 rows need a category")
    toast(c,rx+22,ty+392,"info","Sync started in background")
    return c,"21_notifications"

# render all
ok=0
for fn in PAGES:
    try:
        c,name=fn(); c.png(f"{OUT}/{name}.png"); ok+=1; print("ok",name)
    except Exception as e:
        print("FAIL",fn.__name__,e); traceback.print_exc()
print(f"DONE {ok}/{len(PAGES)}")
