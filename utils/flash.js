// Tiện ích flash cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
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
