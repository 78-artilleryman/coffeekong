import { PrismaClient } from '@prisma/client'

// PrismaClient를 글로벌 변수로 선언하여 개발 환경에서 핫 리로드 시 인스턴스가 중복 생성되는 것을 방지
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

