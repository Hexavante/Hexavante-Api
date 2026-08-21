import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@better-auth/utils/password";

const prisma = new PrismaClient();

// ── Helpers ─────────────────────────────────────────────
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function createUser(
  email: string,
  password: string,
  data: {
    username: string;
    fullName: string;
    birthDate: Date;
    role: string;
    level?: number;
    totalXp?: number;
    coins?: number;
    league?: "BRONZE" | "SILVER" | "GOLD";
    isVerified?: boolean;
    isPremium?: boolean;
    bio?: string;
    city?: string;
    state?: string;
  },
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ~ ${email} já existe, pulando`);
    return existing;
  }

  const passwordHash = await hashPassword(password);
  const role = await prisma.role.findUnique({ where: { name: data.role } });

  const user = await prisma.user.create({
    data: {
      username: data.username,
      fullName: data.fullName,
      email,
      passwordHash,
      birthDate: data.birthDate,
      bio: data.bio,
      city: data.city,
      state: data.state,
      emailVerified: true,
      isVerified: data.isVerified ?? false,
      isPremium: data.isPremium ?? false,
      ...(role && {
        roles: {
          create: { roleId: role.id },
        },
      }),
      xp: {
        create: {
          level: data.level ?? 1,
          currentXp: data.totalXp ? data.totalXp % 1000 : 0,
          totalXp: data.totalXp ?? 0,
          league: data.league ?? "BRONZE",
        },
      },
      wallet: {
        create: {
          coins: data.coins ?? 0,
        },
      },
      // Better Auth requires a credential Account record for signInEmail
      accounts: {
        create: {
          type: "credential",
          providerId: "credential",
          accountId: email,
          password: passwordHash,
        },
      },
    },
  });

  console.log(`  ✓ ${email} (${data.role})`);
  return user;
}

// ── Categories ──────────────────────────────────────────
const CATEGORIES = [
  { name: "Matemática", description: "Números, álgebra, geometria, cálculo e estatística" },
  { name: "Português", description: "Gramática, literatura, redação e interpretação de texto" },
  { name: "Ciências da Natureza", description: "Física, química e biologia" },
  { name: "Ciências Humanas", description: "História, geografia, filosofia e sociologia" },
  { name: "Inglês", description: "Língua inglesa para vestibulares e ENEM" },
  { name: "Tecnologia", description: "Programação, ciência da computação e TI" },
];

async function seedCategories(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    map[c.name] = cat.id;
    console.log(`  ✓ Categoria: ${c.name}`);
  }
  return map;
}

// ── Courses ─────────────────────────────────────────────
interface CourseSeed {
  title: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  courseType: "FREE" | "PAID" | "PREMIUM";
  estimatedHours: number;
  modules: {
    title: string;
    description: string;
    lessons: {
      title: string;
      description: string;
      duration: number;
      videoUrl?: string;
      videoProvider?: "youtube";
    }[];
    materials?: { title: string; fileUrl: string; fileType: string }[];
  }[];
}

const COURSES: CourseSeed[] = [
  {
    title: "Matemática Básica para ENEM",
    slug: "matematica-basica-enem",
    category: "Matemática",
    shortDescription: "Domine os fundamentos da matemática para o ENEM com aulas práticas e exercícios.",
    description:
      "Curso completo de Matemática Básica focado no ENEM. Aborda conjuntos numéricos, proporções, regra de três, porcentagem, juros, geometria plana e espacial, estatística básica e análise combinatória. Ideal para quem quer reforçar a base e garantir uma boa pontuação na prova de Matemática.",
    level: "BEGINNER",
    courseType: "FREE",
    estimatedHours: 40,
    modules: [
      {
        title: "Conjuntos Numéricos",
        description: "Números naturais, inteiros, racionais, irracionais e reais",
        lessons: [
          { title: "Números Naturais e Inteiros", description: "Propriedades e operações básicas", duration: 25 },
          { title: "Números Racionais", description: "Frações, decimais e dízimas", duration: 30 },
          { title: "Potenciação e Radiciação", description: "Propriedades das potências e raízes", duration: 35 },
        ],
      },
      {
        title: "Geometria Plana",
        description: "Figuras geométricas, áreas e perímetros",
        lessons: [
          { title: "Triângulos e Teorema de Pitágoras", description: "Classificação e relações métricas", duration: 40 },
          { title: "Quadriláteros e Circunferência", description: "Propriedades e fórmulas de área", duration: 35 },
        ],
      },
    ],
  },
  {
    title: "Redação Nota 1000",
    slug: "redacao-nota-1000",
    category: "Português",
    shortDescription: "Aprenda a estrutura da redação ENEM e garanta sua nota máxima.",
    description:
      "Curso intensivo de redação para o ENEM e vestibulares. Aborda a estrutura dissertativo-argumentativa, competências do ENEM, repertórios socioculturais, proposta de intervenção e dicas para cada competência. Inclui correção de redações-modelo e análise de temas quentes.",
    level: "INTERMEDIATE",
    courseType: "FREE",
    estimatedHours: 30,
    modules: [
      {
        title: "Estrutura da Redação ENEM",
        description: "Os pilares do texto dissertativo-argumentativo",
        lessons: [
          { title: "Introdução", description: "Tese, contextualização e repertório", duration: 20 },
          { title: "Desenvolvimento", description: "Argumentação e evidências", duration: 25 },
          { title: "Conclusão", description: "Proposta de intervenção detalhada", duration: 20 },
        ],
      },
      {
        title: "Repertórios Socioculturais",
        description: "Como usar referências corretamente",
        lessons: [
          { title: "Filósofos e Pensadores", description: "Aristóteles, Foucault, Bauman e outros", duration: 30 },
          { title: "Contextos Históricos", description: "Revolução Industrial, Ditadura e mais", duration: 35 },
        ],
      },
    ],
  },
  {
    title: "Física para ENEM",
    slug: "física-enem",
    category: "Ciências da Natureza",
    shortDescription: "Mecânica, termologia, ondulatória, eletricidade e óptica para o ENEM.",
    description:
      "Curso de Física completo para o ENEM. Aborda mecânica clássica (cinemática, dinâmica, estática), termologia (calorimetria, termodinâmica), ondulatória, óptica geométrica e eletricidade (circuitos, campo elétrico, magnetismo). Com resolução de questões de provas anteriores.",
    level: "INTERMEDIATE",
    courseType: "FREE",
    estimatedHours: 50,
    modules: [
      {
        title: "Mecânica",
        description: "Cinemática, dinâmica, energia e quantidade de movimento",
        lessons: [
          { title: "Cinemática", description: "MRU, MRUV, queda livre e lançamentos", duration: 45 },
          { title: "Leis de Newton", description: "Inércia, força e ação-reação", duration: 40 },
          { title: "Trabalho e Energia", description: "Energia cinética, potencial e conservação", duration: 35 },
        ],
      },
      {
        title: "Termologia",
        description: "Calor, temperatura e leis da termodinâmica",
        lessons: [
          { title: "Calorimetria", description: "Calor sensível e latente, equilíbrio térmico", duration: 30 },
          { title: "Termodinâmica", description: "Leis da termodinâmica e máquinas térmicas", duration: 35 },
        ],
      },
    ],
  },
  {
    title: "História do Brasil Colonial",
    slug: "historia-brasil-colonial",
    category: "Ciências Humanas",
    shortDescription: "Do descobrimento à independência: o período colonial brasileiro.",
    description:
      "Curso sobre a História do Brasil Colônia. Aborda o período pré-cabralino, descobrimento, capitanias hereditárias, economia açucareira, mineração, invasões estrangeiras, movimentos nativistas e a chegada da família real portuguesa.",
    level: "BEGINNER",
    courseType: "FREE",
    estimatedHours: 25,
    modules: [
      {
        title: "Brasil Pré-Cabralino e Descobrimento",
        description: "Os povos indígenas e a chegada dos portugueses",
        lessons: [
          { title: "Povos Indígenas", description: "Diversidade cultural antes de 1500", duration: 25 },
          { title: "Chegada dos Portugueses", description: "Contexto das Grandes Navegações", duration: 20 },
        ],
      },
      {
        title: "Brasil Colônia",
        description: "Economia, sociedade e administração colonial",
        lessons: [
          { title: "Capitanias Hereditárias", description: "Sistema administrativo colonial", duration: 30 },
          { title: "Ciclo do Açúcar", description: "Engenhos, escravidão e sociedade", duration: 35 },
          { title: "Mineração", description: "Ciclo do ouro em Minas Gerais", duration: 30 },
        ],
      },
    ],
  },
  {
    title: "Inglês Instrumental para Vestibulares",
    slug: "ingles-instrumental",
    category: "Inglês",
    shortDescription: "Interpretação de textos em inglês para provas de vestibular e ENEM.",
    description:
      "Curso de Inglês Instrumental voltado para vestibulares. Ensina técnicas de leitura (skimming, scanning), cognatos, falsos cognatos, grupos nominais, marcadores discursivos, referência textual e vocabulário acadêmico. Baseado em questões de provas anteriores.",
    level: "BEGINNER",
    courseType: "FREE",
    estimatedHours: 20,
    modules: [
      {
        title: "Técnicas de Leitura",
        description: "Estratégias para compreensão rápida de textos",
        lessons: [
          { title: "Skimming e Scanning", description: "Leitura rápida para ideia geral e busca específica", duration: 20 },
          { title: "Cognatos e Falsos Cognatos", description: "Palavras que ajudam e atrapalham", duration: 15 },
        ],
      },
      {
        title: "Gramática Contextualizada",
        description: "Estruturas essenciais para interpretação",
        lessons: [
          { title: "Tempos Verbais", description: "Presente, passado e futuro em contexto", duration: 25 },
          { title: "Conectivos", description: "Marcadores discursivos e relação entre ideias", duration: 20 },
        ],
      },
    ],
  },
  {
    title: "React do Zero ao Avançado",
    slug: "react-zero-avancado",
    category: "Tecnologia",
    shortDescription: "Aprenda React com TypeScript, hooks, estado global e testes.",
    description:
      "Curso completo de React. Do fundamentos (componentes, JSX, props) até tópicos avançados (hooks personalizados, Context API, TanStack Query, Zustand, testes com Testing Library, Server-Side Rendering com Next.js). Projetos práticos ao longo do curso.",
    level: "INTERMEDIATE",
    courseType: "FREE",
    estimatedHours: 60,
    modules: [
      {
        title: "Fundamentos do React",
        description: "Componentes, JSX e props",
        lessons: [
          { title: "O que é React?", description: "Conceitos, VDOM e configuração do ambiente", duration: 20 },
          { title: "Componentes e JSX", description: "Criando e compondo componentes", duration: 25 },
          { title: "Props e Children", description: "Comunicação entre componentes", duration: 20 },
        ],
      },
      {
        title: "Hooks Essenciais",
        description: "useState, useEffect, useRef e hooks personalizados",
        lessons: [
          { title: "useState e Eventos", description: "Estado local e interações do usuário", duration: 30 },
          { title: "useEffect", description: "Efeitos colaterais e ciclo de vida", duration: 30 },
          { title: "Custom Hooks", description: "Criando hooks reutilizáveis", duration: 35 },
        ],
      },
    ],
  },
  {
    title: "Álgebra Linear",
    slug: "algebra-linear",
    category: "Matemática",
    shortDescription: "Vetores, matrizes, espaços vetoriais e transformações lineares.",
    description:
      "Curso avançado de Álgebra Linear. Aborda vetores no R² e R³, operações com matrizes, sistemas lineares, determinantes, espaços vetoriais, transformações lineares, autovalores e autovetores. Com aplicações em computação gráfica e machine learning.",
    level: "ADVANCED",
    courseType: "PAID",
    estimatedHours: 45,
    modules: [
      {
        title: "Vetores e Matrizes",
        description: "Fundamentos da álgebra linear",
        lessons: [
          { title: "Vetores no Plano e Espaço", description: "Operações, produto escalar e projeções", duration: 35 },
          { title: "Matrizes", description: "Tipos, operações e propriedades", duration: 30 },
          { title: "Sistemas Lineares", description: "Eliminação Gaussiana e classificação", duration: 40 },
        ],
      },
      {
        title: "Espaços Vetoriais",
        description: "Conceitos fundamentais de espaços vetoriais",
        lessons: [
          { title: "Subespaços e Base", description: "Dependência linear e dimensão", duration: 35 },
          { title: "Transformações Lineares", description: "Núcleo, imagem e matriz associada", duration: 40 },
        ],
      },
    ],
  },
  {
    title: "Literatura Brasileira",
    slug: "literatura-brasileira",
    category: "Português",
    shortDescription: "Dos árcades aos contemporâneos: movimentos literários brasileiros.",
    description:
      "Curso de Literatura Brasileira para vestibulares. Aborda do Arcadismo ao Pós-Modernismo, com análise de obras cobradas (Machado de Assis, Clarice Lispector, Guimarães Rosa, João Cabral de Melo Neto, entre outros). Contexto histórico, características e análise de trechos.",
    level: "INTERMEDIATE",
    courseType: "FREE",
    estimatedHours: 35,
    modules: [
      {
        title: "Pré-Modernismo e Modernismo",
        description: "Transição e renovação literária",
        lessons: [
          { title: "Pré-Modernismo", description: "Euclides da Cunha, Lima Barreto e Graça Aranha", duration: 30 },
          { title: "Semana de 22", description: "Modernismo, Oswald e Mário de Andrade", duration: 25 },
          { title: "Geração de 30", description: "Regionalismo, Graciliano Ramos e José Lins do Rego", duration: 35 },
        ],
      },
      {
        title: "Pós-Modernismo",
        description: "Literatura contemporânea brasileira",
        lessons: [
          { title: "João Guimarães Rosa", description: "Grande Sertão: Veredas e a linguagem inovadora", duration: 30 },
          { title: "Clarice Lispector", description: "Intimismo e fluxo de consciência", duration: 30 },
        ],
      },
    ],
  },
  {
    title: "Química Geral",
    slug: "quimica-geral",
    category: "Ciências da Natureza",
    shortDescription: "Matéria, átomos, ligações, reações e estequiometria para o ENEM.",
    description:
      "Curso de Química Geral para ENEM e vestibulares. Aborda estrutura atômica, tabela periódica, ligações químicas, funções inorgânicas, reações químicas, estequiometria, soluções e propriedades coligativas.",
    level: "BEGINNER",
    courseType: "FREE",
    estimatedHours: 40,
    modules: [
      {
        title: "Estrutura Atômica",
        description: "Modelos atômicos e configuração eletrônica",
        lessons: [
          { title: "Modelos Atômicos", description: "De Dalton a Bohr", duration: 25 },
          { title: "Configuração Eletrônica", description: "Distribuição de elétrons", duration: 30 },
          { title: "Tabela Periódica", description: "Propriedades periódicas", duration: 25 },
        ],
      },
      {
        title: "Ligações e Reações",
        description: "Como os átomos se ligam e reagem",
        lessons: [
          { title: "Ligações Químicas", description: "Iônica, covalente e metálica", duration: 35 },
          { title: "Funções Inorgânicas", description: "Ácidos, bases, sais e óxidos", duration: 30 },
        ],
      },
    ],
  },
  {
    title: "Machine Learning com Python",
    slug: "machine-learning-python",
    category: "Tecnologia",
    shortDescription: "Algoritmos de ML supervisionado e não supervisionado com Python.",
    description:
      "Curso prático de Machine Learning. Aborda regressão linear e logística, árvores de decisão, Random Forest, SVM, K-Means, PCA, redes neurais com TensorFlow/Keras, pré-processamento de dados, validação cruzada e deploy de modelos. Projetos reais ao longo do curso.",
    level: "ADVANCED",
    courseType: "PREMIUM",
    estimatedHours: 70,
    modules: [
      {
        title: "Fundamentos de ML",
        description: "Conceitos e preparação de dados",
        lessons: [
          { title: "O que é Machine Learning?", description: "Tipos de aprendizado e pipeline", duration: 20 },
          { title: "Pré-processamento", description: "Limpeza, normalização e encoding", duration: 30 },
          { title: "Análise Exploratória", description: "Visualização e estatística descritiva", duration: 35 },
        ],
      },
      {
        title: "Aprendizado Supervisionado",
        description: "Modelos com dados rotulados",
        lessons: [
          { title: "Regressão Linear e Logística", description: "Modelos preditivos fundamentais", duration: 40 },
          { title: "Árvores de Decisão", description: "Classificação e interpretabilidade", duration: 35 },
        ],
      },
    ],
  },
];

async function seedCourses(categoryMap: Record<string, string>, adminUser: any) {
  const created: any[] = [];

  for (const c of COURSES) {
    const existing = await prisma.course.findUnique({ where: { slug: c.slug } });
    if (existing) {
      console.log(`  ~ Curso "${c.title}" já existe`);
      created.push(existing);
      continue;
    }

    const course = await prisma.course.create({
      data: {
        categoryId: categoryMap[c.category],
        title: c.title,
        slug: c.slug,
        shortDescription: c.shortDescription,
        description: c.description,
        level: c.level as any,
        courseType: c.courseType as any,
        estimatedHours: c.estimatedHours,
        status: "APPROVED",
        instructors: {
          create: { userId: adminUser.id },
        },
      },
    });

    for (let mi = 0; mi < c.modules.length; mi++) {
      const mod = c.modules[mi];
      const module = await prisma.module.create({
        data: {
          courseId: course.id,
          title: mod.title,
          description: mod.description,
          orderNumber: mi + 1,
        },
      });

      for (let li = 0; li < mod.lessons.length; li++) {
        const les = mod.lessons[li];
        await prisma.lesson.create({
          data: {
            moduleId: module.id,
            title: les.title,
            description: les.description,
            videoUrl: les.videoUrl,
            videoProvider: les.videoProvider as any,
            duration: les.duration,
            orderNumber: li + 1,
          },
        });
      }

      if (mod.materials) {
        for (const mat of mod.materials) {
          await prisma.material.create({
            data: {
              moduleId: module.id,
              title: mat.title,
              fileUrl: mat.fileUrl,
              fileType: mat.fileType,
            },
          });
        }
      }
    }

    console.log(`  ✓ Curso: ${c.title} (${c.level}, ${c.courseType})`);
    created.push(course);
  }

  return created;
}

// ── Store Items ─────────────────────────────────────────
const STORE_ITEMS = [
  { slug: "titulo-mestre", name: "Título: Mestre", description: "Título de Mestre para exibir no perfil", cost: 500, category: "TITLE" as const },
  { slug: "titulo-veterano", name: "Título: Veterano", description: "Título de Veterano para exibir no perfil", cost: 300, category: "TITLE" as const },
  { slug: "borda-ouro", name: "Borda Dourada", description: "Borda dourada para seu avatar", cost: 200, category: "AVATAR_BORDER" as const },
  { slug: "borda-cyan", name: "Borda Ciano", description: "Borda ciano neon para seu avatar", cost: 150, category: "AVATAR_BORDER" as const },
  { slug: "tema-matrix", name: "Tema Matrix", description: "Tema visual verde neon", cost: 400, category: "THEME" as const },
  { slug: "tema-sunset", name: "Tema Sunset", description: "Tema visual laranjado", cost: 400, category: "THEME" as const },
  { slug: "boost-xp2", name: "Boost de XP x2", description: "Dobre seus ganhos de XP por 1 hora", cost: 100, category: "BOOSTER" as const, isPermanent: false },
  { slug: "pacote-revisao", name: "Pacote de Revisão", description: "Acesso a revisões exclusivas", cost: 250, category: "REVIEW_PACK" as const },
  { slug: "pass-premium-mensal", name: "Pass Premium Mensal", description: "30 dias de recursos premium", cost: 1000, category: "PASS" as const, isPermanent: false },
  { slug: "pet-coruja", name: "Pet Coruja", description: "Uma coruja sábia para te acompanhar", cost: 800, category: "PET" as const },
  { slug: "cosmetico-capacete", name: "Capacete Espacial", description: "Cosmético especial para seu avatar", cost: 350, category: "COSMETIC" as const },
  { slug: "pet-chapeu", name: "Chapéu de Bruxo para Pet", description: "Um chapéu mágico para seu pet", cost: 200, category: "PET_COSMETIC" as const },
];

async function seedStoreItems() {
  for (const item of STORE_ITEMS) {
    const existing = await prisma.storeItem.findUnique({ where: { slug: item.slug } });
    if (existing) continue;

    await prisma.storeItem.create({ data: item });
    console.log(`  ✓ Loja: ${item.name} (${item.cost} moedas)`);
  }
}

// ── Achievements ────────────────────────────────────────
const ACHIEVEMENT_KEYS = [
  "primeira-aula", "primeiro-modulo", "primeiro-curso",
  "5-cursos", "10-aulas", "50-aulas",
  "nivel-5", "nivel-10", "nivel-25",
  "liga-prata", "liga-ouro",
  "100-moedas", "1000-moedas",
  "7-dias-seguidos", "30-dias-seguidos",
  "redacao-nota-1000", "enem-acima-media",
];

// ── Enrollments + XP + Coins ──────────────────────────
async function createEnrollmentsXpAndRankings(users: any[], courses: any[]) {
  for (const user of users) {
    // Enroll in random courses
    const enrolledCount = randomInt(0, 4);
    const shuffled = [...courses].sort(() => Math.random() - 0.5);
    const toEnroll = shuffled.slice(0, enrolledCount);

    for (const course of toEnroll) {
      const existing = await prisma.courseEnrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
      });
      if (existing) continue;

      await prisma.courseEnrollment.create({
        data: {
          userId: user.id,
          courseId: course.id,
          progress: randomInt(0, 100),
        },
      });
    }
  }

  // Update wallet coins based on XP earned
  for (const user of users) {
    const xp = await prisma.userXP.findUnique({ where: { userId: user.id } });
    if (xp) {
      await prisma.userWallet.upsert({
        where: { userId: user.id },
        update: { coins: Math.floor(xp.totalXp / 10) },
        create: { userId: user.id, coins: Math.floor(xp.totalXp / 10) },
      });
    }
  }

  console.log(`  ✓ Matrículas e XP criados`);
}

// ── Ranking Season ──────────────────────────────────────
async function createRankingSeason(users: any[]) {
  // Current season
  const now = new Date();
  const seasonKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const existing = await prisma.rankingSeason.findUnique({ where: { seasonKey } });
  if (!existing) {
    await prisma.rankingSeason.create({
      data: {
        seasonKey,
        startsAt: new Date(now.getFullYear(), now.getMonth(), 1),
        endsAt: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      },
    });
  }

  // Sort users by XP and create ranking results
  const usersWithXp = await Promise.all(
    users.map(async (u) => {
      const xp = await prisma.userXP.findUnique({ where: { userId: u.id } });
      return { user: u, xp };
    }),
  );

  usersWithXp.sort((a, b) => (b.xp?.totalXp ?? 0) - (a.xp?.totalXp ?? 0));

  for (let i = 0; i < usersWithXp.length; i++) {
    const { user, xp } = usersWithXp[i];
    if (!xp) continue;

    await prisma.rankingSeasonResult.upsert({
      where: { userId_seasonKey: { userId: user.id, seasonKey } },
      update: { finalRank: i + 1, league: xp.league, seasonXp: xp.totalXp },
      create: {
        userId: user.id,
        seasonKey,
        league: xp.league,
        seasonXp: xp.totalXp,
        finalRank: i + 1,
      },
    });
  }

  console.log(`  ✓ Ranking da temporada ${seasonKey} gerado`);
}

// ── Achievements for Users ──────────────────────────────
async function seedAchievements(users: any[]) {
  for (const user of users) {
    const count = randomInt(0, 5);
    for (let i = 0; i < count; i++) {
      const key = pick(ACHIEVEMENT_KEYS);
      await prisma.userAchievement.upsert({
        where: { userId_achievementKey: { userId: user.id, achievementKey: key } },
        update: {},
        create: { userId: user.id, achievementKey: key },
      });
    }
  }
  console.log(`  ✓ Conquistas distribuídas`);
}

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log("\n🌱 Populando banco de dados completo...\n");

  // Credentials from env vars (defaults for development only)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD || "teacher123";
  const modPassword = process.env.SEED_MOD_PASSWORD || "mod123";
  const userPassword = process.env.SEED_USER_PASSWORD || "user123";

  // 1. Users
  const admin = await createUser("admin@hexavante.com", adminPassword, {
    username: "admin",
    fullName: "Admin Hexavante",
    birthDate: new Date("1990-01-01"),
    role: "ADMIN",
    level: 50,
    totalXp: 45000,
    coins: 9999,
    league: "GOLD",
    isVerified: true,
    isPremium: true,
    bio: "Fundador da plataforma Hexavante",
    city: "São Paulo",
    state: "SP",
  });

  const teacher = await createUser("teacher@hexavante.com", teacherPassword, {
    username: "professor",
    fullName: "Carlos Silva",
    birthDate: new Date("1985-05-15"),
    role: "TEACHER",
    level: 30,
    totalXp: 25000,
    coins: 5000,
    league: "SILVER",
    isVerified: true,
    bio: "Professor de Matemática e Tecnologia",
    city: "Rio de Janeiro",
    state: "RJ",
  });

  const moderator = await createUser("moderator@hexavante.com", modPassword, {
    username: "moderador",
    fullName: "Ana Beatriz",
    birthDate: new Date("1995-03-20"),
    role: "MODERATOR",
    level: 20,
    totalXp: 15000,
    coins: 2000,
    league: "SILVER",
    isVerified: true,
    city: "Belo Horizonte",
    state: "MG",
  });

  const user1 = await createUser("user@hexavante.com", userPassword, {
    username: "aluno1",
    fullName: "João Aluno",
    birthDate: new Date("2002-07-10"),
    role: "USER",
    level: 8,
    totalXp: 3200,
    coins: 450,
    league: "BRONZE",
    bio: "Estudante dedicado rumo à faculdade",
    city: "Curitiba",
    state: "PR",
  });

  const user2 = await createUser("maria@hexavante.com", userPassword, {
    username: "maria_estudante",
    fullName: "Maria Oliveira",
    birthDate: new Date("2003-11-22"),
    role: "USER",
    level: 12,
    totalXp: 5800,
    coins: 720,
    league: "BRONZE",
    isVerified: true,
    bio: "Apaixonada por ciências e matemática",
    city: "Porto Alegre",
    state: "RS",
  });

  const user3 = await createUser("pedro@hexavante.com", userPassword, {
    username: "pedro_code",
    fullName: "Pedro Santos",
    birthDate: new Date("2001-09-05"),
    role: "USER",
    level: 15,
    totalXp: 8900,
    coins: 1100,
    league: "SILVER",
    city: "Fortaleza",
    state: "CE",
  });

  const users = [admin, teacher, moderator, user1, user2, user3];

  // 2. Categories & Courses
  console.log("\n── Categorias ──");
  const catMap = await seedCategories();

  console.log("\n── Cursos ──");
  const courses = await seedCourses(catMap, admin);

  // 3. Store
  console.log("\n── Loja ──");
  await seedStoreItems();

  // 4. Enrollments, XP, Coins
  console.log("\n── Matrículas e Progresso ──");
  await createEnrollmentsXpAndRankings(users, courses);

  // 5. Ranking Season
  console.log("\n── Ranking ──");
  await createRankingSeason(users);

  // 6. Achievements
  console.log("\n── Conquistas ──");
  await seedAchievements(users);

  console.log("\n✅ Banco populado com sucesso!\n");
  console.log("   Admin:    admin@hexavante.com");
  console.log("   Teacher:  teacher@hexavante.com");
  console.log("   Moderator: moderator@hexavante.com");
  console.log("   Aluno 1:  user@hexavante.com");
  console.log("   Aluno 2:  maria@hexavante.com");
  console.log("   Aluno 3:  pedro@hexavante.com");
  console.log("   (Senhas definidas via variáveis de ambiente SEED_*_PASSWORD)");
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
