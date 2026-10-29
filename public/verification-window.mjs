/* Explicit evidence cutoffs for retrospective forecast comparisons. Apache-2.0. */
export const VERIFICATION_REPLAY_METHOD='2026-10-29.1';
export const OBSERVATION_RETENTION_DAYS=30;
export const MAX_VERIFICATION_LOOKBACK_DAYS=29;
export function verificationWindow(value,now){
  const historical=value!==null&&value!==undefined;
  const end=historical&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):historical?NaN:now;
  if(!Number.isFinite(now)||!Number.isFinite(end)||end>now||end<now-MAX_VERIFICATION_LOOKBACK_DAYS*86400000)throw Error('Invalid verification archive time: use an explicit timezone within the past 29 days');
  return {method_version:VERIFICATION_REPLAY_METHOD,historical,as_of:new Date(end).toISOString(),window_start:new Date(end-7*86400000).toISOString(),window_end:new Date(end).toISOString(),retention_days:OBSERVATION_RETENTION_DAYS,
    // Collection completion is stored in whole seconds. Exclude the partial cutoff second.
    evidence_before:historical?new Date(Math.floor(end/1000)*1000).toISOString():null,
    interpretation:historical?'Seven-day comparison using only evidence collected before the cutoff second. Missing archives are not reconstructed; later observation corrections are excluded.':'Seven-day comparison using the latest available observation edition. Later corrections may change a new evaluation.'};
}
