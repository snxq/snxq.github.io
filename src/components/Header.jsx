import { Link } from 'react-router-dom'
import { Github } from 'lucide-react'
import { BLOG_CONFIG } from '../../config.js'

const Header = () => {

  return (
    <header className="header">
      <div className="terminal-header">
        <div className="terminal-dot dot-red"></div>
        <div className="terminal-dot dot-yellow"></div>
        <div className="terminal-dot dot-green"></div>
        <div className="terminal-title">snxq-blog</div>
      </div>
      <div className="header-content">
        <Link to="/" className="logo">
          <h1>{BLOG_CONFIG.BLOG_TITLE}</h1>
        </Link>
        
        <nav className="nav-menu">
          <Link to="/" className="nav-link">首页</Link>
          <Link to="/about" className="nav-link">关于我</Link>
          <a 
            href="https://github.com/snxq" 
            target="_blank" 
            rel="noopener noreferrer"
            className="nav-link github-link"
            title="GitHub"
          >
            <Github size={16} />
            <span>GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  )
}

export default Header