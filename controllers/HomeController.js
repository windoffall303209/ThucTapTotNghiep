function index(req, res) {
  if (req.auth?.role === 'student') {
    return res.redirect('/student/dashboard');
  }

  if (['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth?.role)) {
    return res.redirect('/admin/dashboard');
  }

  return res.render('home/index', {
    title: 'Toán Bổ Trợ 1-7'
  });
}

module.exports = { index };
