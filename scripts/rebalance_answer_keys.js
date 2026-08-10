// Script rebalance answer keys h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/**
 * Cân bằng lại vị trí đáp án đúng trong ngân hàng câu hỏi lớp 4 và lớp 5.
 *
 * Vấn đề: đo phân bố đáp án đúng cho thấy lớp 5 có B chiếm 45,5% và D chỉ 4,1%,
 * lớp 4 có B 41,5% và D 5,1%. Hệ thống lại KHÔNG đảo thứ tự phương án khi hiển
 * thị (models/Question.js chỉ đảo thứ tự câu hỏi, không đảo choices), nên học
 * sinh chỉ cần luôn bấm B là đúng khoảng 45% mà không cần biết Toán, và có thể
 * bỏ hẳn phương án D vì gần như không bao giờ đúng. Mẹo này ổn định qua mọi lần
 * luyện tập nên điểm số không còn phản ánh năng lực.
 *
 * Cách xử lý: hoán vị thứ tự phương án ngay trong dữ liệu để đáp án đúng rải đều
 * bốn vị trí, thay vì đảo lúc hiển thị. Chọn cách này vì:
 *   - Sửa được cả file .tex là nguồn gốc, nên import lại vẫn giữ kết quả.
 *   - Không phải dịch nhãn qua lại giữa vị trí hiển thị và khóa đáp án lúc chấm,
 *     tránh cả một lớp lỗi mới.
 *
 * Chỉ làm lớp 4 và 5. Lớp 1, 2, 3 có phân bố đã gần đều (lệch nhiều nhất 28,9%)
 * và riêng lớp 1 có một số ảnh in sẵn phương án bên trong nên đụng vào sẽ hỏng.
 *
 * Dùng:
 *   node scripts/rebalance_answer_keys.js            -> xem trước
 *   node scripts/rebalance_answer_keys.js --commit   -> ghi .tex và MySQL
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS = ['A', 'B', 'C', 'D'];

const FILES = {
  4: 'grade4_question_bank.tex',
  5: 'grade5_question_bank.tex'
};

// H?m decode d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function decode(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// H?m encode d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Sắp xếp lại mảng phương án sao cho đáp án đúng nằm ở vị trí targetIndex.
 * Các phương án còn lại giữ nguyên thứ tự tương đối để nội dung vẫn đọc tự nhiên
 * (ví dụ dãy số tăng dần không bị xáo trộn vô nghĩa).
 */
function hoanVi(choices, correctKey, targetIndex) {
  const dung = choices.find((choice) => choice.key === correctKey);
  const conLai = choices.filter((choice) => choice.key !== correctKey);
  const moi = [...conLai];
  moi.splice(targetIndex, 0, dung);

  // Gán lại nhãn theo vị trí mới; nội dung đi theo, khóa đáp án đúng đổi tương ứng.
  return moi.map((choice, index) => ({ ...choice, key: KEYS[index] }));
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function main() {
  return (async () => {
    let tongDoi = 0;
    const thongKeTruoc = {};
    const thongKeSau = {};

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const [grade, fileName] of Object.entries(FILES)) {
      const filePath = path.join(DATA_DIR, fileName);
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');

      thongKeTruoc[grade] = { A: 0, B: 0, C: 0, D: 0 };
      thongKeSau[grade] = { A: 0, B: 0, C: 0, D: 0 };

      let stt = 0;
      let doiTrongFile = 0;

      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (let i = 0; i < lines.length; i += 1) {
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!lines[i].startsWith('% DBJSON ')) continue;

        let payload;
        // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
        try {
          payload = decode(lines[i].slice('% DBJSON '.length).trim());
        } catch (error) {
          continue;
        }
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (payload.question_type !== 'MULTIPLE_CHOICE') continue;
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!Array.isArray(payload.choices) || payload.choices.length !== 4) continue;

        thongKeTruoc[grade][payload.correct_answer] += 1;

        // Rải đều theo thứ tự xuất hiện: câu thứ 1 đáp án A, thứ 2 B, thứ 3 C,
        // thứ 4 D rồi lặp lại. Cách này cho phân bố đúng 25% mỗi vị trí và hoàn
        // toàn xác định, chạy lại nhiều lần vẫn ra kết quả như nhau.
        const targetIndex = stt % 4;
        stt += 1;

        const targetKey = KEYS[targetIndex];
        thongKeSau[grade][targetKey] += 1;

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (payload.correct_answer === targetKey) continue;

        const choicesMoi = hoanVi(payload.choices, payload.correct_answer, targetIndex);
        payload.choices = choicesMoi;
        payload.correct_answer = targetKey;
        doiTrongFile += 1;
        tongDoi += 1;

        lines[i] = `% DBJSON ${encode(payload)}`;

        // Cập nhật khối LaTeX đi kèm để hai phần không lệch nhau.
        let end = i + 1;
        // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
        while (end < lines.length && !lines[end].includes('\\end{minipage}')) end += 1;

        // Các file .tex dùng xuống dòng CRLF nên mỗi phần tử của mảng lines còn
        // sót ký tự \r ở cuối. Phải tách nó ra rồi ghép lại, nếu không sẽ làm
        // hỏng định dạng file và biểu thức chính quy có neo cuối dòng cũng không
        // khớp được.
        for (let j = i + 1; j < end; j += 1) {
          const cr = lines[j].endsWith('\r') ? '\r' : '';
          const match = lines[j].replace(/\r$/, '').match(/^\\item ([A-D])\. (.*)$/);
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (!match) continue;
          const viTri = KEYS.indexOf(match[1]);
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (viTri === -1 || !choicesMoi[viTri]) continue;
          lines[j] = `\\item ${KEYS[viTri]}. ${choicesMoi[viTri].text}${cr}`;
        }
        // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
        for (let j = i + 1; j <= end; j += 1) {
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (lines[j].includes('Đáp án đúng:')) {
            lines[j] = lines[j].replace(/(Đáp án đúng:\} )([A-D])/, `$1${targetKey}`);
            break;
          }
        }

        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (COMMIT) {
          const rows = await db.query(
            `SELECT q.id FROM QuestionBank q
             JOIN Lessons l ON l.id = q.lesson_id
             JOIN Chapters ch ON ch.id = l.chapter_id
             WHERE ch.grade = ? AND JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.text')) = ?`,
            [Number(grade), payload.content.text]
          );
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (rows.length === 1) {
            await db.query(
              'UPDATE QuestionBank SET choices = CAST(? AS JSON), correct_answer = ? WHERE id = ?',
              [JSON.stringify(choicesMoi), targetKey, rows[0].id]
            );
          }
        }
      }

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (COMMIT) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`Đã ghi ${fileName} (${doiTrongFile} câu đổi vị trí)`);
      } else {
        console.log(`${fileName}: sẽ đổi ${doiTrongFile} câu`);
      }
    }

    console.log('\nPhân bố đáp án đúng:');
    Object.keys(FILES).forEach((grade) => {
      const t = thongKeTruoc[grade];
      const s = thongKeSau[grade];
      const tong = KEYS.reduce((sum, key) => sum + t[key], 0) || 1;
      // H?m pct d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      const pct = (obj) => KEYS.map((key) => `${key}=${(obj[key] / tong * 100).toFixed(1)}%`).join('  ');
      console.log(`  Lớp ${grade} trước: ${pct(t)}`);
      console.log(`  Lớp ${grade} sau:   ${pct(s)}`);
    });

    console.log(`\nTổng số câu đổi vị trí: ${tongDoi}`);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!COMMIT) console.log('Đây là bản xem trước. Thêm --commit để ghi thật.');
  })();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
