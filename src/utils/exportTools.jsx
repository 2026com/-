import React, { useEffect } from 'react'

/**
 * 全局导出工具 V1.0
 * 支持：PDF / Excel / 思维导图长图片
 */

// 1. 导出思维导图长图（使用 html2canvas）
export async function exportMindMapAsImage() {
  const canvasEl = document.querySelector('.canvas-lined')?.parentElement || document.querySelector('.bg-white')
  if (!canvasEl) { alert('未找到画布'); return }
  const { default: html2canvas } = await import('html2canvas')
  const cvs = await html2canvas(canvasEl, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
  const url = cvs.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `成长思维导图画布_${Date.now()}.png`
  a.click()
}

// 2. 导出复盘报告为 PDF（使用 jsPDF）
export async function exportReportAsPDF(title, content) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, 595, 90, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text(title, 40, 55)
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(11)
  doc.text(`生成时间：${new Date().toLocaleString()}`, 40, 120)
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(12)
  const lines = String(content || '').split('\n').flatMap(line => doc.splitTextToSize(line, 515))
  let y = 150
  lines.forEach(line => {
    if (y > 800) { doc.addPage(); y = 60 }
    doc.text(String(line), 40, y)
    y += 18
  })
  doc.save(`成长复盘报告_${Date.now()}.pdf`)
}

// 3. 导出数据为 Excel（习惯/打卡/计时/节点/报告）
export async function exportExcel(type, data) {
  const XLSX = (await import('xlsx')).default
  const wb = XLSX.utils.book_new()
  const toSheet = (arr, name) => {
    const ws = XLSX.utils.json_to_sheet(arr || [])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  if (type === 'habits' || type === 'all') toSheet(data.habits, '日常习惯')
  if (type === 'checkins' || type === 'all') {
    const flat = Object.entries(data.checkins || {}).map(([k, v]) => ({ key: k, date: v.date, habitId: v.habitId, time: new Date(v.time).toLocaleString() }))
    toSheet(flat, '打卡记录')
  }
  if (type === 'nodes' || type === 'all') toSheet(data.nodes, '思维导图节点')
  if (type === 'timer' || type === 'all') toSheet(data.timerRecords, '计时记录')
  if (type === 'reports' || type === 'all') toSheet((data.reports || []).map(r => ({ ...r, content: String(r.content || '').slice(0, 2000) })), '复盘报告')

  XLSX.writeFile(wb, `成长APP数据导出_${Date.now()}.xlsx`)
}

/** 无渲染挂载组件：把导出工具挂到 window 并监听自定义导出按钮*/
export default function ExportToolsMount() {
  useEffect(() => {
    window.__growth_tools = {
      exportMindMapAsImage,
      exportReportAsPDF,
      exportExcel,
    }
    // 监听右下角工具栏的导出按钮（通过自定义事件）
    const handler = async (e) => {
      const detail = e.detail || {}
      if (detail.type === 'image') await exportMindMapAsImage()
      if (detail.type === 'excel') {
        const payload = {
          nodes: JSON.parse(localStorage.getItem('growth_app_v1_nodes') || '[]'),
          habits: JSON.parse(localStorage.getItem('growth_app_v1_habits') || '[]'),
          checkins: JSON.parse(localStorage.getItem('growth_app_v1_checkins') || '{}'),
          timerRecords: JSON.parse(localStorage.getItem('growth_app_v1_timer_records') || '[]'),
          reports: JSON.parse(localStorage.getItem('growth_app_v1_reports') || '[]'),
        }
        await exportExcel('all', payload)
      }
      if (detail.type === 'pdf' && detail.title && detail.content) {
        await exportReportAsPDF(detail.title, detail.content)
      }
    }
    window.addEventListener('growth:export', handler)
    return () => window.removeEventListener('growth:export', handler)
  }, [])
  return null
}
