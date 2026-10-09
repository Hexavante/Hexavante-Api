import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { buildPagination } from "../../../lib/serializers/base";
import { NotFoundError } from "../../../lib/errors/AppError";
import type { TutorialQueryInput } from "../schemas/tutorial.schemas";

export interface TutorialListItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  duration: number | null;
  viewCount: number;
  categoryId: string | null;
  categoryName: string | null;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  tags: string[];
  createdAt: string;
}

export interface TutorialDetail extends TutorialListItem {}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("doesn't exist") ||
    message.includes("Unknown table") ||
    message.includes("no such table")
  );
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class TutorialService {
  async list(query: TutorialQueryInput) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;
    const q = query.q?.trim() || null;
    const orderBy =
      query.sort === "popular"
        ? Prisma.sql`ORDER BY t.view_count DESC, t.created_at DESC`
        : Prisma.sql`ORDER BY t.created_at DESC`;

    try {
      const where = Prisma.sql`WHERE t.is_published = 1
        ${query.categoryId ? Prisma.sql`AND t.category_id = ${query.categoryId}` : Prisma.empty}
        ${q ? Prisma.sql`AND (t.title LIKE CONCAT('%', ${q}, '%') OR t.description LIKE CONCAT('%', ${q}, '%'))` : Prisma.empty}`;

      const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT COUNT(*) AS total FROM tutorials t ${where}`,
      );
      const total = Number(countRows[0]?.total ?? 0);

      if (total === 0) {
        return { data: [], pagination: buildPagination({ page, limit }, 0) };
      }

      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          slug: string;
          description: string | null;
          thumbnail_url: string | null;
          video_url: string | null;
          duration: number | null;
          view_count: number;
          category_id: string | null;
          category_name: string | null;
          author_name: string;
          author_username: string | null;
          author_avatar_url: string | null;
          created_at: Date;
        }>
      >(
        Prisma.sql`SELECT t.id, t.title, t.slug, t.description, t.thumbnail_url, t.video_url,
          t.duration, t.view_count, t.category_id,
          c.name AS category_name,
          u.full_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
          t.created_at
        FROM tutorials t
        LEFT JOIN categories c ON c.id = t.category_id
        INNER JOIN users u ON u.id = t.author_id
        ${where}
        ${orderBy}
        LIMIT ${limit} OFFSET ${offset}`,
      );

      const tagsByTutorial = await this.fetchTags(rows.map((r) => r.id));

      const data: TutorialListItem[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        thumbnailUrl: r.thumbnail_url,
        videoUrl: r.video_url,
        duration: r.duration,
        viewCount: Number(r.view_count ?? 0),
        categoryId: r.category_id,
        categoryName: r.category_name,
        authorName: r.author_name,
        authorUsername: r.author_username,
        authorAvatarUrl: r.author_avatar_url,
        tags: tagsByTutorial.get(r.id) ?? [],
        createdAt: toIso(r.created_at),
      }));

      return { data, pagination: buildPagination({ page, limit }, total) };
    } catch (error) {
      if (isMissingTableError(error)) {
        return { data: [], pagination: buildPagination({ page, limit }, 0) };
      }
      throw error;
    }
  }

  async getBySlugOrId(slugOrId: string): Promise<TutorialDetail> {
    try {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          slug: string;
          description: string | null;
          thumbnail_url: string | null;
          video_url: string | null;
          duration: number | null;
          view_count: number;
          category_id: string | null;
          category_name: string | null;
          author_name: string;
          author_username: string | null;
          author_avatar_url: string | null;
          created_at: Date;
        }>
      >(
        Prisma.sql`SELECT t.id, t.title, t.slug, t.description, t.thumbnail_url, t.video_url,
          t.duration, t.view_count, t.category_id,
          c.name AS category_name,
          u.full_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
          t.created_at
        FROM tutorials t
        LEFT JOIN categories c ON c.id = t.category_id
        INNER JOIN users u ON u.id = t.author_id
        WHERE t.is_published = 1 AND (t.slug = ${slugOrId} OR t.id = ${slugOrId})
        LIMIT 1`,
      );

      const row = rows[0];
      if (!row) throw new NotFoundError("Tutorial não encontrado");

      const tagsByTutorial = await this.fetchTags([row.id]);

      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        thumbnailUrl: row.thumbnail_url,
        videoUrl: row.video_url,
        duration: row.duration,
        viewCount: Number(row.view_count ?? 0),
        categoryId: row.category_id,
        categoryName: row.category_name,
        authorName: row.author_name,
        authorUsername: row.author_username,
        authorAvatarUrl: row.author_avatar_url,
        tags: tagsByTutorial.get(row.id) ?? [],
        createdAt: toIso(row.created_at),
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if (isMissingTableError(error)) throw new NotFoundError("Tutorial não encontrado");
      throw error;
    }
  }

  async incrementViews(id: string): Promise<void> {
    try {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE tutorials SET view_count = view_count + 1 WHERE id = ${id}`,
      );
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  private async fetchTags(tutorialIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (tutorialIds.length === 0) return map;
    try {
      const rows = await prisma.$queryRaw<Array<{ tutorial_id: string; name: string }>>(
        Prisma.sql`SELECT tt.tutorial_id, tg.name FROM tutorial_tags tt
        INNER JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.tutorial_id IN (${Prisma.join(tutorialIds)})`,
      );
      for (const row of rows) {
        const list = map.get(row.tutorial_id) ?? [];
        list.push(row.name);
        map.set(row.tutorial_id, list);
      }
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
    return map;
  }
}
