import { z } from 'zod';

const httpUrlSchema = z.string().url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'URL must use http or https');

const linkUrlSchema = z.string().url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
}, 'URL protocol is not allowed');

const imageUrlSchema = z.string().url().refine(value => new URL(value).protocol === 'https:', 'image URL must use https');

const richInlineSchema = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string() }).strict(),
  z.object({ type: z.literal('emphasis'), children: z.array(richInlineSchema) }).strict(),
  z.object({ type: z.literal('strong'), children: z.array(richInlineSchema) }).strict(),
  z.object({ type: z.literal('delete'), children: z.array(richInlineSchema) }).strict(),
  z.object({ type: z.literal('link'), href: linkUrlSchema, children: z.array(richInlineSchema) }).strict(),
  z.object({ type: z.literal('inlineCode'), value: z.string() }).strict()
]));

const headingSchema = z.object({ type: z.literal('heading'), depth: z.number().int().min(2).max(4), children: z.array(richInlineSchema) }).strict();
const paragraphSchema = z.object({ type: z.literal('paragraph'), children: z.array(richInlineSchema) }).strict();
const codeSchema = z.object({ type: z.literal('code'), language: z.string().nullable(), value: z.string() }).strict();
const tableSchema = z.object({
  type: z.literal('table'),
  align: z.array(z.enum(['left', 'right', 'center']).nullable()),
  rows: z.array(z.array(z.array(richInlineSchema)))
}).strict();
const dividerSchema = z.object({ type: z.literal('divider') }).strict();
const imageSchema = z.object({ type: z.literal('image'), src: imageUrlSchema, alt: z.string(), title: z.string().nullable() }).strict();

const listItemBlockSchema = z.lazy(() => z.discriminatedUnion('type', [
  headingSchema,
  paragraphSchema,
  z.object({ type: z.literal('quote'), children: z.array(listItemBlockSchema) }).strict(),
  codeSchema,
  tableSchema,
  dividerSchema,
  imageSchema
]));

export const richBlockSchema = z.lazy(() => z.discriminatedUnion('type', [
  headingSchema,
  paragraphSchema,
  z.object({ type: z.literal('quote'), children: z.array(richBlockSchema) }).strict(),
  codeSchema,
  z.object({
    type: z.literal('list'),
    ordered: z.boolean(),
    start: z.number().int().positive().optional(),
    items: z.array(z.array(listItemBlockSchema))
  }).strict(),
  tableSchema,
  dividerSchema,
  imageSchema
]));

const sourceSchema = z.object({
  issueNumber: z.number().int().positive(),
  issueUrl: httpUrlSchema,
  updatedAt: z.string().datetime({ offset: true })
}).strict();

const detailSchema = z.array(richBlockSchema);
const tagsSchema = z.array(z.string());

export const postSchema = z.object({
  id: z.string().min(1), date: z.string().min(1), title: z.string(), summary: z.string(),
  tags: tagsSchema, detail: detailSchema, source: sourceSchema
}).strict();
export const projectSchema = z.object({
  id: z.string().min(1), name: z.string(), summary: z.string(), status: z.string(), tags: tagsSchema,
  year: z.string(), url: linkUrlSchema.nullable(), detail: detailSchema, source: sourceSchema
}).strict();
export const noteSchema = z.object({ time: z.string().min(1), text: z.string(), tags: tagsSchema, source: sourceSchema }).strict();
export const lifeSchema = z.object({
  id: z.string().min(1), date: z.string().min(1), title: z.string(), summary: z.string(), tone: z.string(),
  imageUrl: imageUrlSchema.nullable(), detail: detailSchema, source: sourceSchema
}).strict();
export const bookmarkEntrySchema = z.object({ name: z.string(), description: z.string(), url: linkUrlSchema, source: sourceSchema }).strict();
export const useEntrySchema = z.object({ name: z.string(), description: z.string(), url: linkUrlSchema.nullable(), source: sourceSchema }).strict();
export const openSourceSchema = z.object({ year: z.string(), title: z.string(), text: z.string(), tags: tagsSchema, url: linkUrlSchema.nullable(), source: sourceSchema }).strict();

const aboutSchema = z.object({
  name: z.string(), role: z.string(), bio: z.string(), location: z.string(), status: z.string(),
  fields: z.array(z.string()), links: z.array(z.tuple([z.string(), linkUrlSchema]))
}).strict();
const nowSchema = z.object({
  summary: z.string(),
  sections: z.array(z.object({ code: z.enum(['BUILD', 'LEARN', 'READ', 'LOOP']), title: z.string(), items: z.array(z.string()) }).strict())
}).strict();

const sectionEnvelope = (section, data) => z.object({
  version: z.literal(1), section: z.literal(section), title: z.string(), subtitle: z.string(),
  updatedAt: z.string().datetime({ offset: true }), data
}).strict();

export const sectionDocumentSchema = z.discriminatedUnion('section', [
  sectionEnvelope('about', aboutSchema),
  sectionEnvelope('now', nowSchema),
  sectionEnvelope('posts', z.object({ items: z.array(postSchema) }).strict()),
  sectionEnvelope('projects', z.object({ items: z.array(projectSchema) }).strict()),
  sectionEnvelope('notes', z.object({ items: z.array(noteSchema) }).strict()),
  sectionEnvelope('life', z.object({ items: z.array(lifeSchema) }).strict()),
  sectionEnvelope('bookmarks', z.object({ groups: z.array(z.object({ name: z.string(), description: z.string(), links: z.array(bookmarkEntrySchema) }).strict()) }).strict()),
  sectionEnvelope('uses', z.object({ categories: z.array(z.object({ name: z.string(), items: z.array(useEntrySchema) }).strict()) }).strict()),
  sectionEnvelope('opensource', z.object({ contributions: z.array(openSourceSchema) }).strict())
]);

export const manifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  source: z.object({ repository: z.string().min(1), issueCount: z.number().int().nonnegative() }).strict(),
  files: z.record(z.string(), z.string().min(1))
}).strict();
