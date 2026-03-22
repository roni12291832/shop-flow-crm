import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SellerBottomNav } from "@/components/seller/SellerBottomNav";
import { SellerHome } from "@/components/seller/SellerHome";
import { SellerQuickSale } from "@/components/seller/SellerQuickSale";
import { SellerHistory } from "@/components/seller/SellerHistory";
import { SellerProfile } from "@/components/seller/SellerProfile";
import { SellerTasks } from "@/components/seller/SellerTasks";
import { SellerRanking } from "@/components/seller/SellerRanking";
import { SellerClients } from "@/components/seller/SellerClients";
import { SellerInventory } from "@/components/seller/SellerInventory";

export default function SellerMode() {
  const [activeTab, setActiveTab] = useState<"home" | "sale" | "tasks" | "chat" | "ranking" | "history" | "profile" | "clients" | "inventory">("home");
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleTabChange = (tab: any) => {
    if (tab === "chat") {
      navigate("/chat");
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <div className="flex-1 overflow-y-auto">
        {activeTab === "home" && <SellerHome key={refreshKey} />}
        {activeTab === "sale" && <SellerQuickSale onSaleCreated={() => { refresh(); setActiveTab("home"); }} />}
        {activeTab === "tasks" && <SellerTasks key={refreshKey} />}
        {activeTab === "ranking" && <SellerRanking key={refreshKey} />}
        {activeTab === "history" && <SellerHistory key={refreshKey} />}
        {activeTab === "clients" && <SellerClients key={refreshKey} />}
        {activeTab === "inventory" && <SellerInventory key={refreshKey} />}
        {activeTab === "profile" && <SellerProfile />}
      </div>
      <SellerBottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}
