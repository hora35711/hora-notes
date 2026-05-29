import { redirect } from "next/navigation"

// 首页路由：统一跳转到仪表板，避免展示误引入的示例页面。
export default function HomePage() {
  // 直接进入 Dashboard 主视图。
  redirect("/dashboard")
}
