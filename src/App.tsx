/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC RENDER TRANG CHỦ MẶC ĐỊNH VITE + REACT (ROOT APP COMPONENT ARCHITECTURE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT LÕI VÀ STATE ĐẾM TĂNG TỰ ĐỘNG (INIT & STATE MANAGEMENT)
 * - Minh chứng 1: Tại dòng 46 có khai báo `function App() { ... }`.
 *   Đây là Component gốc mặc định của dự án React + Vite được khởi tạo tại điểm vào (entry point `main.tsx`).
 * - Minh chứng 2: Tại dòng 48 có khai báo `const [count, setCount] = useState(0)`.
 *   React tự cấp phát bộ nhớ lưu trữ biến đếm `count` bắt đầu từ 0.
 * 
 * BƯỚC 2: RENDER KHU VỰC HERO CHÍNH KÈM TÍNH NĂNG ĐẾM COUNTER (HERO SECTION & COUNTER LOGIC)
 * - Minh chứng: Tại dòng 56 khối JSX `<section id="center">`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hiển thị hình ảnh biểu tượng Hero (Vite, React) và tiêu đề HMR.
 *   + Nút bấm Counter kích hoạt callback `setCount((count) => count + 1)` để thay đổi trạng thái và trigger re-render.
 * 
 * BƯỚC 3: HIỂN THỊ DANH SÁCH LIÊN KẾT TÀI LIỆU VÀ CỘNG ĐỒNG VITE/REACT (DOCS & SOCIAL LINKS)
 * - Minh chứng: Tại dòng 83 khối JSX `<section id="next-steps">`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hiển thị các khối liên kết hướng dẫn tới trang chủ Vite.dev, React.dev.
 *   + Danh sách mạng xã hội cộng đồng (GitHub, Discord, X.com, Bluesky).
 * 
 * BƯỚC 4: XUẤT COMPONENT ROOT ĐỂ MOUNT VÀO VIRTUAL DOM (COMPONENT EXPORT)
 * - Minh chứng: Tại dòng 173 `export default App`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Xuất đối tượng Component `App` để `main.tsx` nhập vào và mount trực tiếp vào thẻ HTML có id `root`.
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN REACT VÀ NGUỒN TÀI NGUYÊN HÌNH ẢNH / STYLES
// Công dụng: Nạp Hook useState của React, các hình ảnh logo SVG/PNG và file định dạng CSS.
// =========================================================================
import { useState } from 'react' // Hook quản lý trạng thái biến đếm.
import reactLogo from './assets/react.svg' // Logo chính thức của thư viện React.
import viteLogo from './assets/vite.svg' // Logo chính thức của công cụ build Vite.
import heroImg from './assets/hero.png' // Hình nền minh họa khu vực Hero.
import './App.css' // File định dạng giao diện CSS cho App.

/**
 * === PHẦN 2: ĐỊNH NGHĨA FUNCTION COMPONENT APP ===
 * Component gốc hiển thị trang chào mừng mặc định khi khởi tạo dự án React + Vite.
 */
function App() {
  // --- KHỞI TẠO STATE BIẾN ĐẾM (COUNTER STATE) ---
  const [count, setCount] = useState(0) // State lưu trữ số lần bấm nút, khởi tạo = 0

  // =========================================================================
  // PHẦN 3: RENDER GIAO DIỆN COMPONENT (JSX)
  // =========================================================================
  return (
    <>
      {/* 1. KHỐI NỘI DUNG HERO VÀ NÚT BẤM TĂNG TỰ ĐỘNG */}
      <section id="center">
        {/* HÌNH ẢNH BIỂU TƯỢNG VITE & REACT */}
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        {/* VĂN BẢN TIÊU ĐỀ HƯỚNG DẪN */}
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        {/* NÚT BẤM COUNTER KÍCH HOẠT RE-RENDER */}
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      {/* 2. KHỐI LIÊN KẾT TÀI LIỆU VÀ MẠNG XÃ HỘI */}
      <section id="next-steps">
        {/* TÀI LIỆU HƯỚNG DẪN DỰ ÁN */}
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>

        {/* LIÊN KẾT CỘNG ĐỒNG MẠNG XÃ HỘI */}
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
