import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.knowledge.findMany({
  where: { category: 'packaging' },
  orderBy: { createdAt: 'desc' },
});
for (const r of rows) {
  console.log('────────────────────────');
  console.log('id:', r.id);
  console.log('userId:', r.userId);
  console.log('createdAt:', r.createdAt);
  console.log('content:', r.content?.slice(0, 200));
  console.log('structured:', typeof r.structured === 'string' ? r.structured.slice(0, 300) : JSON.stringify(r.structured)?.slice(0, 300));
}
await prisma.$disconnect();
