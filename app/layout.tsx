// app/layout.tsx
import "./globals.css"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/app/AppSidebar/app-sidebar"

export default function RootLayout({ children, }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            {/* 左边 Sidebar */}
            <AppSidebar />

            {/* 右边内容 */}
            <main className="flex-1 p-4">
              <SidebarTrigger />
              {children} {/* 🔥 关键就在这里 */}
            </main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  )
}
