// Structured timing logger for offer-letter pipeline.
// Writes JSON lines to stdout so PM2 captures them in backend-out.log.
// grep: grep '"event":"offer_letter"' /home/ubuntu/.pm2/logs/backend-out.log

const offerLetterLogger = {
  _log(level, offerId, stage, data = {}) {
    const line = JSON.stringify({
      event: 'offer_letter',
      level,
      offerId: String(offerId),
      stage,
      ts: new Date().toISOString(),
      ...data,
    });
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  },

  info: (offerId, stage, data) => offerLetterLogger._log('info', offerId, stage, data),
  warn: (offerId, stage, data) => offerLetterLogger._log('warn', offerId, stage, data),
  error: (offerId, stage, data) => offerLetterLogger._log('error', offerId, stage, data),

  /** Call the returned function at the END of a stage — logs duration automatically. */
  timer(offerId, stage, extraData = {}) {
    const start = Date.now();
    const oid = String(offerId);
    return (extraOnDone = {}) => {
      offerLetterLogger.info(oid, stage, {
        ...extraData,
        ...extraOnDone,
        durationMs: Date.now() - start,
      });
    };
  },
};

export default offerLetterLogger;
