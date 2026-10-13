import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// janbyeol.com/admin — 관리자 전용 트랙션 리포트. 따로 불러와서 일반 방문자의 화면 무게에는 더해지지 않습니다.
const AdminReport = lazy(() => import('./admin/AdminReport.jsx'))
const isAdminPage = window.location.pathname.replace(/\/+$/, '') === '/admin'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminPage ? (
      <Suspense fallback={null}>
        <AdminReport />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
)
