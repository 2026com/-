/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 四色状态标记
        status: {
          done: '#22c55e',      // 绿色=已完成
          todo: '#3b82f6',      // 蓝色=待执行
          paused: '#f97316',    // 橙色=暂时搁置
          aborted: '#ef4444'    // 红色=废弃终止
        },
        system: {
          primary: '#6366f1',
          dark: '#1e1b4b',
          bg: '#f8fafc',
          panel: '#ffffff',
          drawer: '#f1f5f9'
        }
      },
      touchAction: {
        'manipulation': 'manipulation'
      }
    },
  },
  plugins: [],
}
