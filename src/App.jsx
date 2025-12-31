import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from './components/Header'
import BlogList from './components/BlogList'
import BlogPost from './components/BlogPost'
import About from './components/About'
import { GitHubProvider } from './context/GitHubContext'
import { BLOG_CONFIG } from '../config.js'
import './App.css'

function App() {
  // 设置页面标题
  useEffect(() => {
    document.title = BLOG_CONFIG.BLOG_TITLE
  }, [])

  return (
    <GitHubProvider>
      <Router>
        <div className="app">
          <div className="terminal">
            <Header />
            <div className="terminal-body">
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<BlogList />} />
                  <Route path="/post/:issueNumber" element={<BlogPost />} />
                  <Route path="/about" element={<About />} />
                </Routes>
              </main>
            </div>
          </div>
        </div>
      </Router>
    </GitHubProvider>
  )
}

export default App
