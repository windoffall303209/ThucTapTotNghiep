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
