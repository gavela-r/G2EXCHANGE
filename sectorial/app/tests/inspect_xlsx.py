import zipfile,xml.etree.ElementTree as ET,json,pathlib,collections,sys,math,posixpath
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
root=pathlib.Path(__file__).resolve().parents[1]
files=[root.parent/'implementacion/entrega/excels/SECTOR_05_PRUEBA.xlsx',root/'data/exports/33faf452e7007a6b8d6ec3c5b99d8378d57c10c6a0a75c0b130990c879b798c1.xlsx']
records=[]
for file in files:
 with zipfile.ZipFile(file) as z:
  out={'file':str(file),'entries':len(z.namelist()),'problems':[],'sheets':[]}
  st=ET.fromstring(z.read('xl/styles.xml'));out['styles']={e.tag.rsplit('}',1)[-1]:{'attrs':e.attrib,'children':len(e)} for e in st}
  xfs=len(st.find('s:cellXfs',NS));fonts=len(st.find('s:fonts',NS));fills=len(st.find('s:fills',NS));borders=len(st.find('s:borders',NS))
  for i,xf in enumerate(st.find('s:cellXfs',NS)):
   for key,count in [('fontId',fonts),('fillId',fills),('borderId',borders)]:
    if int(xf.get(key,'0'))>=count:out['problems'].append(['xf',i,key,xf.get(key)])
  for entry in z.namelist():
   if entry.endswith('.xml') or entry.endswith('.rels'):
    try:r=ET.fromstring(z.read(entry))
    except Exception as e:out['problems'].append([entry,str(e)]);continue
    if entry.endswith('.rels'):
     base=posixpath.dirname(posixpath.dirname(entry)) if '/_rels/' in entry else ''
     for e in r:
      if e.get('TargetMode')=='External':continue
      t=e.get('Target');dest=t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join(base,t))
      if dest not in z.namelist():out['problems'].append(['rel_missing',entry,dest])
    if entry.startswith('xl/worksheets/sheet') and entry.endswith('.xml'):
     issues=[];addresses=[]
     for c in r.findall('.//s:c',NS):
      addresses.append(c.get('r'))
      if int(c.get('s','0'))>=xfs:issues.append(['style',c.attrib])
      v=c.find('s:v',NS)
      if v is not None and c.get('t','n')=='n':
       try:
        if not math.isfinite(float(v.text)):issues.append(['nonfinite',c.get('r'),v.text])
       except Exception:issues.append(['badnumber',c.get('r'),v.text])
     duplicates=[a for a,n in collections.Counter(addresses).items() if n>1]
     out['sheets'].append({'entry':entry,'children':[(e.tag.rsplit('}',1)[-1],e.attrib) for e in r if not e.tag.endswith('sheetData')],'cells':len(addresses),'duplicates':duplicates[:10],'issues':issues[:10]})
  records.append(out)
(root/'evidencias/xlsx_estructura_comparada.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
for r in records:print(json.dumps({'file':r['file'],'styles':r['styles'],'problems':r['problems'],'cellIssues':[s for s in r['sheets'] if s['issues'] or s['duplicates']]}))
