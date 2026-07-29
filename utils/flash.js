function setFlash(req, type, message, options = {}) {
  req.session.flash = {
    type,
    message,
    transient: Boolean(options.transient),
    durationMs: Number(options.durationMs) > 0 ? Number(options.durationMs) : undefined
  };
}

module.exports = { setFlash };
