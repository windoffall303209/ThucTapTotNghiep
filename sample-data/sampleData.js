const chapters = [
  {
    id: 1,
    grade: 4,
    chapter_name: 'Chủ đề 3. Phân số',
    sort_order: 1,
    lessons: [
      {
        id: 101,
        chapter_id: 1,
        lesson_name: 'Bài 59: Rút gọn phân số',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Rút gọn phân số',
            body: 'Rút gọn phân số là chia cả tử số và mẫu số cho cùng một ước chung khác 1.',
            formula: '$\\frac{12}{18}=\\frac{12:6}{18:6}=\\frac{2}{3}$',
            example: 'Phân số được rút gọn đúng khi giá trị không thay đổi.'
          },
          {
            title: 'Phân số tối giản',
            body: 'Phân số tối giản là phân số có tử số và mẫu số không còn ước chung nào lớn hơn 1.',
            formula: '$\\gcd(2,3)=1$',
            example: '$\\frac{2}{3}$ là phân số tối giản.'
          }
        ]
      },
      {
        id: 102,
        chapter_id: 1,
        lesson_name: 'Bài 60: Quy đồng mẫu số các phân số',
        sort_order: 2,
        theory_cards: [
          {
            title: 'Quy đồng mẫu số',
            body: 'Quy đồng mẫu số là biến đổi các phân số về cùng một mẫu số chung để so sánh hoặc tính toán.',
            formula: '$\\frac{1}{3}=\\frac{5}{15}, \\frac{2}{5}=\\frac{6}{15}$',
            example: 'Mẫu số chung thường là bội chung nhỏ nhất của các mẫu.'
          }
        ]
      }
    ]
  },
  {
    id: 2,
    grade: 5,
    chapter_name: 'Chủ đề 2. Các phép tính với số thập phân',
    sort_order: 1,
    lessons: [
      {
        id: 201,
        chapter_id: 2,
        lesson_name: 'Bài 25. Cộng các số thập phân',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Cộng số thập phân',
            body: 'Đặt tính sao cho các dấu phẩy thẳng cột, cộng như số tự nhiên rồi viết dấu phẩy vào tổng.',
            formula: '$12,35 + 4,8 = 17,15$',
            example: 'Có thể thêm chữ số 0 vào phần thập phân để dễ tính.'
          }
        ]
      }
    ]
  },
  {
    id: 3,
    grade: 6,
    chapter_name: 'Chương 5. Phân số và số thập phân',
    sort_order: 1,
    lessons: [
      {
        id: 301,
        chapter_id: 3,
        lesson_name: 'Bài 3. Phép cộng và phép trừ phân số',
        sort_order: 1,
        theory_cards: [
          {
            title: 'Cộng phân số khác mẫu',
            body: 'Quy đồng mẫu số trước, sau đó cộng các tử số và giữ nguyên mẫu số chung.',
            formula: '$\\frac{1}{3}+\\frac{2}{5}=\\frac{5}{15}+\\frac{6}{15}=\\frac{11}{15}$',
            example: 'Không cộng trực tiếp hai mẫu số.'
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
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Rút gọn phân số $\\frac{12}{18}$ ta được phân số nào?',
      images: []
    },
    choices: [
      { key: 'A', text: '$\\frac{2}{3}$' },
      { key: 'B', text: '$\\frac{3}{2}$' },
      { key: 'C', text: '$\\frac{6}{9}$' },
      { key: 'D', text: '$\\frac{12}{9}$' }
    ],
    correct_answer: 'A',
    explanation: {
      text: 'Ta chia cả tử số và mẫu số cho 6: $12:6=2$, $18:6=3$. Vậy $\\frac{12}{18}=\\frac{2}{3}$.',
      images: []
    }
  },
  {
    id: 1002,
    lesson_id: 101,
    concept_id: null,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'MEDIUM',
    layout_template: 'STACK_VERTICAL',
    content: {
      text: 'Phân số nào bằng $\\frac{3}{5}$?',
      images: []
    },
    choices: [
      { key: 'A', text: '$\\frac{6}{15}$' },
      { key: 'B', text: '$\\frac{9}{15}$' },
      { key: 'C', text: '$\\frac{12}{15}$' },
      { key: 'D', text: '$\\frac{15}{9}$' }
    ],
    correct_answer: 'B',
    explanation: {
      text: 'Nhân cả tử số và mẫu số của $\\frac{3}{5}$ với 3, ta được $\\frac{9}{15}$.',
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
      text: 'Tính $\\frac{1}{3}+\\frac{2}{5}$.',
      images: []
    },
    choices: [
      { key: 'A', text: '$\\frac{3}{8}$' },
      { key: 'B', text: '$\\frac{11}{15}$' },
      { key: 'C', text: '$\\frac{3}{15}$' },
      { key: 'D', text: '$\\frac{2}{15}$' }
    ],
    correct_answer: 'B',
    explanation: {
      text: 'Mẫu chung là 15. Ta có $\\frac{1}{3}=\\frac{5}{15}$ và $\\frac{2}{5}=\\frac{6}{15}$, nên tổng là $\\frac{11}{15}$.',
      images: []
    }
  }
];

const misconceptions = [
  {
    id: 1,
    question_id: 1001,
    distractor_key: 'C',
    misconception_name: 'Chưa rút gọn đến tối giản',
    explanation: 'Em mới chia cả tử và mẫu cho 2. Hãy tiếp tục tìm ước chung lớn hơn để rút gọn đến phân số tối giản.'
  },
  {
    id: 2,
    question_id: 1003,
    distractor_key: 'A',
    misconception_name: 'Cộng cả tử số và mẫu số',
    explanation: 'Em đang cộng tử với tử và mẫu với mẫu. Với phân số khác mẫu, cần quy đồng mẫu số trước.'
  },
  {
    id: 3,
    question_id: 1003,
    distractor_key: 'C',
    misconception_name: 'Chưa cộng tử số sau khi quy đồng',
    explanation: 'Em đã tìm mẫu chung 15 nhưng cần đổi tử số thành 5 và 6 rồi cộng lại.'
  }
];

const studentLogs = [];
const aiLogs = [];
const students = [];
let systemSettings = {
  ai_provider: process.env.AI_PROVIDER || 'nvidia',
  ai_automation_enabled: process.env.AI_AUTOMATION_ENABLED || 'true',
  ai_json_timeout_ms: process.env.AI_JSON_TIMEOUT_MS || '45000',
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
  nvidia_nim_model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct',
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
