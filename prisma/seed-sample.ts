import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VIDEO_URL =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

// ---------------------------------------------------------------------------
// Tipos auxiliares do seed
// ---------------------------------------------------------------------------

type AlternativeSeed = {
  text: string;
  isCorrect: boolean;
};

type QuestionSeed = {
  statement: string;
  subject: string;
  explanation: string;
  difficulty: number;
  orderNumber: number;
  points: number;
  alternatives: AlternativeSeed[];
};

type ExamSeed = {
  title: string;
  slug: string;
  examType: "TECNOLOGIA" | "ENEM";
  description: string;
  timeLimit: number;
  isPremiumOnly: boolean;
  questions: QuestionSeed[];
};

type LessonSeed = {
  title: string;
  description: string;
  duration: number;
  orderNumber: number;
};

type ModuleSeed = {
  title: string;
  description: string;
  orderNumber: number;
  lessons: LessonSeed[];
};

type CourseSeed = {
  title: string;
  slug: string;
  categoryName: string;
  shortDescription: string;
  description: string;
  estimatedHours: number;
  modules: ModuleSeed[];
};

type TutorialSeed = {
  title: string;
  slug: string;
  categoryName: string;
  description: string;
  duration: number;
  tags: string[];
};

// ---------------------------------------------------------------------------
// Conteúdo de exemplo (pt-BR)
// ---------------------------------------------------------------------------

const EXAMS: ExamSeed[] = [
  {
    title: "Lógica de Programação",
    slug: "logica-de-programacao",
    examType: "TECNOLOGIA",
    description:
      "Simulado introdutório de lógica de programação: algoritmos, variáveis, condicionais e repetições.",
    timeLimit: 60,
    isPremiumOnly: false,
    questions: [
      {
        statement: "O que é um algoritmo?",
        subject: "Algoritmos",
        explanation:
          "Um algoritmo é uma sequência finita e ordenada de passos para resolver um problema.",
        difficulty: 1,
        orderNumber: 1,
        points: 1,
        alternatives: [
          { text: "Uma sequência finita de passos para resolver um problema", isCorrect: true },
          { text: "Uma linguagem de programação compilada", isCorrect: false },
          { text: "Um tipo de banco de dados relacional", isCorrect: false },
          { text: "Um erro de sintaxe no código-fonte", isCorrect: false },
        ],
      },
      {
        statement: "Qual das opções representa uma variável?",
        subject: "Variáveis",
        explanation:
          "Variável é um espaço nomeado na memória que armazena um valor que pode mudar.",
        difficulty: 1,
        orderNumber: 2,
        points: 1,
        alternatives: [
          { text: "Um valor fixo que nunca pode mudar", isCorrect: false },
          { text: "Um nome que referencia um valor armazenado na memória", isCorrect: true },
          { text: "Um comando de repetição", isCorrect: false },
          { text: "Um tipo de comentário no código", isCorrect: false },
        ],
      },
      {
        statement: "Para que serve uma estrutura condicional (se/então)?",
        subject: "Condicionais",
        explanation:
          "A condicional permite executar trechos diferentes do programa conforme uma condição seja verdadeira ou falsa.",
        difficulty: 1,
        orderNumber: 3,
        points: 1,
        alternatives: [
          { text: "Repetir um bloco de código várias vezes", isCorrect: false },
          { text: "Executar blocos diferentes conforme uma condição", isCorrect: true },
          { text: "Declarar variáveis globais", isCorrect: false },
          { text: "Importar bibliotecas externas", isCorrect: false },
        ],
      },
      {
        statement: "O que faz um laço de repetição 'enquanto' (while)?",
        subject: "Repetição",
        explanation:
          "O laço 'enquanto' repete um bloco enquanto a condição testada no início for verdadeira.",
        difficulty: 2,
        orderNumber: 4,
        points: 1,
        alternatives: [
          { text: "Executa o bloco uma única vez, sem testes", isCorrect: false },
          { text: "Repete o bloco enquanto a condição for verdadeira", isCorrect: true },
          { text: "Interrompe o programa imediatamente", isCorrect: false },
          { text: "Converte texto em número", isCorrect: false },
        ],
      },
      {
        statement: "O que é uma função em programação?",
        subject: "Funções",
        explanation:
          "Função é um bloco reutilizável que recebe entradas (parâmetros) e pode devolver um resultado.",
        difficulty: 2,
        orderNumber: 5,
        points: 1,
        alternatives: [
          { text: "Um erro que trava o programa", isCorrect: false },
          { text: "Um bloco reutilizável que pode receber valores e retornar um resultado", isCorrect: true },
          { text: "Um tipo de variável que só guarda texto", isCorrect: false },
          { text: "Um atalho para desligar o computador", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "JavaScript Essencial",
    slug: "javascript-essencial",
    examType: "TECNOLOGIA",
    description:
      "Simulado dos fundamentos de JavaScript: variáveis, arrays, funções, igualdade e assincronicidade.",
    timeLimit: 45,
    isPremiumOnly: false,
    questions: [
      {
        statement: "Qual a diferença entre 'let' e 'const' em JavaScript?",
        subject: "Variáveis",
        explanation:
          "'let' permite reatribuição; 'const' cria uma referência que não pode ser reatribuída.",
        difficulty: 1,
        orderNumber: 1,
        points: 1,
        alternatives: [
          { text: "Não há diferença entre eles", isCorrect: false },
          { text: "'let' permite reatribuir, 'const' não permite reatribuir", isCorrect: true },
          { text: "'const' só serve para números", isCorrect: false },
          { text: "'let' é mais rápido que 'const'", isCorrect: false },
        ],
      },
      {
        statement: "O que o método 'map' de um array retorna?",
        subject: "Arrays",
        explanation:
          "'map' cria e retorna um novo array com o resultado da função aplicada a cada elemento.",
        difficulty: 2,
        orderNumber: 2,
        points: 1,
        alternatives: [
          { text: "Um novo array com os elementos transformados", isCorrect: true },
          { text: "O primeiro elemento do array", isCorrect: false },
          { text: "Sempre um número", isCorrect: false },
          { text: "Nada, ele só imprime no console", isCorrect: false },
        ],
      },
      {
        statement: "Qual a diferença entre '==' e '===' em JavaScript?",
        subject: "Operadores",
        explanation:
          "'==' compara com conversão de tipo; '===' compara valor e tipo, sem conversão.",
        difficulty: 2,
        orderNumber: 3,
        points: 1,
        alternatives: [
          { text: "São idênticos em qualquer situação", isCorrect: false },
          { text: "'==' converte tipos antes de comparar; '===' exige mesmo valor e tipo", isCorrect: true },
          { text: "'===' só funciona com strings", isCorrect: false },
          { text: "'==' é mais moderno que '==='", isCorrect: false },
        ],
      },
      {
        statement: "Para que serve 'async/await' em JavaScript?",
        subject: "Assincronicidade",
        explanation:
          "'async/await' permite escrever código assíncrono (como Promises) de forma sequencial e legível.",
        difficulty: 3,
        orderNumber: 4,
        points: 1,
        alternatives: [
          { text: "Para declarar variáveis globais", isCorrect: false },
          { text: "Para estilizar elementos HTML", isCorrect: false },
          { text: "Para lidar com operações assíncronas de forma legível", isCorrect: true },
          { text: "Para compilar o código para binário", isCorrect: false },
        ],
      },
      {
        statement: "O que é hoisting em JavaScript?",
        subject: "Fundamentos",
        explanation:
          "Hoisting é o comportamento de mover declarações (ex.: 'var' e funções) para o topo do escopo antes da execução.",
        difficulty: 3,
        orderNumber: 5,
        points: 1,
        alternatives: [
          { text: "Uma técnica de hospedagem de sites", isCorrect: false },
          { text: "O içamento de declarações para o topo do escopo antes da execução", isCorrect: true },
          { text: "Um método para ordenar arrays", isCorrect: false },
          { text: "Um tipo de ataque de segurança", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "ENEM Matemática",
    slug: "enem-matematica",
    examType: "ENEM",
    description:
      "Simulado estilo ENEM de matemática: porcentagem, funções, probabilidade, geometria e proporção.",
    timeLimit: 120,
    isPremiumOnly: false,
    questions: [
      {
        statement:
          "Uma loja dá 20% de desconto em um produto de R$ 250,00. Qual o preço final?",
        subject: "Porcentagem",
        explanation:
          "20% de 250 = 50. Preço final: 250 − 50 = R$ 200,00.",
        difficulty: 1,
        orderNumber: 1,
        points: 1,
        alternatives: [
          { text: "R$ 230,00", isCorrect: false },
          { text: "R$ 200,00", isCorrect: true },
          { text: "R$ 180,00", isCorrect: false },
          { text: "R$ 210,00", isCorrect: false },
        ],
      },
      {
        statement:
          "Na função f(x) = 2x + 3, qual é o valor de f(4)?",
        subject: "Função do 1º grau",
        explanation: "f(4) = 2·4 + 3 = 8 + 3 = 11.",
        difficulty: 1,
        orderNumber: 2,
        points: 1,
        alternatives: [
          { text: "9", isCorrect: false },
          { text: "10", isCorrect: false },
          { text: "11", isCorrect: true },
          { text: "12", isCorrect: false },
        ],
      },
      {
        statement:
          "Em uma urna com 5 bolas vermelhas e 3 bolas azuis, qual a probabilidade de sortear uma bola azul?",
        subject: "Probabilidade",
        explanation: "Casos favoráveis 3 em 8 possíveis: 3/8.",
        difficulty: 2,
        orderNumber: 3,
        points: 1,
        alternatives: [
          { text: "3/5", isCorrect: false },
          { text: "3/8", isCorrect: true },
          { text: "5/8", isCorrect: false },
          { text: "1/3", isCorrect: false },
        ],
      },
      {
        statement:
          "Qual é a área de um retângulo de base 8 cm e altura 5 cm?",
        subject: "Geometria",
        explanation: "Área do retângulo: base × altura = 8 × 5 = 40 cm².",
        difficulty: 1,
        orderNumber: 4,
        points: 1,
        alternatives: [
          { text: "13 cm²", isCorrect: false },
          { text: "26 cm²", isCorrect: false },
          { text: "40 cm²", isCorrect: true },
          { text: "45 cm²", isCorrect: false },
        ],
      },
      {
        statement:
          "Um carro percorre 180 km com 12 litros de gasolina. Mantendo o consumo, quantos litros são necessários para 300 km?",
        subject: "Razão e proporção",
        explanation:
          "Regra de três: 180/12 = 300/x → x = (300·12)/180 = 20 litros.",
        difficulty: 2,
        orderNumber: 5,
        points: 1,
        alternatives: [
          { text: "15 litros", isCorrect: false },
          { text: "18 litros", isCorrect: false },
          { text: "20 litros", isCorrect: true },
          { text: "25 litros", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "Banco de Dados SQL",
    slug: "banco-de-dados-sql",
    examType: "TECNOLOGIA",
    description:
      "Simulado de SQL: SELECT, WHERE, JOIN, agregações e chaves primárias. Conteúdo premium.",
    timeLimit: 90,
    isPremiumOnly: true,
    questions: [
      {
        statement: "Para que serve o comando SELECT em SQL?",
        subject: "Consultas",
        explanation:
          "SELECT consulta e retorna dados de uma ou mais tabelas.",
        difficulty: 1,
        orderNumber: 1,
        points: 1,
        alternatives: [
          { text: "Consultar e retornar dados de tabelas", isCorrect: true },
          { text: "Criar um novo banco de dados", isCorrect: false },
          { text: "Apagar todos os registros", isCorrect: false },
          { text: "Criar usuários do banco", isCorrect: false },
        ],
      },
      {
        statement: "O que a cláusula WHERE faz em uma query?",
        subject: "Filtros",
        explanation:
          "WHERE filtra as linhas retornadas, mantendo apenas as que satisfazem a condição.",
        difficulty: 1,
        orderNumber: 2,
        points: 1,
        alternatives: [
          { text: "Ordena os resultados", isCorrect: false },
          { text: "Agrupa os resultados", isCorrect: false },
          { text: "Filtra as linhas conforme uma condição", isCorrect: true },
          { text: "Une duas tabelas", isCorrect: false },
        ],
      },
      {
        statement: "Para que serve um INNER JOIN?",
        subject: "Junções",
        explanation:
          "INNER JOIN combina linhas de duas tabelas mantendo apenas os registros com correspondência nas duas.",
        difficulty: 2,
        orderNumber: 3,
        points: 1,
        alternatives: [
          { text: "Apagar registros duplicados", isCorrect: false },
          { text: "Combinar linhas com correspondência nas duas tabelas", isCorrect: true },
          { text: "Criar uma nova tabela vazia", isCorrect: false },
          { text: "Fazer backup do banco", isCorrect: false },
        ],
      },
      {
        statement: "O que a função COUNT(*) retorna?",
        subject: "Agregações",
        explanation:
          "COUNT(*) retorna o número total de linhas do conjunto (incluindo nulas).",
        difficulty: 2,
        orderNumber: 4,
        points: 1,
        alternatives: [
          { text: "A soma dos valores de uma coluna", isCorrect: false },
          { text: "A média dos valores", isCorrect: false },
          { text: "O número total de linhas", isCorrect: true },
          { text: "O maior valor da tabela", isCorrect: false },
        ],
      },
      {
        statement: "O que é uma chave primária (PRIMARY KEY)?",
        subject: "Modelagem",
        explanation:
          "É a coluna (ou conjunto) que identifica unicamente cada linha da tabela, sem nulos nem duplicatas.",
        difficulty: 3,
        orderNumber: 5,
        points: 1,
        alternatives: [
          { text: "Uma senha de acesso ao banco", isCorrect: false },
          { text: "Um índice que acelera qualquer consulta", isCorrect: false },
          { text: "A coluna que identifica unicamente cada linha, sem nulos", isCorrect: true },
          { text: "Uma cópia de segurança da tabela", isCorrect: false },
        ],
      },
    ],
  },
];

const COURSES: CourseSeed[] = [
  {
    title: "React Native do Zero",
    slug: "react-native-do-zero",
    categoryName: "Programação",
    shortDescription: "Aprenda a criar apps mobile com React Native e Expo.",
    description:
      "Curso introdutório de React Native: do ambiente Expo aos primeiros componentes, navegação e estado.",
    estimatedHours: 8,
    modules: [
      {
        title: "Primeiros passos",
        description: "Configuração do ambiente e criação do primeiro componente.",
        orderNumber: 1,
        lessons: [
          {
            title: "Instalando o ambiente Expo",
            description:
              "Nesta aula você instala Node.js e o Expo, cria o projeto e roda o app no celular.",
            duration: 12,
            orderNumber: 1,
          },
          {
            title: "Seu primeiro componente",
            description:
              "Entenda JSX, props e estilização básica criando sua primeira tela.",
            duration: 15,
            orderNumber: 2,
          },
        ],
      },
      {
        title: "Navegação e estado",
        description: "Navegação entre telas e gerenciamento de estado local.",
        orderNumber: 2,
        lessons: [
          {
            title: "Navegação com expo-router",
            description:
              "Aprenda a organizar rotas por arquivos e navegar entre telas do app.",
            duration: 18,
            orderNumber: 1,
          },
          {
            title: "Estado com useState",
            description:
              "Use o hook useState para criar telas interativas que reagem ao usuário.",
            duration: 14,
            orderNumber: 2,
          },
        ],
      },
    ],
  },
  {
    title: "Python para Iniciantes",
    slug: "python-para-iniciantes",
    categoryName: "Programação",
    shortDescription: "Primeiros passos com Python: sintaxe, controle e dados.",
    description:
      "Curso básico de Python cobrindo instalação, sintaxe, estruturas de controle e coleções de dados.",
    estimatedHours: 10,
    modules: [
      {
        title: "Fundamentos",
        description: "Instalação, sintaxe básica e estruturas de controle.",
        orderNumber: 1,
        lessons: [
          {
            title: "Instalação e primeiro script",
            description:
              "Instale o Python, conheça o terminal e escreva seu primeiro programa.",
            duration: 10,
            orderNumber: 1,
          },
          {
            title: "Condicionais e laços",
            description:
              "Controle o fluxo do programa com if/else, for e while.",
            duration: 16,
            orderNumber: 2,
          },
        ],
      },
      {
        title: "Estruturas de dados",
        description: "Listas, dicionários e como organizar informações.",
        orderNumber: 2,
        lessons: [
          {
            title: "Listas e tuplas",
            description:
              "Guarde coleções de valores com listas e entenda a diferença para tuplas.",
            duration: 13,
            orderNumber: 1,
          },
          {
            title: "Dicionários na prática",
            description:
              "Associe chaves a valores com dicionários e resolva um exercício guiado.",
            duration: 17,
            orderNumber: 2,
          },
        ],
      },
    ],
  },
  {
    title: "Git e GitHub",
    slug: "git-e-github",
    categoryName: "Ferramentas",
    shortDescription: "Versione seus projetos com Git e publique no GitHub.",
    description:
      "Aprenda commits, branches e colaboração no GitHub para versionar seus projetos com segurança.",
    estimatedHours: 4,
    modules: [
      {
        title: "Essencial de Git",
        description: "Do primeiro commit ao trabalho com repositórios remotos.",
        orderNumber: 1,
        lessons: [
          {
            title: "Primeiro commit",
            description:
              "Configure sua identidade, inicialize um repositório e faça o primeiro commit.",
            duration: 11,
            orderNumber: 1,
          },
          {
            title: "Branches sem medo",
            description:
              "Crie ramificações, alterne entre elas e faça merge com confiança.",
            duration: 15,
            orderNumber: 2,
          },
          {
            title: "Publicando no GitHub",
            description:
              "Conecte o repositório local ao GitHub com push, pull e clone.",
            duration: 12,
            orderNumber: 3,
          },
        ],
      },
    ],
  },
];

const TUTORIALS: TutorialSeed[] = [
  {
    title: "Como estudar com flashcards",
    slug: "como-estudar-com-flashcards",
    categoryName: "Métodos de Estudo",
    description:
      "Aprenda a técnica de repetição espaçada com flashcards para memorizar fórmulas, datas e conceitos.",
    duration: 8,
    tags: ["flashcards", "memorização", "estudo"],
  },
  {
    title: "5 erros em simulados",
    slug: "5-erros-em-simulados",
    categoryName: "Simulados",
    description:
      "Os 5 erros mais comuns ao fazer simulados — e como evitá-los para render mais na prova.",
    duration: 10,
    tags: ["simulados", "estratégia", "provas"],
  },
  {
    title: "Guia da prova ENEM",
    slug: "guia-da-prova-enem",
    categoryName: "ENEM",
    description:
      "Guia completo da prova do ENEM: formato, áreas do conhecimento, TRI e estratégias de tempo.",
    duration: 12,
    tags: ["enem", "guia", "estratégia"],
  },
];

// ---------------------------------------------------------------------------
// Seed idempotente (upsert por slug + recriação de filhos)
// ---------------------------------------------------------------------------

async function seedExams() {
  for (const exam of EXAMS) {
    // Exam possui slug @unique → upsert direto.
    const saved = await prisma.exam.upsert({
      where: { slug: exam.slug },
      update: {
        title: exam.title,
        examType: exam.examType,
        description: exam.description,
        timeLimit: exam.timeLimit,
        isPublished: true,
        isPremiumOnly: exam.isPremiumOnly,
      },
      create: {
        title: exam.title,
        slug: exam.slug,
        examType: exam.examType,
        description: exam.description,
        timeLimit: exam.timeLimit,
        isPublished: true,
        isPremiumOnly: exam.isPremiumOnly,
      },
    });

    // ExamQuestion/ExamAlternative não têm campo único próprio:
    // apaga as filhas (alternativas caem em cascata) e recria.
    await prisma.examQuestion.deleteMany({ where: { examId: saved.id } });

    for (const q of exam.questions) {
      await prisma.examQuestion.create({
        data: {
          examId: saved.id,
          statement: q.statement,
          subject: q.subject,
          explanation: q.explanation,
          difficulty: q.difficulty,
          orderNumber: q.orderNumber,
          points: q.points,
          type: "MULTIPLE_CHOICE",
          alternatives: {
            create: q.alternatives.map((a) => ({
              text: a.text,
              isCorrect: a.isCorrect,
            })),
          },
        },
      });
    }

    console.log(
      `  ✓ Exam ${exam.slug} (${exam.questions.length} questões)`,
    );
  }
}

async function seedCourses() {
  for (const course of COURSES) {
    // Course exige categoryId → Category por name @unique.
    const category = await prisma.category.upsert({
      where: { name: course.categoryName },
      update: {},
      create: {
        name: course.categoryName,
        description: `Categoria ${course.categoryName} (seed de exemplo).`,
      },
    });

    // Course possui slug @unique → upsert direto.
    const saved = await prisma.course.upsert({
      where: { slug: course.slug },
      update: {
        title: course.title,
        categoryId: category.id,
        shortDescription: course.shortDescription,
        description: course.description,
        estimatedHours: course.estimatedHours,
        progressionType: "FREE",
        status: "APPROVED",
        isPublished: true,
      },
      create: {
        title: course.title,
        slug: course.slug,
        categoryId: category.id,
        shortDescription: course.shortDescription,
        description: course.description,
        estimatedHours: course.estimatedHours,
        progressionType: "FREE",
        status: "APPROVED",
        isPublished: true,
      },
    });

    // Module/Lesson não têm campo único próprio:
    // apaga os módulos (aulas caem em cascata) e recria.
    await prisma.module.deleteMany({ where: { courseId: saved.id } });

    for (const m of course.modules) {
      await prisma.module.create({
        data: {
          courseId: saved.id,
          title: m.title,
          description: m.description,
          orderNumber: m.orderNumber,
          lessons: {
            create: m.lessons.map((l) => ({
              title: l.title,
              description: l.description,
              videoUrl: VIDEO_URL,
              videoProvider: "other",
              duration: l.duration,
              orderNumber: l.orderNumber,
            })),
          },
        },
      });
    }

    const lessonCount = course.modules.reduce(
      (acc, m) => acc + m.lessons.length,
      0,
    );
    console.log(
      `  ✓ Course ${course.slug} (${course.modules.length} módulos, ${lessonCount} aulas)`,
    );
  }
}

async function seedTutorials(authorId: string) {
  for (const tutorial of TUTORIALS) {
    const category = await prisma.category.upsert({
      where: { name: tutorial.categoryName },
      update: {},
      create: {
        name: tutorial.categoryName,
        description: `Categoria ${tutorial.categoryName} (seed de exemplo).`,
      },
    });

    // Tutorial possui slug @unique → upsert direto.
    // viewCount vai só no create para não zerar visualizações reais em re-runs.
    const saved = await prisma.tutorial.upsert({
      where: { slug: tutorial.slug },
      update: {
        title: tutorial.title,
        description: tutorial.description,
        videoUrl: VIDEO_URL,
        duration: tutorial.duration,
        categoryId: category.id,
        isPublished: true,
      },
      create: {
        authorId,
        categoryId: category.id,
        title: tutorial.title,
        slug: tutorial.slug,
        description: tutorial.description,
        videoUrl: VIDEO_URL,
        duration: tutorial.duration,
        isPublished: true,
        viewCount: 0,
      },
    });

    // Tags via join TutorialTag (@@id [tutorialId, tagId]).
    for (const tagName of tutorial.tags) {
      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });
      await prisma.tutorialTag.upsert({
        where: {
          tutorialId_tagId: { tutorialId: saved.id, tagId: tag.id },
        },
        update: {},
        create: { tutorialId: saved.id, tagId: tag.id },
      });
    }

    console.log(`  ✓ Tutorial ${tutorial.slug}`);
  }
}

async function main() {
  console.log("🌱 Seed de conteúdo de exemplo (idempotente)...");

  await seedExams();
  await seedCourses();

  // Tutorial exige authorId → usuário seed "Equipe Hexavante".
  const author = await prisma.user.upsert({
    where: { email: "equipe@hexavante.com" },
    update: {},
    create: {
      email: "equipe@hexavante.com",
      username: "equipe-hexavante",
      fullName: "Equipe Hexavante",
      emailVerified: true,
    },
  });
  await seedTutorials(author.id);

  console.log("✅ Seed de exemplo concluído.");
}

main()
  .catch((e) => {
    console.error("❌ Falha no seed de exemplo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
