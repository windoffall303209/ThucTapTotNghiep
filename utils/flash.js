// Ti?n ?ch flash cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
function setFlash(req, type, message, options = {}) {
  req.session.flash = {
    type,
    message,
    transient: Boolean(options.transient),
    modal: Boolean(options.modal),
    durationMs: Number(options.durationMs) > 0 ? Number(options.durationMs) : undefined
  };
}

module.exports = { setFlash };
