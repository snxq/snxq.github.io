import { useState, useEffect } from 'react'
import { Calendar, User, Github } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

const About = () => {
  const [aboutContent, setAboutContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadAbout = async () => {
      try {
        setLoading(true)
        // 假设"关于我"文章的 issue number 是 1
        const response = await fetch('https://api.github.com/repos/snxq/snxq.github.io/issues/1')
        if (!response.ok) {
          throw new Error('Failed to fetch about content')
        }
        const data = await response.json()
        setAboutContent(data)
      } catch (err) {
        setError('加载关于我页面失败')
        console.error('加载关于我页面失败:', err)
      } finally {
        setLoading(false)
      }
    }

    loadAbout()
  }, [])

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

  // 移除文章内容中的自定义时间注释
  const removeCustomDateFromContent = (content) => {
    if (!content) return content
    
    // 移除时间注释标记
    return content.replace(/<!--\s*date:\s*[\d-]+(?:\s+[\d:]+)?\s*-->\s*/gi, '')
  }

  // 获取文章的显示时间（优先使用自定义时间）
  const getDisplayDate = (content) => {
    const customDate = extractCustomDate(content.body)
    return customDate || content.created_at
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="about-container">
        <div className="loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="about-container">
        <div className="error">{error}</div>
      </div>
    )
  }

  if (!aboutContent) {
    return (
      <div className="about-container">
        <div className="no-content">暂无关于我的内容</div>
      </div>
    )
  }

  return (
    <div className="about-container">
      <article className="about-article">
        <header className="about-header">
          <h1 className="about-title">{aboutContent.title}</h1>
          <div className="about-meta">
            <div className="meta-item">
              <Calendar size={16} />
              <span>发布于 {formatDate(getDisplayDate(aboutContent))}</span>
            </div>
            <div className="meta-item">
              <User size={16} />
              <span>作者: {aboutContent.user.login}</span>
            </div>
            <div className="meta-item">
              <Github size={16} />
              <a 
                href={aboutContent.html_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="github-link"
              >
                在GitHub上查看
              </a>
            </div>
          </div>
        </header>
        
        <div className="about-content">
          <div className="markdown-content">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                img: ({node, ...props}) => (
                  <img 
                    {...props} 
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: '8px',
                      margin: '16px 0'
                    }}
                    loading="lazy"
                  />
                )
              }}
            >
              {removeCustomDateFromContent(aboutContent.body) || '暂无内容'}
            </ReactMarkdown>
          </div>
        </div>
        

      </article>
    </div>
  )
}

export default About