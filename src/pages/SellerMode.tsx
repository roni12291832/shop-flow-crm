import { useState, useCallback } from "react";
import { SellerBottomNav } from "@/components/seller/SellerBottomNav";
import { SellerHome } from "@/components/seller/SellerHome";
import { SellerQuickSale } from "@/components/seller/SellerQuickSale";
import { SellerHistory } from "@/components/seller/SellerHistory";
import { SellerProfile } from "@/components/seller/SellerProfile";
import { SellerTasks } from "@/components/seller/SellerTasks";
import { SellerRanking } from "@/components/seller/SellerRanking";

export default function SellerMode() {
  const [activeTab, setActiveTab] = useState<"home" | "sale" | "tasks" | "ranking" | "history" | "profile">("home");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <div className="flex-1 overflow-y-auto">
        {activeTab === "home" && <SellerHome key={refreshKey} />}
        {activeTab === "sale" && <SellerQuickSale onSaleCreated={() => { refresh(); setActiveTab("home"); }} />}
        {activeTab === "tasks" && <SellerTasks key={refreshKey} />}
        {activeTab === "ranking" && <SellerRanking key={refreshKey} />}
        {activeTab === "history" && <SellerHistory key={refreshKey} />}
        {activeTab === "profile" && <SellerProfile />}
      </div>
      <SellerBottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
