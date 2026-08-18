/**
 * Prisma Mock for Tests
 */

// Mock user data
export const mockUser = {
  id: "test-user-id-1",
  email: "test@example.com",
  fullName: "Test User",
  username: "testuser",
  avatarUrl: null,
  birthDate: "2000-01-01",
  role: "user",
  coins: 0,
  level: 1,
  xp: 0,
  boosterMultiplier: 1.0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock course data
export const mockCourse = {
  id: "test-course-id-1",
  title: "Test Course",
  description: "A test course description",
  imageUrl: null,
  instructorId: "test-user-id-1",
  price: 99.99,
  isPublished: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock session data
export const mockSession = {
  id: "test-session-id-1",
  userId: "test-user-id-1",
  token: "test-session-token",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
};

// Mock role data
export const mockRole = {
  id: "test-role-id-1",
  name: "user",
  description: "Regular user role",
  createdAt: new Date(),
};

// Mock permission data
export const mockPermission = {
  id: "test-permission-id-1",
  name: "course.create",
  resource: "course",
  action: "create",
  createdAt: new Date(),
};

// Create mock Prisma client
export const createMockPrisma = () => ({
  user: {
    findUnique: jest.fn().mockResolvedValue(mockUser),
    findFirst: jest.fn().mockResolvedValue(mockUser),
    findMany: jest.fn().mockResolvedValue([mockUser]),
    create: jest.fn().mockResolvedValue(mockUser),
    update: jest.fn().mockResolvedValue(mockUser),
    delete: jest.fn().mockResolvedValue(mockUser),
    count: jest.fn().mockResolvedValue(1),
  },
  session: {
    findUnique: jest.fn().mockResolvedValue(mockSession),
    findFirst: jest.fn().mockResolvedValue(mockSession),
    findMany: jest.fn().mockResolvedValue([mockSession]),
    create: jest.fn().mockResolvedValue(mockSession),
    update: jest.fn().mockResolvedValue(mockSession),
    delete: jest.fn().mockResolvedValue(mockSession),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  course: {
    findUnique: jest.fn().mockResolvedValue(mockCourse),
    findFirst: jest.fn().mockResolvedValue(mockCourse),
    findMany: jest.fn().mockResolvedValue([mockCourse]),
    create: jest.fn().mockResolvedValue(mockCourse),
    update: jest.fn().mockResolvedValue(mockCourse),
    delete: jest.fn().mockResolvedValue(mockCourse),
    count: jest.fn().mockResolvedValue(1),
  },
  role: {
    findUnique: jest.fn().mockResolvedValue(mockRole),
    findFirst: jest.fn().mockResolvedValue(mockRole),
    findMany: jest.fn().mockResolvedValue([mockRole]),
    create: jest.fn().mockResolvedValue(mockRole),
    update: jest.fn().mockResolvedValue(mockRole),
    delete: jest.fn().mockResolvedValue(mockRole),
  },
  permission: {
    findUnique: jest.fn().mockResolvedValue(mockPermission),
    findFirst: jest.fn().mockResolvedValue(mockPermission),
    findMany: jest.fn().mockResolvedValue([mockPermission]),
    create: jest.fn().mockResolvedValue(mockPermission),
    update: jest.fn().mockResolvedValue(mockPermission),
    delete: jest.fn().mockResolvedValue(mockPermission),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
});

// Create mock Redis client
export const createMockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(1),
  lpush: jest.fn().mockResolvedValue(1),
  rpush: jest.fn().mockResolvedValue(1),
  lpop: jest.fn().mockResolvedValue(null),
  rpop: jest.fn().mockResolvedValue(null),
  lrange: jest.fn().mockResolvedValue([]),
  sadd: jest.fn().mockResolvedValue(1),
  srem: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue("PONG"),
  quit: jest.fn().mockResolvedValue("OK"),
  disconnect: jest.fn(),
});

export default {
  createMockPrisma,
  createMockRedis,
  mockUser,
  mockCourse,
  mockSession,
  mockRole,
  mockPermission,
};
