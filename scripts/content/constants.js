export const CONTENT_SCHEMA_VERSION = 1;

export const CONTENT_TYPES = Object.freeze({
  'content:post': 'posts',
  'content:project': 'projects',
  'content:note': 'notes',
  'content:life': 'life',
  'content:bookmark': 'bookmarks',
  'content:use': 'uses',
  'content:opensource': 'opensource',
  'content:about': 'about',
  'content:now': 'now'
});

export const SECTION_META = Object.freeze({
  about: { title: '关于', subtitle: 'IDENTITY SHEET' },
  projects: { title: '项目', subtitle: 'BUILT SIGNALS' },
  posts: { title: '文章', subtitle: 'LONG-FORM TRANSMISSIONS' },
  notes: { title: '短笔记', subtitle: 'FIELD SIGNALS' },
  now: { title: '此刻', subtitle: 'CURRENT STATE' },
  bookmarks: { title: '收藏', subtitle: 'SAVED COORDINATES' },
  uses: { title: '使用清单', subtitle: 'DAILY INSTRUMENTS' },
  life: { title: '生活切片', subtitle: 'OFFLINE FRAGMENTS' },
  opensource: { title: '开源与技术轨迹', subtitle: 'PUBLIC WORK' }
});

export const FORM_FIELDS = Object.freeze({
  posts: [],
  projects: ['Slug', 'Summary', 'Status', 'Year', 'Tags', 'Project URL', 'Body'],
  notes: ['Date', 'Tags', 'Body'],
  life: ['Slug', 'Date', 'Summary', 'Tone', 'Image URL', 'Body'],
  bookmarks: ['URL', 'Description', 'Group'],
  uses: ['Description', 'Category', 'URL'],
  opensource: ['Year', 'Description', 'Tags', 'URL'],
  about: ['Display Name', 'Role', 'Bio', 'Location', 'Status', 'Fields', 'Links'],
  now: ['Summary', 'BUILD', 'LEARN', 'READ', 'LOOP']
});
