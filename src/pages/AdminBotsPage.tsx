// src/pages/AdminBotsPage.tsx
// Trước đây file này là TanStack route tại /admin/bots. Đã chuyển thành page
// React Router (react-router-dom) để mount dưới slug bí mật (`${ADMIN_SLUG}/bots`)
// thay vì hardcode "/admin".
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bot, Shield, ArrowLeft, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BotsOverview } from "@/components/bots/bots-overview";
import { BotAssignmentsPanel } from "@/components/bots/bot-assignments-panel";
import { ModerationQueuePanel } from "@/components/bots/moderation-queue-panel";
import { BotLogsPanel } from "@/components/bots/bot-logs-panel";
import { RiskOverviewPanel } from "@/components/bots/risk-overview-panel";
import { QueueCounters } from "@/components/bots/queue-counters";
import { checkAdminAccess } from "@/lib/bot-system";

export default function AdminBotsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    checkAdminAccess().then(setAllowed).catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <Shield className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Truy cập bị từ chối</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Bạn cần quyền admin để truy cập Bot Control Panel.
        </p>
        <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0b14] text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-emerald-600/15 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur transition hover:bg-white/10"
              aria-label="Về trang chủ"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 p-2">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight sm:text-xl">Bot Control Panel</h1>
                <p className="text-xs text-muted-foreground">Internal bot ecosystem · realtime</p>
              </div>
            </div>
          </div>
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            ● live
          </div>
        </motion.header>

        <section className="mb-6">
          <QueueCounters />
        </section>

        <Tabs defaultValue="bots" className="space-y-4">
          <TabsList className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <TabsTrigger value="bots">Bots</TabsTrigger>
            <TabsTrigger value="assignments">User Bots</TabsTrigger>
            <TabsTrigger value="moderation">Moderation</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="bots"><BotsOverview /></TabsContent>
          <TabsContent value="assignments"><BotAssignmentsPanel /></TabsContent>
          <TabsContent value="moderation"><ModerationQueuePanel /></TabsContent>
          <TabsContent value="risk"><RiskOverviewPanel /></TabsContent>
          <TabsContent value="logs"><BotLogsPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
