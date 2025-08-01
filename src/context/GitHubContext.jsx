import { createContext, useContext, useState, useEffect } from 'react'
import { BLOG_CONFIG } from '../../config.js'

const GitHubContext = createContext()

export const useGitHub = () => {
  const context = useContext(GitHubContext)
  if (!context) {
    throw new Error('useGitHub must be used within a GitHubProvider')
  }
  return context
}

export const GitHubProvider = ({ children }) => {
  const [loading, setLoading] = useState(false)
  
  // 从配置文件获取 GitHub 仓库配置
  const REPO_OWNER = BLOG_CONFIG.REPO_OWNER
  const REPO_NAME = BLOG_CONFIG.REPO_NAME

  // 获取所有博客文章（issues）
  const getBlogPosts = async () => {
    try {
      // 使用fetch直接调用GitHub API
      const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&labels=${BLOG_CONFIG.BLOG_POST_LABEL}&sort=created&direction=desc`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      
      // 过滤掉标题为"关于我"的文章
      return data.filter(issue => issue.title !== '关于我')
    } catch (error) {
      console.error('获取博客文章失败:', error)
      return []
    }
  }

  // 获取单篇文章详情
  const getBlogPost = async (issueNumber) => {
    try {
      // 使用fetch直接调用GitHub API
      const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('获取文章详情失败:', error)
      return null
    }
  }



  const value = {
    loading,
    getBlogPosts,
    getBlogPost,
    REPO_OWNER,
    REPO_NAME
  }

  return (
    <GitHubContext.Provider value={value}>
      {children}
    </GitHubContext.Provider>
  )
}