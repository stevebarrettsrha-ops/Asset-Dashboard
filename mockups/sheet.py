from PIL import Image, ImageDraw, ImageFont
import glob, os
files=sorted(glob.glob("mockups/pages/*.png"))
labels={
"01":"Dashboard","02":"Monthly Breakdown","03":"Fiscal Year Report","04":"Analytics & Insights  (NEW)",
"05":"Asset Register","06":"Cost Catalog","07":"Asset Lookup","08":"Asset 360 Profile  (NEW)",
"09":"Maintenance  (NEW)","10":"Board of Survey","11":"Asset Disposal","12":"Audit / Scan Mode  (NEW)",
"13":"Depreciation  (NEW)","14":"Import Assets","15":"Google Drive Import","16":"BOS Upload",
"17":"Bulk Categories","18":"Duplicates Tracker","19":"Code Parser","20":"Tools & Utilities","21":"Notifications  (NEW)"}
cols=3; tw=452; th=325; padx=22; pady=20; lab=30; top=84
rows=(len(files)+cols-1)//cols
W=cols*tw+(cols+1)*padx; H=top+rows*(th+lab+pady)+pady
sheet=Image.new("RGB",(W,H),"#0F172A")
d=ImageDraw.Draw(sheet)
def font(sz,bold=False):
    for p in ["/usr/share/fonts/truetype/liberation/LiberationSans-%s.ttf"%("Bold" if bold else "Regular"),
              "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"%("-Bold" if bold else "")]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()
d.text((padx,28),"Fixed Asset Dashboard — Full Redesign  ·  21 pages (15 existing + 6 new features)",font=font(30,True),fill="#FFFFFF")
for i,f in enumerate(files):
    r=i//cols; c=i%cols; x=padx+c*(tw+padx); y=top+r*(th+lab+pady)
    im=Image.open(f).convert("RGB").resize((tw,th))
    sheet.paste(im,(x,y))
    d.rectangle([x,y,x+tw-1,y+th-1],outline="#334155",width=1)
    key=os.path.basename(f)[:2]
    new = "(NEW)" in labels.get(key,"")
    d.text((x+2,y+th+7),labels.get(key,key),font=font(17,True),fill=("#A5B4FC" if new else "#E2E8F0"))
sheet.save("mockups/out/00_contact_sheet.png")
print("sheet",sheet.size)
