require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const Question = require('../models/Question');

const API_KEY = process.env.NVIDIA_NIM_API_KEY || '';
const BASE_URL = (process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const MODEL = 'meta/llama-3.1-8b-instruct';
const LATEX_PATH = path.join(__dirname, '..', 'question_bank.tex');

const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

// Normalization function for mapping names
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/^trắc nghiệm\s+/gi, '')
    .replace(/[.,\-–:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert HTML tags like <sup> and <sub> to LaTeX formatting
function extractHtmlWithLatex($, element) {
  let result = '';
  element.contents().each((i, node) => {
    if (node.type === 'text') {
      result += node.data;
    } else if (node.type === 'tag') {
      const tagName = node.name.toLowerCase();
      const $node = $(node);
      if (tagName === 'sup') {
        result += `^{${$node.text()}}`;
      } else if (tagName === 'sub') {
        result += `_{${$node.text()}}`;
      } else {
        result += extractHtmlWithLatex($, $node);
      }
    }
  });
  return result.trim();
}

// AI call to generate misconceptions for distractor choices
async function generateMisconceptionsWithAI(questionText, choices, correctAnswer, explanation) {
  if (!API_KEY) {
    // If no API key, return a generic misconception mapping
    return choices
      .filter(c => c.key !== correctAnswer)
      .map(c => ({
        distractor_key: c.key,
        misconception_name: 'Lỗi tính toán hoặc hiểu nhầm đề bài',
        explanation: `Học sinh chọn phương án ${c.key} do tính toán sai hoặc chưa đọc kỹ yêu cầu của bài toán.`
      }));
  }

  const choicesStr = choices.map(c => `${c.key}. ${c.text}`).join('\n');
  const prompt = `Bạn là một trợ lý giáo dục chuyên nghiệp.
Dưới đây là một câu hỏi trắc nghiệm Toán lớp 4 (Cánh Diều) được crawl từ Vietjack:
Đề bài: ${questionText}
Các phương án:
${choicesStr}
Đáp án đúng: ${correctAnswer}
Lời giải chi tiết: ${explanation}

Hãy phân tích các lỗi sai thường gặp của học sinh dẫn đến việc chọn các đáp án SAI (đáp án gây nhiễu).
Đối với mỗi đáp án sai, hãy cung cấp một đối tượng JSON gồm:
- distractor_key: Ký tự đáp án sai (ví dụ: "A")
- misconception_name: Tên lỗi sai ngắn gọn bằng tiếng Việt (ví dụ: "Nhầm lẫn công thức diện tích", "Nhầm đơn vị đo")
- explanation: Giải thích chi tiết tại sao học sinh lại tính ra đáp án này và hướng dẫn cách làm đúng.

Hãy trả về một mảng JSON duy nhất chứa đối tượng cho các đáp án sai:
[
  {
    "distractor_key": "...",
    "misconception_name": "...",
    "explanation": "..."
  }
]
Không viết thêm bất kỳ lời dẫn hay giải thích nào khác ngoài JSON.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are an educational assistant that outputs JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) return getDefaultMisconceptions(choices, correctAnswer);

    const data = await response.json();
    let rawContent = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Repair single backslashes from LaTeX (e.g. \frac -> \\frac)
    rawContent = rawContent.replace(/\\(?![nt"\\]|u[0-9a-fA-F]{4})/g, '\\\\');
    
    const startIdx = rawContent.indexOf('[');
    const endIdx = rawContent.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = rawContent.substring(startIdx, endIdx + 1);
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.warn(`[AI Warning] Lỗi sinh misconceptions: ${err.message}. Sử dụng cấu hình mặc định.`);
  } finally {
    clearTimeout(timeout);
  }

  return getDefaultMisconceptions(choices, correctAnswer);
}

function getDefaultMisconceptions(choices, correctAnswer) {
  return choices
    .filter(c => c.key !== correctAnswer)
    .map(c => ({
      distractor_key: c.key,
      misconception_name: 'Lỗi tính toán',
      explanation: `Học sinh chọn đáp án ${c.key} do nhầm lẫn trong các bước cộng, trừ, nhân, chia hoặc đọc sai đơn vị đo.`
    }));
}

// Format LaTeX output
function formatLatexQuestion(qNum, question) {
  let latex = `\\begin{minipage}{\\textwidth}\n`;
  latex += `\\noindent\\textbf{Câu hỏi ${qNum} (MEDIUM):} ${question.question_text.replace(/\n/g, ' \\\\\n')} \n`;
  latex += `\\begin{itemize}[label={}]\n`;
  for (const choice of question.choices) {
    latex += `    \\item ${choice.key}. ${choice.text}\n`;
  }
  latex += `\\end{itemize}\n`;
  latex += `\\textbf{Đáp án đúng:} ${question.correct_answer} \\\\\n`;
  latex += `\\textbf{Lời giải chi tiết:} ${question.explanation.replace(/\n/g, ' \\\\\n')} \\\\\n`;
  
  if (question.misconceptions && question.misconceptions.length > 0) {
    latex += `\\textbf{Lỗi thường gặp:}\n`;
    latex += `\\begin{itemize}\n`;
    for (const mis of question.misconceptions) {
      latex += `  \\item \\textbf{Đáp án ${mis.distractor_key} (${mis.misconception_name}):} ${mis.explanation}\n`;
    }
    latex += `\\end{itemize}\n`;
  }
  latex += `\\end{minipage}\n`;
  latex += `\\vspace{1em}\n\n`;
  return latex;
}

function initializeLatexFile() {
  const header = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{enumitem}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\title{Ngân hàng câu hỏi Toán Lớp 4 (Crawl từ Vietjack)}
\\author{Hệ thống Ôn luyện Toán Bổ Trợ}
\\date{\\today}

\\begin{document}
\\maketitle

\\tableofcontents
\\newpage
\\section{Lớp 4}
`;
  fs.writeFileSync(LATEX_PATH, header, 'utf8');
}

function closeLatexFile() {
  if (fs.existsSync(LATEX_PATH)) {
    fs.appendFileSync(LATEX_PATH, `\\end{document}\n`, 'utf8');
  }
}

async function main() {
  console.log('--- KHỞI ĐỘNG TIẾN TRÌNH CRAWL CÂU HỎI VIETJACK (LỚP 4) ---');
  
  const connStatus = await db.testConnection();
  if (!connStatus.connected) {
    console.error('Không kết nối được MySQL. Vui lòng kiểm tra file .env');
    process.exit(1);
  }

  // Get Lớp 4 lessons from CSDL
  const lessonsInDb = await db.query(`
    SELECT l.id as lesson_id, l.lesson_name, c.chapter_name
    FROM Lessons l
    JOIN Chapters c ON l.chapter_id = c.id
    WHERE c.grade = 4
  `);
  console.log(`Đã tải ${lessonsInDb.length} bài học Lớp 4 từ CSDL.`);

  initializeLatexFile();

  const indexUrl = 'https://vietjack.com/toan-4-cd/trac-nghiem-toan-lop-4.jsp';
  console.log(`Fetching index page: ${indexUrl}`);
  
  let indexRes;
  try {
    indexRes = await axios.get(indexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
  } catch (err) {
    console.error(`Không thể tải trang index: ${err.message}`);
    process.exit(1);
  }

  const $ = cheerio.load(indexRes.data);
  const quizLinks = [];
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim();
    if (href && href.includes('trac-nghiem-') && !href.endsWith('trac-nghiem-toan-lop-4.jsp')) {
      const fullUrl = new URL(href, indexUrl).href;
      if (fullUrl.includes('toan-4-cd')) {
        quizLinks.push({ title, url: fullUrl });
      }
    }
  });

  // De-duplicate quiz links
  const uniqueLinks = [];
  const seenUrls = new Set();
  for (const l of quizLinks) {
    if (!seenUrls.has(l.url)) {
      seenUrls.add(l.url);
      uniqueLinks.push(l);
    }
  }

  console.log(`Tìm thấy ${uniqueLinks.length} bài trắc nghiệm Cánh diều.`);
  
  // Mapping Vietjack title to CSDL lesson
  const mappedTasks = [];
  for (const link of uniqueLinks) {
    const normLinkTitle = normalizeName(link.title);
    
    // Find matching lesson
    let matchedLesson = null;
    for (const les of lessonsInDb) {
      const normLesName = normalizeName(les.lesson_name);
      if (normLinkTitle.includes(normLesName) || normLesName.includes(normLinkTitle)) {
        matchedLesson = les;
        break;
      }
    }
    
    if (matchedLesson) {
      mappedTasks.push({
        vietjackTitle: link.title,
        url: link.url,
        lesson_id: matchedLesson.lesson_id,
        lesson_name: matchedLesson.lesson_name,
        chapter_name: matchedLesson.chapter_name
      });
    }
  }

  console.log(`Ánh xạ thành công ${mappedTasks.length} bài học từ CSDL với Vietjack.`);
  
  const tasksToProcess = limit ? mappedTasks.slice(0, limit) : mappedTasks;
  console.log(`Sẽ tiến hành crawl ${tasksToProcess.length} bài học.`);

  let totalQuestionsSaved = 0;

  for (let idx = 0; idx < tasksToProcess.length; idx++) {
    const task = tasksToProcess[idx];
    console.log(`\n[${idx + 1}/${tasksToProcess.length}] Đang xử lý: ${task.lesson_name} (${task.vietjackTitle})`);
    console.log(`URL: ${task.url}`);

    let res;
    try {
      res = await axios.get(task.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (err) {
      console.error(`  -> LỖI tải trang: ${err.message}`);
      continue;
    }

    const $q = cheerio.load(res.data);
    const contentDiv = $q('.content').length ? $q('.content') : $q('main').length ? $q('main') : $q('body');
    const elements = contentDiv.find('p, section.toggle');

    const questions = [];
    let currentQ = null;

    elements.each((i, el) => {
      const $el = $q(el);
      const text = extractHtmlWithLatex($q, $el);
      if (!text) return;

      const qMatch = text.match(/^Câu\s+(\d+)\b/i);
      if (qMatch) {
        if (currentQ && currentQ.choices.length > 0 && currentQ.correct_answer) {
          questions.push(currentQ);
        }
        currentQ = {
          q_num: parseInt(qMatch[1], 10),
          question_text: '',
          choices: [],
          correct_answer: '',
          explanation: ''
        };
        let body = text.replace(/^Câu\s+\d+[\.\s]*/i, '');
        body = body.replace(/Em hãy chọn đáp án đúng nhất\.?/g, '').trim();
        if (body) {
          currentQ.question_text = body;
        }
        return;
      }

      if (!currentQ) return;

      const choiceMatch = text.match(/^([A-D])[\.\s]\s*(.*)$/);
      if (choiceMatch) {
        currentQ.choices.push({
          key: choiceMatch[1].toUpperCase(),
          text: choiceMatch[2].trim()
        });
        return;
      }

      if (el.name === 'section' && $el.hasClass('toggle')) {
        const toggleContent = $el.find('.toggle-content');
        if (toggleContent.length) {
          const ansText = toggleContent.text().trim();
          let ansMatch = ansText.match(/Đáp án đúng là\s*:\s*([A-D])/i);
          if (!ansMatch) {
            ansMatch = ansText.match(/Đáp án\s*:\s*([A-D])/i);
          }
          if (!ansMatch) {
            ansMatch = ansText.match(/(?:chọn|đáp án)\s+([A-D])\b/i);
          }
          if (!ansMatch) {
            ansMatch = ansText.match(/\b([A-D])\b/);
          }

          if (ansMatch) {
            currentQ.correct_answer = ansMatch[1].toUpperCase();
          }

          const explParas = [];
          toggleContent.find('p').each((idx, pEl) => {
            const pText = extractHtmlWithLatex($q, $q(pEl));
            if (pText && !pText.includes('Đáp án đúng là') && !pText.includes('Đáp án:')) {
              explParas.push(pText);
            }
          });
          currentQ.explanation = explParas.join(' ').trim();
        }
        return;
      }

      if (currentQ.choices.length === 0) {
        if (text.includes("Em hãy chọn đáp án đúng nhất.") && text.length < 40) {
          return;
        }
        if (currentQ.question_text) {
          if (!currentQ.question_text.includes(text)) {
            currentQ.question_text += '\n' + text;
          }
        } else {
          currentQ.question_text = text;
        }
      }
    });

    if (currentQ && currentQ.choices.length > 0 && currentQ.correct_answer) {
      questions.push(currentQ);
    }

    console.log(`  -> Trích xuất được ${questions.length} câu hỏi từ HTML.`);
    
    // Process and enrich each question
    fs.appendFileSync(LATEX_PATH, `\\subsection{${task.chapter_name}: ${task.lesson_name}}\n`, 'utf8');

    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
      
      // Enrich misconceptions using AI
      console.log(`  -> AI phân tích misconceptions câu ${q.q_num}...`);
      const misconceptions = await generateMisconceptionsWithAI(
        q.question_text,
        q.choices,
        q.correct_answer,
        q.explanation
      );
      q.misconceptions = misconceptions;

      // Seed to MySQL database
      try {
        const payload = {
          lesson_id: task.lesson_id,
          question_type: 'MULTIPLE_CHOICE',
          difficulty: qIdx % 3 === 0 ? 'EASY' : qIdx % 3 === 1 ? 'MEDIUM' : 'HARD',
          layout_template: 'STACK_VERTICAL',
          content: {
            text: q.question_text,
            images: []
          },
          choices: q.choices,
          correct_answer: q.correct_answer,
          explanation: {
            text: q.explanation,
            images: []
          },
          misconceptions: q.misconceptions
        };

        await Question.createQuestion(payload);
        totalQuestionsSaved++;
      } catch (dbErr) {
        console.error(`  -> LỖI lưu database câu ${q.q_num}: ${dbErr.message}`);
      }

      // Append to LaTeX file
      const qLatex = formatLatexQuestion(qIdx + 1, q);
      fs.appendFileSync(LATEX_PATH, qLatex, 'utf8');
    }
  }

  closeLatexFile();
  
  console.log('\n==================================================');
  console.log('HOÀN THÀNH TIẾN TRÌNH CRAWL VÀ ĐỒNG BỘ:');
  console.log(`- Đã lưu thành công ${totalQuestionsSaved} câu hỏi vào MySQL.`);
  console.log(`- Tài liệu LaTeX lưu tại: ${LATEX_PATH}`);
  console.log('==================================================');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
