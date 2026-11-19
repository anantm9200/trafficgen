/** Deterministic, bounded scheduler for authorized synthetic QA jobs. */
export function validateSchedule(input) {
  if (!input || typeof input !== 'object') throw new Error('Schedule required');
  const {sessions, intervalSeconds, concurrency, maxSessionsPerDay} = input;
  if (![sessions, intervalSeconds, concurrency, maxSessionsPerDay].every(Number.isInteger)) throw new Error('Integer scheduling fields required');
  if (sessions < 1 || sessions > 100 || intervalSeconds < 1 || concurrency < 1 || concurrency > 2 || maxSessionsPerDay < sessions || maxSessionsPerDay > 100) throw new Error('Schedule exceeds QA safety limits');
  return Object.freeze({sessions, intervalSeconds, concurrency, maxSessionsPerDay});
}
export function nextDispatchAt({lastDispatchAt, now, intervalSeconds}) {
  if (!Number.isFinite(now) || !Number.isFinite(intervalSeconds) || intervalSeconds < 1) throw new Error('Invalid timing');
  return Math.max(now, Number.isFinite(lastDispatchAt) ? lastDispatchAt + intervalSeconds * 1000 : now);
}
export function canDispatch({active, dispatchedToday, scheduled, now, lastDispatchAt}) {
  const plan = validateSchedule(scheduled);
  if (active >= plan.concurrency) return {allowed:false, reason:'concurrency_limit'};
  if (dispatchedToday >= plan.maxSessionsPerDay) return {allowed:false, reason:'daily_budget'};
  const at = nextDispatchAt({lastDispatchAt, now, intervalSeconds:plan.intervalSeconds});
  return at > now ? {allowed:false, reason:'pacing', nextAt:at} : {allowed:true, nextAt:at};
}
