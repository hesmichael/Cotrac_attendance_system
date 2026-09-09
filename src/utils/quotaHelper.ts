export const isQuotaError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || String(err || '')).toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('quota') ||
    msg.includes('quota exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('free daily read units')
  );
};
