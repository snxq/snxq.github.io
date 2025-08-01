# GitHub Issues 博客系统

一个基于 GitHub Issues 的静态博客系统，使用 React + Vite 构建，支持 GitHub Pages 自动部署。

## 功能特性

- 📝 使用 GitHub Issues 作为博客文章存储
- 📖 纯静态博客展示
- 🎨 现代化响应式 UI 设计
- 🚀 GitHub Pages 自动部署
- 📱 移动端友好
- 🔍 Markdown 内容渲染

## 快速开始

### 1. 配置 GitHub 仓库

1. 创建 `config.js` 文件并添加以下配置：
   ```javascript
   export const BLOG_CONFIG = {
     // GitHub 仓库配置
     REPO_OWNER: 'your-username', // 替换为你的GitHub用户名
     REPO_NAME: 'your-blog-repo',  // 替换为你的博客仓库名
     
     // 博客基本信息
     BLOG_TITLE: '你的博客标题',
     BLOG_DESCRIPTION: '博客描述',
     
     // GitHub Pages 配置
     BASE_URL: '/your-repo-name/', // 仓库名，格式: /repository-name/
     
     // 文章标签配置
     BLOG_POST_LABEL: 'blog-post', // 用于标识博客文章的标签
     
     // 其他配置
     POSTS_PER_PAGE: 10, // 每页显示的文章数量
   }
   ```

2. 在你的 GitHub 仓库中创建 Issues 作为博客文章：
   - 添加 `blog-post` 标签来标识博客文章
   - Issue 标题作为文章标题
   - Issue 内容作为文章正文（支持 Markdown）
   - 其他标签作为文章分类标签
   - 可在文章开头添加 `<!-- date: YYYY-MM-DD -->` 或 `<!-- date: YYYY-MM-DD HH:mm -->` 来指定自定义创建时间

### 2. 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 3. GitHub Pages 部署

1. 在 GitHub 仓库设置中启用 GitHub Pages
2. 选择 "GitHub Actions" 作为部署源
3. 推送代码到 main 分支，自动触发部署

### 4. 用户使用说明

#### 博客文章展示

博客系统会自动从 GitHub Issues 中获取并展示文章：

1. 系统会获取带有 `blog-post` 标签的 Issues
2. 按创建时间倒序排列显示
3. 支持 Markdown 格式渲染
4. 支持自定义文章创建时间

#### 发表文章

1. 在 GitHub 仓库中创建新的 Issue
2. 添加 `blog-post` 标签
3. 使用 Markdown 格式编写内容
4. （可选）在文章开头添加自定义创建时间：
   ```markdown
   <!-- date: 2024-01-15 -->
   <!-- date: 2024-01-15 14:30 -->
   
   # 文章标题
   
   文章内容...
   ```
5. 发布 Issue，文章将自动显示在博客中

#### 查看文章

1. 在首页浏览文章列表
2. 点击文章标题查看详细内容
3. 文章支持代码高亮和 Markdown 扩展语法

## 技术栈

- **前端框架**: React 19
- **构建工具**: Vite 7
- **路由**: React Router DOM
- **GitHub API**: 原生 Fetch API
- **Markdown 渲染**: react-markdown + remark-gfm + rehype-raw
- **图标**: Lucide React
- **部署**: GitHub Pages + GitHub Actions

## 项目结构

```
src/
├── components/          # React 组件
│   ├── Header.jsx      # 头部导航
│   ├── BlogList.jsx    # 文章列表
│   └── BlogPost.jsx    # 文章详情页面
├── context/            # React Context
│   └── GitHubContext.jsx # GitHub API 管理
├── App.jsx             # 主应用组件
├── App.css             # 样式文件
├── main.jsx            # 应用入口
└── index.css           # 全局样式
config.js               # 博客配置文件
.github/workflows/      # GitHub Actions 工作流
└── deploy.yml          # 自动部署配置
```

## 自定义配置

### 修改仓库配置

在 `config.js` 中修改：

```javascript
export const BLOG_CONFIG = {
  REPO_OWNER: 'your-username',
  REPO_NAME: 'your-blog-repo',
  // 其他配置...
}
```

### 修改部署路径

在 `config.js` 中修改 BASE_URL，`vite.config.js` 会自动读取：

```javascript
// config.js
export const BLOG_CONFIG = {
  BASE_URL: '/your-repo-name/',
  // 其他配置...
}
```

对应的 `vite.config.js` 配置：
```javascript
base: process.env.NODE_ENV === 'production' ? '/your-repo-name/' : '/'
```

### 自定义博客信息

在 `config.js` 中可以自定义博客的基本信息：

```javascript
export const BLOG_CONFIG = {
  BLOG_TITLE: '你的博客标题',        // 显示在页面顶部
  BLOG_DESCRIPTION: '博客描述',     // 博客简介
  POSTS_PER_PAGE: 10,              // 每页显示文章数量
  // 其他配置...
}
```

### 自定义样式

主要样式文件：
- `src/App.css` - 组件样式
- `src/index.css` - 全局样式

## 注意事项

1. **仓库权限**: 确保博客仓库是公开的，以便访问 GitHub API
2. **标签管理**: 只有带 `blog-post` 标签的 Issues 会显示为博客文章
3. **内容格式**: 支持完整的 Markdown 语法和 GitHub Flavored Markdown
4. **自定义时间**: 可在文章开头使用 `<!-- date: YYYY-MM-DD -->` 格式自定义显示时间

## 许可证

MIT License
