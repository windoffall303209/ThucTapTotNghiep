// B? ?i?u khi?n home controller ti?p nh?n y?u c?u, ki?m tra d? li?u v? ?i?u ph?i ph?n h?i cho ng??i d?ng.
function index(req, res) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (req.auth?.role === 'student') {
    return res.redirect('/student/dashboard');
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth?.role)) {
    return res.redirect('/admin/dashboard');
  }

  return res.render('home/index', {
    title: 'Toán Bổ Trợ Tiểu học'
  });
}

module.exports = { index };
