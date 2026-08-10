// Script generate and seed questions h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const Question = require('../models/Question');
const { MAX_GRADE, MIN_GRADE, isSupportedGrade } = require('../config/grades');

// Configure API call parameters
const API_KEY = process.env.NVIDIA_NIM_API_KEY || '';
const BASE_URL = (process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';

const LATEX_PATH = path.join(__dirname, '..', 'question_bank.tex');

// Parse command line arguments
const args = process.argv.slice(2);
const gradeArg = args.find(arg => arg.startsWith('--grade='));
const limitArg = args.find(arg => arg.startsWith('--limit='));
const modelArg = args.find(arg => arg.startsWith('--model='));
const demoArg = args.find(arg => arg.startsWith('--demo'));

const selectedGrade = gradeArg ? Number(gradeArg.split('=')[1]) : null;
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const selectedModel = modelArg ? modelArg.split('=')[1] : DEFAULT_MODEL;
const isDemo = demoArg !== undefined;

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!API_KEY) {
    console.error('Lỗi: NVIDIA_NIM_API_KEY chưa được cấu hình trong file .env');
    process.exit(1);
  }

  console.log('--- KHỞI ĐỘNG TIẾN TRÌNH TẠO NGÂN HÀNG CÂU HỎI ---');
  console.log(`AI Provider: NVIDIA NIM`);
  console.log(`Model: ${selectedModel}`);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (selectedGrade && !isSupportedGrade(selectedGrade)) {
    console.error(`Lỗi: chỉ hỗ trợ khối lớp từ ${MIN_GRADE} đến ${MAX_GRADE}.`);
    process.exit(1);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (selectedGrade) console.log(`Khối lớp lựa chọn: Lớp ${selectedGrade}`);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (limit) console.log(`Giới hạn số lượng bài học: ${limit}`);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (isDemo) console.log(`Chế độ: Demo (Chọn tối đa 2 bài học đại diện cho mỗi khối lớp từ Lớp ${MIN_GRADE}-${MAX_GRADE})`);

  // Test DB connection
  const connStatus = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connStatus.connected) {
    console.error('Không kết nối được MySQL. Vui lòng kiểm tra cấu hình trong .env');
    process.exit(1);
  }
  console.log('Kết nối MySQL thành công.');

  // Fetch chapters and lessons
  let querySql = `
    SELECT l.id as lesson_id, l.lesson_name, c.id as chapter_id, c.chapter_name, c.grade
    FROM Lessons l
    JOIN Chapters c ON l.chapter_id = c.id
  `;
  const queryParams = [];

  querySql += ' WHERE c.grade BETWEEN ? AND ?';
  queryParams.push(MIN_GRADE, MAX_GRADE);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (selectedGrade) {
    querySql += ' AND c.grade = ?';
    queryParams.push(selectedGrade);
  }

  querySql += ' ORDER BY c.grade, c.sort_order, l.sort_order';

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (limit && !isDemo) {
    querySql += ` LIMIT ${Number(limit)}`;
  }

  let lessons = await db.query(querySql, queryParams);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (isDemo) {
    const grouped = {};
    lessons.forEach(l => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!grouped[l.grade]) grouped[l.grade] = [];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (grouped[l.grade].length < 2) {
        grouped[l.grade].push(l);
      }
    });
    lessons = Object.values(grouped).flat();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (limit) {
      lessons = lessons.slice(0, limit);
    }
  }

  console.log(`Đã tìm thấy ${lessons.length} bài học cần sinh câu hỏi.`);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (lessons.length === 0) {
    console.log('Không có bài học nào để xử lý.');
    process.exit(0);
  }

  // Initialize LaTeX file
  initializeLatexFile();

  let countSuccess = 0;
  let countFailed = 0;

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    console.log(`\n[${i + 1}/${lessons.length}] Đang xử lý: Lớp ${lesson.grade} -> ${lesson.chapter_name} -> ${lesson.lesson_name}`);
    
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const questions = await generateQuestionsWithAI(lesson, selectedModel);
      console.log(`-> Sinh thành công ${questions.length} câu hỏi từ AI.`);
      
      let insertedCount = 0;
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const q of questions) {
        // Insert into database
        await Question.createQuestion({
          lesson_id: lesson.lesson_id,
          question_type: q.question_type || 'MULTIPLE_CHOICE',
          difficulty: q.difficulty || 'EASY',
          layout_template: q.layout_template || 'STACK_VERTICAL',
          content: q.content || { text: '', images: [] },
          choices: q.choices || [],
          correct_answer: q.correct_answer || 'A',
          explanation: q.explanation || { text: 'Chưa có lời giải chi tiết.', images: [] },
          misconceptions: q.misconceptions || []
        });
        insertedCount++;
      }
      console.log(`-> Đã lưu ${insertedCount} câu hỏi vào MySQL.`);

      // Write to LaTeX
      writeToLatex(lesson, questions);
      console.log('-> Đã ghi vào file question_bank.tex.');

      countSuccess++;
    } catch (error) {
      console.error(`-> LỖI khi xử lý bài học (ID: ${lesson.lesson_id}):`, error.message);
      countFailed++;
    }

    // Add a tiny delay between requests to be polite to the API
    await sleep(1000);
  }

  // Finalize LaTeX file
  finalizeLatexFile();

  console.log('\n==================================================');
  console.log(`HOÀN THÀNH TIẾN TRÌNH:`);
  console.log(`- Thành công: ${countSuccess}/${lessons.length} bài học`);
  console.log(`- Thất bại: ${countFailed}/${lessons.length} bài học`);
  console.log(`- File LaTeX lưu tại: ${LATEX_PATH}`);
  console.log('==================================================');
  
  process.exit(0);
}

// H?m generateQuestionsWithAI d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function generateQuestionsWithAI(lesson, model) {
  const prompt = `Bạn là chuyên gia giáo dục Toán tiểu học Việt Nam (Lớp ${MIN_GRADE}-${MAX_GRADE}).
Hãy biên soạn 3 câu hỏi trắc nghiệm Toán học (độ khó: 1 EASY, 1 MEDIUM, 1 HARD) cho bài học sau:
Lớp: ${lesson.grade}
Chương: ${lesson.chapter_name}
Bài học: ${lesson.lesson_name}

Yêu cầu về nội dung và chất lượng câu hỏi:
1. Định hướng bài học: Câu hỏi phải bám sát chương trình sách giáo khoa (ví dụ: bộ Cánh Diều). Tránh các câu hỏi quá xa vời, trừu tượng hoặc nâng cao không cần thiết đối với lứa tuổi tương ứng.
   Dưới đây là một số ví dụ về các dạng toán thích hợp cho từng khối lớp:
   - Lớp 1: Đếm số, so sánh trong phạm vi 10, phép cộng/trừ trong phạm vi 10, phép cộng/trừ trong phạm vi 100 (không nhớ), xem đồng hồ giờ đúng.
   - Lớp 2: Phép cộng/trừ có nhớ trong phạm vi 100, bảng nhân 2, bảng nhân 5, bảng chia 2, bảng chia 5, độ dài đường gấp khúc, hình tứ giác.
   - Lớp 3: Nhân/chia trong phạm vi 1000, làm quen số la mã, tính giá trị biểu thức, chu vi hình chữ nhật, hình vuông, làm quen với thống kê.
   - Lớp 4: Các số đến lớp triệu (đọc, viết, cấu tạo số, so sánh), phép nhân/chia số có nhiều chữ số, phân số (rút gọn, quy đồng, cộng, trừ, nhân, chia phân số), tính chất giao hoán/kết hợp.
   - Lớp 5: Số thập phân (đọc, viết, cộng, trừ, nhân, chia), tỉ số phần trăm, diện tích hình tam giác, hình thang, hình tròn, thể tích hình hộp chữ nhật, chuyển động đều.
   BẮT BUỘC KHÔNG ĐƯỢC sinh các kiến thức vượt cấp hoặc kiến thức THCS. Ví dụ: Lớp 4 không được dùng phương trình bậc hai, căn bậc hai, lũy thừa lớn, số thực âm. Các phép tính toán phải sử dụng số nguyên đơn giản hoặc phân số/số thập phân đơn giản phù hợp lứa tuổi.
2. CHÍNH XÁC TOÁN HỌC: Bạn bắt buộc phải giải nháp và kiểm tra lại từng câu hỏi, từng phương án lựa chọn:
   - Đáp án đúng phải là duy nhất và hoàn toàn chính xác về mặt toán học.
   - Các đáp án nhiễu phải sai rõ ràng nhưng hợp lý (thể hiện được các lỗi tư duy thường gặp).
   - Công thức toán học bắt buộc phải viết bằng LaTeX chuẩn, ví dụ: $\\frac{1}{2}$, $x^2$, $30\\text{ cm}^2$.
3. Phân tích lỗi sai (Misconceptions): Với các phương án sai (nhiễu), bạn phải phân tích cụ thể tại sao học sinh chọn đáp án đó (ví dụ: do cộng nhầm tử với tử, mẫu với mẫu; quên đổi đơn vị đo; nhầm công thức diện tích với chu vi,...).

Định dạng trả về:
- Định dạng câu hỏi là trắc nghiệm 4 lựa chọn (A, B, C, D).
- Trả về kết quả ở dạng JSON Array duy nhất, không kèm theo bất kỳ văn bản giải thích nào khác ở ngoài.

JSON Schema mẫu:
[
  {
    "question_type": "MULTIPLE_CHOICE",
    "difficulty": "EASY",
    "layout_template": "STACK_VERTICAL",
    "content": {
      "text": "Đề bài câu hỏi...",
      "images": []
    },
    "choices": [
      { "key": "A", "text": "Phương án A", "images": [] },
      { "key": "B", "text": "Phương án B", "images": [] },
      { "key": "C", "text": "Phương án C", "images": [] },
      { "key": "D", "text": "Phương án D", "images": [] }
    ],
    "correct_answer": "A",
    "explanation": {
      "text": "Lời giải chi tiết...",
      "images": []
    },
    "misconceptions": [
      {
        "distractor_key": "B",
        "misconception_name": "Tên lỗi sai",
        "explanation": "Giải thích chi tiết tại sao đáp án B là sai và hướng dẫn cách làm đúng."
      }
    ]
  }
]`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  let response;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are an educational assistant that output JSON content only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });
  } catch (error) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (error.name === 'AbortError') {
      throw new Error('Yêu cầu gọi NVIDIA NIM API bị quá thời gian chờ (35 giây).');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA NIM API trả về mã lỗi HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
  
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!rawContent) {
    throw new Error('API không trả về câu trả lời.');
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return parseAIResponse(rawContent);
  } catch (err) {
    console.error('Lỗi khi parse JSON từ AI. Nội dung thô:', rawContent);
    throw new Error(`Lỗi parse JSON: ${err.message}`);
  }
}

// H?m parseAIResponse d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseAIResponse(content) {
  const startIdx = content.indexOf('[');
  const endIdx = content.lastIndexOf(']');
  
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('Không tìm thấy JSON Array trong kết quả trả về của AI.');
  }
  
  let jsonStr = content.substring(startIdx, endIdx + 1);
  // Repair single backslashes from LaTeX (e.g. \frac -> \\frac) to avoid invalid JSON escapes
  jsonStr = jsonStr.replace(/\\(?![nt"\\]|u[0-9a-fA-F]{4})/g, '\\\\');
  return JSON.parse(jsonStr);
}

function initializeLatexFile() {
  const preamble = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{enumitem}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\title{Ngân hàng câu hỏi Toán Tiểu học Lớp 1 - 5}
\\author{Hệ thống Ôn luyện Toán Bổ Trợ}
\\date{\\today}

\\begin{document}
\\maketitle

\\tableofcontents
\\newpage
`;
  fs.writeFileSync(LATEX_PATH, preamble, 'utf8');
}

let lastGrade = null;
let lastChapter = null;

function writeToLatex(lesson, questions) {
  let content = '';

  if (lastGrade !== lesson.grade) {
    content += `\\section{Lớp ${lesson.grade}}\n`;
    lastGrade = lesson.grade;
    lastChapter = null;
  }

  if (lastChapter !== lesson.chapter_name) {
    content += `\\subsection{${lesson.chapter_name}}\n`;
    lastChapter = lesson.chapter_name;
  }

  content += `\\subsubsection{${lesson.lesson_name}}\n\n`;

  questions.forEach((q, index) => {
    const text = q.content.text;
    const choiceMap = {};
    q.choices.forEach(c => {
      choiceMap[c.key] = c.text;
    });

    let misconceptionsStr = '';
    if (q.misconceptions && q.misconceptions.length > 0) {
      misconceptionsStr = '\\textbf{Lỗi thường gặp:}\n\\begin{itemize}\n';
      q.misconceptions.forEach(m => {
        misconceptionsStr += `  \\item \\textbf{Đáp án ${m.distractor_key} (${m.misconception_name}):} ${m.explanation}\n`;
      });
      misconceptionsStr += '\\end{itemize}\n';
    }

    content += `
\\begin{minipage}{\\textwidth}
\\noindent\\textbf{Câu hỏi ${index + 1} (${q.difficulty}):} ${text}
\\begin{itemize}[label={}]
    \\item A. ${choiceMap['A'] || ''}
    \\item B. ${choiceMap['B'] || ''}
    \\item C. ${choiceMap['C'] || ''}
    \\item D. ${choiceMap['D'] || ''}
\\end{itemize}
\\textbf{Đáp án đúng:} ${q.correct_answer} \\\\
\\textbf{Lời giải chi tiết:} ${q.explanation.text} \\\\
${misconceptionsStr}
\\end{minipage}
\\vspace{1em}
`;
  });

  fs.appendFileSync(LATEX_PATH, content, 'utf8');
}

function finalizeLatexFile() {
  fs.appendFileSync(LATEX_PATH, '\n\\end{document}\n', 'utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error('Fatal Error:', error);
  process.exit(1);
});
