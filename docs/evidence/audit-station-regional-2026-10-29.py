"""Independent audit of this fixed 2016–2025 experiment, not a general collector."""
import gzip, json, math, statistics, datetime, hashlib
from pathlib import Path
bundle_path=Path(__file__).with_name('station-regional-2026-10-29.json.gz')
bundle_bytes=gzip.decompress(bundle_path.read_bytes())
b=json.loads(bundle_bytes)
D=datetime.date
one=datetime.timedelta(days=1)
cutoff=D(2024,1,1)
def phase(day): return (D(2000,day.month,day.day)-D(2000,1,1)).days
def distance(a,c):
    p,q=map(math.radians,[a['lat'],float(c['LATITUDE'])])
    dl=math.radians(float(c['LONGITUDE'])-a['lon'])
    return 6371*2*math.asin(min(1,math.sqrt(math.sin((q-p)/2)**2+math.cos(p)*math.cos(q)*math.sin(dl/2)**2)))
summary=[]
for r in b['results']:
    h=r['history']; readings={}
    for x in h['raw']:
        d=D.fromisoformat(x['DATE'])
        assert x['STATION']==r['id'] and d not in readings
        f=float(x['TEMP']); count=float(x['TEMP_ATTRIBUTES'])
        if -150<=f<=150 and count.is_integer() and 18<=count<=999 and distance(h['station'],x)<=1:
            readings[d]=(f-32)*5/9
    cases={c['date']:c for c in r['validation']['cases']}
    errors={'analog':[],'seasonal':[],'persistence':[]}
    statuses={'evaluated':0,'missing':0,'insufficient':0}
    for year in (2024,2025):
      for month in range(1,13):
       for day in (7,21):
        target=D(year,month,day); actual=readings.get(target+one); ref=readings.get(target)
        if actual is None or ref is None: statuses['missing']+=1; continue
        pool=[d for d in readings if d+2*one<=cutoff and target-d>=7*one and min(abs(phase(d)-phase(target)),366-abs(phase(d)-phase(target)))<=30]
        candidates=sorted([d for d in pool if abs(readings[d]-ref)<=3],key=lambda d:(abs(readings[d]-ref),d))
        chosen=[]
        for d in candidates:
            if all(abs((d-prior).days)>=7 for prior in chosen): chosen.append(d)
            if len(chosen)==20: break
        matched=[readings[d+one] for d in chosen if d+one in readings]
        seasonal=[readings[d+one] for d in pool if d+one in readings]
        if min(len(chosen),len(matched),len(seasonal))<10: statuses['insufficient']+=1; continue
        statuses['evaluated']+=1
        c=cases[target.isoformat()]
        assert [d.isoformat() for d in chosen]==c['match_dates']
        medians={'analog':statistics.median(matched),'seasonal':statistics.median(seasonal),'persistence':ref}
        assert math.isclose(medians['analog'],c['prediction']['mean_c']['median'],abs_tol=1e-10)
        assert math.isclose(medians['seasonal'],c['baseline']['mean_c']['median'],abs_tol=1e-10)
        assert math.isclose(actual,c['actual']['mean_c'],abs_tol=1e-10)
        for k,v in medians.items(): errors[k].append(abs(v-actual))
    metrics={k+'_mae':statistics.mean(v) for k,v in errors.items()}
    for k,v in metrics.items(): assert math.isclose(v,r['validation']['diagnostics']['cohorts'][0]['metrics']['mean_c'][k],abs_tol=1e-10)
    for k,v in statuses.items(): assert v==r['validation'][k]
    summary.append({'city':r['city'],'id':r['id'],'usable_days':len(readings),**statuses,**metrics})
out={'verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bundle_sha256':hashlib.sha256(bundle_bytes).hexdigest(),'method':'Independent Python reconstruction from raw station rows: count/location exclusions, seasonal pool, temperature ranking/spacing, all 48 test dates, medians and identical-case errors. No JavaScript evaluator imports.','stations':summary,'equal_station_mae':{k:statistics.mean(s[k] for s in summary) for k in ('analog_mae','seasonal_mae','persistence_mae')}}
print(json.dumps(out))
