export const firmsNow=Date.parse('2026-10-29T08:00:00Z');
export const firmsHeader='latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight';
export const firmsRow=(overrides={})=>Object.values({latitude:'39',longitude:'-77',bright_ti4:'310.5',scan:'0.4',track:'0.5',acq_date:'2026-10-29',acq_time:'700',satellite:'N20',confidence:'nominal',version:'2.0NRT',bright_ti5:'285',frp:'0',daynight:'D',...overrides}).join(',');
export const firmsCSV=(...rows)=>[firmsHeader,...(rows.length?rows:[firmsRow()])].join('\n')+'\n';
