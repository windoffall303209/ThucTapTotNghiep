// T?p m? ngu?n sample data th?c hi?n m?t ph?n ch?c n?ng c?a ?ng d?ng v? ph?i h?p v?i c?c m?-?un li?n quan.
function svgDataUri(label, background = '#eff6ff', foreground = '#1d4ed8') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-label="${label}">
      <rect width="480" height="300" rx="28" fill="${background}"/>
      <circle cx="132" cy="150" r="58" fill="#ffffff" stroke="${foreground}" stroke-width="10"/>
      <circle cx="242" cy="150" r="58" fill="#ffffff" stroke="${foreground}" stroke-width="10"/>
      <circle cx="352" cy="150" r="58" fill="#ffffff" stroke="${foreground}" stroke-width="10"/>
      <text x="240" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${foreground}">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

const chapters = [
  {
    id: 1,
    grade: 1,
    semester: 1,
    chapter_name: 'Chủ đề 1. Các số đến 10',
    sort_order: 1,
    lessons: [
      {
        id: 101,
        chapter_id: 1,
        lesson_name: 'Bài 1: Đếm số lượng trong phạm vi 5',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Đếm từng đồ vật',
            body: 'Khi đếm, em chỉ vào từng đồ vật một lần và đọc các số theo thứ tự: 1, 2, 3, 4, 5.',
            formulas: [],
            example: 'Có 3 quả bóng thì em đọc: một, hai, ba.'
          },
          {
            title: 'So sánh ít hơn, nhiều hơn',
            body: 'Nhóm nào có số đồ vật lớn hơn thì là nhóm nhiều hơn. Nhóm nào có số đồ vật nhỏ hơn thì là nhóm ít hơn.',
            formulas: [],
            example: '4 bông hoa nhiều hơn 2 bông hoa.'
          }
        ]
      }
    ]
  },
  {
    id: 2,
    grade: 2,
    semester: 1,
    chapter_name: 'Chủ đề 2. Phép cộng và phép trừ trong phạm vi 100',
    sort_order: 1,
    lessons: [
      {
        id: 201,
        chapter_id: 2,
        lesson_name: 'Bài 12: Cộng số có hai chữ số',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Cộng theo hàng chục và hàng đơn vị',
            body: 'Khi cộng số có hai chữ số, em cộng hàng đơn vị với hàng đơn vị, hàng chục với hàng chục.',
            formulas: ['23 + 14 = 37'],
            example: '23 gồm 2 chục 3 đơn vị; 14 gồm 1 chục 4 đơn vị.'
          }
        ]
      }
    ]
  },
  {
    id: 3,
    grade: 4,
    semester: 2,
    chapter_name: 'Chủ đề 3. Phân số',
    sort_order: 1,
    lessons: [
      {
        id: 301,
        chapter_id: 3,
        lesson_name: 'Bài 59: Rút gọn phân số',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Rút gọn phân số',
            body: 'Rút gọn phân số là chia cả tử số và mẫu số cho cùng một ước chung khác 1.',
            formulas: ['$\\frac{12}{18}=\\frac{12:6}{18:6}=\\frac{2}{3}$'],
            formula: '$\\frac{12}{18}=\\frac{12:6}{18:6}=\\frac{2}{3}$',
            example: 'Phân số được rút gọn đúng khi giá trị không thay đổi.'
          },
          {
            title: 'Phân số tối giản',
            body: 'Phân số tối giản là phân số có tử số và mẫu số không còn ước chung nào lớn hơn 1.',
            formulas: ['$\\gcd(2,3)=1$'],
            formula: '$\\gcd(2,3)=1$',
            example: '$\\frac{2}{3}$ là phân số tối giản.'
          }
        ]
      },
      {
        id: 302,
        chapter_id: 3,
        lesson_name: 'Bài 60: Quy đồng mẫu số các phân số',
        sort_order: 2,
        theory_cards: [
          {
            title: 'Quy đồng mẫu số',
            body: 'Quy đồng mẫu số là biến đổi các phân số về cùng một mẫu số chung để so sánh hoặc tính toán.',
            formulas: ['$\\frac{1}{3}=\\frac{5}{15}, \\frac{2}{5}=\\frac{6}{15}$'],
            formula: '$\\frac{1}{3}=\\frac{5}{15}, \\frac{2}{5}=\\frac{6}{15}$',
            example: 'Mẫu số chung thường là bội chung nhỏ nhất của các mẫu.'
          }
        ]
      }
    ]
  },
  {
    id: 4,
    grade: 5,
    semester: 1,
    chapter_name: 'Chủ đề 2. Các phép tính với số thập phân',
    sort_order: 1,
    lessons: [
      {
        id: 401,
        chapter_id: 4,
        lesson_name: 'Bài 25: Cộng các số thập phân',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Cộng số thập phân',
            body: 'Đặt tính sao cho các dấu phẩy thẳng cột, cộng như số tự nhiên rồi viết dấu phẩy vào tổng.',
            formulas: ['$12,35 + 4,8 = 17,15$'],
            formula: '$12,35 + 4,8 = 17,15$',
            example: 'Có thể thêm chữ số 0 vào phần thập phân để dễ tính.'
          }
        ]
      }
    ]
  }
];

const questions = [
  {
    id: 1001,
    lesson_id: 101,
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'EASY',
    layout_template: 'SPLIT_HORIZONTAL_LEFT_IMAGE',
    content: {
      text: 'Trong hình có bao nhiêu chấm tròn?\n\n[image-1]',
      images: [
        {
          id: 'image-1',
          url: svgDataUri('3 chấm tròn'),
          width_percent: 100,
          alt_text: 'Ba chấm tròn để học sinh đếm',
          storage_provider: 'sample',
          public_id: null
        }
      ]
    },
    choices: [
      { key: 'A', text: '2', images: [] },
      { key: 'B', text: '3', images: [] },
      { key: 'C', text: '4', images: [] },
      { key: 'D', text: '5', images: [] }
    ],
    correct_answer: 'B',
    explanation: {
      text: 'Em đếm từng chấm tròn: 1, 2, 3. Vậy trong hình có 3 chấm tròn.',
      images: []
    }
  },
  {
    id: 1002,
    lesson_id: 101,
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'EASY',
    layout_template: 'IMAGE_IN_CHOICES',
    content: {
      text: 'Chọn hình có đúng 2 chấm tròn.',
      images: []
    },
    choices: [
      {
        key: 'A',
        text: 'Một chấm',
        images: [{ id: 'choice-A-image-1', url: svgDataUri('1 chấm', '#fef2f2', '#dc2626'), width_percent: 100, alt_text: 'Hình có một chấm tròn' }]
      },
      {
        key: 'B',
        text: 'Hai chấm',
        images: [{ id: 'choice-B-image-1', url: svgDataUri('2 chấm', '#f0fdf4', '#16a34a'), width_percent: 100, alt_text: 'Hình có hai chấm tròn' }]
      },
      {
        key: 'C',
        text: 'Ba chấm',
        images: [{ id: 'choice-C-image-1', url: svgDataUri('3 chấm', '#eff6ff', '#2563eb'), width_percent: 100, alt_text: 'Hình có ba chấm tròn' }]
      },
      {
        key: 'D',
        text: 'Bốn chấm',
        images: [{ id: 'choice-D-image-1', url: svgDataUri('4 chấm', '#fffbeb', '#d97706'), width_percent: 100, alt_text: 'Hình có bốn chấm tròn' }]
      }
    ],
    correct_answer: 'B',
    explanation: {
      text: 'Đáp án B có hai chấm tròn. Em có thể chỉ tay và đếm: 1, 2.',
      images: []
    }
  },
  {
    id: 1003,
    lesson_id: 301,
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'EASY',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Rút gọn phân số $\\frac{12}{18}$ ta được phân số nào?',
      images: []
    },
    choices: [
      { key: 'A', text: '$\\frac{2}{3}$', images: [] },
      { key: 'B', text: '$\\frac{3}{2}$', images: [] },
      { key: 'C', text: '$\\frac{6}{9}$', images: [] },
      { key: 'D', text: '$\\frac{12}{9}$', images: [] }
    ],
    correct_answer: 'A',
    explanation: {
      text: 'Ta chia cả tử số và mẫu số cho 6: $12:6=2$, $18:6=3$. Vậy $\\frac{12}{18}=\\frac{2}{3}$.',
      images: [
        {
          id: 'explanation-image-1',
          url: svgDataUri('12:6 và 18:6', '#f8fafc', '#0f766e'),
          width_percent: 70,
          alt_text: 'Minh họa chia cả tử số và mẫu số cho 6',
          storage_provider: 'sample',
          public_id: null
        }
      ]
    }
  },
  {
    id: 1004,
    lesson_id: 401,
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'MEDIUM',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Tính $12,35 + 4,8$.',
      images: []
    },
    choices: [
      { key: 'A', text: '$16,43$', images: [] },
      { key: 'B', text: '$17,15$', images: [] },
      { key: 'C', text: '$60,35$', images: [] },
      { key: 'D', text: '$12,83$', images: [] }
    ],
    correct_answer: 'B',
    explanation: {
      text: 'Viết $4,8$ thành $4,80$, rồi cộng thẳng cột: $12,35 + 4,80 = 17,15$.',
      images: []
    }
  }
];

const misconceptions = [
  {
    id: 1,
    question_id: 1001,
    distractor_key: 'A',
    misconception_name: 'Đếm thiếu một hình',
    explanation: 'Em có thể đã bỏ sót một chấm tròn. Hãy chỉ vào từng chấm và đếm lại từ 1.'
  },
  {
    id: 2,
    question_id: 1002,
    distractor_key: 'C',
    misconception_name: 'Đếm thừa hình',
    explanation: 'Em đang chọn hình có 3 chấm. Đề yêu cầu đúng 2 chấm, nên cần đếm lại chậm hơn.'
  },
  {
    id: 3,
    question_id: 1003,
    distractor_key: 'C',
    misconception_name: 'Chưa rút gọn đến tối giản',
    explanation: 'Em mới chia cả tử và mẫu cho 2. Hãy tiếp tục tìm ước chung lớn hơn để rút gọn đến phân số tối giản.'
  },
  {
    id: 4,
    question_id: 1004,
    distractor_key: 'A',
    misconception_name: 'Đặt lệch dấu phẩy',
    explanation: 'Khi cộng số thập phân, cần đặt các dấu phẩy thẳng cột rồi mới cộng từng hàng.'
  }
];

const studentLogs = [];
const aiLogs = [];
const students = [];
let systemSettings = {
  ai_provider: process.env.AI_PROVIDER || 'nvidia',
  ai_automation_enabled: process.env.AI_AUTOMATION_ENABLED || 'true',
  ai_json_timeout_ms: process.env.AI_JSON_TIMEOUT_MS || '45000',
  ai_enabled_grades: process.env.AI_ENABLED_GRADES || '3,4,5',
  ai_max_hints_per_question: process.env.AI_MAX_HINTS_PER_QUESTION || '2',
  ai_max_hints_per_session: process.env.AI_MAX_HINTS_PER_SESSION || '8',
  ai_require_answer_before_help: process.env.AI_REQUIRE_ANSWER_BEFORE_HELP || 'true',
  openai_api_key: process.env.OPENAI_API_KEY || '',
  openai_base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openai_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openai_vision_model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  openai_embedding_model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  gemini_api_key: process.env.GEMINI_API_KEY || '',
  gemini_model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  gemini_cli_model: process.env.GEMINI_CLI_MODEL || 'gemini-2.5-flash-lite',
  gemini_cli_timeout_ms: process.env.GEMINI_CLI_TIMEOUT_MS || '120000',
  nvidia_nim_api_key: process.env.NVIDIA_NIM_API_KEY || '',
  nvidia_nim_base_url: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidia_nim_model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
  nvidia_nim_vision_model: process.env.NVIDIA_NIM_VISION_MODEL || 'meta/llama-3.2-90b-vision-instruct',
  nvidia_nim_embedding_model: process.env.NVIDIA_NIM_EMBEDDING_MODEL || 'nvidia/nv-embedqa-e5-v5',
  openrouter_api_key: process.env.OPENROUTER_API_KEY || '',
  openrouter_base_url: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  openrouter_model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinary_api_key: process.env.CLOUDINARY_API_KEY || '',
  cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET || ''
};
const admins = [
  {
    id: 1,
    username: 'admin',
    password_hash: '$2b$10$Px9plvW0cgBO6TvqWiEiFOYSO3FvjvVfslUIdG2RjQCVjRZxv8qH2',
    fullname: 'Quản trị viên',
    role: 'SYSADMIN',
    is_active: 1
  },
  {
    id: 2,
    username: 'content',
    password_hash: '$2b$10$O8L4rOVXq6VMZQZlOpI7buYV6CY6hSyg0hBniX/EZnUkdyrOV3Pgi',
    fullname: 'Biên soạn nội dung',
    role: 'CONTENT_ADMIN',
    is_active: 1
  }
];

module.exports = {
  chapters,
  questions,
  misconceptions,
  studentLogs,
  aiLogs,
  students,
  admins,
  systemSettings
};
