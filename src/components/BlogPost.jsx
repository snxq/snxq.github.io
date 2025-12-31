import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useGitHub } from '../context/GitHubContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

const BlogPost = () => {
  const { issueNumber } = useParams()
  const { getBlogPost } = useGitHub()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadPost()
  }, [issueNumber])

  const loadPost = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBlogPost(parseInt(issueNumber))
      if (data) {
        setPost(data)
      } else {
        setError('文章不存在')
      }
    } catch (err) {
      setError('加载文章失败')
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

  // 移除文章内容中的自定义时间注释
  const removeCustomDateFromContent = (content) => {
    if (!content) return content
    
    // 移除时间注释标记
    return content.replace(/<!--\s*date:\s*[\d-]+(?:\s+[\d:]+)?\s*-->\s*/gi, '')
  }

  // 获取文章的显示时间（优先使用自定义时间）
  const getDisplayDate = (post) => {
    const customDate = extractCustomDate(post.body)
    return customDate || post.created_at
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `[${year}-${month}-${day}]`
  }

  if (loading) {
    return (
      <div className="blog-post">
        <div className="prompt">
          <span className="prompt-user">snxq@blog</span>:<span className="prompt-path">~/posts</span><span className="prompt-symbol">$</span> cat post.md
        </div>
        <div className="loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="blog-post">
        <div className="prompt">
          <span className="prompt-user">snxq@blog</span>:<span className="prompt-path">~/posts</span><span className="prompt-symbol">$</span> cat post.md
        </div>
        <div className="error">
          <p>{error}</p>
          <Link to="/" className="back-link">
            ← cd ..
          </Link>
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="blog-post">
        <div className="prompt">
          <span className="prompt-user">snxq@blog</span>:<span className="prompt-path">~/posts</span><span className="prompt-symbol">$</span> cat post.md
        </div>
        <div className="error">
          <p>文章不存在</p>
          <Link to="/" className="back-link">
            ← cd ..
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="blog-post">
      <div className="prompt">
        <span className="prompt-user">snxq@blog</span>:<span className="prompt-path">~/posts</span><span className="prompt-symbol">$</span> cat {post.number}.md
      </div>
      
      <div className="post-header">
        <Link to="/" className="back-link">
          ← cd ..
        </Link>
        
        <h1 className="post-title">{post.title}</h1>
        
        <div className="post-meta">
          {formatDate(getDisplayDate(post))}
        </div>
        
        {post.labels.length > 0 && (
          <div className="post-labels">
            {post.labels
              .filter(label => label.name !== 'blog-post')
              .map((label) => (
                <span 
                  key={label.id} 
                  className="label"
                >
                  {label.name}
                </span>
              ))
            }
          </div>
        )}
      </div>

      <div className="post-content">
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
                  border: '1px solid #30363d',
                  margin: '16px 0'
                }}
                loading="lazy"
              />
            )
          }}
        >
          {removeCustomDateFromContent(post.body) || '暂无内容'}
        </ReactMarkdown>
      </div>
      
      <div className="separator">────────────────────────────────────────────────────────────</div>
      <div className="prompt">
        <span className="prompt-user">snxq@blog</span>:<span className="prompt-path">~/posts</span><span className="prompt-symbol">$</span> <span className="cursor"></span>
      </div>
    </div>
  )
}

export default BlogPost