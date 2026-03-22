import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function NpsPublic() {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<any>(null);
  const [tenant, setTenant] = useState<any>({
    company_name: "Avaliação",
    primary_color: "#2563eb"
  });
  const [customer, setCustomer] = useState<any>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const fetchSurvey = async () => {
      const { data, error } = await supabase
        .from("nps_surveys")
        .select("*")
        .eq("unique_token", token)
        .single();

      if (error || !data) {
        setError("Pesquisa não encontrada ou já respondida.");
        setLoading(false);
        return;
      }

      if (data.status === "responded") {
        setSubmitted(true);
        setLoading(false);
        return;
      }

      setSurvey(data);

      const [customerRes] = await Promise.all([
        supabase.from("clients").select("name").eq("id", data.customer_id).single(),
      ]);

      if (customerRes.data) {
        setCustomer(customerRes.data);
      }
      setLoading(false);
    };
    fetchSurvey();
  }, [token]);

  const getScoreColor = (i: number) => {
    if (i <= 6) return "bg-destructive hover:bg-destructive/80 text-white";
    if (i <= 8) return "bg-warning hover:bg-warning/80 text-white";
    return "bg-accent hover:bg-accent/80 text-white";
  };

  const getCategory = (score: number): string => {
    if (score >= 9) return "promotor";
    if (score >= 7) return "neutro";
    return "detrator";
  };

  const handleSubmit = async () => {
    if (selectedScore === null || !survey) return;
    setSubmitting(true);
    const trimmedComment = comment.trim().slice(0, 1000);
    const category = getCategory(selectedScore);

    await supabase.from("nps_surveys").update({
      score: selectedScore,
      comment: trimmedComment || null,
      category: category as any,
      status: "responded" as any,
      responded_at: new Date().toISOString(),
    }).eq("id", survey.id);

    setSubmitted(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center animate-in fade-in zoom-in duration-500">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Obrigado pela sua avaliação!</h2>
          <p className="text-gray-500">Sua opinião é muito importante para nós.</p>
        </div>
      </div>
    );
  }

  const showCommentField = selectedScore !== null && selectedScore <= 7;
  const showPositiveField = selectedScore !== null && selectedScore >= 9;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt={tenant.company_name} className="h-12 mx-auto" />
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl mx-auto flex items-center justify-center text-white font-bold text-xl"
              style={{ background: tenant?.primary_color || "#2563eb" }}>
              {tenant?.company_name?.[0] || "L"}
            </div>
            <p className="text-gray-800 font-bold mt-2">{tenant?.company_name || "Loja"}</p>
          </div>
        )}

        {/* Question */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-800 leading-snug">
            De 0 a 10, quanto você recomendaria{" "}
            <span style={{ color: tenant?.primary_color || "#2563eb" }}>
              {tenant?.company_name || "nossa loja"}
            </span>{" "}
            para um amigo?
          </h1>
          {customer && <p className="text-gray-400 text-sm mt-2">Olá, {customer.name}!</p>}
        </div>

        {/* Score buttons */}
        <div className="grid grid-cols-6 sm:grid-cols-11 gap-2">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setSelectedScore(i)}
              className={cn(
                "h-12 rounded-xl font-bold text-lg transition-all duration-200",
                selectedScore === i
                  ? `${getScoreColor(i)} ring-2 ring-offset-2 ring-offset-white scale-110`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {i}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>

        {/* Comment field */}
        {showCommentField && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <label className="text-gray-700 font-medium text-sm">O que podemos melhorar?</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 1000))}
              placeholder="Conte-nos sua experiência..."
              className="mt-2 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400"
              rows={3}
              maxLength={1000}
            />
            <span className="text-xs text-gray-400">{comment.length}/1000</span>
          </div>
        )}

        {showPositiveField && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <label className="text-gray-700 font-medium text-sm">O que você mais gostou? 😊</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 1000))}
              placeholder="Adoraríamos saber!"
              className="mt-2 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400"
              rows={3}
              maxLength={1000}
            />
          </div>
        )}

        {/* Submit */}
        {selectedScore !== null && (
          <Button
            className="w-full h-12 text-base font-bold"
            style={{ background: tenant?.primary_color || "#2563eb" }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Enviando..." : "Enviar Avaliação"}
          </Button>
        )}
      </div>
    </div>
  );
}
