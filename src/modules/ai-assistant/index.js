/**
 * 独立模块：AI助手（ai-assistant）模块入口
 * 规则：只读取使用者数据，不直接引用其他系统的代码
 */
export { default as ChatInterface } from './components/ChatInterface.jsx'

/**
 * 3D 知识图谱（KnowledgeGraph3D）已迁移至「知识思考库」系统：
 *   src/systems/knowledge-base/components/KnowledgeGraph3D.jsx
 * 消费方从 '../systems/knowledge-base/index.js' 或直接 lazy import 该组件。
 */
