import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGitHub } from '../context/GitHubContext'
import { Calendar, User, Tag } from 'lucide-react'

const BlogList = () => {
  const { getBlogPosts } = useGitHub()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBlogPosts()
      setPosts(data)
    } catch (err) {
      setError('加载文章失败，请检查仓库配置')
      console.error('加载文章失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 从文章内容中提取自定义创建时间
  const extractCustomDate = (content) => {
    if (!content) return null
    
    // 匹配格式: <!-- date: YYYY-MM-DD --> 或 <!-- date: YYYY-MM-DD HH:mm -->
    const dateMatch = content.match(/<!--\s*date:\s*([\d-]+(?:\s+[\d:]+)?)\s*-->/i)
    if (dateMatch) {
      const dateStr = dateMatch[1].trim()
      const date = new Date(dateStr)
      return isNaN(date.getTime()) ? null : date.toISOString()
    }
    
    return null
  }

  // 获取文章的显示时间（优先使用自定义时间）
  const getDisplayDate = (post) => {
    const customDate = extractCustomDate(post.body)
    return customDate || post.created_at
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const extractSummary = (body) => {
    if (!body) return '暂无内容预览...'
    // 移除markdown语法，获取前150个字符作为摘要
    const plainText = body
      .replace(/<!--\s*date:\s*[\d-]+(?:\s+[\d:]+)?\s*-->\s*/gi, '') // 移除时间注释
      .replace(/#{1,6}\s+/g, '') // 移除标题
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接
      .replace(/```[\s\S]*?```/g, '[代码块]') // 替换代码块
      .replace(/`([^`]+)`/g, '$1') // 移除行内代码
      .trim()
    
    return plainText.length > 150 
      ? plainText.substring(0, 150) + '...' 
      : plainText
  }

  if (loading) {
    return (
      <div className="blog-list">
        <div className="loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="blog-list">
        <div className="error">
          <p>{error}</p>
          <button onClick={loadPosts} className="retry-btn">
            重试
          </button>
        </div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="blog-list">
        <div className="empty">
          <h2>暂无文章</h2>
          <p>还没有发布任何博客文章。</p>
          <p>请在GitHub仓库中创建带有 "blog-post" 标签的issue来发布文章。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="blog-list">
      <div className="posts-header">
        <h2>最新文章</h2>
      </div>
      
      <div className="posts-list">
        {posts.map((post) => (
          <article key={post.number} className="post-item">
            <Link to={`/post/${post.number}`} className="post-link">
              <div className="post-header">
                <h3 className="post-title">{post.title}</h3>
                <span className="post-date">{formatDate(getDisplayDate(post))}</span>
              </div>
              {post.body && (
                <p className="post-excerpt">
                  {extractSummary(post.body).length > 100 
                    ? extractSummary(post.body).substring(0, 100) + '...' 
                    : extractSummary(post.body)
                  }
                </p>
              )}
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}

export default BlogList