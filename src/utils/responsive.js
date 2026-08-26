/**
 * 响应式适配工具模块 V2.0
 * 
 * 功能：
 * 1. 检测设备类型（手机/平板/桌面）
 * 2. 检测屏幕方向（横屏/竖屏）
 * 3. 提供安全区域适配常量
 * 4. 提供响应式断点判断
 * 5. 横屏模式下的布局调整参数
 */

// ========== 断点定义（Tailwind 对齐） ==========
export const BREAKPOINTS = {
  sm: 640,   // 小手机横屏 / 大手机竖屏
  md: 768,   // 平板竖屏
  lg: 1024,  // 平板横屏 / 小桌面
  xl: 1280,  // 桌面
  '2xl': 1536, // 大桌面
}

// ========== 设备检测 ==========
export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, isPortrait: true, isLandscape: false }
  }
  const w = window.innerWidth
  const h = window.innerHeight
  const ua = navigator.userAgent || ''
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  
  const isMobile = w < BREAKPOINTS.md && (isMobileUA || w < BREAKPOINTS.sm)
  const isTablet = w >= BREAKPOINTS.md && w < BREAKPOINTS.lg
  const isDesktop = w >= BREAKPOINTS.lg
  const isPortrait = w < h
  const isLandscape = w >= h

  return { isMobile, isTablet, isDesktop, isPortrait, isLandscape, width: w, height: h }
}

// ========== 安全区域适配 ==========
// 移动端刘海屏/底部横条安全区，CSS 变量在 index.css 定义
export const SAFE_AREA = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
}

// ========== 顶部状态栏高度计算 ==========
// 基础高度 + 安全区域补偿，确保不被系统状态栏遮挡
export function getTopBarHeight() {
  if (typeof window === 'undefined') return 44
  const { isMobile, isLandscape } = getDeviceInfo()
  // 移动端竖屏需要额外补偿安全区
  if (isMobile && !isLandscape) return 44
  // 横屏时高度可以更紧凑
  if (isLandscape) return 40
  return 48
}

// ========== 底部导航栏高度计算 ==========
export function getBottomBarHeight() {
  if (typeof window === 'undefined') return 56
  const { isMobile } = getDeviceInfo()
  return isMobile ? 56 : 52
}

// ========== 横屏模式辅助 ==========
// 横屏下左侧抽屉最大宽度限制
export const LANDSCAPE_DRAWER_MAX_WIDTH = 260
// 横屏下日历抽屉宽度
export const LANDSCAPE_CALENDAR_WIDTH = 280

// ========== 监听屏幕旋转 ==========
export function useOrientation(callback) {
  if (typeof window === 'undefined') return () => {}
  
  const handler = () => {
    const info = getDeviceInfo()
    callback?.(info)
  }
  
  // matchMedia 监听优于 resize
  const mqPortrait = window.matchMedia('(orientation: portrait)')
  const mqLandscape = window.matchMedia('(orientation: landscape)')
  
  if (mqPortrait.addEventListener) {
    mqPortrait.addEventListener('change', handler)
    mqLandscape.addEventListener('change', handler)
  } else {
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
  }
  
  return () => {
    if (mqPortrait.removeEventListener) {
      mqPortrait.removeEventListener('change', handler)
      mqLandscape.removeEventListener('change', handler)
    } else {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }
}