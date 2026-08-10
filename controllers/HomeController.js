// Bộ điều khiển home controller tiếp nhận yêu cầu, kiểm tra dữ liệu và điều phối phản hồi cho người dùng.
function index(req, res) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (req.auth?.role === 'student') {
    return res.redirect('/student/dashboard');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (['SYSADMIN', 'CONTENT_ADMIN'].includes(req.auth?.role)) {
    return res.redirect('/admin/dashboard');
  }

  return res.render('home/index', {
    title: 'Toán Bổ Trợ Tiểu học'
  });
}

module.exports = { index };
